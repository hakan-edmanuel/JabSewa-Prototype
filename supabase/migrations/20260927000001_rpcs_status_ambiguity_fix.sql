-- ============================================================================
-- MIGRATION CANONICAL REPOSITORY (FORWARD-ONLY) — 20260927000001_rpcs_status_ambiguity_fix.sql
-- ============================================================================
-- STATUS: Migration canonical repository — bagian WAJIB dari migration chain
--         (setelah 20260927000000_rpcs_guard_stop_fix.sql). Idempotent
--         (CREATE OR REPLACE), aman dijalankan ulang.
--         Riwayat environment (evidence historis, BUKAN klaim live-state
--         terbaru): diterapkan 27 Sep 2026 ke project dev `yjwlqqigbzvjbvpwybup`
--         via `node scripts/apply-migration.mjs … --yes` — regresi 79/79
--         create_rental + 26/26 quote_rental + `npm run verify:supabase` PASS
--         (docs/db-rebuild/06-migration-plan.md & 14-create-rental-fix-report.md).
--         Asal: fix diusulkan sebagai docs/db-rebuild/13-usulan-migration-
--         status-ambiguity.sql, disetujui, lalu dipromosikan 1:1 ke file ini
--         (salinan usulan tetap di docs sebagai artefak historis).
--
-- BUG-1 (kritis, laporan 13-create-rental-test-report.md §7):
--   create_rental & cancel_rental punya OUT parameter bernama `status`
--   (dari RETURNS TABLE). Referensi kolom `status` tanpa kualifikasi
--   memicu PL/pgSQL variable_conflict=error → 42702 "column reference
--   \"status\" is ambiguous" pada SELURUH success-path kedua RPC.
--
-- FIX: kualifikasi referensi kolom yang ambigu. DUA baris berubah,
--   perilaku kontrak TIDAK berubah. CREATE OR REPLACE mempertahankan grants.
--
-- VERIFIKASI pasca-terap:
--   1. node scripts/test-create-rental.mjs   (regresi penuh; menulis data uji)
--   2. node scripts/test-quote-rental.mjs
--   3. npm run verify:supabase               (read-only)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1/2 — create_rental: kualifikasi `status` pada SELECT stores
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_rental(p_start date, p_end date, p_items jsonb)
RETURNS TABLE (
  ok boolean, error text,
  rental_id uuid, status text,
  subtotal bigint, deposit_total bigint, total bigint, total_days integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_item jsonb;
  v_lid uuid;
  v_qty integer;
  v_listing public.listings%ROWTYPE;
  v_store uuid := NULL;
  v_store_status public.store_status;
  v_days integer;
  v_units integer;
  v_subtotal bigint := 0;
  v_deposit_total bigint := 0;
  v_tx public.rental_transactions%ROWTYPE;
  v_seen uuid[] := '{}';
BEGIN
  IF v_user IS NULL THEN ok := false; error := 'unauthenticated'; RETURN NEXT; RETURN; END IF;
  IF NOT public.is_active_user() THEN ok := false; error := 'user_inactive'; RETURN NEXT; RETURN; END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start THEN
    ok := false; error := 'invalid_date_range'; RETURN NEXT; RETURN;
  END IF;
  IF p_start < CURRENT_DATE THEN ok := false; error := 'start_date_in_past'; RETURN NEXT; RETURN; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    ok := false; error := 'invalid_items'; RETURN NEXT; RETURN;
  END IF;
  IF jsonb_array_length(p_items) = 0 THEN ok := false; error := 'empty_items'; RETURN NEXT; RETURN; END IF;
  IF jsonb_array_length(p_items) > 20 THEN ok := false; error := 'too_many_items'; RETURN NEXT; RETURN; END IF;

  v_days := (p_end - p_start)::int + 1;  -- end_date INCLUSIVE; same-day = 1

  -- PASS 1 — validasi bisnis (tanpa tulis): satu store, listing aktif, qty, durasi.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_lid := (v_item ->> 'listing_id')::uuid;
    v_qty := COALESCE((v_item ->> 'quantity')::int, 0);
    IF v_lid IS NULL THEN ok := false; error := 'invalid_items'; RETURN NEXT; RETURN; END IF;
    IF v_lid = ANY (v_seen) THEN ok := false; error := 'duplicate_item'; RETURN NEXT; RETURN; END IF;
    v_seen := v_seen || v_lid;
    IF v_qty <= 0 THEN ok := false; error := 'invalid_quantity'; RETURN NEXT; RETURN; END IF;

    SELECT * INTO v_listing FROM public.listings WHERE id = v_lid;
    IF NOT FOUND THEN ok := false; error := 'listing_not_found'; RETURN NEXT; RETURN; END IF;
    IF v_listing.status <> 'active' THEN ok := false; error := 'listing_unavailable'; RETURN NEXT; RETURN; END IF;

    IF v_store IS NULL THEN v_store := v_listing.store_id;
    ELSIF v_store <> v_listing.store_id THEN
      ok := false; error := 'mixed_stores'; RETURN NEXT; RETURN;  -- PRD §5.1 / C-21
    END IF;

    v_units := ceil(v_days::numeric / public.rental_unit_days(v_listing.rental_unit))::int;
    IF v_listing.min_rental_duration IS NOT NULL AND v_units < v_listing.min_rental_duration THEN
      ok := false; error := 'min_duration'; RETURN NEXT; RETURN;
    END IF;

    v_subtotal := v_subtotal + v_listing.price * v_qty * v_units;
    v_deposit_total := v_deposit_total + v_listing.deposit * v_qty;
  END LOOP;

  -- FIX BUG-1 (satu-satunya perubahan): kualifikasi kolom status dengan alias s.
  SELECT s.status INTO v_store_status FROM public.stores s WHERE s.id = v_store;
  IF NOT FOUND OR v_store_status <> 'active' THEN
    ok := false; error := 'store_inactive'; RETURN NEXT; RETURN;
  END IF;

  -- PASS 2 — advisory lock per listing (urut id = deterministik, anti-deadlock).
  FOR v_lid IN
    SELECT DISTINCT (x ->> 'listing_id')::uuid
    FROM jsonb_array_elements(p_items) x
    ORDER BY 1
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('jabsewa:listing:' || v_lid::text, 0));
  END LOOP;

  -- PASS 3 — re-check ketersediaan DI BAWAH lock (stock multi-unit, PRD §9).
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_lid := (v_item ->> 'listing_id')::uuid;
    v_qty := (v_item ->> 'quantity')::int;
    SELECT * INTO v_listing FROM public.listings WHERE id = v_lid;
    IF v_qty > v_listing.stock - public.occupied_units(v_lid, p_start, p_end) THEN
      ok := false; error := 'insufficient_stock'; RETURN NEXT; RETURN;
    END IF;
  END LOOP;

  -- PASS 4 — insert atomik. (total_days tidak dikolomkan — kontrak §4.7;
  -- durasi selalu turun dari start/end inclusive.)
  INSERT INTO public.rental_transactions
    (buyer_id, store_id, start_date, end_date,
     subtotal, deposit_total, total, status)
  VALUES
    (v_user, v_store, p_start, p_end,
     v_subtotal, v_deposit_total, v_subtotal + v_deposit_total, 'pending')
  RETURNING * INTO v_tx;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_lid := (v_item ->> 'listing_id')::uuid;
    v_qty := (v_item ->> 'quantity')::int;
    SELECT * INTO v_listing FROM public.listings WHERE id = v_lid;
    v_units := ceil(v_days::numeric / public.rental_unit_days(v_listing.rental_unit))::int;
    INSERT INTO public.transaction_items
      (transaction_id, listing_id, quantity, price, deposit, subtotal)
    VALUES
      (v_tx.id, v_lid, v_qty, v_listing.price, v_listing.deposit,
       v_listing.price * v_qty * v_units);
  END LOOP;

  PERFORM public.log_audit('rental_create', 'rental_transaction', v_tx.id,
    jsonb_build_object('store_id', v_store, 'items', jsonb_array_length(p_items)));

  ok := true; error := NULL;
  rental_id := v_tx.id; status := v_tx.status::text;
  subtotal := v_tx.subtotal; deposit_total := v_tx.deposit_total; total := v_tx.total;
  total_days := v_days; RETURN NEXT;
