-- ============================================================================
-- JabSewa — RENTAL MVP MIGRATION (ADDITIVE & IDEMPOTENT)
-- ============================================================================
-- Adds to the existing schema (20260921000002_full_reset_idempotent.sql):
--   1. rental_transactions — the core rental request/status table
--   2. wishlists           — per-user wishlist
--   3. payment_records     — OPTIONAL manual-payment status tracking (created
--                            but intentionally UNUSED by the app; no gateway)
--   4. RLS policies for all three + grants/RLS fixups for stores & listings
--   5. Secure RPCs (SECURITY DEFINER, server-side validation):
--        public.create_rental          — atomic rental creation (Phase 3)
--        public.set_rental_status      — guarded status transitions (Phase 4)
--        public.get_rentals_for_user   — tenant's own rentals (Phase 2)
--        public.get_rentals_for_store  — store owner's rentals (Phase 2)
--        public.rental_quote           — server-side price quote (Phase 3)
--        public.get_my_store           — seller's own active store
--        public.get_wishlist / public.toggle_wishlist
--
-- SAFE TO RUN MULTIPLE TIMES. Never drops business tables; only creates
-- missing objects. Existing data is untouched. No payment gateway.
--
-- DOCUMENTATION — RENTAL PERIOD & PRICING SEMANTICS (Phase 3 requirement):
--   * end_date is INCLUSIVE: renting 2026-10-01 → 2026-10-03 is 3 days.
--     total_days = (end_date - start_date)::int + 1.
--   * Same-day rental is allowed and charged as 1 day (start = end → 1 day).
--   * start_date must be >= CURRENT_DATE (project timezone: Asia/Jakarta).
--   * Conflicts: a period [s,e] conflicts with an existing booking [s2,e2]
--     iff s <= e2 AND s2 <= e, considering only statuses that hold inventory:
--     pending, accepted, active. (rejected/cancelled/completed do not block.)
--   * Pricing (server-computed, client values never trusted):
--       subtotal = total_days * price_per_day   (from listings at booking time)
--       total    = subtotal + deposit           (deposit snapshot from listings)
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — TABLES
-- ════════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- 1a. rental_transactions — includes legacy-style human-readable rental code
-- (e.g. R-1758…-xxxx) for UI display, generated server-side.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rental_transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text UNIQUE,
  tenant_id        uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  listing_id       bigint NOT NULL REFERENCES public.listings (id) ON DELETE RESTRICT,
  store_id         uuid REFERENCES public.stores (id) ON DELETE SET NULL,
  start_date       date NOT NULL,
  end_date         date NOT NULL,
  total_days       integer NOT NULL CHECK (total_days > 0),
  price_per_day    integer NOT NULL CHECK (price_per_day >= 0),
  deposit          integer NOT NULL CHECK (deposit >= 0),
  subtotal         integer NOT NULL CHECK (subtotal >= 0),
  total            integer NOT NULL CHECK (total >= 0),
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','accepted','rejected','active','completed','cancelled')),
  rejection_reason text,
  payment_status   text NOT NULL DEFAULT 'unpaid'
                     CHECK (payment_status IN ('unpaid','awaiting_confirmation','paid','refunded')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_dates_order CHECK (end_date >= start_date)
);

COMMENT ON TABLE public.rental_transactions IS
  'Rental requests: end_date inclusive; total_days = end-start+1; prices are server-side snapshots in IDR.';

