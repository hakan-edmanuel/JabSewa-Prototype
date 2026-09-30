-- ============================================================================
-- JabSewa — LEGACY SCHEMA COMPATIBILITY PATCH (ADDITIVE & IDEMPOTENT)
-- ============================================================================
-- LATAR BELAKANG:
--   Migration 20260924000000 gagal di tengah jalan (SQL 42703: column
--   "listing_id" does not exist) karena database berisi skema LEGACY:
--
--     rental_transactions : id, buyer_id, store_id, start_date, end_date,
--                           subtotal, total, status, created_at, updated_at
--                           (TIDAK ada: listing_id, code, tenant_id,
--                            total_days, price_per_day, deposit,
--                            rejection_reason, payment_status)
--     stores              : id, owner_id, name, description, address,
--                           status, created_at, updated_at
--                           (TIDAK ada: user_id, store_name, contact, city,
--                            username, is_verified, rating)
--     listings            : id, store_id, name, description, price, stock,
--                           status, created_at, updated_at
--                           (TIDAK ada: price_per_day, deposit, available,
--                            image_url, location, category, tags, rating,
--                            successful_transactions)
--     wishlists           : id, user_id, listing_id, created_at  (SUDAH OK)
--     users               : id, email, full_name, phone, is_seller, role,
--                           status, created_at
--                           (TIDAK ada: seller_application, seller_profile)
--     payment_records     : tabel belum ada
--
--   CREATE TABLE IF NOT EXISTS melompati tabel yang sudah ada, sehingga
--   ALTER/ADD COLUMN pendampingnya tidak pernah dijalankan → index di
--   listing_id (baris 109 file lama) adalah statement pertama yang meledak.
--
-- YANG DILAKUKAN PATCH INI (aman dijalankan BERKALI-KALI):
--   1. Menambah kolom kontrak yang hilang (ADD COLUMN IF NOT EXISTS).
--   2. MENGISI (backfill) kolom baru dari kolom legacy yang setara:
--        stores.name           → stores.store_name
--        stores.owner_id       → stores.user_id
--        listings.price        → listings.price_per_day
--        listings.stock        → listings.available   (stock > 0)
--        rental.buyer_id       → rental.tenant_id
--        rental.(end-start+1)  → rental.total_days
--      Data legacy TIDAK diubah/dihapus — hanya dibaca sebagai sumber.
--   3. Trigger sinkronisasi dua arah (name↔store_name, price↔price_per_day,
--      stock↔available, owner_id↔user_id) agar kode lama & baru tetap cocok.
--   4. Membuat ulang SEMUA objek yang gagal terpasang dari migration lama:
--      payment_records, index, exclusion constraint, RLS + policies,
--      grants, dan seluruh RPC (rental_quote, create_rental, set_rental_status,
--      get_rentals_for_user/store, wishlist, seller application, listings).
--   5. Semua operasi berisiko (SET NOT NULL, ADD CONSTRAINT, backfill, seed)
--      dibungkus blok exception → satu masalah tidak menggagalkan sisanya;
--      hanya RAISE WARNING, tidak pernah menghapus data.
--   6. TRADE-OFF KOLOM LEGACY (disengaja):
--      * rental_transactions — backfill buyer_id→tenant_id hanya sekali saat
--        patch. Baris BARU dari create_rental mengisi tenant_id saja (bukan
--        kolom legacy buyer_id/subtotal/total), sehingga pembaca lama yang
--        bergantung pada buyer_id tidak melihat rental baru. Konsumen resmi
--        = kode baru & RPC di file ini (get_rentals_for_user/store).
--      * stores/listings — kolom BARU adalah sumber kebenaran; tulisan lewat
--        kolom legacy ditimpa trigger sinkron (bagian D & E).
--   7. PERILAKU APPROVAL TOKO — decide_seller_application(p_approve => true)
--      memaksa stores.status = 'active' untuk toko target: toko yang sedang
--      dinonaktifkan akan AKTIF kembali saat lamaran disetujui (disengaja
--      agar toko hasil approval selalu bisa bertransaksi). Nonaktifkan
--      ulang secara manual bila diperlukan.
--
-- CARA PAKAI: Supabase Dashboard → SQL Editor → paste seluruh file → Run.
-- Tidak perlu menjalankan 20260924000000 lagi — patch ini mencakupnya.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- A. EXTENSIONS
-- ════════════════════════════════════════════════════════════════════════════

DO $do$
BEGIN
  CREATE EXTENSION IF NOT EXISTS btree_gist;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'btree_gist: % (exclusion constraint anti-double-booking mungkin gagal)', SQLERRM;
END $do$;

DO $do$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pg_trgm: % (index pencarian trigram dilewati)', SQLERRM;
END $do$;

-- ════════════════════════════════════════════════════════════════════════════
-- B. ENUM user_role (bila belum ada) — kolom role TIDAK dipaksa konversi;
--    semua RPC di bawah ditulis type-agnostic (role::text = '...').
-- ════════════════════════════════════════════════════════════════════════════

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.user_role AS ENUM ('TENANT', 'STORE_OWNER', 'SUPERADMIN');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'enum user_role: %', SQLERRM;
END $do$;

-- ════════════════════════════════════════════════════════════════════════════
-- C. USERS — kolom profil seller + trigger pendaftaran auth
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS seller_application jsonb,
  ADD COLUMN IF NOT EXISTS seller_profile     jsonb;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    'TENANT'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ════════════════════════════════════════════════════════════════════════════
