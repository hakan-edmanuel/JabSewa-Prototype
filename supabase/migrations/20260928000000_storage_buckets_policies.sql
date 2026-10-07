-- ══════════════════════════════════════════════════════════════════════════
-- STORAGE — 20260928000000_storage_buckets_policies.sql (FORWARD-ONLY)
-- ══════════════════════════════════════════════════════════════════════════
-- LINGKUP HANYA: Supabase Storage — 2 bucket + policy storage.objects.
-- TIDAK mengubah: schema public, tabel, RPC rental lifecycle, RLS public,
-- grants public. Tidak ada perubahan destruktif; semua perintah idempotent.
--
-- Prasyarat (owner action di dashboard — TIDAK dibuat otomatis dari frontend):
--   Dashboard → Storage → New bucket:
--     1. "listing-images"   — Public bucket (foto katalog harus bisa dilihat
--                             anon tanpa sesi, sejajar policy listing_images_read
--                             yang membuka SELECT ke `anon`).
--     2. "payment-proofs"   — PRIVATE bucket (bukti transfer bersifat sensitif;
--                             akses via signed URL, TTL 15 menit).
--   Pembuatan bucket membutuhkan hak service-role/operator — file ini dijalankan
--   lewat SQL Editor / scripts/apply-migration.mjs (koneksi DATABASE_URL),
--   BUKAN lewat frontend (aturan keras #8).
--
-- ATURAN PATH (dipatuahkan juga di frontend helper src/lib/uploads.js):
--   listing-images : listings/{listing_id}/{uuid}.{jpg|png|webp}
--                    listing_id di-resolve ownership-nya oleh policy INSERT
--                    melalui public.listings + public.stores (owner_id = auth.uid()).
--   payment-proofs : proofs/{rental_id}/{uuid}.{jpg|png|webp}
--                    rental_id di-resolve oleh policy INSERT melalui
--                    public.rental_transactions (buyer_id = auth.uid()).
--   Admin TIDAK diberi akses tulis via policy ini (admin memverifikasi bukti
--   lewat RPC decide_payment yang membaca payment_proof_url — SELECT/signed
--   URL, bukan tulis file). Tulis hanya oleh pemilik resource.
--
-- KONSISTENSI DENGAN MODEL AKSES EXISTING (baseline 20260926000000 §16):
--   - listing_images_read: anon + authenticated; katalog aktif / owner / admin.
--     Bucket public membuat foto katalog terbaca anon — sama seperti katalog DB.
--   - payments_select: buyer pemilik transaksi / owner toko / admin.
--     Policy SELECT payment-proofs meniru matriks itu persis.
-- ══════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. BUCKETS (idempotent — aman dijalankan ulang)
--    storage.buckets dimiliki service role; statement di bawah harus dijalankan
--    dengan kredensial operator (SQL Editor / apply-migration.mjs, bukan anon).
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('listing-images', 'listing-images', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. HELPER — cek namespace path (dipanggil dari policy, row columns sebagai
--    parameter: bucket_id & name adalah kolom storage.objects yang sedang
--    dicek policy).
--    namespace valid: {prefix}/{resource_uuid}/{file_name} — minimal 3 segmen.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.storage_path_in_namespace(
  p_bucket text,
  p_name text,
  p_want_bucket text,
  p_prefix text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_bucket = p_want_bucket
     AND p_name LIKE p_prefix || '/%'
     AND array_length(string_to_array(p_name, '/'), 1) >= 3
     AND split_part(p_name, '/', 2) ~ '^[0-9a-fA-F-]{36}$';
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. LISTING-IMAGES (public bucket — foto katalog)
--    SELECT: publik (katalog, sejajar listings_read/listing_images_read yang
--    membuka SELECT ke anon). INSERT/UPDATE/DELETE: hanya owner toko yang
--    memiliki listing pada segmen path kedua.
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS storage_listing_images_select ON storage.objects;
CREATE POLICY storage_listing_images_select ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (public.storage_path_in_namespace(bucket_id, name, 'listing-images', 'listings'));

DROP POLICY IF EXISTS storage_listing_images_insert ON storage.objects;
CREATE POLICY storage_listing_images_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    public.storage_path_in_namespace(bucket_id, name, 'listing-images', 'listings')
    AND EXISTS (
      SELECT 1
      FROM public.listings l
      JOIN public.stores s ON s.id = l.store_id
      WHERE l.id::text = split_part(name, '/', 2)
        AND s.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS storage_listing_images_update ON storage.objects;
CREATE POLICY storage_listing_images_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    public.storage_path_in_namespace(bucket_id, name, 'listing-images', 'listings')
    AND EXISTS (
      SELECT 1
      FROM public.listings l
      JOIN public.stores s ON s.id = l.store_id
      WHERE l.id::text = split_part(name, '/', 2)
        AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    public.storage_path_in_namespace(bucket_id, name, 'listing-images', 'listings')
    AND EXISTS (
      SELECT 1
      FROM public.listings l
      JOIN public.stores s ON s.id = l.store_id
      WHERE l.id::text = split_part(name, '/', 2)
        AND s.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS storage_listing_images_delete ON storage.objects;
CREATE POLICY storage_listing_images_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    public.storage_path_in_namespace(bucket_id, name, 'listing-images', 'listings')
    AND EXISTS (
      SELECT 1
      FROM public.listings l
      JOIN public.stores s ON s.id = l.store_id
      WHERE l.id::text = split_part(name, '/', 2)
        AND s.owner_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 4. PAYMENT-PROOFS (private bucket — bukti transfer)
--    INSERT: hanya buyer pemilik rental pada path proofs/{rental_id}/…
--    SELECT: buyer / owner toko / admin — matriks payments_select.
--    UPDATE/DELETE: sengaja TIDAK diberikan (riwayat bukti immutable; bukti
--    ditolak membuat payment baru, bukan menimpa file — CATATAN-K).
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS storage_payment_proofs_insert ON storage.objects;
CREATE POLICY storage_payment_proofs_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    public.storage_path_in_namespace(bucket_id, name, 'payment-proofs', 'proofs')
    AND EXISTS (
      SELECT 1
      FROM public.rental_transactions r
      WHERE r.id::text = split_part(name, '/', 2)
        AND r.buyer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS storage_payment_proofs_select ON storage.objects;
CREATE POLICY storage_payment_proofs_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    public.storage_path_in_namespace(bucket_id, name, 'payment-proofs', 'proofs')
    AND EXISTS (
      SELECT 1
      FROM public.rental_transactions r
      LEFT JOIN public.stores s ON s.id = r.store_id
      WHERE r.id::text = split_part(name, '/', 2)
        AND (
          r.buyer_id = auth.uid()
          OR public.is_admin()
          OR s.owner_id = auth.uid()
        )
    )
  );

-- ══════════════════════════════════════════════════════════════════════════
-- 5. SANITY CHECKS — fail loudly bila kontrak pelanggar
-- ══════════════════════════════════════════════════════════════════════════
DO $sanity$
DECLARE
  v_missing text := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'listing-images' AND public) THEN
    v_missing := v_missing || 'bucket:listing-images(public) ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'payment-proofs' AND NOT public) THEN
    v_missing := v_missing || 'bucket:payment-proofs(private) ';
  END IF;
  IF v_missing <> '' THEN
    RAISE EXCEPTION 'Storage setup tidak lengkap: %', v_missing;
  END IF;

  -- payment-proofs harus immutable: tidak boleh ada policy UPDATE/DELETE apa pun
  -- yang menyasar bucket ini (pola nama storage_payment_proofs_*).
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname LIKE 'storage_payment_proofs_%'
      AND cmd IN ('UPDATE', 'DELETE')
  ) THEN
    RAISE EXCEPTION 'payment-proofs harus immutable: tidak boleh ada policy UPDATE/DELETE';
  END IF;

  -- Helper namespace wajib ada (policy depend padanya).
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'storage_path_in_namespace'
  ) THEN
    RAISE EXCEPTION 'helper public.storage_path_in_namespace tidak ditemukan';
  END IF;
END
$sanity$;
