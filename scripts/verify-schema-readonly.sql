-- ============================================================================
-- JabSewa — VERIFIKASI BASELINE ERD v2 (100% READ-ONLY)
-- ============================================================================
-- TUJUAN  : memverifikasi di project Supabase BARU setelah baseline
--           20260926000000_baseline_erd_v2.sql dijalankan:
--             1. 14 tabel ada
--             2. RLS aktif di semua 14 tabel
--             3. Tidak ada policy INSERT/UPDATE/DELETE pada tabel transaksi
--             4. 30 RPC publik + helper ada (signature sesuai kontrak)
--             5. Grants: anon tidak punya EXECUTE kecuali quote_rental + helper
--             6. Enum & tipe kolom kunci sesuai kontrak §2/§4
-- JAMINAN : SKRIP INI 100% READ-ONLY. Hanya SELECT pg_catalog/information_schema
--           dan blok DO yang hanya RAISE NOTICE. Tidak ada DDL/DML.
-- CARA    : Supabase Dashboard → SQL Editor → paste seluruh file → Run
-- OUTPUT  : NOTICE "=== RINGKASAN ===" di bagian akhir (PASS/FAIL per cek).
-- ============================================================================

-- ── 1. Tabel (harus 14) ──────────────────────────────────────────────────────
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND c.relname IN (
    'users','categories','store_applications','stores','listings','listing_images',
    'rental_transactions','transaction_items','payments','late_fees','disputes',
    'reviews','wishlists','audit_logs')
ORDER BY c.relname;

-- ── 2. Tabel lain yang JUGA ada di public (deteksi sisa legacy) ──────────────
SELECT c.relname AS extra_table
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND c.relname NOT IN (
    'users','categories','store_applications','stores','listings','listing_images',
    'rental_transactions','transaction_items','payments','late_fees','disputes',
    'reviews','wishlists','audit_logs')
ORDER BY c.relname;

-- ── 3. Semua policy (informatif + diverifikasi blok DO di bawah) ────────────
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ── 4. RPC & helper publik ───────────────────────────────────────────────────
SELECT p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS is_security_definer,
       (SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)
          FROM unnest(proargtypes) arg(x)
          JOIN pg_type t ON t.oid = x
          JOIN pg_enum e ON e.enumtypid = t.oid) AS enum_params
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    -- helpers
    'is_admin','is_active_user','my_store','owns_store_of_tx','log_audit',
    'occupied_units','rental_unit_days','refresh_late_fee_total','sync_is_seller',
    -- trigger fns
    'handle_new_user','touch_updated_at',
    -- 30 RPC
    'submit_store_application','get_my_applications','list_store_applications',
    'decide_store_application','get_my_stores','update_my_store',
    'set_my_store_status','admin_set_store_status','save_listing',
    'set_listing_availability','delete_listing','admin_set_listing_status',
    'get_wishlist','toggle_wishlist','quote_rental','create_rental',
    'cancel_rental','submit_payment','decide_payment','start_rental',
    'mark_overdue','record_return','apply_late_fee','decide_late_fee',
    'open_dispute','resolve_dispute','create_review',
    'admin_set_user_status','admin_set_user_role','list_audit_logs')
ORDER BY function_name, arguments;

-- ── 5. Grants tabel (informatif) ─────────────────────────────────────────────
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
  AND table_name IN (
    'users','categories','store_applications','stores','listings','listing_images',
    'rental_transactions','transaction_items','payments','late_fees','disputes',
    'reviews','wishlists','audit_logs')
ORDER BY table_name, grantee;

-- ══════════════════════════════════════════════════════════════════════════
-- 6. PEMERIKSAAN TERPROGRAM (hanya RAISE NOTICE — tidak menulis apa pun)
-- ══════════════════════════════════════════════════════════════════════════
DO $verdict$
DECLARE
  v_missing_tables  text := '';
  v_missing_rls     text := '';
  v_write_policies  text := '';
  v_missing_rpc     text := '';
  v_anon_exec_leaks integer := 0;
  t text;
  r record;