-- D. STORES — samakan nama kolom dengan kontrak (add + backfill + sync)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS store_name  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS user_id     uuid,
  ADD COLUMN IF NOT EXISTS contact     text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS city        text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS username    text,
  ADD COLUMN IF NOT EXISTS rating      numeric(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;

-- Backfill satu kali (idempotent: baris yang sudah diisi terlewati).
DO $do$
BEGIN
  UPDATE public.stores SET store_name = name          WHERE store_name = ''  AND name    IS NOT NULL;
  UPDATE public.stores SET user_id    = owner_id      WHERE user_id IS NULL  AND owner_id IS NOT NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'backfill stores: %', SQLERRM;
END $do$;

-- Sinkronisasi dua arah. ATURAN: KOLOM BARU = SUMBER KEBENARAN
-- (store_name, user_id); kolom legacy (name, owner_id) hanya cermin yang
-- selalu disamakan setiap tulisan. Edit manual lewat kolom legacy akan
-- ditimpa — edit lewat kolom baru / RPC aplikasi.
CREATE OR REPLACE FUNCTION public.jabsewa_stores_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.store_name IS NULL OR NEW.store_name = '' THEN
    NEW.store_name := COALESCE(NEW.name, NEW.store_name, ''); -- hanya saat baru/kosong
  END IF;
  NEW.name := NEW.store_name;                                  -- cermin
  IF NEW.user_id IS NULL THEN
    NEW.user_id := NEW.owner_id;                               -- hanya saat NULL
  END IF;
  NEW.owner_id := NEW.user_id;                                 -- cermin
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_stores_sync ON public.stores;
CREATE TRIGGER trg_stores_sync
  BEFORE INSERT OR UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.jabsewa_stores_sync();

-- ════════════════════════════════════════════════════════════════════════════
-- E. LISTINGS — samakan nama kolom dengan kontrak (add + backfill + sync)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS price_per_day           integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit                 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS available               boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS image_url               text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS location                text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS category                text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tags                    text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rating                  numeric(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS successful_transactions integer NOT NULL DEFAULT 0;

DO $do$
BEGIN
  UPDATE public.listings SET price_per_day = COALESCE(price, 0) WHERE price_per_day = 0 AND price IS NOT NULL AND price <> 0;
  -- stock legacy TIDAK pernah ditulis ulang di sini (nilai positif dipertahankan);
  -- available hanya diturunkan DARI stock, bukan sebaliknya.
  UPDATE public.listings SET available      = (COALESCE(stock, 1) > 0) WHERE stock IS NOT NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'backfill listings: %', SQLERRM;
END $do$;

-- ATURAN: KOLOM BARU = SUMBER KEBENARAN (price_per_day, available);
-- kolom legacy (price, stock) hanya cermin. Edit manual lewat kolom legacy
-- akan ditimpa oleh trigger — selalu edit lewat kolom baru / RPC aplikasi.
-- stock BUKAN penghitung unit pada model inventori JabSewa: ketersediaan
-- per-periode dikunci exclusion constraint rental_transactions_no_double_
-- booking, bukan dikurangi per unit. stock = atribut legacy yang
-- DIPERTAHANKAN — trigger tidak pernah menulis stock; mengaktifkan atau
-- menonaktifkan listing (available) tidak pernah mengubah nilainya.
CREATE OR REPLACE FUNCTION public.jabsewa_listings_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.price_per_day IS NULL OR NEW.price_per_day = 0 THEN
    NEW.price_per_day := COALESCE(NEW.price, NEW.price_per_day, 0); -- legacy-only write
  END IF;
  NEW.price := NEW.price_per_day;                                 -- cermin
  IF NEW.available IS NULL THEN
    NEW.available := (COALESCE(NEW.stock, 1) > 0);                -- legacy-only write
  END IF;
  -- stock = atribut legacy yang DIPERTAHANKAN, BUKAN dihitung ulang dari
  -- available: trigger TIDAK PERNAH menulis NEW.stock. Nilai 0, NULL, atau
  -- positif tetap utuh — menonaktifkan lalu mengaktifkan kembali listing
  -- tidak pernah mengubah stock. available yang berubah setelah insert
  -- juga tidak memengaruhi stock; derivasi dari stock hanya terjadi pada
  -- tulisan legacy-only saat available masih NULL (blok IF di atas).
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_listings_sync ON public.listings;
CREATE TRIGGER trg_listings_sync
  BEFORE INSERT OR UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.jabsewa_listings_sync();

-- ════════════════════════════════════════════════════════════════════════════
-- F. RENTAL_TRANSACTIONS — tambah kolom kontrak + backfill dari legacy
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.rental_transactions
  ADD COLUMN IF NOT EXISTS code             text,
  ADD COLUMN IF NOT EXISTS tenant_id        uuid,
  ADD COLUMN IF NOT EXISTS listing_id       bigint,
  ADD COLUMN IF NOT EXISTS total_days       integer,
  ADD COLUMN IF NOT EXISTS price_per_day    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit          integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS payment_status   text NOT NULL DEFAULT 'unpaid';

-- legacy buyer_id mungkin NOT NULL → RPC baru tidak mengisinya, longgarkan.
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rental_transactions'
      AND column_name = 'buyer_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.rental_transactions ALTER COLUMN buyer_id DROP NOT NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'buyer_id DROP NOT NULL: %', SQLERRM;
END $do$;

-- Backfill tenant_id dari buyer_id, total_days dari tanggal, code untuk baris lama.
DO $do$
BEGIN
  UPDATE public.rental_transactions
     SET tenant_id = buyer_id
   WHERE tenant_id IS NULL AND buyer_id IS NOT NULL;

  UPDATE public.rental_transactions
     SET total_days = GREATEST(1, COALESCE(end_date, start_date) - start_date + 1)
   WHERE total_days IS NULL AND start_date IS NOT NULL;

  UPDATE public.rental_transactions
     SET code = 'R-' || to_char(COALESCE(created_at, now()) AT TIME ZONE 'Asia/Jakarta', 'YYYYMMDDHH24MISS')
              || '-' || substr(md5(id::text), 1, 6)
   WHERE code IS NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'backfill rental_transactions: %', SQLERRM;
END $do$;

-- tenant_id NOT NULL hanya bila seluruh baris terisi (tidak pernah menghapus data).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.rental_transactions WHERE tenant_id IS NULL) THEN
    ALTER TABLE public.rental_transactions ALTER COLUMN tenant_id SET NOT NULL;
  ELSE
    RAISE WARNING 'tenant_id masih punya NULL (baris legacy tanpa buyer_id) — dibiarkan nullable';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tenant_id SET NOT NULL: %', SQLERRM;
END $do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.rental_transactions WHERE total_days IS NULL) THEN
    ALTER TABLE public.rental_transactions ALTER COLUMN total_days SET NOT NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'total_days SET NOT NULL: %', SQLERRM;
END $do$;

-- FK (NOT VALID: baris lama tidak divalidasi; baris baru selalu dicek).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rental_tenant_fk'
                 AND conrelid = 'public.rental_transactions'::regclass) THEN
    ALTER TABLE public.rental_transactions
      ADD CONSTRAINT rental_tenant_fk FOREIGN KEY (tenant_id)
      REFERENCES auth.users (id) ON DELETE CASCADE NOT VALID;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'FK tenant_id: %', SQLERRM;
END $do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rental_listing_fk'
                 AND conrelid = 'public.rental_transactions'::regclass) THEN
    ALTER TABLE public.rental_transactions
      ADD CONSTRAINT rental_listing_fk FOREIGN KEY (listing_id)
      REFERENCES public.listings (id) ON DELETE RESTRICT NOT VALID;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'FK listing_id: %', SQLERRM;
END $do$;

-- CHECK total_days > 0 (guard bila belum ada).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rental_total_days_check'
                 AND conrelid = 'public.rental_transactions'::regclass) THEN
    ALTER TABLE public.rental_transactions
      ADD CONSTRAINT rental_total_days_check CHECK (total_days > 0);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'CHECK total_days: % (ada baris legacy yang melanggar — dibiarkan)', SQLERRM;
END $do$;

-- CHECK end_date >= start_date (guard).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rental_dates_order'
                 AND conrelid = 'public.rental_transactions'::regclass) THEN
    ALTER TABLE public.rental_transactions
      ADD CONSTRAINT rental_dates_order CHECK (end_date >= start_date);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'CHECK tanggal: % (ada baris legacy yang melanggar — dibiarkan)', SQLERRM;
END $do$;

-- CHECK status: bila CHECK lama tidak mengizinkan 'accepted'/'cancelled',
-- ganti dengan set lengkap (data tidak disentuh; nilai lama tetap valid).
DO $do$
DECLARE
  cName text;
  cDef  text;
