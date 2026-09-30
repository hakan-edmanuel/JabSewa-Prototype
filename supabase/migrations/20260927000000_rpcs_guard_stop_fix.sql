-- ============================================================================
-- JabSewa — FIX: guard error RPC plpgsql fall-through (RETURN NEXT tanpa stop)
-- ============================================================================
-- Migrasi FORWARD-ONLY untuk project yang SUDAH menjalankan baseline
-- 20260926000000_baseline_erd_v2.sql dan fix 20260926000002_rpcs_return_next_fix.sql.
-- Idempotent (CREATE OR REPLACE), aman dijalankan ulang. Jangan pernah mengedit
-- baseline atau migration sebelumnya yang sudah diterapkan.
--
-- GEJALA (live, verifier npm run verify:supabase):
--   * "quote_rental menolak rentang terbalik" — baris=4 (invalid_date_range,
--     listing_not_found, store_inactive, lalu baris sukses ok=true)
--   * "quote_rental menolak tanggal lampau" — baris=4 (start_date_in_past + …)
--   * "quote_rental bentuk kontrak" — baris=3 (listing_not_found + … + ok=true)
--   Kontrak 04-rpc-security-contract.md §4: RPC ber-RETURNS TABLE mengembalikan
--   PERSIS SATU baris per panggilan.
--
-- AKAR MASALAH: migrasi 20260926000002 mengubah setiap `RETURN;` →
--   `RETURN NEXT;` secara mekanis. Pada PL/pgSQL, RETURN NEXT mem-emit baris
--   TETAPI TIDAK menghentikan eksekusi (docs PostgreSQL §41.6.1.2: "RETURN NEXT
--   does not actually return from the function; it just appends a row"). Setiap
--   guard error kini menambah baris error lalu eksekusi BERLANJUT sampai baris
--   sukses terakhir. Selain melanggar kontrak respons, ini berbahaya pada RPC
--   mutasi: create_rental bisa INSERT transaksi sungguhan meski validasi gagal
--   (insufficient_stock tidak lagi menghentikan), dan jalur reject
--   decide_store_application tetap melanjutkan ke INSERT stores.
--
-- PERBAIKAN: definisikan ulang 25 RPC plpgsql yang sama — logika, nama,
--   parameter, SECDEF, search_path tidak berubah — dengan pola guard yang benar:
--       IF <gagal> THEN ok := false; error := 'x'; RETURN NEXT; RETURN; END IF;
--   Baris error tetap di-emit (kontrak {ok:false, error} terjaga), lalu fungsi
--   berhenti; baris sukses hanya di-emit di akhir jalur sukses.
--
-- TERDAMPAK (25): submit_store_application, decide_store_application,
--   update_my_store, set_my_store_status, admin_set_store_status, save_listing,
--   set_listing_availability, delete_listing, admin_set_listing_status,
--   toggle_wishlist, quote_rental, create_rental, cancel_rental, submit_payment,
--   decide_payment, start_rental, mark_overdue, record_return, apply_late_fee,
--   decide_late_fee, open_dispute, resolve_dispute, create_review,
--   admin_set_user_status, admin_set_user_role.
--
-- TIDAK disentuh: RPC LANGUAGE sql (get_my_applications, list_store_applications,
--   get_my_stores, my_store_listings, get_wishlist, list_audit_logs) dan semua
--   helper scalar/void/trigger. RLS dan grants tidak berubah — CREATE OR REPLACE
--   mempertahankan EXECUTE grants yang sudah ada.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.submit_store_application(
  p_store_name text, p_description text DEFAULT '', p_address text DEFAULT '',
  p_logo_url text DEFAULT NULL
)
RETURNS TABLE (ok boolean, error text, application_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN ok := false; error := 'unauthenticated'; RETURN NEXT; RETURN; END IF;
  IF NOT public.is_active_user() THEN ok := false; error := 'user_inactive'; RETURN NEXT; RETURN; END IF;
  IF btrim(COALESCE(p_store_name, '')) = '' THEN ok := false; error := 'store_name_required'; RETURN NEXT; RETURN; END IF;

  IF EXISTS (SELECT 1 FROM public.stores WHERE owner_id = v_user AND status = 'active') THEN
    ok := false; error := 'already_seller'; RETURN NEXT; RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.store_applications
    WHERE user_id = v_user AND status = 'pending'
  ) THEN
    ok := false; error := 'application_pending'; RETURN NEXT; RETURN;
  END IF;

  INSERT INTO public.store_applications (user_id, store_name, description, address, logo_url)
  VALUES (v_user, btrim(p_store_name), btrim(COALESCE(p_description, '')),
          btrim(COALESCE(p_address, '')), p_logo_url)
  RETURNING id INTO v_id;

  PERFORM public.log_audit('application_submit', 'store_application', v_id,
    jsonb_build_object('store_name', btrim(p_store_name)));
  ok := true; error := NULL; application_id := v_id; RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.decide_store_application(
  p_application_id uuid, p_approve boolean, p_reason text DEFAULT NULL
)
RETURNS TABLE (ok boolean, error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_app   public.store_applications%ROWTYPE;
  v_store uuid;
BEGIN
  IF NOT public.is_admin() THEN ok := false; error := 'forbidden'; RETURN NEXT; RETURN; END IF;

  SELECT * INTO v_app FROM public.store_applications WHERE id = p_application_id;
  IF NOT FOUND THEN ok := false; error := 'application_not_found'; RETURN NEXT; RETURN; END IF;
  IF v_app.user_id = v_admin THEN ok := false; error := 'self_review_forbidden'; RETURN NEXT; RETURN; END IF;
  IF v_app.status <> 'pending' THEN ok := false; error := 'application_not_pending'; RETURN NEXT; RETURN; END IF;

  IF NOT p_approve THEN
    IF btrim(COALESCE(p_reason, '')) = '' THEN
      ok := false; error := 'rejection_reason_required'; RETURN NEXT; RETURN;
    END IF;
    UPDATE public.store_applications
       SET status = 'rejected', rejection_reason = btrim(p_reason),
           reviewed_by = v_admin, reviewed_at = now()
     WHERE id = v_app.id;
    PERFORM public.log_audit('application_reject', 'store_application', v_app.id,
      jsonb_build_object('reason', btrim(p_reason)));
    ok := true; error := NULL; RETURN NEXT; RETURN;
  END IF;

  -- Approve: buat store aktif (approval pertama TIDAK mengubah toko lama — PRD §3).
  INSERT INTO public.stores (owner_id, name, description, address, logo_url, status)
  VALUES (v_app.user_id, v_app.store_name, v_app.description, v_app.address, v_app.logo_url, 'active')
  RETURNING id INTO v_store;

  UPDATE public.store_applications
     SET status = 'approved', reviewed_by = v_admin, reviewed_at = now()
   WHERE id = v_app.id;

  PERFORM public.sync_is_seller(v_app.user_id);
  PERFORM public.log_audit('application_approve', 'store_application', v_app.id,
    jsonb_build_object('store_id', v_store));
  ok := true; error := NULL; RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.update_my_store(
  p_store_id uuid, p_name text, p_description text DEFAULT '',
  p_address text DEFAULT '', p_logo_url text DEFAULT NULL
)
RETURNS TABLE (ok boolean, error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_store uuid := public.my_store(p_store_id);
BEGIN
  IF auth.uid() IS NULL THEN ok := false; error := 'unauthenticated'; RETURN NEXT; RETURN; END IF;
  IF v_store IS NULL THEN ok := false; error := 'not_found_or_forbidden'; RETURN NEXT; RETURN; END IF;
  IF btrim(COALESCE(p_name, '')) = '' THEN ok := false; error := 'store_name_required'; RETURN NEXT; RETURN; END IF;

  UPDATE public.stores
     SET name = btrim(p_name), description = btrim(COALESCE(p_description, '')),
         address = btrim(COALESCE(p_address, '')), logo_url = p_logo_url
   WHERE id = v_store;
  ok := true; error := NULL; RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.set_my_store_status(p_store_id uuid, p_status store_status)
RETURNS TABLE (ok boolean, error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_store uuid := public.my_store(p_store_id);
  v_cur   public.store_status;
BEGIN
  IF auth.uid() IS NULL THEN ok := false; error := 'unauthenticated'; RETURN NEXT; RETURN; END IF;
  IF v_store IS NULL THEN ok := false; error := 'not_found_or_forbidden'; RETURN NEXT; RETURN; END IF;
  IF p_status NOT IN ('active', 'inactive') THEN
    ok := false; error := 'admin_only_status'; RETURN NEXT; RETURN;
  END IF;

  SELECT status INTO v_cur FROM public.stores WHERE id = v_store;
  IF v_cur = 'suspended' THEN ok := false; error := 'admin_only_status'; RETURN NEXT; RETURN; END IF;

  UPDATE public.stores SET status = p_status WHERE id = v_store;
  PERFORM public.sync_is_seller(auth.uid());
  PERFORM public.log_audit(
    CASE WHEN p_status = 'active' THEN 'store_activate' ELSE 'store_deactivate' END,
    'store', v_store, jsonb_build_object('from', v_cur, 'to', p_status));
  ok := true; error := NULL; RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_store_status(p_store_id uuid, p_status store_status)
RETURNS TABLE (ok boolean, error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_cur   public.store_status;
BEGIN
  IF NOT public.is_admin() THEN ok := false; error := 'forbidden'; RETURN NEXT; RETURN; END IF;
  SELECT owner_id, status INTO v_owner, v_cur FROM public.stores WHERE id = p_store_id;
  IF NOT FOUND THEN ok := false; error := 'not_found'; RETURN NEXT; RETURN; END IF;

  UPDATE public.stores SET status = p_status WHERE id = p_store_id;
  PERFORM public.sync_is_seller(v_owner);
  PERFORM public.log_audit(
    CASE p_status
      WHEN 'suspended' THEN 'store_suspend'
      WHEN 'active'    THEN 'store_unsuspend'
      ELSE 'store_deactivate' END,
    'store', p_store_id, jsonb_build_object('from', v_cur, 'to', p_status));
  ok := true; error := NULL; RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.save_listing(
  p_listing_id uuid DEFAULT NULL,
  p_store_id uuid DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_name text DEFAULT '',
  p_description text DEFAULT '',
  p_price bigint DEFAULT 0,
  p_deposit bigint DEFAULT 0,
  p_stock integer DEFAULT 1,
  p_rental_unit rental_unit DEFAULT 'day',
  p_min_rental_duration integer DEFAULT NULL,
  p_available boolean DEFAULT true,
  p_image_urls text[] DEFAULT NULL
)
RETURNS TABLE (ok boolean, error text, listing_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_store uuid := public.my_store(p_store_id);
  v_id uuid;
  v_old_status public.listing_status;
BEGIN
  IF auth.uid() IS NULL THEN ok := false; error := 'unauthenticated'; RETURN NEXT; RETURN; END IF;
  IF v_store IS NULL THEN ok := false; error := 'no_active_store'; RETURN NEXT; RETURN; END IF;
  IF btrim(COALESCE(p_name, '')) = '' THEN ok := false; error := 'name_required'; RETURN NEXT; RETURN; END IF;
  IF p_price < 0 OR p_deposit < 0 THEN ok := false; error := 'invalid_amount'; RETURN NEXT; RETURN; END IF;
  IF p_stock IS NULL OR p_stock < 0 THEN ok := false; error := 'invalid_stock'; RETURN NEXT; RETURN; END IF;
  IF p_min_rental_duration IS NOT NULL AND p_min_rental_duration <= 0 THEN
    ok := false; error := 'invalid_min_duration'; RETURN NEXT; RETURN;
  END IF;
  IF p_category_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_category_id) THEN
    ok := false; error := 'category_not_found'; RETURN NEXT; RETURN;
  END IF;

  IF p_listing_id IS NULL THEN
    INSERT INTO public.listings
      (store_id, category_id, name, description, price, deposit, stock,
       rental_unit, min_rental_duration, status)
    VALUES
      (v_store, p_category_id, btrim(p_name), btrim(COALESCE(p_description, '')),
       p_price, p_deposit, p_stock, p_rental_unit, p_min_rental_duration,
       CASE WHEN p_available THEN 'active' ELSE 'inactive' END::public.listing_status)
    RETURNING id INTO v_id;
    PERFORM public.log_audit('listing_create', 'listing', v_id,
      jsonb_build_object('store_id', v_store, 'name', btrim(p_name)));
  ELSE
    SELECT status INTO v_old_status FROM public.listings
     WHERE id = p_listing_id AND store_id = v_store;
    IF NOT FOUND THEN ok := false; error := 'not_found_or_forbidden'; RETURN NEXT; RETURN; END IF;

    UPDATE public.listings
       SET category_id = p_category_id, name = btrim(p_name),
           description = btrim(COALESCE(p_description, '')),
           price = p_price, deposit = p_deposit, stock = p_stock,
           rental_unit = p_rental_unit, min_rental_duration = p_min_rental_duration,
           status = CASE
             WHEN v_old_status IN ('suspended', 'out_of_stock') THEN v_old_status
             WHEN p_available THEN 'active'
             ELSE 'inactive' END::public.listing_status
     WHERE id = p_listing_id
    RETURNING id INTO v_id;
    PERFORM public.log_audit('listing_update', 'listing', v_id,
      jsonb_build_object('store_id', v_store));
  END IF;

  -- Gambar: bila p_image_urls disertakan → replace seluruh gambar (sort 1..n).
  IF p_image_urls IS NOT NULL THEN
    DELETE FROM public.listing_images WHERE listing_id = v_id;
    INSERT INTO public.listing_images (listing_id, image_url, sort_order)
    SELECT v_id, u.rl, ord
    FROM unnest(p_image_urls) WITH ORDINALITY AS u(rl, ord)
    WHERE btrim(u.rl) <> '';
  END IF;

  ok := true; error := NULL; listing_id := v_id; RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.set_listing_availability(p_listing_id uuid, p_available boolean)
RETURNS TABLE (ok boolean, error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_store uuid := public.my_store(NULL);
  v_cur   public.listing_status;
BEGIN
  IF auth.uid() IS NULL THEN ok := false; error := 'unauthenticated'; RETURN NEXT; RETURN; END IF;
  IF v_store IS NULL THEN ok := false; error := 'no_active_store'; RETURN NEXT; RETURN; END IF;

  SELECT status INTO v_cur FROM public.listings
   WHERE id = p_listing_id AND store_id = v_store;
  IF NOT FOUND THEN ok := false; error := 'not_found_or_forbidden'; RETURN NEXT; RETURN; END IF;
  IF v_cur = 'suspended' THEN ok := false; error := 'admin_only_status'; RETURN NEXT; RETURN; END IF;

  UPDATE public.listings
     SET status = CASE WHEN p_available THEN 'active' ELSE 'inactive' END::public.listing_status
   WHERE id = p_listing_id;
  PERFORM public.log_audit('listing_update', 'listing', p_listing_id,
    jsonb_build_object('available', p_available));
  ok := true; error := NULL; RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.delete_listing(p_listing_id uuid)
RETURNS TABLE (ok boolean, error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_store uuid := public.my_store(NULL);
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN ok := false; error := 'unauthenticated'; RETURN NEXT; RETURN; END IF;
  IF v_store IS NULL THEN ok := false; error := 'no_active_store'; RETURN NEXT; RETURN; END IF;
  BEGIN
    DELETE FROM public.listings
     WHERE id = p_listing_id AND store_id = v_store
    RETURNING id INTO v_id;
  EXCEPTION WHEN foreign_key_violation THEN
    ok := false; error := 'has_rentals'; RETURN NEXT; RETURN;
  END;
  IF v_id IS NULL THEN ok := false; error := 'not_found_or_forbidden'; RETURN NEXT; RETURN; END IF;
  PERFORM public.log_audit('listing_delete', 'listing', v_id, '{}'::jsonb);
  ok := true; error := NULL; RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_listing_status(p_listing_id uuid, p_status listing_status)
RETURNS TABLE (ok boolean, error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN ok := false; error := 'forbidden'; RETURN NEXT; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.listings WHERE id = p_listing_id) THEN
    ok := false; error := 'not_found'; RETURN NEXT; RETURN;
  END IF;
  UPDATE public.listings SET status = p_status WHERE id = p_listing_id;
  PERFORM public.log_audit(
    CASE WHEN p_status = 'suspended' THEN 'listing_suspend' ELSE 'listing_update' END,
    'listing', p_listing_id, jsonb_build_object('to', p_status));
  ok := true; error := NULL; RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.toggle_wishlist(p_listing_id uuid)
RETURNS TABLE (ok boolean, error text, active boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_exists boolean;
BEGIN
  IF v_user IS NULL THEN ok := false; error := 'unauthenticated'; RETURN NEXT; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.listings WHERE id = p_listing_id) THEN
    ok := false; error := 'listing_not_found'; RETURN NEXT; RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.wishlists
    WHERE user_id = v_user AND listing_id = p_listing_id
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.wishlists WHERE user_id = v_user AND listing_id = p_listing_id;
    ok := true; error := NULL; active := false; RETURN NEXT; RETURN;
  ELSE
    INSERT INTO public.wishlists (user_id, listing_id) VALUES (v_user, p_listing_id)
      ON CONFLICT (user_id, listing_id) DO NOTHING;
    ok := true; error := NULL; active := true; RETURN NEXT; RETURN;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.quote_rental(
  p_start date, p_end date, p_items jsonb
)
RETURNS TABLE (
  ok boolean, error text,
  total_days integer, subtotal bigint, deposit_total bigint, total bigint,
  items jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_lid uuid;
  v_qty integer;
  v_listing public.listings%ROWTYPE;
  v_days integer;
  v_units integer;
  v_items_out jsonb := '[]'::jsonb;
  v_subtotal bigint := 0;
  v_deposit_total bigint := 0;
  v_avail integer;
BEGIN
  -- Urutan validasi tetap: rentang → lampau → items (mirror rpcContract.test.js).
  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start THEN
    ok := false; error := 'invalid_date_range'; RETURN NEXT; RETURN;
  END IF;
  IF p_start < CURRENT_DATE THEN ok := false; error := 'start_date_in_past'; RETURN NEXT; RETURN; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    ok := false; error := 'empty_items'; RETURN NEXT; RETURN;
  END IF;

  v_days := (p_end - p_start)::int + 1;  -- end_date INCLUSIVE

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_lid := (v_item ->> 'listing_id')::uuid;
    v_qty := COALESCE((v_item ->> 'quantity')::int, 0);
    IF v_lid IS NULL THEN ok := false; error := 'invalid_items'; RETURN NEXT; RETURN; END IF;
    IF v_qty <= 0 THEN ok := false; error := 'invalid_quantity'; RETURN NEXT; RETURN; END IF;

    SELECT * INTO v_listing FROM public.listings WHERE id = v_lid;
    IF NOT FOUND THEN ok := false; error := 'listing_not_found'; RETURN NEXT; RETURN; END IF;
    IF v_listing.status <> 'active' THEN ok := false; error := 'listing_unavailable'; RETURN NEXT; RETURN; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = v_listing.store_id AND status = 'active') THEN
      ok := false; error := 'store_inactive'; RETURN NEXT; RETURN;
    END IF;

    v_units := ceil(v_days::numeric / public.rental_unit_days(v_listing.rental_unit))::int;
    IF v_listing.min_rental_duration IS NOT NULL AND v_units < v_listing.min_rental_duration THEN
      ok := false; error := 'min_duration'; RETURN NEXT; RETURN;
    END IF;

    v_avail := v_listing.stock - public.occupied_units(v_lid, p_start, p_end);
    IF v_qty > v_avail THEN ok := false; error := 'insufficient_stock'; RETURN NEXT; RETURN; END IF;

    v_subtotal := v_subtotal + v_listing.price * v_qty * v_units;
    v_deposit_total := v_deposit_total + v_listing.deposit * v_qty;
    v_items_out := v_items_out || jsonb_build_object(
      'listing_id', v_lid, 'quantity', v_qty, 'duration_units', v_units,
      'price', v_listing.price, 'deposit', v_listing.deposit,
      'subtotal', v_listing.price * v_qty * v_units);
  END LOOP;

  ok := true; error := NULL;
  total_days := v_days; subtotal := v_subtotal; deposit_total := v_deposit_total;
  total := v_subtotal + v_deposit_total; items := v_items_out; RETURN NEXT;
END $$;

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

  SELECT status INTO v_store_status FROM public.stores WHERE id = v_store;
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

  UPDATE public.payments
     SET status = 'failed'
   WHERE transaction_id = p_rental_id AND status = 'pending';

  PERFORM public.log_audit('rental_cancel', 'rental_transaction', p_rental_id,
    jsonb_build_object('from', v_tx.status, 'reason', v_reason));
  ok := true; error := NULL; status := 'cancelled'; RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.submit_payment(
  p_rental_id uuid, p_method payment_method, p_proof_url text,
  p_external_reference text DEFAULT NULL
)
RETURNS TABLE (ok boolean, error text, payment_id uuid, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_tx public.rental_transactions%ROWTYPE;
  v_pay uuid;
BEGIN
  IF v_user IS NULL THEN ok := false; error := 'unauthenticated'; RETURN NEXT; RETURN; END IF;
  SELECT * INTO v_tx FROM public.rental_transactions WHERE id = p_rental_id;
  IF NOT FOUND THEN ok := false; error := 'not_found'; RETURN NEXT; RETURN; END IF;
  IF v_tx.buyer_id <> v_user THEN ok := false; error := 'forbidden'; RETURN NEXT; RETURN; END IF;
  IF v_tx.status <> 'pending' THEN ok := false; error := 'illegal_transition'; RETURN NEXT; RETURN; END IF;
  IF btrim(COALESCE(p_proof_url, '')) = '' THEN ok := false; error := 'proof_required'; RETURN NEXT; RETURN; END IF;

  INSERT INTO public.payments
    (transaction_id, amount, status, payment_method, payment_proof_url, external_reference)
  VALUES
    (p_rental_id, v_tx.total, 'pending', p_method, btrim(p_proof_url), p_external_reference)
  RETURNING id INTO v_pay;

  UPDATE public.rental_transactions SET status = 'payment_verify' WHERE id = p_rental_id;
  PERFORM public.log_audit('payment_submit', 'payment', v_pay,
    jsonb_build_object('rental_id', p_rental_id, 'method', p_method));
  ok := true; error := NULL; payment_id := v_pay; status := 'payment_verify'; RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.decide_payment(
  p_payment_id uuid, p_approve boolean, p_note text DEFAULT NULL
)
RETURNS TABLE (ok boolean, error text, tx_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_pay public.payments%ROWTYPE;
  v_tx   public.rental_transactions%ROWTYPE;
  v_is_owner boolean;
  v_reason text := btrim(COALESCE(p_note, ''));
BEGIN
  IF v_user IS NULL THEN ok := false; error := 'unauthenticated'; RETURN NEXT; RETURN; END IF;
  SELECT * INTO v_pay FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN ok := false; error := 'payment_not_found'; RETURN NEXT; RETURN; END IF;
  SELECT * INTO v_tx FROM public.rental_transactions WHERE id = v_pay.transaction_id;

  v_is_owner := public.owns_store_of_tx(v_pay.transaction_id);
  IF NOT v_is_owner AND NOT public.is_admin() THEN
    ok := false; error := 'forbidden'; RETURN NEXT; RETURN;  -- D5: verifikator = owner toko / admin
  END IF;
  IF v_pay.status <> 'pending' THEN ok := false; error := 'payment_not_pending'; RETURN NEXT; RETURN; END IF;
  IF v_tx.status <> 'payment_verify' THEN ok := false; error := 'illegal_transition'; RETURN NEXT; RETURN; END IF;

  IF p_approve THEN
    UPDATE public.payments SET status = 'paid', paid_at = now() WHERE id = p_payment_id;
    UPDATE public.rental_transactions SET status = 'confirmed' WHERE id = v_pay.transaction_id;
    PERFORM public.log_audit('payment_verify', 'payment', p_payment_id,
      jsonb_build_object('rental_id', v_pay.transaction_id));
    ok := true; error := NULL; tx_status := 'confirmed'; RETURN NEXT; RETURN;
  ELSE
    -- Bukti ditolak: payment 'failed', transaksi kembali ke 'pending' agar buyer
    -- dapat mengirim bukti ulang (PRD §6). Pembatalan transaksi tetap tersedia
    -- via cancel_rental (diizinkan pada payment_verify).
    IF v_reason = '' THEN ok := false; error := 'reason_required'; RETURN NEXT; RETURN; END IF;
    UPDATE public.payments SET status = 'failed' WHERE id = p_payment_id;
    UPDATE public.rental_transactions SET status = 'pending' WHERE id = v_pay.transaction_id;
    PERFORM public.log_audit('payment_reject', 'payment', p_payment_id,
      jsonb_build_object('rental_id', v_pay.transaction_id, 'reason', v_reason));
    ok := true; error := NULL; tx_status := 'pending'; RETURN NEXT; RETURN;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.start_rental(p_rental_id uuid)
RETURNS TABLE (ok boolean, error text, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tx public.rental_transactions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN ok := false; error := 'unauthenticated'; RETURN NEXT; RETURN; END IF;
  IF NOT public.owns_store_of_tx(p_rental_id) AND NOT public.is_admin() THEN
    ok := false; error := 'forbidden'; RETURN NEXT; RETURN;
  END IF;
  SELECT * INTO v_tx FROM public.rental_transactions WHERE id = p_rental_id;
  IF NOT FOUND THEN ok := false; error := 'not_found'; RETURN NEXT; RETURN; END IF;
  IF v_tx.status <> 'confirmed' THEN ok := false; error := 'illegal_transition'; RETURN NEXT; RETURN; END IF;

  UPDATE public.rental_transactions SET status = 'ongoing' WHERE id = p_rental_id;
  ok := true; error := NULL; status := 'ongoing'; RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.mark_overdue(p_rental_id uuid)
RETURNS TABLE (ok boolean, error text, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tx public.rental_transactions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN ok := false; error := 'unauthenticated'; RETURN NEXT; RETURN; END IF;
  IF NOT public.owns_store_of_tx(p_rental_id) AND NOT public.is_admin() THEN
    ok := false; error := 'forbidden'; RETURN NEXT; RETURN;
  END IF;
  SELECT * INTO v_tx FROM public.rental_transactions WHERE id = p_rental_id;
  IF NOT FOUND THEN ok := false; error := 'not_found'; RETURN NEXT; RETURN; END IF;
  IF v_tx.status <> 'ongoing' THEN ok := false; error := 'illegal_transition'; RETURN NEXT; RETURN; END IF;
  IF CURRENT_DATE <= v_tx.end_date THEN ok := false; error := 'not_late'; RETURN NEXT; RETURN; END IF;

  UPDATE public.rental_transactions SET status = 'overdue' WHERE id = p_rental_id;
  ok := true; error := NULL; status := 'overdue'; RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.record_return(p_rental_id uuid)
RETURNS TABLE (ok boolean, error text, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tx public.rental_transactions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN ok := false; error := 'unauthenticated'; RETURN NEXT; RETURN; END IF;
  IF NOT public.owns_store_of_tx(p_rental_id) AND NOT public.is_admin() THEN
    ok := false; error := 'forbidden'; RETURN NEXT; RETURN;
  END IF;
  SELECT * INTO v_tx FROM public.rental_transactions WHERE id = p_rental_id;
  IF NOT FOUND THEN ok := false; error := 'not_found'; RETURN NEXT; RETURN; END IF;
  IF v_tx.status <> 'ongoing' AND v_tx.status <> 'overdue' THEN
    ok := false; error := 'illegal_transition'; RETURN NEXT; RETURN;
  END IF;

  UPDATE public.rental_transactions
     SET status = 'completed', actual_return_date = now()
   WHERE id = p_rental_id;
  PERFORM public.log_audit('return_record', 'rental_transaction', p_rental_id,
    jsonb_build_object('from', v_tx.status));
  ok := true; error := NULL; status := 'completed'; RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.apply_late_fee(p_rental_id uuid, p_daily_rate bigint)
RETURNS TABLE (ok boolean, error text, total bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tx public.rental_transactions%ROWTYPE;
  v_days integer;
  v_total bigint;
BEGIN
  IF auth.uid() IS NULL THEN ok := false; error := 'unauthenticated'; RETURN NEXT; RETURN; END IF;
  IF NOT public.owns_store_of_tx(p_rental_id) AND NOT public.is_admin() THEN
    ok := false; error := 'forbidden'; RETURN NEXT; RETURN;
  END IF;
  SELECT * INTO v_tx FROM public.rental_transactions WHERE id = p_rental_id;
  IF NOT FOUND THEN ok := false; error := 'not_found'; RETURN NEXT; RETURN; END IF;
  IF v_tx.status <> 'overdue' AND NOT (v_tx.status = 'completed' AND v_tx.actual_return_date IS NOT NULL AND v_tx.actual_return_date::date > v_tx.end_date) THEN
    ok := false; error := 'not_late'; RETURN NEXT; RETURN;
  END IF;
  IF p_daily_rate IS NULL OR p_daily_rate < 0 THEN
    ok := false; error := 'invalid_rate'; RETURN NEXT; RETURN;
  END IF;

  v_days := GREATEST(0, COALESCE(v_tx.actual_return_date::date, CURRENT_DATE) - v_tx.end_date);
  IF v_days <= 0 THEN ok := false; error := 'not_late'; RETURN NEXT; RETURN; END IF;

  v_total := v_days * p_daily_rate;
  INSERT INTO public.late_fees (transaction_id, days_late, daily_rate, total, status)
  VALUES (p_rental_id, v_days, p_daily_rate, v_total, 'unpaid')
  ON CONFLICT (transaction_id) DO UPDATE
    SET days_late = EXCLUDED.days_late, daily_rate = EXCLUDED.daily_rate,
        total = EXCLUDED.total, status = 'unpaid';

  PERFORM public.refresh_late_fee_total(p_rental_id);
  PERFORM public.log_audit('latefee_apply', 'late_fee', p_rental_id,
    jsonb_build_object('days_late', v_days, 'daily_rate', p_daily_rate, 'total', v_total));
  ok := true; error := NULL; total := v_total; RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.decide_late_fee(p_late_fee_id uuid, p_decision late_fee_status)
RETURNS TABLE (ok boolean, error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_fee public.late_fees%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN ok := false; error := 'unauthenticated'; RETURN NEXT; RETURN; END IF;
  SELECT * INTO v_fee FROM public.late_fees WHERE id = p_late_fee_id;
  IF NOT FOUND THEN ok := false; error := 'not_found'; RETURN NEXT; RETURN; END IF;

  IF p_decision = 'waived' THEN
    IF NOT public.is_admin() THEN ok := false; error := 'forbidden'; RETURN NEXT; RETURN; END IF;
    UPDATE public.late_fees SET status = 'waived' WHERE id = p_late_fee_id;
    PERFORM public.log_audit('latefee_waive', 'late_fee', p_late_fee_id, '{}'::jsonb);
  ELSIF p_decision = 'paid' THEN
    IF NOT public.owns_store_of_tx(v_fee.transaction_id) AND NOT public.is_admin() THEN
      ok := false; error := 'forbidden'; RETURN NEXT; RETURN;
    END IF;
    UPDATE public.late_fees SET status = 'paid' WHERE id = p_late_fee_id;
  ELSE
    ok := false; error := 'invalid_decision'; RETURN NEXT; RETURN;
  END IF;

  PERFORM public.refresh_late_fee_total(v_fee.transaction_id);
  ok := true; error := NULL; RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.open_dispute(
  p_rental_id uuid, p_reason text, p_description text DEFAULT ''
)
RETURNS TABLE (ok boolean, error text, dispute_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_tx public.rental_transactions%ROWTYPE;
  v_id uuid;
  v_is_buyer boolean;
  v_is_owner boolean;
BEGIN
  IF v_user IS NULL THEN ok := false; error := 'unauthenticated'; RETURN NEXT; RETURN; END IF;
  SELECT * INTO v_tx FROM public.rental_transactions WHERE id = p_rental_id;
  IF NOT FOUND THEN ok := false; error := 'not_found'; RETURN NEXT; RETURN; END IF;

  v_is_buyer := v_tx.buyer_id = v_user;
  v_is_owner := public.owns_store_of_tx(p_rental_id);
  IF NOT v_is_buyer AND NOT v_is_owner THEN ok := false; error := 'forbidden'; RETURN NEXT; RETURN; END IF;
  IF btrim(COALESCE(p_reason, '')) = '' THEN ok := false; error := 'reason_required'; RETURN NEXT; RETURN; END IF;
  IF v_tx.status NOT IN ('ongoing', 'overdue', 'completed') THEN
    ok := false; error := 'illegal_transition'; RETURN NEXT; RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.disputes
    WHERE transaction_id = p_rental_id AND status IN ('open', 'investigating')
  ) THEN ok := false; error := 'dispute_exists'; RETURN NEXT; RETURN; END IF;

  INSERT INTO public.disputes (transaction_id, opened_by, reason, description)
  VALUES (p_rental_id, v_user, btrim(p_reason), btrim(COALESCE(p_description, '')))
  RETURNING id INTO v_id;

  -- Rental ikut 'disputed' hanya saat belum completed (PRD §10).
  IF v_tx.status IN ('ongoing', 'overdue') THEN
    UPDATE public.rental_transactions SET status = 'disputed' WHERE id = p_rental_id;
  END IF;

  PERFORM public.log_audit('dispute_open', 'dispute', v_id,
    jsonb_build_object('rental_id', p_rental_id, 'opened_by', v_user));
  ok := true; error := NULL; dispute_id := v_id; RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.resolve_dispute(
  p_dispute_id uuid, p_outcome dispute_status, p_resolution text
)
RETURNS TABLE (ok boolean, error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_d public.disputes%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN ok := false; error := 'forbidden'; RETURN NEXT; RETURN; END IF;
  SELECT * INTO v_d FROM public.disputes WHERE id = p_dispute_id;
  IF NOT FOUND THEN ok := false; error := 'not_found'; RETURN NEXT; RETURN; END IF;
  IF v_d.status NOT IN ('open', 'investigating') THEN
    ok := false; error := 'dispute_closed'; RETURN NEXT; RETURN;
  END IF;
  IF p_outcome NOT IN ('resolved', 'rejected') THEN
    ok := false; error := 'invalid_outcome'; RETURN NEXT; RETURN;
  END IF;
  IF btrim(COALESCE(p_resolution, '')) = '' THEN ok := false; error := 'resolution_required'; RETURN NEXT; RETURN; END IF;

  UPDATE public.disputes
     SET status = p_outcome, resolution = btrim(p_resolution),
         resolved_by = auth.uid(), resolved_at = now()
   WHERE id = p_dispute_id;

  UPDATE public.rental_transactions SET status = 'completed'
   WHERE id = v_d.transaction_id AND status = 'disputed';

  PERFORM public.log_audit('dispute_resolve', 'dispute', p_dispute_id,
    jsonb_build_object('rental_id', v_d.transaction_id, 'outcome', p_outcome));
  ok := true; error := NULL; RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.create_review(
  p_rental_id uuid, p_rating integer, p_comment text
)
RETURNS TABLE (ok boolean, error text, review_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_tx public.rental_transactions%ROWTYPE;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN ok := false; error := 'unauthenticated'; RETURN NEXT; RETURN; END IF;
  SELECT * INTO v_tx FROM public.rental_transactions WHERE id = p_rental_id;
  IF NOT FOUND THEN ok := false; error := 'not_found'; RETURN NEXT; RETURN; END IF;
  IF v_tx.buyer_id <> v_user THEN ok := false; error := 'forbidden'; RETURN NEXT; RETURN; END IF;
  IF v_tx.status <> 'completed' THEN ok := false; error := 'rental_not_completed'; RETURN NEXT; RETURN; END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    ok := false; error := 'invalid_rating'; RETURN NEXT; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.reviews WHERE transaction_id = p_rental_id) THEN
    ok := false; error := 'already_reviewed'; RETURN NEXT; RETURN;
  END IF;

  INSERT INTO public.reviews (transaction_id, buyer_id, store_id, rating, comment)
  VALUES (p_rental_id, v_user, v_tx.store_id, p_rating, btrim(COALESCE(p_comment, '')))
  RETURNING id INTO v_id;

  PERFORM public.log_audit('review_create', 'review', v_id,
    jsonb_build_object('rental_id', p_rental_id, 'rating', p_rating));
  ok := true; error := NULL; review_id := v_id; RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_user_status(p_user_id uuid, p_status user_status)
RETURNS TABLE (ok boolean, error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN ok := false; error := 'forbidden'; RETURN NEXT; RETURN; END IF;
  IF p_user_id = auth.uid() THEN ok := false; error := 'self_action_forbidden'; RETURN NEXT; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
    ok := false; error := 'not_found'; RETURN NEXT; RETURN;
  END IF;
  UPDATE public.users SET status = p_status WHERE id = p_user_id;
  PERFORM public.log_audit(
    CASE WHEN p_status = 'active' THEN 'user_activate' ELSE 'user_suspend' END,
    'user', p_user_id, jsonb_build_object('to', p_status));
  ok := true; error := NULL; RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id uuid, p_role user_role)
RETURNS TABLE (ok boolean, error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN ok := false; error := 'forbidden'; RETURN NEXT; RETURN; END IF;
  IF p_user_id = auth.uid() THEN ok := false; error := 'self_action_forbidden'; RETURN NEXT; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
    ok := false; error := 'not_found'; RETURN NEXT; RETURN;
  END IF;
  UPDATE public.users SET role = p_role WHERE id = p_user_id;
  PERFORM public.log_audit('role_change', 'user', p_user_id,
    jsonb_build_object('to', p_role));
  ok := true; error := NULL; RETURN NEXT;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- SANITY CHECK (waktu deploy) — gagal keras bila invarian dilanggar:
--   1. Jumlah definisi 25 RPC plpgsql = 25 (migrasi tidak terpotong).
--   2. Minimal satu jalur emit per fungsi (>= 1 RETURN NEXT).
--   3. TIDAK ADA fall-through: setiap RETURN NEXT langsung diikuti RETURN;
--      (guard stop) atau END (emit sukses terakhir). Emit di dalam cabang
--      eksklusif (mis. approve/reject) sah — kontrak "persis satu baris"
--      adalah sifat runtime, diuji oleh verifier end-to-end.
--   4. Tidak ada RETURN; tanpa emit (stop tanpa emit = 0 baris).
-- ════════════════════════════════════════════════════════════════════════════
DO $sanity_control_flow$
DECLARE
  v_names text[] := ARRAY[
    'submit_store_application','decide_store_application','update_my_store',
    'set_my_store_status','admin_set_store_status','save_listing',
    'set_listing_availability','delete_listing','admin_set_listing_status',
    'toggle_wishlist','quote_rental','create_rental','cancel_rental',
    'submit_payment','decide_payment','start_rental','mark_overdue',
    'record_return','apply_late_fee','decide_late_fee','open_dispute',
    'resolve_dispute','create_review','admin_set_user_status','admin_set_user_role'];
  r       record;
  v_def   text;
  v_norm  text;
  v_parts text[];
  v_bad   text := '';
  v_cnt   integer;
  i       integer;
  v_emit_stop_pairs   integer;
  v_return_semicolons integer;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = ANY (v_names);
  IF v_cnt <> 25 THEN
    RAISE EXCEPTION 'Migrasi tidak lengkap: jumlah RPC yang ditambal = %, diharapkan 25', v_cnt;
  END IF;

  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY (v_names)
  LOOP
    v_def := pg_get_functiondef(r.sig::regprocedure);

    -- Invarian 2: minimal satu jalur emit (>= 1 RETURN NEXT).
    IF position('RETURN NEXT' in v_def) = 0 THEN
      v_bad := v_bad || r.sig || '[no-emit] ';
    END IF;

    -- Invarian 3: tidak ada fall-through — setiap 'RETURN NEXT;' langsung
    -- diikuti ' RETURN;' (guard stop) atau 'END' di akhir body (emit sukses
    -- terakhir). Analisis via split teks (bukan lookahead — backtracking
    -- [[:space:]]* membuat lookahead false-positive pada guard berspasi).
    v_norm  := regexp_replace(v_def, '[[:space:]]+', ' ', 'g');
    v_parts := string_to_array(v_norm, 'RETURN NEXT;');
    FOR i IN 2 .. COALESCE(array_length(v_parts, 1), 1)
    LOOP
      IF NOT (
        btrim(v_parts[i]) LIKE 'RETURN;%'
        OR (i = array_length(v_parts, 1) AND btrim(v_parts[i]) LIKE 'END%')
      ) THEN
        v_bad := v_bad || r.sig || '[fall-through] ';
      END IF;
    END LOOP;

    -- Invarian 4: setiap 'RETURN;' bagian dari pasangan 'RETURN NEXT; RETURN;'
    -- (stop tanpa emit = regreso ke bug 0-baris).
    v_emit_stop_pairs   := (length(v_def) - length(replace(v_def, 'RETURN NEXT; RETURN;', '')))
                           / length('RETURN NEXT; RETURN;');
    v_return_semicolons := (length(v_def) - length(replace(v_def, 'RETURN;', '')))
                           / length('RETURN;');
    IF v_return_semicolons <> v_emit_stop_pairs THEN
      v_bad := v_bad || r.sig || '[return-without-emit] ';
    END IF;
  END LOOP;

  IF v_bad <> '' THEN
    RAISE EXCEPTION 'Invarian control-flow RPC dilanggar: %', v_bad;
  END IF;
  RAISE NOTICE 'OK — 25 RPC: tanpa fall-through (setiap RETURN NEXT diikuti RETURN;/END), semua RETURN; didahului emit.';
END
$sanity_control_flow$;