END $$;

-- ---------------------------------------------------------------------------
-- 2/2 — cancel_rental: kualifikasi `status` pada UPDATE payments (WHERE)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_rental(p_rental_id uuid, p_reason text DEFAULT NULL)
RETURNS TABLE (ok boolean, error text, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_tx public.rental_transactions%ROWTYPE;
  v_is_buyer boolean;
  v_is_owner boolean;
  v_reason text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF v_user IS NULL THEN ok := false; error := 'unauthenticated'; RETURN NEXT; RETURN; END IF;
  SELECT * INTO v_tx FROM public.rental_transactions WHERE id = p_rental_id;
  IF NOT FOUND THEN ok := false; error := 'not_found'; RETURN NEXT; RETURN; END IF;

  v_is_buyer := v_tx.buyer_id = v_user;
  v_is_owner := public.owns_store_of_tx(p_rental_id);
  IF NOT v_is_buyer AND NOT v_is_owner AND NOT public.is_admin() THEN
    ok := false; error := 'forbidden'; RETURN NEXT; RETURN;
  END IF;

  -- PRD §5.2 (OQ-1): buyer boleh cancel di pending/payment_verify;
  -- owner (dan admin) sampai confirmed.
  IF v_is_buyer AND NOT v_is_owner AND NOT public.is_admin() THEN
    IF NOT v_tx.status IN ('pending', 'payment_verify') THEN
      ok := false; error := 'illegal_transition'; RETURN NEXT; RETURN;
    END IF;
  ELSE
    IF NOT v_tx.status IN ('pending', 'payment_verify', 'confirmed') THEN
      ok := false; error := 'illegal_transition'; RETURN NEXT; RETURN;
    END IF;
    IF v_reason = '' THEN
      ok := false; error := 'reason_required'; RETURN NEXT; RETURN;
    END IF;
  END IF;

  UPDATE public.rental_transactions
     SET status = 'cancelled', cancelled_by = v_user,
         cancelled_at = now(), cancel_reason = NULLIF(v_reason, '')
   WHERE id = p_rental_id;

  -- FIX BUG-1 (satu-satunya perubahan): alias p + kualifikasi kolom di WHERE.
  -- (LHS `SET status` memang milik tabel target dan tidak ambigu.)
  UPDATE public.payments p
     SET status = 'failed'
   WHERE p.transaction_id = p_rental_id AND p.status = 'pending';

  PERFORM public.log_audit('rental_cancel', 'rental_transaction', p_rental_id,
    jsonb_build_object('from', v_tx.status, 'reason', v_reason));
  ok := true; error := NULL; status := 'cancelled'; RETURN NEXT;
END $$;

-- ---------------------------------------------------------------------------
-- SANITY CHECK deploy-time — gagal keras bila pola ambigu masih ada.
-- ---------------------------------------------------------------------------
DO $sanity_status_ambiguity$
DECLARE
  v_def text;
  v_bad text := '';
BEGIN
  v_def := pg_get_functiondef('public.create_rental(date,date,jsonb)'::regprocedure);
  IF v_def LIKE '%SELECT status INTO v_store_status FROM public.stores WHERE%'
     OR position('SELECT s.status INTO v_store_status FROM public.stores s' in v_def) = 0 THEN
    v_bad := v_bad || 'create_rental[unqualified-status] ';
  END IF;

  v_def := pg_get_functiondef('public.cancel_rental(uuid,text)'::regprocedure);
  IF v_def LIKE '%AND status = %pending%'
     OR position('p.status = ' in v_def) = 0 THEN
    v_bad := v_bad || 'cancel_rental[unqualified-status] ';
  END IF;

  IF v_bad <> '' THEN
    RAISE EXCEPTION 'Fix ambiguitas status belum diterapkan bersih: %', v_bad;
  END IF;
  RAISE NOTICE 'OK — create_rental & cancel_rental bebas referensi status ambigu.';
END
$sanity_status_ambiguity$;