BEGIN
  SELECT conname, pg_get_constraintdef(oid) INTO cName, cDef
    FROM pg_constraint
   WHERE conrelid = 'public.rental_transactions'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF cName IS NULL OR position('accepted' in lower(cDef)) = 0 THEN
    IF cName IS NOT NULL THEN
      EXECUTE 'ALTER TABLE public.rental_transactions DROP CONSTRAINT ' || quote_ident(cName);
    END IF;
    ALTER TABLE public.rental_transactions
      ADD CONSTRAINT rental_transactions_status_check
      CHECK (status IN ('pending','accepted','rejected','active','completed','cancelled'));
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'CHECK status: % (periksa manual bila status legacy berupa enum)', SQLERRM;
END $do$;

-- Jika kolom status ternyata ENUM legacy, tambahkan nilai yang kurang.
DO $do$
DECLARE
  vType text;
BEGIN
  SELECT udt_name INTO vType FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'rental_transactions'
     AND column_name = 'status';
  IF vType IS NOT NULL AND vType NOT IN ('text','varchar','character varying','bpchar') THEN
    EXECUTE 'ALTER TYPE public.' || quote_ident(vType) || ' ADD VALUE IF NOT EXISTS ''pending''';
    EXECUTE 'ALTER TYPE public.' || quote_ident(vType) || ' ADD VALUE IF NOT EXISTS ''accepted''';
    EXECUTE 'ALTER TYPE public.' || quote_ident(vType) || ' ADD VALUE IF NOT EXISTS ''rejected''';
    EXECUTE 'ALTER TYPE public.' || quote_ident(vType) || ' ADD VALUE IF NOT EXISTS ''cancelled''';
    EXECUTE 'ALTER TYPE public.' || quote_ident(vType) || ' ADD VALUE IF NOT EXISTS ''active''';
    EXECUTE 'ALTER TYPE public.' || quote_ident(vType) || ' ADD VALUE IF NOT EXISTS ''completed''';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'enum status: % — bila gagal, jalankan ALTER TYPE ... ADD VALUE terpisah lalu patch ulang', SQLERRM;
END $do$;

-- CHECK payment_status (guard).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rental_payment_status_check'
                 AND conrelid = 'public.rental_transactions'::regclass) THEN
    ALTER TABLE public.rental_transactions
      ADD CONSTRAINT rental_payment_status_check
      CHECK (payment_status IN ('unpaid','awaiting_confirmation','paid','refunded'));
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'CHECK payment_status: %', SQLERRM;
END $do$;

-- ════════════════════════════════════════════════════════════════════════════
-- G. PAYMENT_RECORDS (opsional, ledger manual — tidak dipakai UI di MVP ini)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.payment_records (
  id            bigserial PRIMARY KEY,
  rental_id     uuid NOT NULL REFERENCES public.rental_transactions (id) ON DELETE CASCADE,
  amount        integer NOT NULL CHECK (amount >= 0),
  method        text NOT NULL DEFAULT 'manual',
  status        text NOT NULL DEFAULT 'unpaid'
                  CHECK (status IN ('unpaid','awaiting_confirmation','paid','refunded')),
  recorded_by   uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  note          text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_records_rental
  ON public.payment_records (rental_id, created_at DESC);

COMMENT ON TABLE public.payment_records IS
  'OPTIONAL manual-payment ledger (no gateway). Unused by the app in this MVP.';

-- ════════════════════════════════════════════════════════════════════════════
-- H. INDEXES
-- ════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_rentals_listing ON public.rental_transactions (listing_id);
CREATE INDEX IF NOT EXISTS idx_rentals_store   ON public.rental_transactions (store_id);
CREATE INDEX IF NOT EXISTS idx_rentals_tenant  ON public.rental_transactions (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rentals_status  ON public.rental_transactions (status);
CREATE INDEX IF NOT EXISTS idx_rentals_buyer_legacy ON public.rental_transactions (buyer_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_user  ON public.wishlists (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_store_available ON public.listings (store_id) WHERE available;

-- Composite partial untuk cek konflik periode.
CREATE INDEX IF NOT EXISTS idx_rentals_listing_dates
  ON public.rental_transactions (listing_id, start_date, end_date)
  WHERE status IN ('pending', 'accepted', 'active');

-- Trigram (pencarian) — opsional, dilewati bila pg_trgm tidak tersedia.
DO $do$
BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_stores_name_trgm ON public.stores USING gin (store_name gin_trgm_ops)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_listings_name_trgm ON public.listings USING gin (name gin_trgm_ops)';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'index trigram: % (opsional)', SQLERRM;
END $do$;

-- Unique wishlist (dibutuhkan ON CONFLICT di toggle_wishlist).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wishlists_user_listing_unique'
                 AND conrelid = 'public.wishlists'::regclass) THEN
    ALTER TABLE public.wishlists
      ADD CONSTRAINT wishlists_user_listing_unique UNIQUE (user_id, listing_id);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'unique wishlist: % (ada duplikat? bersihkan manual dulu)', SQLERRM;
END $do$;

-- ════════════════════════════════════════════════════════════════════════════
-- I. TRIGGER updated_at + EXCLUSION CONSTRAINT anti-double-booking
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_rentals_touch ON public.rental_transactions;
CREATE TRIGGER trg_rentals_touch
  BEFORE UPDATE ON public.rental_transactions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.rental_transactions
  DROP CONSTRAINT IF EXISTS rental_transactions_no_double_booking;
ALTER TABLE public.rental_transactions
  DROP CONSTRAINT IF EXISTS rental_no_double_booking;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rental_transactions_no_double_booking'
      AND conrelid = 'public.rental_transactions'::regclass
  ) THEN
    ALTER TABLE public.rental_transactions
      ADD CONSTRAINT rental_transactions_no_double_booking
      EXCLUDE USING gist (
        listing_id WITH =,
        daterange(start_date, end_date, '[]') WITH &&
      ) WHERE (status IN ('pending', 'accepted', 'active'));
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'exclusion constraint: % (baris legacy tanpa listing_id tidak konflik — aman)', SQLERRM;
END $do$;

-- ════════════════════════════════════════════════════════════════════════════
-- J. HELPERS + RLS + POLICIES
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND role::text = 'SUPERADMIN'
      AND status = 'active'
  );
$fn$;

CREATE OR REPLACE FUNCTION public.get_my_store(p_store_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT s.id
  FROM public.stores s
  WHERE s.user_id = auth.uid()
    AND s.status = 'active'
    AND (p_store_id IS NULL OR s.id = p_store_id)
  ORDER BY s.created_at
  LIMIT 1;
$fn$;

COMMENT ON FUNCTION public.get_my_store(uuid) IS
  'Resolve the callers owned ACTIVE store; pass a store_id to verify ownership, NULL for first active.';

ALTER TABLE public.rental_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlists           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_records     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users               ENABLE ROW LEVEL SECURITY;

-- rentals: tenant baca miliknya
DROP POLICY IF EXISTS rentals_select_own ON public.rental_transactions;
CREATE POLICY rentals_select_own
  ON public.rental_transactions FOR SELECT TO authenticated
  USING (tenant_id = auth.uid() OR buyer_id = auth.uid());

-- rentals: pemilik toko baca rental tokonya
DROP POLICY IF EXISTS rentals_select_store_owner ON public.rental_transactions;
CREATE POLICY rentals_select_store_owner
  ON public.rental_transactions FOR SELECT TO authenticated
  USING (
    store_id IN (SELECT s.id FROM public.stores s WHERE s.user_id = auth.uid())
    OR store_id IN (SELECT s.id FROM public.stores s WHERE s.owner_id = auth.uid())
  );

-- rentals: superadmin baca semua
DROP POLICY IF EXISTS rentals_select_superadmin ON public.rental_transactions;
CREATE POLICY rentals_select_superadmin
  ON public.rental_transactions FOR SELECT TO authenticated
  USING (public.is_superadmin());

-- TIDAK ada INSERT/UPDATE/DELETE policy — semua tulisan lewat RPC (default-deny).

-- wishlists
DROP POLICY IF EXISTS wishlists_select_own ON public.wishlists;
CREATE POLICY wishlists_select_own ON public.wishlists
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS wishlists_write_own ON public.wishlists;
CREATE POLICY wishlists_write_own ON public.wishlists
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS wishlists_delete_own ON public.wishlists;
CREATE POLICY wishlists_delete_own ON public.wishlists
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- payment_records: baca untuk kedua pihak
DROP POLICY IF EXISTS payments_select_tenant ON public.payment_records;
CREATE POLICY payments_select_tenant ON public.payment_records
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rental_transactions r
      WHERE r.id = payment_records.rental_id
        AND (r.tenant_id = auth.uid() OR r.buyer_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS payments_select_store_owner ON public.payment_records;
CREATE POLICY payments_select_store_owner ON public.payment_records
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rental_transactions r
      WHERE r.id = payment_records.rental_id
        AND r.store_id IN (SELECT s.id FROM public.stores s WHERE s.user_id = auth.uid())
    )
  );

-- users: baca baris sendiri / superadmin
DROP POLICY IF EXISTS users_select_own ON public.users;
CREATE POLICY users_select_own ON public.users
  FOR SELECT TO authenticated USING (id = auth.uid());

DROP POLICY IF EXISTS users_select_superadmin ON public.users;
CREATE POLICY users_select_superadmin ON public.users
  FOR SELECT TO authenticated USING (public.is_superadmin());

-- stores & listings: katalog aktif terbaca; pemilik melihat tokonya sendiri
DROP POLICY IF EXISTS stores_read_active ON public.stores;
CREATE POLICY stores_read_active ON public.stores
  FOR SELECT TO anon, authenticated
  USING (status = 'active' OR user_id = auth.uid() OR owner_id = auth.uid());

DROP POLICY IF EXISTS listings_read_catalog ON public.listings;
CREATE POLICY listings_read_catalog ON public.listings
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = listings.store_id
        AND (s.status = 'active' OR s.user_id = auth.uid() OR s.owner_id = auth.uid())
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- K. GRANTS
-- ════════════════════════════════════════════════════════════════════════════

GRANT SELECT ON public.stores, public.listings TO anon, authenticated;
GRANT SELECT ON public.rental_transactions TO authenticated;
GRANT SELECT ON public.wishlists           TO authenticated;
GRANT SELECT ON public.payment_records     TO authenticated;
GRANT SELECT ON public.users               TO authenticated;

DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'listings_id_seq' AND c.relkind = 'S'
  ) THEN
    GRANT USAGE, SELECT ON SEQUENCE public.listings_id_seq TO anon, authenticated;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'grant sequence: %', SQLERRM;