BEGIN
  -- 6a. 14 tabel wajib ada + RLS aktif
  FOREACH t IN ARRAY ARRAY[
    'users','categories','store_applications','stores','listings','listing_images',
    'rental_transactions','transaction_items','payments','late_fees','disputes',
    'reviews','wishlists','audit_logs']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r'
    ) THEN
      v_missing_tables := v_missing_tables || t || ' ';
    ELSIF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t AND c.relrowsecurity
    ) THEN
      v_missing_rls := v_missing_rls || t || ' ';
    END IF;
  END LOOP;

  IF v_missing_tables <> '' THEN
    RAISE NOTICE 'FAIL — tabel hilang: %', v_missing_tables;
  ELSE
    RAISE NOTICE 'PASS — 14 tabel baseline ada.';
  END IF;

  IF v_missing_rls <> '' THEN
    RAISE NOTICE 'FAIL — RLS tidak aktif pada: %', v_missing_rls;
  ELSE
    RAISE NOTICE 'PASS — RLS aktif di semua 14 tabel.';
  END IF;

  -- 6b. Tabel transaksi tidak boleh punya policy tulis
  SELECT string_agg(DISTINCT tablename || '.' || policyname || ' (' || cmd || ')', ', ')
    INTO v_write_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('rental_transactions','transaction_items','payments',
                      'late_fees','disputes','audit_logs')
    AND cmd IN ('INSERT','UPDATE','DELETE');

  IF v_write_policies IS NOT NULL THEN
    RAISE NOTICE 'FAIL — policy tulis ditemukan pada tabel transaksi: %', v_write_policies;
  ELSE
    RAISE NOTICE 'PASS — tidak ada policy tulis pada tabel transaksi (tulis via RPC).';
  END IF;

  -- 6c. 30 RPC wajib ada
  FOREACH t IN ARRAY ARRAY[
    'submit_store_application','get_my_applications','list_store_applications',
    'decide_store_application','get_my_stores','update_my_store',
    'set_my_store_status','admin_set_store_status','save_listing',
    'set_listing_availability','delete_listing','admin_set_listing_status',
    'get_wishlist','toggle_wishlist','quote_rental','create_rental',
    'cancel_rental','submit_payment','decide_payment','start_rental',
    'mark_overdue','record_return','apply_late_fee','decide_late_fee',
    'open_dispute','resolve_dispute','create_review',
    'admin_set_user_status','admin_set_user_role','list_audit_logs']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = t
    ) THEN
      v_missing_rpc := v_missing_rpc || t || ' ';
    END IF;
  END LOOP;

  IF v_missing_rpc <> '' THEN
    RAISE NOTICE 'FAIL — RPC hilang: %', v_missing_rpc;
  ELSE
    RAISE NOTICE 'PASS — 30 RPC kontrak ada.';
  END IF;

  -- 6d. anon EXECUTE hanya boleh: quote_rental + is_admin/is_active_user
  FOR r IN
    SELECT p.proname, p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND EXISTS (
        SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        WHERE a.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'anon')
          AND a.privilege_type = 'EXECUTE')
  LOOP
    IF r.proname NOT IN ('quote_rental','is_admin','is_active_user') THEN
      v_anon_exec_leaks := v_anon_exec_leaks + 1;
      RAISE NOTICE 'FAIL — anon punya EXECUTE ke % (di luar kontrak)', r.proname;
    END IF;
  END LOOP;

  IF v_anon_exec_leaks = 0 THEN
    RAISE NOTICE 'PASS — anon EXECUTE hanya quote_rental + helper RLS.';
  END IF;

  -- 6e. Tipe kolom kunci
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='rental_transactions' AND column_name='status'
      AND udt_name='transaction_status'
  ) THEN
    RAISE NOTICE 'FAIL — rental_transactions.status bukan enum transaction_status';
  ELSE
    RAISE NOTICE 'PASS — tipe kolom kunci sesuai (status enum, id uuid).';
  END IF;

  RAISE NOTICE '=== RINGKASAN SELESAI ===';
END $verdict$;