-- ---------------------------------------------------------------------------
-- 1b. wishlists — per-user (FK to public.users keeps only registered users)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wishlists (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  listing_id bigint NOT NULL REFERENCES public.listings (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wishlists_user_listing_unique UNIQUE (user_id, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_wishlists_user ON public.wishlists (user_id, created_at DESC);

COMMENT ON TABLE public.wishlists IS 'Per-user wishlist; one row per (user, listing).';

-- ---------------------------------------------------------------------------
-- 1c. payment_records — OPTIONAL manual-payment status flow.
--     Created for completeness; the app does NOT write to it in this MVP.
-- ---------------------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_payment_records_rental ON public.payment_records (rental_id, created_at DESC);

COMMENT ON TABLE public.payment_records IS
  'OPTIONAL manual-payment ledger (no gateway). Unused by the app in this MVP.';

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — INDEXES (Phase 1 requirement)
-- ════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_rentals_listing ON public.rental_transactions (listing_id);
CREATE INDEX IF NOT EXISTS idx_rentals_store   ON public.rental_transactions (store_id);
CREATE INDEX IF NOT EXISTS idx_rentals_tenant  ON public.rental_transactions (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rentals_status  ON public.rental_transactions (status);
-- Conflict checks always filter listing + status + date overlap → composite:
CREATE INDEX IF NOT EXISTS idx_rentals_listing_dates
  ON public.rental_transactions (listing_id, start_date, end_date)
  WHERE status IN ('pending', 'accepted', 'active');

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — updated_at trigger
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_rentals_touch ON public.rental_transactions;
CREATE TRIGGER trg_rentals_touch
  BEFORE UPDATE ON public.rental_transactions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — DOUBLE-BOOKING GUARD (EXCLUSION CONSTRAINT)
-- ════════════════════════════════════════════════════════════════════════════
-- Only ONE active-ish booking per listing per period. Uses a status sub-range
-- so cancelling/rejecting/completing frees the dates. Requires btree_gist.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------------
-- Drop legacy/alternate constraint names first (idempotent).
ALTER TABLE public.rental_transactions
  DROP CONSTRAINT IF EXISTS rental_transactions_no_double_booking;
ALTER TABLE public.rental_transactions
  DROP CONSTRAINT IF EXISTS rental_no_double_booking;

DO $double_booking$
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
END $double_booking$;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 5 — RLS (Phase 2)
-- ════════════════════════════════════════════════════════════════════════════
-- Model:
--   * Tenant: sees only own rentals; may cancel own pending rentals.
--   * Store owner: sees/manages rentals of their OWN active store.
--   * Superadmin: full read (existing pattern).
--   * All sensitive mutations go through SECURITY DEFINER RPCs that validate
--     server-side; INSERT/UPDATE/DELETE are NOT granted to client roles.
--   * anon gets nothing (default-deny).
--   * The auth.users id is the source of identity — frontend-supplied
--     tenant_id/store_id/role/price/deposit are never trusted.
-- -----------------------------------------------------------------------------

ALTER TABLE public.rental_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlists        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_records  ENABLE ROW LEVEL SECURITY;

-- Make sure the base business tables from the earlier migration are also
-- RLS-protected (the old migration never enabled RLS on them).
ALTER TABLE public.stores  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 5a. Helpers (recreated each run — CREATE OR REPLACE keeps them in sync)
--
-- OWNERSHIP MODEL: a user may own SEVERAL stores (stores.user_id = auth.uid()).
-- get_my_store() resolves WHICH store a caller is acting on:
--   * p_store_id given  → must be a store owned by the caller AND active;
--                         otherwise NULL (fail-closed).
--   * p_store_id NULL   → the caller's first active store (single-store app
--                         convenience).
-- Store management RPCs use this so an inactive or unowned store can never be
-- used to accept/start/complete rentals (Phase 2 requirement).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_store(p_store_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
  FROM public.stores s
  WHERE s.user_id = auth.uid()
    AND s.status = 'active'
    AND (p_store_id IS NULL OR s.id = p_store_id)
  ORDER BY s.created_at
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_my_store(uuid) IS
  'Resolve the callers owned ACTIVE store; pass a store_id to verify ownership, NULL for first active.';

-- ---------------------------------------------------------------------------
-- 5b. rental_transactions policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS rentals_select_own ON public.rental_transactions;
CREATE POLICY rentals_select_own
  ON public.rental_transactions
  FOR SELECT
  TO authenticated
  USING (tenant_id = auth.uid());

-- Store owner: rentals of ANY store they own (read includes history of
-- inactive stores; writes are separately guarded to ACTIVE stores via RPCs).
DROP POLICY IF EXISTS rentals_select_store_owner ON public.rental_transactions;
CREATE POLICY rentals_select_store_owner
  ON public.rental_transactions
  FOR SELECT
  TO authenticated
  USING (
    store_id IN (
      SELECT s.id FROM public.stores s WHERE s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS rentals_select_superadmin ON public.rental_transactions;
CREATE POLICY rentals_select_superadmin
  ON public.rental_transactions
  FOR SELECT
  TO authenticated
  USING (public.is_superadmin());

-- No INSERT/UPDATE/DELETE policies: writes happen only through RPCs.
-- (Explicitly not created — RLS default-deny blocks direct writes.)

-- ---------------------------------------------------------------------------
-- 5c. wishlists policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS wishlists_select_own ON public.wishlists;
CREATE POLICY wishlists_select_own
  ON public.wishlists
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS wishlists_write_own ON public.wishlists;
CREATE POLICY wishlists_write_own
  ON public.wishlists
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS wishlists_delete_own ON public.wishlists;
CREATE POLICY wishlists_delete_own
  ON public.wishlists
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5d. payment_records — read-only mirror for the two parties
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS payments_select_tenant ON public.payment_records;
CREATE POLICY payments_select_tenant
  ON public.payment_records
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rental_transactions r
      WHERE r.id = payment_records.rental_id
        AND r.tenant_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS payments_select_store_owner ON public.payment_records;
CREATE POLICY payments_select_store_owner
  ON public.payment_records
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rental_transactions r
      WHERE r.id = payment_records.rental_id
        AND r.store_id IN (
          SELECT s.id FROM public.stores s WHERE s.user_id = auth.uid()
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 5e2. users — RLS was NEVER enabled by the earlier migration (probe showed
--      401 42501 on any read). Fix: enable RLS + read-own / superadmin policies.
--      Profile mutations happen only via SECURITY DEFINER RPCs.
-- ---------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select_own ON public.users;
CREATE POLICY users_select_own
  ON public.users
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS users_select_superadmin ON public.users;
CREATE POLICY users_select_superadmin
  ON public.users
  FOR SELECT
  TO authenticated
  USING (public.is_superadmin());

GRANT SELECT ON public.users TO authenticated;

-- ---------------------------------------------------------------------------
-- 5e. stores & listings — public catalog read (active stores only for anon;
--     authenticated sees active stores; sellers additionally see their own
--     store even if inactive). No client writes: mutations stay behind RPCs
--     or service-role tooling.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS stores_read_active ON public.stores;
CREATE POLICY stores_read_active
  ON public.stores
  FOR SELECT
  TO anon, authenticated
  USING (status = 'active' OR user_id = auth.uid());

DROP POLICY IF EXISTS listings_read_catalog ON public.listings;
CREATE POLICY listings_read_catalog
  ON public.listings
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = listings.store_id
        AND (s.status = 'active' OR s.user_id = auth.uid())
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 6 — GRANTS
-- ════════════════════════════════════════════════════════════════════════════

-- Clients only SELECT the business tables; writes go through RPCs.
GRANT SELECT ON public.stores, public.listings TO anon, authenticated;
GRANT SELECT ON public.rental_transactions TO authenticated;
GRANT SELECT ON public.wishlists TO authenticated;
GRANT SELECT ON public.payment_records TO authenticated;

-- Sequences for tables clients can read (needed by PostgREST inserts; here
-- only SELECT is granted, so this is defensive for future RPC use).
GRANT USAGE, SELECT ON SEQUENCE public.listings_id_seq TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 7 — SECURE RPCs
-- ════════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- 7a. rental_quote — server-side price preview (Phase 3).
--     Returns NULL-priced row when the listing cannot be quoted.
-- ---------------------------------------------------------------------------
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
AS $$
DECLARE
  vListing   public.listings%ROWTYPE;
  vDays      integer;
BEGIN
  SELECT * INTO vListing FROM public.listings WHERE id = p_listing_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'listing_not_found', NULL::integer, NULL::integer, NULL::integer, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start THEN
    RETURN QUERY SELECT false, 'invalid_date_range', NULL::integer, NULL::integer, NULL::integer, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  IF p_start < CURRENT_DATE THEN
    RETURN QUERY SELECT false, 'start_date_in_past', NULL::integer, NULL::integer, NULL::integer, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  IF NOT vListing.available OR vListing.status <> 'active' THEN
    RETURN QUERY SELECT false, 'listing_unavailable', NULL::integer, NULL::integer, NULL::integer, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = vListing.store_id AND s.status = 'active') THEN
    RETURN QUERY SELECT false, 'store_inactive', NULL::integer, NULL::integer, NULL::integer, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  vDays := (p_end - p_start)::int + 1; -- end_date INCLUSIVE; same-day = 1 day

  RETURN QUERY SELECT
    true,
    NULL::text,
    vDays,
    vListing.price_per_day,
    vListing.deposit,
    vDays * vListing.price_per_day,
    vDays * vListing.price_per_day + vListing.deposit;
END $$;

GRANT EXECUTE ON FUNCTION public.rental_quote(bigint, date, date) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7b. create_rental — ATOMIC rental creation (Phase 3). SECURITY DEFINER so it
--     can validate the listing regardless of RLS read scope; identity is taken
--     from auth.uid() ONLY. Prices/deposit/total/duration are computed HERE.
--     Concurrency: the exclusion constraint makes conflicting inserts fail;
--     a table-level advisory lock serializes same-listing requests so the
--     error is deterministic (no double booking even under parallel requests).
-- ---------------------------------------------------------------------------
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
AS $$
DECLARE
  vUser      uuid := auth.uid();
  vListing   public.listings%ROWTYPE;
  vStoreOk   boolean;
  vQuote     record;
  vCode      text;
  vRental    public.rental_transactions%ROWTYPE;
BEGIN
  IF vUser IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated', NULL::uuid, NULL::text, NULL::text, NULL::integer, NULL::integer, NULL::integer, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  -- Server-side validation (availability, dates, prices) via the same logic
  -- as rental_quote; definer bypasses RLS so validation cannot be bypassed.
  SELECT * INTO vQuote FROM public.rental_quote(p_listing_id, p_start, p_end);
  IF vQuote IS NULL OR NOT vQuote.ok THEN
    RETURN QUERY SELECT false,
      COALESCE(vQuote.error, 'quote_failed'),
      NULL::uuid, NULL::text, NULL::text, NULL::integer, NULL::integer, NULL::integer, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  SELECT * INTO vListing FROM public.listings WHERE id = p_listing_id;
  SELECT EXISTS (
    SELECT 1 FROM public.stores s WHERE s.id = vListing.store_id AND s.status = 'active'
  ) INTO vStoreOk;
  IF NOT vStoreOk THEN
    RETURN QUERY SELECT false, 'store_inactive', NULL::uuid, NULL::text, NULL::text, NULL::integer, NULL::integer, NULL::integer, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  -- Serialize concurrent bookings for the same listing (deadlock-safe: always
  -- the same key order, single lock per transaction).
  PERFORM pg_advisory_xact_lock(hashtextextended('jabsewa:listing:' || p_listing_id::text, 0));

  -- Re-check overlap under the lock (constraint is the final authority).
  IF EXISTS (
    SELECT 1 FROM public.rental_transactions r
    WHERE r.listing_id = p_listing_id
      AND r.status IN ('pending','accepted','active')
      AND daterange(r.start_date, r.end_date, '[]') && daterange(p_start, p_end, '[]')
  ) THEN
    RETURN QUERY SELECT false, 'date_conflict', NULL::uuid, NULL::text, NULL::text, NULL::integer, NULL::integer, NULL::integer, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  -- Human-readable rental code (documented as "rental number" for the UI).
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
  ON CONFLICT DO NOTHING
  RETURNING * INTO vRental;

  IF vRental.id IS NULL THEN
    -- Exclusion constraint hit between the re-check and the insert.
    RETURN QUERY SELECT false, 'date_conflict', NULL::uuid, NULL::text, NULL::text, NULL::integer, NULL::integer, NULL::integer, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    true, NULL::text,
    vRental.id, vRental.code, vRental.status,
    vRental.total_days, vRental.price_per_day, vRental.deposit, vRental.subtotal, vRental.total;
END $$;

REVOKE ALL ON FUNCTION public.create_rental(bigint, date, date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_rental(bigint, date, date) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7c. set_rental_status — guarded transitions (Phase 4). Identity from
--     auth.uid(); ownership & transition validity checked server-side.
--     Transitions:
--       pending   → accepted | rejected (store owner; rejection needs reason)
--       pending   → cancelled           (tenant; own pending request)
--       accepted  → active              (store owner)
--       active    → completed           (store owner)
--     Everything else is rejected.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_rental_status(
  p_rental_id uuid,
  p_status    text,
  p_reason    text DEFAULT NULL
)
RETURNS TABLE (ok boolean, error text, status text, rejection_reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vRental   public.rental_transactions%ROWTYPE;
  -- Mutations require the caller's store to be OWNED and ACTIVE (Phase 2:
  -- "manage rentals belonging to their authorized active store").
  vMyStore  uuid := public.get_my_store();
  vIsTenant boolean;
  vIsOwner  boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated', NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT * INTO vRental FROM public.rental_transactions WHERE id = p_rental_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not_found', NULL::text, NULL::text;
    RETURN;
  END IF;

  vIsTenant := vRental.tenant_id = auth.uid();
  vIsOwner  := vMyStore IS NOT NULL AND vRental.store_id = vMyStore;

  IF NOT vIsTenant AND NOT vIsOwner AND NOT public.is_superadmin() THEN
    RETURN QUERY SELECT false, 'forbidden', NULL::text, NULL::text;
    RETURN;
  END IF;

  -- ------------------------------------------------------------ transitions
  IF vRental.status = 'pending' AND p_status = 'accepted' THEN
    IF NOT vIsOwner AND NOT public.is_superadmin() THEN
      RETURN QUERY SELECT false, 'forbidden', NULL::text, NULL::text; RETURN;
    END IF;
    -- free the period first so the exclusion constraint allows the new status
    UPDATE public.rental_transactions SET status = 'accepted' WHERE id = p_rental_id;

  ELSIF vRental.status = 'pending' AND p_status = 'rejected' THEN
    IF NOT vIsOwner AND NOT public.is_superadmin() THEN
      RETURN QUERY SELECT false, 'forbidden', NULL::text, NULL::text; RETURN;
    END IF;
    IF COALESCE(btrim(COALESCE(p_reason, '')), '') = '' THEN
      RETURN QUERY SELECT false, 'rejection_reason_required', NULL::text, NULL::text; RETURN;
    END IF;
    UPDATE public.rental_transactions
       SET status = 'rejected', rejection_reason = btrim(p_reason)
     WHERE id = p_rental_id;

  ELSIF vRental.status = 'pending' AND p_status = 'cancelled' THEN
    IF NOT vIsTenant AND NOT public.is_superadmin() THEN
      RETURN QUERY SELECT false, 'forbidden', NULL::text, NULL::text; RETURN;
    END IF;
    UPDATE public.rental_transactions SET status = 'cancelled' WHERE id = p_rental_id;

  ELSIF vRental.status = 'accepted' AND p_status = 'active' THEN
    IF NOT vIsOwner AND NOT public.is_superadmin() THEN
      RETURN QUERY SELECT false, 'forbidden', NULL::text, NULL::text; RETURN;
    END IF;
    UPDATE public.rental_transactions SET status = 'active' WHERE id = p_rental_id;

  ELSIF vRental.status = 'active' AND p_status = 'completed' THEN
    IF NOT vIsOwner AND NOT public.is_superadmin() THEN
      RETURN QUERY SELECT false, 'forbidden', NULL::text, NULL::text; RETURN;
    END IF;
    UPDATE public.rental_transactions SET status = 'completed' WHERE id = p_rental_id;

  ELSE
    RETURN QUERY SELECT false, 'illegal_transition', NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT * INTO vRental FROM public.rental_transactions WHERE id = p_rental_id;
  RETURN QUERY SELECT true, NULL::text, vRental.status, vRental.rejection_reason;
END $$;

REVOKE ALL ON FUNCTION public.set_rental_status(uuid, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_rental_status(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7d. Read RPCs — scoped by auth.uid() inside the function (RLS-independent).
--     get_rentals_for_store: rentals of the caller's ACTIVE stores only.
--     Enriched shape mirrors the frontend contract (item/store/tenant names).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_rentals_for_user()
RETURNS TABLE (
  id               uuid,
  code             text,
  listing_id       bigint,
  store_id         uuid,
  start_date       date,
  end_date         date,
  total_days       integer,
  price_per_day    integer,
  deposit          integer,
  subtotal         integer,
  total            integer,
  status           text,
  rejection_reason text,
  payment_status   text,
  created_at       timestamptz,
  updated_at       timestamptz,
  item_name        text,
  item_image       text,
  seller_name      text,
  tenant_name      text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.code, r.listing_id, r.store_id,
         r.start_date, r.end_date, r.total_days,
         r.price_per_day, r.deposit, r.subtotal, r.total,
         r.status, r.rejection_reason, r.payment_status,
         r.created_at, r.updated_at,
         COALESCE(l.name, 'Barang dihapus')          AS item_name,
         COALESCE(l.image_url, '')                   AS item_image,
         COALESCE(s.store_name, 'Mitra JabSewa')     AS seller_name,
         COALESCE(u.full_name, 'Penyewa')            AS tenant_name
  FROM public.rental_transactions r
  LEFT JOIN public.listings l ON l.id = r.listing_id
  LEFT JOIN public.stores   s ON s.id = r.store_id
  LEFT JOIN public.users    u ON u.id = r.tenant_id
  WHERE r.tenant_id = auth.uid()
  ORDER BY r.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_rentals_for_store()
RETURNS TABLE (
  id               uuid,
  code             text,
  listing_id       bigint,
  store_id         uuid,
  start_date       date,
  end_date         date,
  total_days       integer,
  price_per_day    integer,
  deposit          integer,
  subtotal         integer,
  total            integer,
  status           text,
  rejection_reason text,
  payment_status   text,
  created_at       timestamptz,
  updated_at       timestamptz,
  item_name        text,
  item_image       text,
  seller_name      text,
  tenant_name      text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.code, r.listing_id, r.store_id,
         r.start_date, r.end_date, r.total_days,
         r.price_per_day, r.deposit, r.subtotal, r.total,
         r.status, r.rejection_reason, r.payment_status,
         r.created_at, r.updated_at,
         COALESCE(l.name, 'Barang dihapus')          AS item_name,
         COALESCE(l.image_url, '')                   AS item_image,
         COALESCE(s.store_name, 'Mitra JabSewa')     AS seller_name,
         COALESCE(u.full_name, 'Penyewa')            AS tenant_name
  FROM public.rental_transactions r
  LEFT JOIN public.listings l ON l.id = r.listing_id
  LEFT JOIN public.stores   s ON s.id = r.store_id
  LEFT JOIN public.users    u ON u.id = r.tenant_id
  WHERE r.store_id IN (
    SELECT s.id FROM public.stores s WHERE s.user_id = auth.uid() AND s.status = 'active'
  )
  ORDER BY r.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_rentals_for_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_rentals_for_store() TO authenticated;
REVOKE ALL ON FUNCTION public.get_rentals_for_user() FROM anon, public;
REVOKE ALL ON FUNCTION public.get_rentals_for_store() FROM anon, public;

-- ---------------------------------------------------------------------------
-- 7e. Wishlist RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_wishlist()
RETURNS TABLE (listing_id bigint, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT w.listing_id, w.created_at
  FROM public.wishlists w
  WHERE w.user_id = auth.uid()
  ORDER BY w.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.toggle_wishlist(p_listing_id bigint)
RETURNS TABLE (listing_id bigint, active boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vUser uuid := auth.uid();
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
END $$;

GRANT EXECUTE ON FUNCTION public.get_wishlist() TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_wishlist(bigint) TO authenticated;
REVOKE ALL ON FUNCTION public.get_wishlist() FROM anon, public;
REVOKE ALL ON FUNCTION public.toggle_wishlist(bigint) FROM anon, public;

-- ---------------------------------------------------------------------------
-- 7f. get_my_stores RPC — ALL stores owned by the caller (any status),
--     newest-first with active first. Powers SellerPage; ownership is
--     resolved server-side, never from the request.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_stores()
RETURNS TABLE (
  id          uuid,
  user_id     uuid,
  name        text,
  description text,
  city        text,
  address     text,
  status      text,
  is_verified boolean,
  rating      numeric,
  created_at  timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.user_id, s.store_name, s.description, s.city, s.address,
         s.status, s.is_verified, s.rating, s.created_at
  FROM public.stores s
  WHERE s.user_id = auth.uid()
  ORDER BY (s.status = 'active') DESC, s.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_stores() TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_stores() FROM anon, public;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 8 — DEMO SEED (only runs when listings table is empty)
-- ════════════════════════════════════════════════════════════════════════════
-- Mirrors the LocalStorage demo catalog (storage.js) so a fresh project is
-- usable immediately. No-op when data already exists. Stores stay unowned
-- except s-1-style one; sellers claim stores via superadmin approval flow.
-- -----------------------------------------------------------------------------

INSERT INTO public.stores (id, store_name, description, city, address, status, is_verified, rating)
SELECT * FROM (VALUES
  (gen_random_uuid(), 'Sewa Kamera Jakarta', 'Rental kamera & perlengkapan foto profesional.', 'Jakarta Selatan', 'Jl. Kebayoran Lama No. 12', 'active', true, 4.9),
  (gen_random_uuid(), 'Gading Rental Tools', 'Peralatan event, projector, dan sound system siap antar.', 'Jakarta Utara', 'Jl. Kelapa Gading Boulevard No. 5', 'active', true, 4.7),
  (gen_random_uuid(), 'GameNest', 'Konsol game, VR, dan koleksi judul terbaru.', 'Jakarta Barat', 'Jl. Tomang Raya No. 40', 'active', true, 4.8),
  (gen_random_uuid(), 'TrailBase Outdoor', 'Tenda, carrier, dan perlengkapan camping lengkap.', 'Depok', 'Jl. Margonda Raya No. 88', 'active', false, 4.6)
) AS seed(store_name, description, city, address, status, is_verified, rating)
WHERE NOT EXISTS (SELECT 1 FROM public.stores);

INSERT INTO public.listings (store_id, name, description, category, price_per_day, deposit, image_url, location, available, status, rating, successful_transactions)
SELECT seed.store_id, seed.name, seed.description, seed.category, seed.price_per_day, seed.deposit, seed.image_url, seed.location, seed.available, 'active', seed.rating, seed.tx
FROM (VALUES
  ('Sewa Kamera Jakarta', 'Sony Alpha A7 III', 'Kamera full-frame untuk foto, video, dan kebutuhan event.', 'photography', 150000, 500000, 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1000&q=80', 'Jakarta Selatan', true, 4.9, 128),
  ('GameNest', 'PlayStation 5', 'Konsol lengkap dengan dua controller dan koleksi game pilihan.', 'gadget', 100000, 750000, 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?auto=format&fit=crop&w=1000&q=80', 'Jakarta Barat', true, 4.8, 203),
  ('TrailBase Outdoor', 'Camping Tent 4 Orang', 'Tenda waterproof yang nyaman untuk camping akhir pekan.', 'sports', 75000, 300000, 'https://images.unsplash.com/photo-1522163182402-834f871fd851?auto=format&fit=crop&w=1000&q=80', 'Depok', true, 4.7, 92),
  ('Sewa Kamera Jakarta', 'DJI Mini Drone', 'Drone ringan dengan video 4K dan baterai cadangan.', 'photography', 220000, 1000000, 'https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=1000&q=80', 'Jakarta Selatan', false, 4.9, 74),
  ('TrailBase Outdoor', 'Mountain Bike', 'Sepeda gunung untuk jalur kota dan trail ringan.', 'sports', 90000, 400000, 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=1000&q=80', 'Depok', true, 4.6, 58),
  ('Gading Rental Tools', 'Projector Epson', 'Projector terang untuk presentasi dan acara.', 'event', 180000, 600000, 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1000&q=80', 'Jakarta Utara', true, 4.8, 81),
  ('Gading Rental Tools', 'Sound System Portable', 'Speaker aktif + mic wireless untuk acara 200 orang.', 'event', 250000, 800000, 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1000&q=80', 'Jakarta Utara', true, 4.7, 66),
  ('GameNest', 'Nintendo Switch OLED', 'Konsol hybrid dengan layar OLED dan Joy-Con neon.', 'gadget', 85000, 500000, 'https://images.unsplash.com/photo-1578303512597-81e6cc155b3e?auto=format&fit=crop&w=1000&q=80', 'Jakarta Barat', true, 4.7, 119)
) AS seed(store_name, name, description, category, price_per_day, deposit, image_url, location, available, rating, tx)
JOIN public.stores s ON s.store_name = seed.store_name
WHERE NOT EXISTS (SELECT 1 FROM public.listings);

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 8b — SELLER APPLICATION & LISTING MANAGEMENT RPCs
-- ════════════════════════════════════════════════════════════════════════════
-- Seller onboarding must end in a PERSISTED store record (Phase 7), and
-- SellerItems must be able to manage listings only for its own active store.
-- jsonb application keys stay camelCase to match the frontend contract.
-- ---------------------------------------------------------------------------

-- users: application/profile columns (jsonb), additive + idempotent
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS seller_application jsonb,
  ADD COLUMN IF NOT EXISTS seller_profile     jsonb;

-- ---------------------------------------------------------------------------
-- submit_seller_application — authenticated user files a store application.
-- One pending application at a time. Approval happens via
-- decide_seller_application (superadmin only).
-- ---------------------------------------------------------------------------
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
AS $$
DECLARE
  vUser     uuid := auth.uid();
  vProfile  public.users%ROWTYPE;
  vApp      jsonb;
  vName     text := btrim(coalesce(p_store_name, ''));
BEGIN
  IF vUser IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated', NULL::jsonb; RETURN;
  END IF;
  IF vName = '' THEN
    RETURN QUERY SELECT false, 'store_name_required', NULL::jsonb; RETURN;
  END IF;

  SELECT * INTO vProfile FROM public.users WHERE id = vUser;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'profile_not_found', NULL::jsonb; RETURN;
  END IF;

  IF vProfile.seller_application IS NOT NULL
     AND vProfile.seller_application ->> 'status' IN ('draft', 'under_review') THEN
    RETURN QUERY SELECT false, 'application_already_pending', vProfile.seller_application;
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
END $$;

REVOKE ALL ON FUNCTION public.submit_seller_application(text, text, text, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.submit_seller_application(text, text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- decide_seller_application — SUPERADMIN ONLY (checked via is_superadmin()).
-- Approve → role STORE_OWNER + seller_profile + store persisted/activated.
-- Reject  → status rejected + mandatory reason.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decide_seller_application(
  p_email   text,
  p_approve boolean,
  p_reason  text DEFAULT NULL
)
RETURNS TABLE (ok boolean, error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vTarget   public.users%ROWTYPE;
  vApp      jsonb;
  vStoreId  uuid;
  vNow      text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  IF NOT public.is_superadmin() THEN
    RETURN QUERY SELECT false, 'forbidden'; RETURN;
  END IF;

  SELECT * INTO vTarget FROM public.users
   WHERE lower(email) = lower(btrim(coalesce(p_email, '')));
  IF NOT FOUND OR vTarget.seller_application IS NULL THEN
    RETURN QUERY SELECT false, 'application_not_found'; RETURN;
  END IF;
  vApp := vTarget.seller_application;

  IF NOT p_approve THEN
    IF COALESCE(btrim(COALESCE(p_reason, '')), '') = '' THEN
      RETURN QUERY SELECT false, 'rejection_reason_required'; RETURN;
    END IF;
    UPDATE public.users
       SET seller_application = vApp
             || jsonb_build_object('status', 'rejected', 'reviewedAt', vNow,
                                   'rejectionReason', btrim(p_reason))
     WHERE id = vTarget.id;
    RETURN QUERY SELECT true, NULL::text; RETURN;
  END IF;

  UPDATE public.users
     SET role = CASE WHEN role = 'SUPERADMIN' THEN role ELSE 'STORE_OWNER'::public.user_role END,
         seller_application = jsonb_set(vApp, '{status}', '"approved"')
             || jsonb_build_object('reviewedAt', vNow),
         seller_profile = jsonb_build_object(
           'storeName', vApp ->> 'storeName',
           'description', COALESCE(vApp ->> 'description', ''),
           'contact', COALESCE(vApp ->> 'contact', ''),
           'city', COALESCE(vApp ->> 'city', ''),
           'address', COALESCE(vApp ->> 'address', ''))
   WHERE id = vTarget.id;

  -- Persist/activate the store record (Phase 7 requirement).
  SELECT s.id INTO vStoreId FROM public.stores s
   WHERE s.user_id = vTarget.id
   ORDER BY s.created_at
   LIMIT 1;

  IF vStoreId IS NULL THEN
    INSERT INTO public.stores
      (user_id, store_name, description, contact, city, address, status, is_verified)
    VALUES
      (vTarget.id, vApp ->> 'storeName', COALESCE(vApp ->> 'description', ''),
       COALESCE(vApp ->> 'contact', ''), COALESCE(vApp ->> 'city', ''),
       COALESCE(vApp ->> 'address', ''), 'active', false)
    RETURNING id INTO vStoreId;
  ELSE
    UPDATE public.stores
       SET store_name  = COALESCE(vApp ->> 'storeName', store_name),
           description = COALESCE(vApp ->> 'description', description),
           contact     = COALESCE(vApp ->> 'contact', contact),
           city        = COALESCE(vApp ->> 'city', city),
           address     = COALESCE(vApp ->> 'address', address),
           status      = 'active'
     WHERE id = vStoreId;
  END IF;

  RETURN QUERY SELECT true, NULL::text;
END $$;

REVOKE ALL ON FUNCTION public.decide_seller_application(text, boolean, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.decide_seller_application(text, boolean, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- save_listing — create or edit a listing of the caller's OWN active store.
-- p_store_id lets a multi-store owner pick; NULL defaults to first active.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_listing(
  p_listing_id   bigint DEFAULT NULL,
  p_store_id     uuid DEFAULT NULL,
  p_name         text DEFAULT '',
  p_description  text DEFAULT '',
  p_category     text DEFAULT '',
  p_price_per_day integer DEFAULT 0,
  p_deposit      integer DEFAULT 0,
  p_image_url    text DEFAULT '',
  p_location     text DEFAULT '',
  p_available    boolean DEFAULT true
)
RETURNS TABLE (ok boolean, error text, listing_id bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vStore uuid := public.get_my_store(p_store_id);
  vId    bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated', NULL::bigint; RETURN;
  END IF;
  IF vStore IS NULL THEN
    RETURN QUERY SELECT false, 'no_active_store', NULL::bigint; RETURN;
  END IF;
  IF btrim(coalesce(p_name, '')) = '' THEN
    RETURN QUERY SELECT false, 'name_required', NULL::bigint; RETURN;
  END IF;
  IF COALESCE(p_price_per_day, 0) < 0 OR COALESCE(p_deposit, 0) < 0 THEN
    RETURN QUERY SELECT false, 'invalid_amount', NULL::bigint; RETURN;
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
      RETURN QUERY SELECT false, 'not_found_or_forbidden', NULL::bigint; RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT true, NULL::text, vId;
END $$;

REVOKE ALL ON FUNCTION public.save_listing(bigint, uuid, text, text, text, integer, integer, text, text, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.save_listing(bigint, uuid, text, text, text, integer, integer, text, text, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- set_listing_availability / delete_listing — owner-only, active store.
-- delete fails with 'has_rentals' when rentals reference the listing
-- (rental_transactions.listing_id is ON DELETE RESTRICT) → deactivate instead.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_listing_availability(
  p_listing_id bigint,
  p_available  boolean
)
RETURNS TABLE (ok boolean, error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE vId bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated'; RETURN;
  END IF;
  UPDATE public.listings SET available = p_available
   WHERE id = p_listing_id
     AND store_id IN (SELECT s.id FROM public.stores s WHERE s.user_id = auth.uid() AND s.status = 'active')
  RETURNING id INTO vId;
  IF vId IS NULL THEN
    RETURN QUERY SELECT false, 'not_found_or_forbidden'; RETURN;
  END IF;
  RETURN QUERY SELECT true, NULL::text;
END $$;

CREATE OR REPLACE FUNCTION public.delete_listing(p_listing_id bigint)
RETURNS TABLE (ok boolean, error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE vId bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated'; RETURN;
  END IF;
  BEGIN
    DELETE FROM public.listings
     WHERE id = p_listing_id
       AND store_id IN (SELECT s.id FROM public.stores s WHERE s.user_id = auth.uid() AND s.status = 'active')
    RETURNING id INTO vId;
  EXCEPTION WHEN foreign_key_violation THEN
    RETURN QUERY SELECT false, 'has_rentals'; RETURN;
  END;
  IF vId IS NULL THEN
    RETURN QUERY SELECT false, 'not_found_or_forbidden'; RETURN;
  END IF;
  RETURN QUERY SELECT true, NULL::text;
END $$;

REVOKE ALL ON FUNCTION public.set_listing_availability(bigint, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_listing_availability(bigint, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.delete_listing(bigint) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.delete_listing(bigint) TO authenticated;

-- ---------------------------------------------------------------------------
-- listings_for_my_store — seller catalog read (own ACTIVE store only).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listings_for_my_store()
RETURNS TABLE (
  id                      bigint,
  store_id                uuid,
  name                    text,
  description             text,
  category                text,
  price_per_day           integer,
  deposit                 integer,
  image_url               text,
  location                text,
  available               boolean,
  rating                  numeric,
  successful_transactions integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.store_id, l.name, l.description, l.category,
         l.price_per_day, l.deposit, l.image_url, l.location,
         l.available, l.rating, l.successful_transactions
  FROM public.listings l
  WHERE l.store_id IN (
    SELECT s.id FROM public.stores s WHERE s.user_id = auth.uid() AND s.status = 'active'
  )
  ORDER BY l.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.listings_for_my_store() TO authenticated;
REVOKE ALL ON FUNCTION public.listings_for_my_store() FROM anon, public;

-- ---------------------------------------------------------------------------
-- list_seller_applications — SUPERADMIN ONLY. All users with a non-draft
-- seller_application, newest first. Shape matches the existing UI contract
-- (id = email, applicant, sellerApplication camelCase).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_seller_applications()
RETURNS TABLE (
  id                 text,
  applicant_name     text,
  applicant_email    text,
  seller_application jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.email AS id,
         COALESCE(u.full_name, split_part(u.email, '@', 1)) AS applicant_name,
         u.email AS applicant_email,
         u.seller_application
  FROM public.users u
  WHERE u.seller_application IS NOT NULL
    AND u.seller_application ->> 'status' IS DISTINCT FROM 'draft'
  ORDER BY COALESCE(u.seller_application ->> 'submittedAt', '') DESC;
$$;

REVOKE ALL ON FUNCTION public.list_seller_applications() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.list_seller_applications() TO authenticated;

-- ---------------------------------------------------------------------------
-- list_audit_logs — SUPERADMIN ONLY; audit trail with actor email joined
-- (the older list_admin_audit_logs does not expose actor_email, which the
-- SysAudit table displays).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_audit_logs(p_limit integer DEFAULT 100)
RETURNS TABLE (
  id          bigint,
  action      text,
  actor_email text,
  target_type text,
  target_id   text,
  ip_address  inet,
  created_at  timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.action,
         COALESCE(u.email, a.admin_id::text) AS actor_email,
         a.target_type, a.target_id, a.ip_address, a.created_at
  FROM public.admin_audit_logs a
  LEFT JOIN public.users u ON u.id = a.admin_id
  WHERE public.is_superadmin()
  ORDER BY a.created_at DESC
  LIMIT least(greatest(COALESCE(p_limit, 100), 1), 500);
$$;

REVOKE ALL ON FUNCTION public.list_audit_logs(integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.list_audit_logs(integer) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 9 — RLS SANITY CHECKS (fail loudly if misconfigured)
-- ════════════════════════════════════════════════════════════════════════════
DO $checks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname='public' AND c.relname='rental_transactions' AND c.relrowsecurity) THEN
    RAISE EXCEPTION 'RLS not enabled on rental_transactions';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rental_transactions' AND policyname LIKE '%insert%') THEN
    RAISE EXCEPTION 'Unexpected INSERT policy on rental_transactions — writes must go through RPC';
  END IF;
END $checks$;