END $do$;

-- ════════════════════════════════════════════════════════════════════════════
-- L. SECURE RPCs
-- Semantik (dokumentasi kontrak Phase 3):
--   * end_date INCLUSIVE: 1–3 Okt = 3 hari; same-day = 1 hari.
--   * start_date >= CURRENT_DATE (Asia/Jakarta).
--   * Konflik: [s,e] bentrok dengan [s2,e2] iff s <= e2 AND s2 <= e,
--     hanya status pending/accepted/active yang mengunci inventori.
--   * subtotal = total_days * price_per_day; total = subtotal + deposit.
-- ════════════════════════════════════════════════════════════════════════════

-- L1. rental_quote -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rental_quote(
  p_listing_id bigint,
  p_start      date,
  p_end        date
)
RETURNS TABLE (
  ok            boolean,
  error         text,
  total_days    integer,
  price_per_day integer,
  deposit       integer,
  subtotal      integer,
  total         integer
)
LANGUAGE plpgsql
STABLE
AS $rpc$
DECLARE
  vListing public.listings%ROWTYPE;
  vDays    integer;
BEGIN
  SELECT * INTO vListing FROM public.listings WHERE id = p_listing_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'listing_not_found'::text, NULL::integer, NULL::integer, NULL::integer, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start THEN
    RETURN QUERY SELECT false, 'invalid_date_range'::text, NULL::integer, NULL::integer, NULL::integer, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  IF p_start < CURRENT_DATE THEN
    RETURN QUERY SELECT false, 'start_date_in_past'::text, NULL::integer, NULL::integer, NULL::integer, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  IF NOT vListing.available OR vListing.status <> 'active' THEN
    RETURN QUERY SELECT false, 'listing_unavailable'::text, NULL::integer, NULL::integer, NULL::integer, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = vListing.store_id AND s.status = 'active') THEN
    RETURN QUERY SELECT false, 'store_inactive'::text, NULL::integer, NULL::integer, NULL::integer, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  vDays := (p_end - p_start)::int + 1; -- end_date INCLUSIVE; same-day = 1 hari

  RETURN QUERY SELECT
    true,
    NULL::text,
    vDays,
    vListing.price_per_day,
    COALESCE(vListing.deposit, 0),
    vDays * vListing.price_per_day,
    vDays * vListing.price_per_day + COALESCE(vListing.deposit, 0);
END $rpc$;

REVOKE ALL ON FUNCTION public.rental_quote(bigint, date, date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.rental_quote(bigint, date, date) TO anon, authenticated;

-- L2. create_rental (ATOMIK) --------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_rental(
  p_listing_id bigint,
  p_start      date,
  p_end        date
)
RETURNS TABLE (
  ok             boolean,
  error          text,
  rental_id      uuid,
  code           text,
  status         text,
  total_days     integer,
  price_per_day  integer,
  deposit        integer,
  subtotal       integer,
  total          integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $rpc$
DECLARE
  vUser    uuid := auth.uid();
  vListing public.listings%ROWTYPE;
  vQuote   record;
  vCode    text;
  vRental  public.rental_transactions%ROWTYPE;
BEGIN
  IF vUser IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated'::text, NULL::uuid, NULL::text, NULL::text, NULL::integer, NULL::integer, NULL::integer, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  SELECT * INTO vQuote FROM public.rental_quote(p_listing_id, p_start, p_end);
  IF vQuote IS NULL OR NOT vQuote.ok THEN
    RETURN QUERY SELECT false,
      COALESCE(vQuote.error, 'quote_failed')::text,
      NULL::uuid, NULL::text, NULL::text, NULL::integer, NULL::integer, NULL::integer, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  SELECT * INTO vListing FROM public.listings WHERE id = p_listing_id;
  IF NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = vListing.store_id AND s.status = 'active') THEN
    RETURN QUERY SELECT false, 'store_inactive'::text, NULL::uuid, NULL::text, NULL::text, NULL::integer, NULL::integer, NULL::integer, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  -- Serialisasi booking per listing (mencegah double-booking konkuren).
  PERFORM pg_advisory_xact_lock(hashtextextended('jabsewa:listing:' || p_listing_id::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.rental_transactions r
    WHERE r.listing_id = p_listing_id
      AND r.status IN ('pending','accepted','active')
      AND daterange(r.start_date, r.end_date, '[]') && daterange(p_start, p_end, '[]')
  ) THEN
    RETURN QUERY SELECT false, 'date_conflict'::text, NULL::uuid, NULL::text, NULL::text, NULL::integer, NULL::integer, NULL::integer, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  vCode := 'R-' || to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYYMMDDHH24MISS')
         || '-' || substr(md5(vUser::text || clock_timestamp()::text), 1, 6);

  INSERT INTO public.rental_transactions (
    tenant_id, listing_id, store_id,
    start_date, end_date, total_days,
    price_per_day, deposit, subtotal, total,
    status, code
  ) VALUES (
    vUser, p_listing_id, vListing.store_id,
    p_start, p_end, vQuote.total_days,
    vQuote.price_per_day, vQuote.deposit, vQuote.subtotal, vQuote.total,
    'pending', vCode
  )
  ON CONFLICT DO NOTHING -- exclusion constraint / unique code: konflik → tanpa baris balik
  RETURNING * INTO vRental;

  IF vRental.id IS NULL THEN
    -- ON CONFLICT DO NOTHING: konflik jadwal (exclusion constraint) menghasilkan
    -- date_conflict — bukan exception 500 ke client.
    RETURN QUERY SELECT false, 'date_conflict'::text, NULL::uuid, NULL::text, NULL::text, NULL::integer, NULL::integer, NULL::integer, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    true, NULL::text,
    vRental.id, vRental.code, vRental.status,
    vRental.total_days, vRental.price_per_day, vRental.deposit, vRental.subtotal, vRental.total;
END $rpc$;

REVOKE ALL ON FUNCTION public.create_rental(bigint, date, date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_rental(bigint, date, date) TO authenticated;

-- L3. set_rental_status (transisi terjaga) -------------------------------------
CREATE OR REPLACE FUNCTION public.set_rental_status(
  p_rental_id uuid,
  p_status    text,
  p_reason    text DEFAULT NULL
)
RETURNS TABLE (ok boolean, error text, status text, rejection_reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $rpc$
DECLARE
  vRental   public.rental_transactions%ROWTYPE;
  vMyStore  uuid := public.get_my_store();
  vIsTenant boolean;
  vIsOwner  boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated'::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT * INTO vRental FROM public.rental_transactions WHERE id = p_rental_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not_found'::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  vIsTenant := vRental.tenant_id = auth.uid() OR vRental.buyer_id = auth.uid();
  vIsOwner  := vMyStore IS NOT NULL AND vRental.store_id = vMyStore;

  IF NOT vIsTenant AND NOT vIsOwner AND NOT public.is_superadmin() THEN
    RETURN QUERY SELECT false, 'forbidden'::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF vRental.status = 'pending' AND p_status = 'accepted' THEN
    IF NOT vIsOwner AND NOT public.is_superadmin() THEN
      RETURN QUERY SELECT false, 'forbidden'::text, NULL::text, NULL::text; RETURN;
    END IF;
    UPDATE public.rental_transactions SET status = 'accepted' WHERE id = p_rental_id;

  ELSIF vRental.status = 'pending' AND p_status = 'rejected' THEN
    IF NOT vIsOwner AND NOT public.is_superadmin() THEN
      RETURN QUERY SELECT false, 'forbidden'::text, NULL::text, NULL::text; RETURN;
    END IF;
    IF COALESCE(btrim(COALESCE(p_reason, '')), '') = '' THEN
      RETURN QUERY SELECT false, 'rejection_reason_required'::text, NULL::text, NULL::text; RETURN;
    END IF;
    UPDATE public.rental_transactions
       SET status = 'rejected', rejection_reason = btrim(p_reason)
     WHERE id = p_rental_id;

  ELSIF vRental.status = 'pending' AND p_status = 'cancelled' THEN
    IF NOT vIsTenant AND NOT public.is_superadmin() THEN
      RETURN QUERY SELECT false, 'forbidden'::text, NULL::text, NULL::text; RETURN;
    END IF;
    UPDATE public.rental_transactions SET status = 'cancelled' WHERE id = p_rental_id;

  ELSIF vRental.status = 'accepted' AND p_status = 'active' THEN
    IF NOT vIsOwner AND NOT public.is_superadmin() THEN
      RETURN QUERY SELECT false, 'forbidden'::text, NULL::text, NULL::text; RETURN;
    END IF;
    UPDATE public.rental_transactions SET status = 'active' WHERE id = p_rental_id;

  ELSIF vRental.status = 'active' AND p_status = 'completed' THEN
    IF NOT vIsOwner AND NOT public.is_superadmin() THEN
      RETURN QUERY SELECT false, 'forbidden'::text, NULL::text, NULL::text; RETURN;
    END IF;
    UPDATE public.rental_transactions SET status = 'completed' WHERE id = p_rental_id;

  ELSE
    RETURN QUERY SELECT false, 'illegal_transition'::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT * INTO vRental FROM public.rental_transactions WHERE id = p_rental_id;
  RETURN QUERY SELECT true, NULL::text, vRental.status, vRental.rejection_reason;
END $rpc$;

REVOKE ALL ON FUNCTION public.set_rental_status(uuid, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_rental_status(uuid, text, text) TO authenticated;

-- L4/L5. Read RPCs (tenant & store) --------------------------------------------
CREATE OR REPLACE FUNCTION public.get_rentals_for_user()
RETURNS TABLE (
  id uuid, code text, listing_id bigint, store_id uuid,
  start_date date, end_date date, total_days integer,
  price_per_day integer, deposit integer, subtotal integer, total integer,
  status text, rejection_reason text, payment_status text,
  created_at timestamptz, updated_at timestamptz,
  item_name text, item_image text, seller_name text, tenant_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $rpc$
  SELECT r.id, r.code, r.listing_id, r.store_id,
         r.start_date, r.end_date, r.total_days,
         r.price_per_day, r.deposit, r.subtotal, r.total,
         r.status, r.rejection_reason, r.payment_status,
         r.created_at, r.updated_at,
         COALESCE(l.name, 'Barang dihapus')      AS item_name,
         COALESCE(l.image_url, '')               AS item_image,
         COALESCE(s.store_name, s.name, 'Mitra JabSewa') AS seller_name,
         COALESCE(u.full_name, 'Penyewa')        AS tenant_name
  FROM public.rental_transactions r
  LEFT JOIN public.listings l ON l.id = r.listing_id
  LEFT JOIN public.stores   s ON s.id = r.store_id
  LEFT JOIN public.users    u ON u.id = r.tenant_id
  WHERE r.tenant_id = auth.uid() OR r.buyer_id = auth.uid()
  ORDER BY r.created_at DESC;
$rpc$;

CREATE OR REPLACE FUNCTION public.get_rentals_for_store()
RETURNS TABLE (
  id uuid, code text, listing_id bigint, store_id uuid,
  start_date date, end_date date, total_days integer,
  price_per_day integer, deposit integer, subtotal integer, total integer,
  status text, rejection_reason text, payment_status text,
  created_at timestamptz, updated_at timestamptz,
  item_name text, item_image text, seller_name text, tenant_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $rpc$
  SELECT r.id, r.code, r.listing_id, r.store_id,
         r.start_date, r.end_date, r.total_days,
         r.price_per_day, r.deposit, r.subtotal, r.total,
         r.status, r.rejection_reason, r.payment_status,
         r.created_at, r.updated_at,
         COALESCE(l.name, 'Barang dihapus')      AS item_name,
         COALESCE(l.image_url, '')               AS item_image,
         COALESCE(s.store_name, s.name, 'Mitra JabSewa') AS seller_name,
         COALESCE(u.full_name, 'Penyewa')        AS tenant_name
  FROM public.rental_transactions r
  LEFT JOIN public.listings l ON l.id = r.listing_id
  LEFT JOIN public.stores   s ON s.id = r.store_id
  LEFT JOIN public.users    u ON u.id = r.tenant_id
  WHERE r.store_id IN (
    SELECT s.id FROM public.stores s
    WHERE (s.user_id = auth.uid() OR s.owner_id = auth.uid()) AND s.status = 'active'
  )
  ORDER BY r.created_at DESC;
$rpc$;

GRANT EXECUTE ON FUNCTION public.get_rentals_for_user()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_rentals_for_store() TO authenticated;
REVOKE ALL ON FUNCTION public.get_rentals_for_user()  FROM anon, public;
REVOKE ALL ON FUNCTION public.get_rentals_for_store() FROM anon, public;

-- L6. Wishlist RPCs -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_wishlist()
RETURNS TABLE (listing_id bigint, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $rpc$
  SELECT w.listing_id, w.created_at
  FROM public.wishlists w
  WHERE w.user_id = auth.uid()
  ORDER BY w.created_at DESC;
$rpc$;

CREATE OR REPLACE FUNCTION public.toggle_wishlist(p_listing_id bigint)
RETURNS TABLE (listing_id bigint, active boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $rpc$
DECLARE
  vUser   uuid := auth.uid();
  vExists boolean;
BEGIN
  IF vUser IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.wishlists w
    WHERE w.user_id = vUser AND w.listing_id = p_listing_id
  ) INTO vExists;

  IF vExists THEN
    DELETE FROM public.wishlists
     WHERE user_id = vUser AND listing_id = p_listing_id;
    RETURN QUERY SELECT p_listing_id, false;
  ELSE
    INSERT INTO public.wishlists (user_id, listing_id)
    VALUES (vUser, p_listing_id)
    ON CONFLICT (user_id, listing_id) DO NOTHING;
    RETURN QUERY SELECT p_listing_id, true;
  END IF;
END $rpc$;

GRANT EXECUTE ON FUNCTION public.get_wishlist() TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_wishlist(bigint) TO authenticated;
REVOKE ALL ON FUNCTION public.get_wishlist() FROM anon, public;
REVOKE ALL ON FUNCTION public.toggle_wishlist(bigint) FROM anon, public;

-- L7. get_my_stores ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_stores()
RETURNS TABLE (
  id uuid, user_id uuid, name text, description text, city text,
  address text, status text, is_verified boolean, rating numeric,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $rpc$
  SELECT s.id, s.user_id,
         COALESCE(s.store_name, s.name)          AS name,
         s.description, s.city, s.address,
         s.status, s.is_verified, s.rating, s.created_at
  FROM public.stores s
  WHERE s.user_id = auth.uid() OR s.owner_id = auth.uid()
  ORDER BY (s.status = 'active') DESC, s.created_at DESC;
$rpc$;

GRANT EXECUTE ON FUNCTION public.get_my_stores() TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_stores() FROM anon, public;

-- L8. submit_seller_application ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_seller_application(
  p_store_name  text,
  p_description text DEFAULT '',
  p_contact     text DEFAULT '',
  p_city        text DEFAULT '',
  p_address     text DEFAULT ''
)
RETURNS TABLE (ok boolean, error text, application jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $rpc$
DECLARE
  vUser    uuid := auth.uid();
  vProfile public.users%ROWTYPE;
  vApp     jsonb;
  vName    text := btrim(coalesce(p_store_name, ''));
BEGIN
  IF vUser IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated'::text, NULL::jsonb; RETURN;
  END IF;
  IF vName = '' THEN
    RETURN QUERY SELECT false, 'store_name_required'::text, NULL::jsonb; RETURN;
  END IF;

  SELECT * INTO vProfile FROM public.users WHERE id = vUser;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'profile_not_found'::text, NULL::jsonb; RETURN;
  END IF;

  IF vProfile.seller_application IS NOT NULL
     AND vProfile.seller_application ->> 'status' IN ('draft', 'under_review') THEN
    RETURN QUERY SELECT false, 'application_already_pending'::text, vProfile.seller_application;
    RETURN;
  END IF;

  vApp := jsonb_build_object(
    'status', 'under_review',
    'storeName', vName,
    'description', btrim(coalesce(p_description, '')),
    'contact', btrim(coalesce(p_contact, '')),
    'city', coalesce(p_city, ''),
    'address', btrim(coalesce(p_address, '')),
    'submittedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

  UPDATE public.users SET seller_application = vApp WHERE id = vUser;
  RETURN QUERY SELECT true, NULL::text, vApp;
END $rpc$;

REVOKE ALL ON FUNCTION public.submit_seller_application(text, text, text, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.submit_seller_application(text, text, text, text, text) TO authenticated;

-- L9. decide_seller_application (SUPERADMIN) ---------------------------------------
CREATE OR REPLACE FUNCTION public.decide_seller_application(
  p_email   text,
  p_approve boolean,
  p_reason  text DEFAULT NULL
)
RETURNS TABLE (ok boolean, error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $rpc$
DECLARE
  vTarget  public.users%ROWTYPE;
  vApp     jsonb;
  vStoreId uuid;
  vNow     text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  IF NOT public.is_superadmin() THEN
    RETURN QUERY SELECT false, 'forbidden'::text; RETURN;
  END IF;

  SELECT * INTO vTarget FROM public.users
   WHERE lower(email) = lower(btrim(coalesce(p_email, '')));
  IF NOT FOUND OR vTarget.seller_application IS NULL THEN
    RETURN QUERY SELECT false, 'application_not_found'::text; RETURN;
  END IF;
  vApp := vTarget.seller_application;

  IF NOT p_approve THEN
    IF COALESCE(btrim(COALESCE(p_reason, '')), '') = '' THEN
      RETURN QUERY SELECT false, 'rejection_reason_required'::text; RETURN;
    END IF;
    UPDATE public.users
       SET seller_application = vApp
             || jsonb_build_object('status', 'rejected', 'reviewedAt', vNow,
                                   'rejectionReason', btrim(p_reason))
     WHERE id = vTarget.id;
    RETURN QUERY SELECT true, NULL::text; RETURN;
  END IF;

  -- role ditulis literal (type-agnostic: cocok untuk enum maupun text).
  UPDATE public.users
     SET role = 'STORE_OWNER'
   WHERE id = vTarget.id AND role::text <> 'SUPERADMIN';

  UPDATE public.users
     SET seller_application = jsonb_set(vApp, '{status}', '"approved"')
             || jsonb_build_object('reviewedAt', vNow),
         seller_profile = jsonb_build_object(
           'storeName', vApp ->> 'storeName',
           'description', COALESCE(vApp ->> 'description', ''),
           'contact', COALESCE(vApp ->> 'contact', ''),
           'city', COALESCE(vApp ->> 'city', ''),
           'address', COALESCE(vApp ->> 'address', ''))
   WHERE id = vTarget.id;

  SELECT s.id INTO vStoreId FROM public.stores s
   WHERE s.user_id = vTarget.id OR s.owner_id = vTarget.id
   ORDER BY s.created_at
   LIMIT 1;

  IF vStoreId IS NULL THEN
    INSERT INTO public.stores
      (user_id, owner_id, store_name, name, description, contact, city, address, status, is_verified)
    VALUES
      (vTarget.id, vTarget.id,
       vApp ->> 'storeName', vApp ->> 'storeName',
       COALESCE(vApp ->> 'description', ''),
       COALESCE(vApp ->> 'contact', ''),
       COALESCE(vApp ->> 'city', ''),
       COALESCE(vApp ->> 'address', ''),
       'active', false)
    RETURNING id INTO vStoreId;
  ELSE
    UPDATE public.stores
       SET store_name  = COALESCE(vApp ->> 'storeName', store_name),
           name        = COALESCE(vApp ->> 'storeName', name),
           description = COALESCE(vApp ->> 'description', description),
           contact     = COALESCE(vApp ->> 'contact', contact),
           city        = COALESCE(vApp ->> 'city', city),
           address     = COALESCE(vApp ->> 'address', address),
           status      = 'active',
           user_id     = COALESCE(user_id, vTarget.id),
           owner_id    = COALESCE(owner_id, vTarget.id)
     WHERE id = vStoreId;
  END IF;

  RETURN QUERY SELECT true, NULL::text;
END $rpc$;

REVOKE ALL ON FUNCTION public.decide_seller_application(text, boolean, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.decide_seller_application(text, boolean, text) TO authenticated;

-- L10. save_listing -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_listing(
  p_listing_id    bigint DEFAULT NULL,
  p_store_id      uuid DEFAULT NULL,
  p_name          text DEFAULT '',
  p_description   text DEFAULT '',
  p_category      text DEFAULT '',
  p_price_per_day integer DEFAULT 0,
  p_deposit       integer DEFAULT 0,
  p_image_url     text DEFAULT '',
  p_location      text DEFAULT '',
  p_available     boolean DEFAULT true
)
RETURNS TABLE (ok boolean, error text, listing_id bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $rpc$
DECLARE
  vStore uuid := public.get_my_store(p_store_id);
  vId    bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated'::text, NULL::bigint; RETURN;
  END IF;
  IF vStore IS NULL THEN
    RETURN QUERY SELECT false, 'no_active_store'::text, NULL::bigint; RETURN;
  END IF;
  IF btrim(coalesce(p_name, '')) = '' THEN
    RETURN QUERY SELECT false, 'name_required'::text, NULL::bigint; RETURN;
  END IF;
  IF COALESCE(p_price_per_day, 0) < 0 OR COALESCE(p_deposit, 0) < 0 THEN
    RETURN QUERY SELECT false, 'invalid_amount'::text, NULL::bigint; RETURN;
  END IF;

  IF p_listing_id IS NULL THEN
    INSERT INTO public.listings
      (store_id, name, description, category, price_per_day, deposit,
       image_url, location, available, status)
    VALUES
      (vStore, btrim(p_name), btrim(coalesce(p_description, '')),
       coalesce(p_category, ''), coalesce(p_price_per_day, 0), coalesce(p_deposit, 0),
       coalesce(p_image_url, ''), coalesce(p_location, ''), p_available, 'active')
    RETURNING id INTO vId;
  ELSE
    UPDATE public.listings SET
        name          = btrim(p_name),
        description   = btrim(coalesce(p_description, '')),
        category      = coalesce(p_category, ''),
        price_per_day = coalesce(p_price_per_day, 0),
        deposit       = coalesce(p_deposit, 0),
        image_url     = coalesce(p_image_url, ''),
        location      = coalesce(p_location, ''),
        available     = p_available
     WHERE id = p_listing_id AND store_id = vStore
    RETURNING id INTO vId;
    IF vId IS NULL THEN
      RETURN QUERY SELECT false, 'not_found_or_forbidden'::text, NULL::bigint; RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT true, NULL::text, vId;
END $rpc$;

REVOKE ALL ON FUNCTION public.save_listing(bigint, uuid, text, text, text, integer, integer, text, text, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.save_listing(bigint, uuid, text, text, text, integer, integer, text, text, boolean) TO authenticated;

-- L11. set_listing_availability / delete_listing -------------------------------------
CREATE OR REPLACE FUNCTION public.set_listing_availability(
  p_listing_id bigint,
  p_available  boolean
)
RETURNS TABLE (ok boolean, error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $rpc$
DECLARE vId bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated'::text; RETURN;
  END IF;
  UPDATE public.listings SET available = p_available
   WHERE id = p_listing_id
     AND store_id IN (
       SELECT s.id FROM public.stores s
       WHERE (s.user_id = auth.uid() OR s.owner_id = auth.uid()) AND s.status = 'active')
  RETURNING id INTO vId;
  IF vId IS NULL THEN
    RETURN QUERY SELECT false, 'not_found_or_forbidden'::text; RETURN;
  END IF;
  RETURN QUERY SELECT true, NULL::text;
END $rpc$;

CREATE OR REPLACE FUNCTION public.delete_listing(p_listing_id bigint)
RETURNS TABLE (ok boolean, error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $rpc$
DECLARE vId bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated'::text; RETURN;
  END IF;
  BEGIN
    DELETE FROM public.listings
     WHERE id = p_listing_id
       AND store_id IN (
         SELECT s.id FROM public.stores s
         WHERE (s.user_id = auth.uid() OR s.owner_id = auth.uid()) AND s.status = 'active')
    RETURNING id INTO vId;
  EXCEPTION WHEN foreign_key_violation THEN
    RETURN QUERY SELECT false, 'has_rentals'::text; RETURN;
  END;
  IF vId IS NULL THEN
    RETURN QUERY SELECT false, 'not_found_or_forbidden'::text; RETURN;
  END IF;
  RETURN QUERY SELECT true, NULL::text;
END $rpc$;

REVOKE ALL ON FUNCTION public.set_listing_availability(bigint, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_listing_availability(bigint, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.delete_listing(bigint) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.delete_listing(bigint) TO authenticated;

-- L12. listings_for_my_store -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listings_for_my_store()
RETURNS TABLE (
  id bigint, store_id uuid, name text, description text, category text,
  price_per_day integer, deposit integer, image_url text, location text,
  available boolean, rating numeric, successful_transactions integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $rpc$
  SELECT l.id, l.store_id, l.name, l.description,
         COALESCE(l.category, '') AS category,
         l.price_per_day, COALESCE(l.deposit, 0) AS deposit,
         COALESCE(l.image_url, '') AS image_url,
         COALESCE(l.location, '') AS location,
         l.available, l.rating, l.successful_transactions
  FROM public.listings l
  WHERE l.store_id IN (
    SELECT s.id FROM public.stores s
    WHERE (s.user_id = auth.uid() OR s.owner_id = auth.uid()) AND s.status = 'active'
  )
  ORDER BY l.created_at DESC;
$rpc$;

GRANT EXECUTE ON FUNCTION public.listings_for_my_store() TO authenticated;
REVOKE ALL ON FUNCTION public.listings_for_my_store() FROM anon, public;

-- L13. list_seller_applications (SUPERADMIN) --------------------------------------------
CREATE OR REPLACE FUNCTION public.list_seller_applications()
RETURNS TABLE (
  id text, applicant_name text, applicant_email text, seller_application jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $rpc$
  SELECT u.email AS id,
         COALESCE(u.full_name, split_part(u.email, '@', 1)) AS applicant_name,
         u.email AS applicant_email,
         u.seller_application
  FROM public.users u
  WHERE public.is_superadmin()
    AND u.seller_application IS NOT NULL
    AND u.seller_application ->> 'status' IS DISTINCT FROM 'draft'
  ORDER BY COALESCE(u.seller_application ->> 'submittedAt', '') DESC;
$rpc$;

REVOKE ALL ON FUNCTION public.list_seller_applications() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.list_seller_applications() TO authenticated;

-- L14. list_audit_logs (SUPERADMIN) ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_audit_logs(p_limit integer DEFAULT 100)
RETURNS TABLE (
  id bigint, action text, actor_email text, target_type text,
  target_id text, ip_address inet, created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $rpc$
  SELECT a.id, a.action,
         COALESCE(u.email, a.admin_id::text) AS actor_email,
         a.target_type, a.target_id, a.ip_address, a.created_at
  FROM public.admin_audit_logs a
  LEFT JOIN public.users u ON u.id = a.admin_id
  WHERE public.is_superadmin()
  ORDER BY a.created_at DESC
  LIMIT least(greatest(COALESCE(p_limit, 100), 1), 500);
$rpc$;

REVOKE ALL ON FUNCTION public.list_audit_logs(integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.list_audit_logs(integer) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- M. DEMO SEED (hanya bila tabel kosong — masing-masing exception-safe)
-- ════════════════════════════════════════════════════════════════════════════

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.stores) THEN
    INSERT INTO public.stores
      (store_name, name, description, contact, city, address, status, is_verified, rating)
    VALUES
      ('Sewa Kamera Jakarta', 'Sewa Kamera Jakarta', 'Rental kamera & perlengkapan foto profesional.', '081200000001', 'Jakarta Selatan', 'Jl. Kebayoran Lama No. 12', 'active', true, 4.9),
      ('Gading Rental Tools', 'Gading Rental Tools', 'Peralatan event, projector, dan sound system siap antar.', '081200000002', 'Jakarta Utara', 'Jl. Kelapa Gading Boulevard No. 5', 'active', true, 4.7),
      ('GameNest', 'GameNest', 'Konsol game, VR, dan koleksi judul terbaru.', '081200000003', 'Jakarta Barat', 'Jl. Tomang Raya No. 40', 'active', true, 4.8),
      ('TrailBase Outdoor', 'TrailBase Outdoor', 'Tenda, carrier, dan perlengkapan camping lengkap.', '081200000004', 'Depok', 'Jl. Margonda Raya No. 88', 'active', false, 4.6);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'seed stores: % (kolom legacy NOT NULL tanpa default? isi manual)', SQLERRM;
END $do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.listings) THEN
    INSERT INTO public.listings
      (store_id, name, description, category, price, price_per_day, deposit,
       image_url, location, available, stock, status, rating, successful_transactions)
    SELECT s.id, seed.name, seed.description, seed.category,
           seed.price, seed.price, seed.deposit,
           seed.image_url, seed.location, seed.available, 1, 'active',
           seed.rating, seed.tx
    FROM (VALUES
      ('Sewa Kamera Jakarta', 'Sony Alpha A7 III', 'Kamera full-frame untuk foto, video, dan kebutuhan event.', 'photography', 150000, 500000, 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1000&q=80', 'Jakarta Selatan', true, 4.9, 128),
      ('GameNest', 'PlayStation 5', 'Konsol lengkap dengan dua controller dan koleksi game pilihan.', 'gadget', 100000, 750000, 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?auto=format&fit=crop&w=1000&q=80', 'Jakarta Barat', true, 4.8, 203),
      ('TrailBase Outdoor', 'Camping Tent 4 Orang', 'Tenda waterproof yang nyaman untuk camping akhir pekan.', 'sports', 75000, 300000, 'https://images.unsplash.com/photo-1522163182402-834f871fd851?auto=format&fit=crop&w=1000&q=80', 'Depok', true, 4.7, 92),
      ('Sewa Kamera Jakarta', 'DJI Mini Drone', 'Drone ringan dengan video 4K dan baterai cadangan.', 'photography', 220000, 1000000, 'https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=1000&q=80', 'Jakarta Selatan', false, 4.9, 74),
      ('TrailBase Outdoor', 'Mountain Bike', 'Sepeda gunung untuk jalur kota dan trail ringan.', 'sports', 90000, 400000, 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=1000&q=80', 'Depok', true, 4.6, 58),
      ('Gading Rental Tools', 'Projector Epson', 'Projector terang untuk presentasi dan acara.', 'event', 180000, 600000, 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1000&q=80', 'Jakarta Utara', true, 4.8, 81),
      ('Gading Rental Tools', 'Sound System Portable', 'Speaker aktif + mic wireless untuk acara 200 orang.', 'event', 250000, 800000, 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1000&q=80', 'Jakarta Utara', true, 4.7, 66),
      ('GameNest', 'Nintendo Switch OLED', 'Konsol hybrid dengan layar OLED dan Joy-Con neon.', 'gadget', 85000, 500000, 'https://images.unsplash.com/photo-1578303512597-81e6cc155b3e?auto=format&fit=crop&w=1000&q=80', 'Jakarta Barat', true, 4.7, 119)
    ) AS seed(store_name, name, description, category, price, deposit, image_url, location, available, rating, tx)
    JOIN public.stores s ON COALESCE(s.store_name, s.name) = seed.store_name;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'seed listings: % (kolom legacy NOT NULL tanpa default? isi manual)', SQLERRM;
END $do$;

-- ════════════════════════════════════════════════════════════════════════════
-- N. SANITY CHECK (peringatan, tidak menggagalkan eksekusi)
-- ════════════════════════════════════════════════════════════════════════════

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname='public' AND c.relname='rental_transactions' AND c.relrowsecurity) THEN
    RAISE WARNING 'RLS tidak aktif pada rental_transactions — periksa manual';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rental_transactions' AND policyname LIKE '%insert%') THEN
    RAISE WARNING 'Ada INSERT policy pada rental_transactions — tulisan seharusnya hanya via RPC';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='create_rental' AND pronamespace='public'::regnamespace) THEN
    RAISE WARNING 'RPC create_rental tidak ditemukan setelah patch — periksa error di atas';
  END IF;
END $do$;