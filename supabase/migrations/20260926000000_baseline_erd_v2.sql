-- ============================================================================
-- JabSewa — CLEAN BASELINE MIGRATION (ERD v2, 13 tables + wishlists)
-- ============================================================================
-- Target: project Supabase BARU dan KOSONG. Tidak mewarisi schema legacy.
-- Sumber kontrak:
--   docs/db-rebuild/03-database-design.md  (schema contract final)
--   docs/db-rebuild/02-final-prd.md        (lifecycle & business rules)
--   docs/db-rebuild/04-rpc-security-contract.md (RPC & security matrix)
--
-- Keputusan terdokumentasi: D1 role consumer/admin · D2 uang integer IDR (bigint)
-- D3 uuid semua tabel · D4 deposit ditambahkan · D5 verifikator owner+admin
-- D6 action/entity_type = text + CHECK registry.
--
-- IDEMPOTENT-CLEAN: dirancang untuk database kosong; tanpa IF NOT EXISTS yang
-- menutupi schema salah (kecuali extension & sanity). TANPA seed demo.
-- ============================================================================

-- ══════════════════════════════════════════════════════════════════════════
-- 1. EXTENSIONS
-- ══════════════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- ══════════════════════════════════════════════════════════════════════════
-- 2. ENUMS
-- ══════════════════════════════════════════════════════════════════════════
CREATE TYPE public.user_role          AS ENUM ('consumer', 'admin');
CREATE TYPE public.user_status        AS ENUM ('active', 'inactive', 'suspended');
CREATE TYPE public.application_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.store_status       AS ENUM ('active', 'inactive', 'suspended');
CREATE TYPE public.rental_unit        AS ENUM ('day', 'week', 'month');
CREATE TYPE public.listing_status     AS ENUM ('active', 'inactive', 'out_of_stock', 'suspended');
CREATE TYPE public.transaction_status AS ENUM (
  'pending', 'payment_verify', 'confirmed', 'ongoing',
  'overdue', 'completed', 'cancelled', 'disputed');
CREATE TYPE public.payment_status     AS ENUM ('pending', 'paid', 'failed', 'refunded');
CREATE TYPE public.payment_method     AS ENUM ('bank_transfer', 'e_wallet', 'credit_card', 'qris');
CREATE TYPE public.dispute_status     AS ENUM ('open', 'investigating', 'resolved', 'rejected');
CREATE TYPE public.late_fee_status    AS ENUM ('unpaid', 'paid', 'waived');

-- ══════════════════════════════════════════════════════════════════════════
-- 3. TABLES (dependency order)
-- ══════════════════════════════════════════════════════════════════════════

-- 3.1 users ----------------------------------------------------------------
CREATE TABLE public.users (
  id          uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email       varchar(255) NOT NULL UNIQUE,
  role        public.user_role   NOT NULL DEFAULT 'consumer',
  full_name   varchar(100)       NOT NULL DEFAULT '',
  phone       varchar(20),
  avatar_url  text,
  is_seller   boolean            NOT NULL DEFAULT false,  -- cache (D1)
  status      public.user_status NOT NULL DEFAULT 'active',
  created_at  timestamptz        NOT NULL DEFAULT now(),
  updated_at  timestamptz        NOT NULL DEFAULT now()
);

-- 3.2 categories -----------------------------------------------------------
CREATE TABLE public.categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       varchar(100) NOT NULL,
  slug       varchar(100) NOT NULL UNIQUE,
  created_at timestamptz  NOT NULL DEFAULT now()
);

-- 3.3 store_applications ---------------------------------------------------
CREATE TABLE public.store_applications (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  store_name       varchar(100) NOT NULL,
  description      text NOT NULL DEFAULT '',
  address          text NOT NULL DEFAULT '',
  logo_url         text,
  status           public.application_status NOT NULL DEFAULT 'pending',
  reviewed_by      uuid REFERENCES public.users (id) ON DELETE SET NULL,
  reviewed_at      timestamptz,
  rejection_reason text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_applications_rejected_reason_required
    CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL)
);
CREATE INDEX idx_store_applications_user   ON public.store_applications (user_id, created_at DESC);
CREATE INDEX idx_store_applications_status ON public.store_applications (status, created_at DESC);

-- 3.4 stores ---------------------------------------------------------------
CREATE TABLE public.stores (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id            uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  name                varchar(100) NOT NULL,
  description         text NOT NULL DEFAULT '',
  address             text NOT NULL DEFAULT '',
  logo_url            text,
  status              public.store_status NOT NULL DEFAULT 'active',
  rental_unit         public.rental_unit NOT NULL DEFAULT 'day',
  min_rental_duration integer CHECK (min_rental_duration IS NULL OR min_rental_duration > 0),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stores_owner  ON public.stores (owner_id);
CREATE INDEX idx_stores_status ON public.stores (status);

-- 3.5 listings -------------------------------------------------------------
CREATE TABLE public.listings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id            uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  category_id         uuid NOT NULL REFERENCES public.categories (id) ON DELETE RESTRICT,
  name                varchar(100) NOT NULL,
  description         text NOT NULL DEFAULT '',
  price               bigint NOT NULL CHECK (price >= 0),            -- IDR per rental_unit (D2)
  deposit             bigint NOT NULL DEFAULT 0 CHECK (deposit >= 0), -- deviasi D4
  stock               integer NOT NULL CHECK (stock >= 0),
  rental_unit         public.rental_unit NOT NULL DEFAULT 'day',
  min_rental_duration integer CHECK (min_rental_duration IS NULL OR min_rental_duration > 0),
  status              public.listing_status NOT NULL DEFAULT 'active',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_listings_store           ON public.listings (store_id);
CREATE INDEX idx_listings_category        ON public.listings (category_id);
CREATE INDEX idx_listings_store_active    ON public.listings (store_id)    WHERE status = 'active';
CREATE INDEX idx_listings_status_active   ON public.listings (status)      WHERE status = 'active';

-- 3.6 listing_images -------------------------------------------------------
CREATE TABLE public.listing_images (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings (id) ON DELETE CASCADE,
  image_url  text NOT NULL DEFAULT '',
  sort_order integer NOT NULL CHECK (sort_order >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT listing_images_unique_sort UNIQUE (listing_id, sort_order)
);
CREATE INDEX idx_listing_images_listing ON public.listing_images (listing_id, sort_order);

-- 3.7 rental_transactions --------------------------------------------------
CREATE TABLE public.rental_transactions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id           uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  store_id           uuid NOT NULL REFERENCES public.stores (id) ON DELETE RESTRICT,
  status             public.transaction_status NOT NULL DEFAULT 'pending',
  start_date         date NOT NULL,
  end_date           date NOT NULL,
  subtotal           bigint NOT NULL CHECK (subtotal >= 0),              -- server-computed
  deposit_total      bigint NOT NULL DEFAULT 0 CHECK (deposit_total >= 0), -- deviasi D4
  total              bigint NOT NULL CHECK (total >= 0),                 -- = subtotal + deposit_total
  late_fee_total     bigint NOT NULL DEFAULT 0 CHECK (late_fee_total >= 0),
  actual_return_date timestamptz,
  cancelled_by       uuid REFERENCES public.users (id) ON DELETE SET NULL,
  cancelled_at       timestamptz,
  cancel_reason      text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_transactions_dates_order CHECK (end_date >= start_date),
  CONSTRAINT rental_transactions_cancel_fields
    CHECK (status <> 'cancelled' OR (cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL))
);
CREATE INDEX idx_rentals_buyer  ON public.rental_transactions (buyer_id, created_at DESC);
CREATE INDEX idx_rentals_store  ON public.rental_transactions (store_id);
CREATE INDEX idx_rentals_status ON public.rental_transactions (status);
CREATE INDEX idx_rentals_status_dates
  ON public.rental_transactions (status, start_date, end_date);

-- 3.8 transaction_items ----------------------------------------------------
CREATE TABLE public.transaction_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.rental_transactions (id) ON DELETE CASCADE,
  listing_id     uuid NOT NULL REFERENCES public.listings (id) ON DELETE RESTRICT,
  quantity       integer NOT NULL CHECK (quantity > 0),
  price          bigint NOT NULL CHECK (price >= 0),              -- snapshot listings.price
  deposit        bigint NOT NULL DEFAULT 0 CHECK (deposit >= 0),  -- snapshot listings.deposit (D4)
  subtotal       bigint NOT NULL CHECK (subtotal >= 0),           -- server-computed
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_transaction_items_tx      ON public.transaction_items (transaction_id);
CREATE INDEX idx_transaction_items_listing ON public.transaction_items (listing_id);

-- 3.9 payments -------------------------------------------------------------
CREATE TABLE public.payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id     uuid NOT NULL REFERENCES public.rental_transactions (id) ON DELETE RESTRICT,
  amount             bigint NOT NULL CHECK (amount > 0),
  status             public.payment_status NOT NULL DEFAULT 'pending',
  payment_method     public.payment_method NOT NULL DEFAULT 'bank_transfer',
  external_reference varchar(100),
  payment_proof_url  text,
  paid_at            timestamptz,   -- nullable; wajib saat status paid (RPC)
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_tx     ON public.payments (transaction_id, created_at DESC);
CREATE INDEX idx_payments_status ON public.payments (status);

-- 3.10 late_fees -----------------------------------------------------------
CREATE TABLE public.late_fees (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL UNIQUE REFERENCES public.rental_transactions (id) ON DELETE CASCADE,
  days_late      integer NOT NULL CHECK (days_late >= 0),
  daily_rate     bigint  NOT NULL CHECK (daily_rate >= 0),
  total          bigint  NOT NULL CHECK (total = days_late * daily_rate),
  status         public.late_fee_status NOT NULL DEFAULT 'unpaid',
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- 3.11 disputes ------------------------------------------------------------
CREATE TABLE public.disputes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.rental_transactions (id) ON DELETE RESTRICT,
  opened_by      uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  reason         text NOT NULL,
  description    text NOT NULL DEFAULT '',
  status         public.dispute_status NOT NULL DEFAULT 'open',
  resolved_by    uuid REFERENCES public.users (id) ON DELETE SET NULL,
  resolution     text,
  resolved_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_disputes_tx     ON public.disputes (transaction_id);
CREATE UNIQUE INDEX uq_disputes_active_per_tx
  ON public.disputes (transaction_id)
  WHERE status IN ('open', 'investigating');

-- 3.12 reviews -------------------------------------------------------------
CREATE TABLE public.reviews (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL UNIQUE REFERENCES public.rental_transactions (id) ON DELETE RESTRICT,
  buyer_id       uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  store_id       uuid NOT NULL REFERENCES public.stores (id) ON DELETE RESTRICT,
  rating         integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment        text NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_reviews_store ON public.reviews (store_id, created_at DESC);

-- 3.13 wishlists -----------------------------------------------------------
CREATE TABLE public.wishlists (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.listings (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wishlists_user_listing_unique UNIQUE (user_id, listing_id)
);
CREATE INDEX idx_wishlists_user ON public.wishlists (user_id, created_at DESC);

-- 3.14 audit_logs ----------------------------------------------------------
CREATE TABLE public.audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   uuid NOT NULL,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_action_registry CHECK (action IN (
    'application_submit','application_approve','application_reject',
    'store_activate','store_deactivate','store_suspend','store_unsuspend',
    'listing_create','listing_update','listing_delete','listing_suspend',
    'rental_create','rental_cancel','payment_submit','payment_verify','payment_reject',
    'return_record','latefee_apply','latefee_waive',
    'dispute_open','dispute_resolve','review_create',
    'role_change','user_suspend','user_activate')),
  CONSTRAINT audit_logs_entity_registry CHECK (entity_type IN (
    'user','store_application','store','category','listing','listing_image',
    'rental_transaction','payment','late_fee','dispute','review'))
);
CREATE INDEX idx_audit_logs_created ON public.audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_actor   ON public.audit_logs (actor_id);
CREATE INDEX idx_audit_logs_entity  ON public.audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_logs_action  ON public.audit_logs (action, created_at DESC);

-- ══════════════════════════════════════════════════════════════════════════
-- 4. TRIGGERS — updated_at & auth profile
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER trg_users_touch       BEFORE UPDATE ON public.users               FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_store_apps_touch  BEFORE UPDATE ON public.store_applications  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_stores_touch      BEFORE UPDATE ON public.stores              FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_listings_touch    BEFORE UPDATE ON public.listings            FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_rentals_touch     BEFORE UPDATE ON public.rental_transactions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Bootstrap profil: setiap user auth baru otomatis punya public.users (consumer).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ══════════════════════════════════════════════════════════════════════════
-- 5. HELPER FUNCTIONS (SECDEF; dipakai policy & RPC)
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND status = 'active'
  );
$$;

-- Resolve store milik pemanggil. p_store_id given → wajib miliknya; NULL → pertama.
-- TANPA filter status (status dicek per kasus di RPC).
CREATE OR REPLACE FUNCTION public.my_store(p_store_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id
  FROM public.stores s
  WHERE s.owner_id = auth.uid()
    AND (p_store_id IS NULL OR s.id = p_store_id)
  ORDER BY s.created_at
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.owns_store_of_tx(p_rental_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.rental_transactions r
    JOIN public.stores s ON s.id = r.store_id
    WHERE r.id = p_rental_id AND s.owner_id = auth.uid()
  );
$$;

-- Hari kalender per rental_unit (durasi unit = ceil(total_days / unit_days)).
CREATE OR REPLACE FUNCTION public.rental_unit_days(p_unit public.rental_unit)
RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE p_unit WHEN 'day' THEN 1 WHEN 'week' THEN 7 WHEN 'month' THEN 30 END;
$$;

-- Unit terisi listing L pada periode [s,e] (inklusif, back-to-back bebas).
-- Status yang memegang inventori: pending..overdue (PRD §9).
CREATE OR REPLACE FUNCTION public.occupied_units(p_listing_id uuid, p_start date, p_end date)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(SUM(ti.quantity), 0)
  FROM public.transaction_items ti
  JOIN public.rental_transactions r ON r.id = ti.transaction_id
  WHERE ti.listing_id = p_listing_id
    AND r.status IN ('pending', 'payment_verify', 'confirmed', 'ongoing', 'overdue')
    AND r.start_date <= p_end
    AND r.end_date   >= p_start;
$$;

-- Tulis audit log (hanya dipanggil dari RPC SECDEF — tanpa grant client).
CREATE OR REPLACE FUNCTION public.log_audit(
  p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), p_action, p_entity_type, p_entity_id, p_metadata);
END $$;

-- Sinkronkan cache is_seller (D1): seller aktif = punya store berstatus active.
CREATE OR REPLACE FUNCTION public.sync_is_seller(p_user_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.users u
  SET is_seller = EXISTS (
        SELECT 1 FROM public.stores s
        WHERE s.owner_id = p_user_id AND s.status = 'active')
  WHERE u.id = p_user_id;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- 6. RPC — STORE APPLICATIONS (§3.1 kontrak RPC)
-- ══════════════════════════════════════════════════════════════════════════

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
  IF v_user IS NULL THEN ok := false; error := 'unauthenticated'; RETURN; END IF;
  IF NOT public.is_active_user() THEN ok := false; error := 'user_inactive'; RETURN; END IF;
  IF btrim(COALESCE(p_store_name, '')) = '' THEN ok := false; error := 'store_name_required'; RETURN; END IF;

  IF EXISTS (SELECT 1 FROM public.stores WHERE owner_id = v_user AND status = 'active') THEN
    ok := false; error := 'already_seller'; RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.store_applications
    WHERE user_id = v_user AND status = 'pending'
  ) THEN
    ok := false; error := 'application_pending'; RETURN;
  END IF;

  INSERT INTO public.store_applications (user_id, store_name, description, address, logo_url)
  VALUES (v_user, btrim(p_store_name), btrim(COALESCE(p_description, '')),
          btrim(COALESCE(p_address, '')), p_logo_url)
  RETURNING id INTO v_id;

  PERFORM public.log_audit('application_submit', 'store_application', v_id,
    jsonb_build_object('store_name', btrim(p_store_name)));
  ok := true; error := NULL; application_id := v_id; RETURN;
END $$;

CREATE OR REPLACE FUNCTION public.get_my_applications()
RETURNS TABLE (
  id uuid, store_name varchar, description text, address text, logo_url text,
  status application_status, rejection_reason text,
  reviewed_at timestamptz, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.id, a.store_name, a.description, a.address, a.logo_url,
         a.status, a.rejection_reason, a.reviewed_at, a.created_at
  FROM public.store_applications a
  WHERE a.user_id = auth.uid()
  ORDER BY a.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.list_store_applications(p_status application_status DEFAULT NULL)
RETURNS TABLE (
  id uuid, user_id uuid, applicant_name text, applicant_email varchar,
  store_name varchar, description text, address text, logo_url text,
  status application_status, rejection_reason text,
  reviewed_by uuid, reviewed_at timestamptz, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.id, a.user_id, u.full_name AS applicant_name, u.email AS applicant_email,
         a.store_name, a.description, a.address, a.logo_url,
         a.status, a.rejection_reason, a.reviewed_by, a.reviewed_at, a.created_at
  FROM public.store_applications a
  JOIN public.users u ON u.id = a.user_id
  WHERE public.is_admin() AND (p_status IS NULL OR a.status = p_status)
  ORDER BY a.created_at DESC;
$$;

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
  IF NOT public.is_admin() THEN ok := false; error := 'forbidden'; RETURN; END IF;

  SELECT * INTO v_app FROM public.store_applications WHERE id = p_application_id;
  IF NOT FOUND THEN ok := false; error := 'application_not_found'; RETURN; END IF;
  IF v_app.user_id = v_admin THEN ok := false; error := 'self_review_forbidden'; RETURN; END IF;
  IF v_app.status <> 'pending' THEN ok := false; error := 'application_not_pending'; RETURN; END IF;

  IF NOT p_approve THEN
    IF btrim(COALESCE(p_reason, '')) = '' THEN
      ok := false; error := 'rejection_reason_required'; RETURN;
    END IF;
    UPDATE public.store_applications
       SET status = 'rejected', rejection_reason = btrim(p_reason),
           reviewed_by = v_admin, reviewed_at = now()
     WHERE id = v_app.id;
    PERFORM public.log_audit('application_reject', 'store_application', v_app.id,
      jsonb_build_object('reason', btrim(p_reason)));
    ok := true; error := NULL; RETURN;
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
  ok := true; error := NULL; RETURN;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 7. RPC — STORES (§3.2)
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_my_stores()
RETURNS TABLE (
  id uuid, owner_id uuid, name varchar, description text, address text,
  logo_url text, status store_status, rental_unit rental_unit,
  min_rental_duration integer, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id, s.owner_id, s.name, s.description, s.address, s.logo_url,
         s.status, s.rental_unit, s.min_rental_duration, s.created_at
  FROM public.stores s
  WHERE s.owner_id = auth.uid()
  ORDER BY (s.status = 'active') DESC, s.created_at DESC;
$$;

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
  IF auth.uid() IS NULL THEN ok := false; error := 'unauthenticated'; RETURN; END IF;
  IF v_store IS NULL THEN ok := false; error := 'not_found_or_forbidden'; RETURN; END IF;
  IF btrim(COALESCE(p_name, '')) = '' THEN ok := false; error := 'store_name_required'; RETURN; END IF;

  UPDATE public.stores
     SET name = btrim(p_name), description = btrim(COALESCE(p_description, '')),
         address = btrim(COALESCE(p_address, '')), logo_url = p_logo_url
   WHERE id = v_store;
  ok := true; error := NULL; RETURN;
END $$;

CREATE OR REPLACE FUNCTION public.set_my_store_status(p_store_id uuid, p_status store_status)
RETURNS TABLE (ok boolean, error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_store uuid := public.my_store(p_store_id);
  v_cur   public.store_status;
BEGIN
  IF auth.uid() IS NULL THEN ok := false; error := 'unauthenticated'; RETURN; END IF;
  IF v_store IS NULL THEN ok := false; error := 'not_found_or_forbidden'; RETURN; END IF;
  IF p_status NOT IN ('active', 'inactive') THEN
    ok := false; error := 'admin_only_status'; RETURN;
  END IF;

  SELECT status INTO v_cur FROM public.stores WHERE id = v_store;
  IF v_cur = 'suspended' THEN ok := false; error := 'admin_only_status'; RETURN; END IF;

  UPDATE public.stores SET status = p_status WHERE id = v_store;
  PERFORM public.sync_is_seller(auth.uid());
  PERFORM public.log_audit(
    CASE WHEN p_status = 'active' THEN 'store_activate' ELSE 'store_deactivate' END,
    'store', v_store, jsonb_build_object('from', v_cur, 'to', p_status));
  ok := true; error := NULL; RETURN;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_store_status(p_store_id uuid, p_status store_status)
RETURNS TABLE (ok boolean, error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_cur   public.store_status;
BEGIN
  IF NOT public.is_admin() THEN ok := false; error := 'forbidden'; RETURN; END IF;
  SELECT owner_id, status INTO v_owner, v_cur FROM public.stores WHERE id = p_store_id;
  IF NOT FOUND THEN ok := false; error := 'not_found'; RETURN; END IF;

  UPDATE public.stores SET status = p_status WHERE id = p_store_id;
  PERFORM public.sync_is_seller(v_owner);
  PERFORM public.log_audit(
    CASE p_status
      WHEN 'suspended' THEN 'store_suspend'
      WHEN 'active'    THEN 'store_unsuspend'
      ELSE 'store_deactivate' END,
    'store', p_store_id, jsonb_build_object('from', v_cur, 'to', p_status));
  ok := true; error := NULL; RETURN;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 8. RPC — LISTINGS & IMAGES (§3.3)
-- ══════════════════════════════════════════════════════════════════════════

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
  IF auth.uid() IS NULL THEN ok := false; error := 'unauthenticated'; RETURN; END IF;
  IF v_store IS NULL THEN ok := false; error := 'no_active_store'; RETURN; END IF;
  IF btrim(COALESCE(p_name, '')) = '' THEN ok := false; error := 'name_required'; RETURN; END IF;
  IF p_price < 0 OR p_deposit < 0 THEN ok := false; error := 'invalid_amount'; RETURN; END IF;
  IF p_stock IS NULL OR p_stock < 0 THEN ok := false; error := 'invalid_stock'; RETURN; END IF;
  IF p_min_rental_duration IS NOT NULL AND p_min_rental_duration <= 0 THEN
    ok := false; error := 'invalid_min_duration'; RETURN;
  END IF;
  IF p_category_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_category_id) THEN
    ok := false; error := 'category_not_found'; RETURN;
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
    IF NOT FOUND THEN ok := false; error := 'not_found_or_forbidden'; RETURN; END IF;

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

  ok := true; error := NULL; listing_id := v_id; RETURN;
END $$;

CREATE OR REPLACE FUNCTION public.set_listing_availability(p_listing_id uuid, p_available boolean)
RETURNS TABLE (ok boolean, error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_store uuid := public.my_store(NULL);
  v_cur   public.listing_status;
BEGIN
  IF auth.uid() IS NULL THEN ok := false; error := 'unauthenticated'; RETURN; END IF;
  IF v_store IS NULL THEN ok := false; error := 'no_active_store'; RETURN; END IF;

  SELECT status INTO v_cur FROM public.listings
   WHERE id = p_listing_id AND store_id = v_store;
  IF NOT FOUND THEN ok := false; error := 'not_found_or_forbidden'; RETURN; END IF;
  IF v_cur = 'suspended' THEN ok := false; error := 'admin_only_status'; RETURN; END IF;

  UPDATE public.listings
     SET status = CASE WHEN p_available THEN 'active' ELSE 'inactive' END::public.listing_status
   WHERE id = p_listing_id;
  PERFORM public.log_audit('listing_update', 'listing', p_listing_id,
    jsonb_build_object('available', p_available));
  ok := true; error := NULL; RETURN;
END $$;

CREATE OR REPLACE FUNCTION public.delete_listing(p_listing_id uuid)
RETURNS TABLE (ok boolean, error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_store uuid := public.my_store(NULL);
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN ok := false; error := 'unauthenticated'; RETURN; END IF;
  IF v_store IS NULL THEN ok := false; error := 'no_active_store'; RETURN; END IF;
  BEGIN
    DELETE FROM public.listings
     WHERE id = p_listing_id AND store_id = v_store
    RETURNING id INTO v_id;
  EXCEPTION WHEN foreign_key_violation THEN
    ok := false; error := 'has_rentals'; RETURN;
  END;
  IF v_id IS NULL THEN ok := false; error := 'not_found_or_forbidden'; RETURN; END IF;
  PERFORM public.log_audit('listing_delete', 'listing', v_id, '{}'::jsonb);
  ok := true; error := NULL; RETURN;
END $$;

-- my_store_listings — katalog seller (semua status, store milik pemanggil).
CREATE OR REPLACE FUNCTION public.my_store_listings()
RETURNS TABLE (
  id uuid, store_id uuid, category_id uuid, category_slug text, name varchar,
  description text, price bigint, deposit bigint, stock integer,
  rental_unit rental_unit, min_rental_duration integer, status listing_status,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT l.id, l.store_id, l.category_id, c.slug AS category_slug, l.name,
         l.description, l.price, l.deposit, l.stock, l.rental_unit,
         l.min_rental_duration, l.status, l.created_at
  FROM public.listings l
  JOIN public.categories c ON c.id = l.category_id
  WHERE l.store_id IN (SELECT s.id FROM public.stores s WHERE s.owner_id = auth.uid())
  ORDER BY l.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_listing_status(p_listing_id uuid, p_status listing_status)
RETURNS TABLE (ok boolean, error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN ok := false; error := 'forbidden'; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.listings WHERE id = p_listing_id) THEN
    ok := false; error := 'not_found'; RETURN;
  END IF;
  UPDATE public.listings SET status = p_status WHERE id = p_listing_id;
  PERFORM public.log_audit(
    CASE WHEN p_status = 'suspended' THEN 'listing_suspend' ELSE 'listing_update' END,
    'listing', p_listing_id, jsonb_build_object('to', p_status));
  ok := true; error := NULL; RETURN;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 9. RPC — WISHLIST (§3.4)
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_wishlist()
RETURNS TABLE (
  listing_id uuid, created_at timestamptz,
  name varchar, price bigint, deposit bigint, image_url text,
  store_id uuid, store_name varchar, status listing_status
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT w.listing_id, w.created_at,
         l.name, l.price, l.deposit,
         (SELECT li.image_url FROM public.listing_images li
           WHERE li.listing_id = l.id ORDER BY li.sort_order LIMIT 1) AS image_url,
         s.id AS store_id, s.name AS store_name, l.status
  FROM public.wishlists w
  JOIN public.listings l ON l.id = w.listing_id
  JOIN public.stores   s ON s.id = l.store_id
  WHERE w.user_id = auth.uid()
  ORDER BY w.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.toggle_wishlist(p_listing_id uuid)
RETURNS TABLE (ok boolean, error text, active boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_exists boolean;
BEGIN
  IF v_user IS NULL THEN ok := false; error := 'unauthenticated'; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.listings WHERE id = p_listing_id) THEN
    ok := false; error := 'listing_not_found'; RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.wishlists
    WHERE user_id = v_user AND listing_id = p_listing_id
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.wishlists WHERE user_id = v_user AND listing_id = p_listing_id;
    ok := true; error := NULL; active := false; RETURN;
  ELSE
    INSERT INTO public.wishlists (user_id, listing_id) VALUES (v_user, p_listing_id)
      ON CONFLICT (user_id, listing_id) DO NOTHING;
    ok := true; error := NULL; active := true; RETURN;
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 10. RPC — QUOTE & CREATE RENTAL (§3.5) — multi-item, atomic, advisory lock
-- ══════════════════════════════════════════════════════════════════════════
-- p_items: jsonb array [{ "listing_id": "<uuid>", "quantity": <int> }]
-- Kontrak PRD §8: unit_days per listing; duration_units = ceil(total_days/unit_days);
-- item.subtotal = price × qty × duration_units; total = Σ subtotal + Σ deposit×qty.

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
  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start THEN
    ok := false; error := 'invalid_date_range'; RETURN;
  END IF;
  IF p_start < CURRENT_DATE THEN ok := false; error := 'start_date_in_past'; RETURN; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    ok := false; error := 'empty_items'; RETURN;
  END IF;

  v_days := (p_end - p_start)::int + 1;  -- end_date INCLUSIVE

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_lid := (v_item ->> 'listing_id')::uuid;
    v_qty := COALESCE((v_item ->> 'quantity')::int, 0);
    IF v_lid IS NULL THEN ok := false; error := 'invalid_items'; RETURN; END IF;
    IF v_qty <= 0 THEN ok := false; error := 'invalid_quantity'; RETURN; END IF;

    SELECT * INTO v_listing FROM public.listings WHERE id = v_lid;
    IF NOT FOUND THEN ok := false; error := 'listing_not_found'; RETURN; END IF;
    IF v_listing.status <> 'active' THEN ok := false; error := 'listing_unavailable'; RETURN; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = v_listing.store_id AND status = 'active') THEN
      ok := false; error := 'store_inactive'; RETURN;
    END IF;

    v_units := ceil(v_days::numeric / public.rental_unit_days(v_listing.rental_unit))::int;
    IF v_listing.min_rental_duration IS NOT NULL AND v_units < v_listing.min_rental_duration THEN
      ok := false; error := 'min_duration'; RETURN;
    END IF;

    v_avail := v_listing.stock - public.occupied_units(v_lid, p_start, p_end);
    IF v_qty > v_avail THEN ok := false; error := 'insufficient_stock'; RETURN; END IF;

    v_subtotal := v_subtotal + v_listing.price * v_qty * v_units;
    v_deposit_total := v_deposit_total + v_listing.deposit * v_qty;
    v_items_out := v_items_out || jsonb_build_object(
      'listing_id', v_lid, 'quantity', v_qty, 'duration_units', v_units,
      'price', v_listing.price, 'deposit', v_listing.deposit,
      'subtotal', v_listing.price * v_qty * v_units);
  END LOOP;

  ok := true; error := NULL;
  total_days := v_days; subtotal := v_subtotal; deposit_total := v_deposit_total;
  total := v_subtotal + v_deposit_total; items := v_items_out; RETURN;
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
  IF v_user IS NULL THEN ok := false; error := 'unauthenticated'; RETURN; END IF;
  IF NOT public.is_active_user() THEN ok := false; error := 'user_inactive'; RETURN; END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start THEN
    ok := false; error := 'invalid_date_range'; RETURN;
  END IF;
  IF p_start < CURRENT_DATE THEN ok := false; error := 'start_date_in_past'; RETURN; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    ok := false; error := 'invalid_items'; RETURN;
  END IF;
  IF jsonb_array_length(p_items) = 0 THEN ok := false; error := 'empty_items'; RETURN; END IF;
  IF jsonb_array_length(p_items) > 20 THEN ok := false; error := 'too_many_items'; RETURN; END IF;

  v_days := (p_end - p_start)::int + 1;  -- end_date INCLUSIVE; same-day = 1

  -- PASS 1 — validasi bisnis (tanpa tulis): satu store, listing aktif, qty, durasi.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_lid := (v_item ->> 'listing_id')::uuid;
    v_qty := COALESCE((v_item ->> 'quantity')::int, 0);
    IF v_lid IS NULL THEN ok := false; error := 'invalid_items'; RETURN; END IF;
    IF v_lid = ANY (v_seen) THEN ok := false; error := 'duplicate_item'; RETURN; END IF;
    v_seen := v_seen || v_lid;
    IF v_qty <= 0 THEN ok := false; error := 'invalid_quantity'; RETURN; END IF;

    SELECT * INTO v_listing FROM public.listings WHERE id = v_lid;
    IF NOT FOUND THEN ok := false; error := 'listing_not_found'; RETURN; END IF;
    IF v_listing.status <> 'active' THEN ok := false; error := 'listing_unavailable'; RETURN; END IF;

    IF v_store IS NULL THEN v_store := v_listing.store_id;
    ELSIF v_store <> v_listing.store_id THEN
      ok := false; error := 'mixed_stores'; RETURN;  -- PRD §5.1 / C-21
    END IF;

    v_units := ceil(v_days::numeric / public.rental_unit_days(v_listing.rental_unit))::int;
    IF v_listing.min_rental_duration IS NOT NULL AND v_units < v_listing.min_rental_duration THEN
      ok := false; error := 'min_duration'; RETURN;
    END IF;

    v_subtotal := v_subtotal + v_listing.price * v_qty * v_units;
    v_deposit_total := v_deposit_total + v_listing.deposit * v_qty;
  END LOOP;

  SELECT status INTO v_store_status FROM public.stores WHERE id = v_store;
  IF NOT FOUND OR v_store_status <> 'active' THEN
    ok := false; error := 'store_inactive'; RETURN;
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
      ok := false; error := 'insufficient_stock'; RETURN;
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
  total_days := v_days; RETURN;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 11. RPC — STATUS TRANSITIONS (§3.5, matriks PRD §5.2)
-- ══════════════════════════════════════════════════════════════════════════

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
  IF v_user IS NULL THEN ok := false; error := 'unauthenticated'; RETURN; END IF;
  SELECT * INTO v_tx FROM public.rental_transactions WHERE id = p_rental_id;
  IF NOT FOUND THEN ok := false; error := 'not_found'; RETURN; END IF;

  v_is_buyer := v_tx.buyer_id = v_user;
  v_is_owner := public.owns_store_of_tx(p_rental_id);
  IF NOT v_is_buyer AND NOT v_is_owner AND NOT public.is_admin() THEN
    ok := false; error := 'forbidden'; RETURN;
  END IF;

  -- PRD §5.2 (OQ-1): buyer boleh cancel di pending/payment_verify;
  -- owner (dan admin) sampai confirmed.
  IF v_is_buyer AND NOT v_is_owner AND NOT public.is_admin() THEN
    IF NOT v_tx.status IN ('pending', 'payment_verify') THEN
      ok := false; error := 'illegal_transition'; RETURN;
    END IF;
  ELSE
    IF NOT v_tx.status IN ('pending', 'payment_verify', 'confirmed') THEN
      ok := false; error := 'illegal_transition'; RETURN;
    END IF;
    IF v_reason = '' THEN
      ok := false; error := 'reason_required'; RETURN;
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
  ok := true; error := NULL; status := 'cancelled'; RETURN;
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
  IF v_user IS NULL THEN ok := false; error := 'unauthenticated'; RETURN; END IF;
  SELECT * INTO v_tx FROM public.rental_transactions WHERE id = p_rental_id;
  IF NOT FOUND THEN ok := false; error := 'not_found'; RETURN; END IF;
  IF v_tx.buyer_id <> v_user THEN ok := false; error := 'forbidden'; RETURN; END IF;
  IF v_tx.status <> 'pending' THEN ok := false; error := 'illegal_transition'; RETURN; END IF;
  IF btrim(COALESCE(p_proof_url, '')) = '' THEN ok := false; error := 'proof_required'; RETURN; END IF;

  INSERT INTO public.payments
    (transaction_id, amount, status, payment_method, payment_proof_url, external_reference)
  VALUES
    (p_rental_id, v_tx.total, 'pending', p_method, btrim(p_proof_url), p_external_reference)
  RETURNING id INTO v_pay;

  UPDATE public.rental_transactions SET status = 'payment_verify' WHERE id = p_rental_id;
  PERFORM public.log_audit('payment_submit', 'payment', v_pay,
    jsonb_build_object('rental_id', p_rental_id, 'method', p_method));
  ok := true; error := NULL; payment_id := v_pay; status := 'payment_verify'; RETURN;
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
  IF v_user IS NULL THEN ok := false; error := 'unauthenticated'; RETURN; END IF;
  SELECT * INTO v_pay FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN ok := false; error := 'payment_not_found'; RETURN; END IF;
  SELECT * INTO v_tx FROM public.rental_transactions WHERE id = v_pay.transaction_id;

  v_is_owner := public.owns_store_of_tx(v_pay.transaction_id);
  IF NOT v_is_owner AND NOT public.is_admin() THEN
    ok := false; error := 'forbidden'; RETURN;  -- D5: verifikator = owner toko / admin
  END IF;
  IF v_pay.status <> 'pending' THEN ok := false; error := 'payment_not_pending'; RETURN; END IF;
  IF v_tx.status <> 'payment_verify' THEN ok := false; error := 'illegal_transition'; RETURN; END IF;

  IF p_approve THEN
    UPDATE public.payments SET status = 'paid', paid_at = now() WHERE id = p_payment_id;
    UPDATE public.rental_transactions SET status = 'confirmed' WHERE id = v_pay.transaction_id;
    PERFORM public.log_audit('payment_verify', 'payment', p_payment_id,
      jsonb_build_object('rental_id', v_pay.transaction_id));
    ok := true; error := NULL; tx_status := 'confirmed'; RETURN;
  ELSE
    -- Bukti ditolak: payment 'failed', transaksi kembali ke 'pending' agar buyer
    -- dapat mengirim bukti ulang (PRD §6). Pembatalan transaksi tetap tersedia
    -- via cancel_rental (diizinkan pada payment_verify).
    IF v_reason = '' THEN ok := false; error := 'reason_required'; RETURN; END IF;
    UPDATE public.payments SET status = 'failed' WHERE id = p_payment_id;
    UPDATE public.rental_transactions SET status = 'pending' WHERE id = v_pay.transaction_id;
    PERFORM public.log_audit('payment_reject', 'payment', p_payment_id,
      jsonb_build_object('rental_id', v_pay.transaction_id, 'reason', v_reason));
    ok := true; error := NULL; tx_status := 'pending'; RETURN;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.start_rental(p_rental_id uuid)
RETURNS TABLE (ok boolean, error text, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tx public.rental_transactions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN ok := false; error := 'unauthenticated'; RETURN; END IF;
  IF NOT public.owns_store_of_tx(p_rental_id) AND NOT public.is_admin() THEN
    ok := false; error := 'forbidden'; RETURN;
  END IF;
  SELECT * INTO v_tx FROM public.rental_transactions WHERE id = p_rental_id;
  IF NOT FOUND THEN ok := false; error := 'not_found'; RETURN; END IF;
  IF v_tx.status <> 'confirmed' THEN ok := false; error := 'illegal_transition'; RETURN; END IF;

  UPDATE public.rental_transactions SET status = 'ongoing' WHERE id = p_rental_id;
  ok := true; error := NULL; status := 'ongoing'; RETURN;
END $$;

CREATE OR REPLACE FUNCTION public.mark_overdue(p_rental_id uuid)
RETURNS TABLE (ok boolean, error text, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tx public.rental_transactions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN ok := false; error := 'unauthenticated'; RETURN; END IF;
  IF NOT public.owns_store_of_tx(p_rental_id) AND NOT public.is_admin() THEN
    ok := false; error := 'forbidden'; RETURN;
  END IF;
  SELECT * INTO v_tx FROM public.rental_transactions WHERE id = p_rental_id;
  IF NOT FOUND THEN ok := false; error := 'not_found'; RETURN; END IF;
  IF v_tx.status <> 'ongoing' THEN ok := false; error := 'illegal_transition'; RETURN; END IF;
  IF CURRENT_DATE <= v_tx.end_date THEN ok := false; error := 'not_late'; RETURN; END IF;

  UPDATE public.rental_transactions SET status = 'overdue' WHERE id = p_rental_id;
  ok := true; error := NULL; status := 'overdue'; RETURN;
END $$;

CREATE OR REPLACE FUNCTION public.record_return(p_rental_id uuid)
RETURNS TABLE (ok boolean, error text, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tx public.rental_transactions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN ok := false; error := 'unauthenticated'; RETURN; END IF;
  IF NOT public.owns_store_of_tx(p_rental_id) AND NOT public.is_admin() THEN
    ok := false; error := 'forbidden'; RETURN;
  END IF;
  SELECT * INTO v_tx FROM public.rental_transactions WHERE id = p_rental_id;
  IF NOT FOUND THEN ok := false; error := 'not_found'; RETURN; END IF;
  IF v_tx.status <> 'ongoing' AND v_tx.status <> 'overdue' THEN
    ok := false; error := 'illegal_transition'; RETURN;
  END IF;

  UPDATE public.rental_transactions
     SET status = 'completed', actual_return_date = now()
   WHERE id = p_rental_id;
  PERFORM public.log_audit('return_record', 'rental_transaction', p_rental_id,
    jsonb_build_object('from', v_tx.status));
  ok := true; error := NULL; status := 'completed'; RETURN;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 12. RPC — LATE FEES (§3.7)
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.refresh_late_fee_total(p_rental_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.rental_transactions r
     SET late_fee_total = COALESCE((
           SELECT SUM(lf.total) FROM public.late_fees lf
           WHERE lf.transaction_id = p_rental_id AND lf.status <> 'waived'), 0)
   WHERE r.id = p_rental_id;
$$;

CREATE OR REPLACE FUNCTION public.apply_late_fee(p_rental_id uuid, p_daily_rate bigint)
RETURNS TABLE (ok boolean, error text, total bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tx public.rental_transactions%ROWTYPE;
  v_days integer;
  v_total bigint;
BEGIN
  IF auth.uid() IS NULL THEN ok := false; error := 'unauthenticated'; RETURN; END IF;
  IF NOT public.owns_store_of_tx(p_rental_id) AND NOT public.is_admin() THEN
    ok := false; error := 'forbidden'; RETURN;
  END IF;
  SELECT * INTO v_tx FROM public.rental_transactions WHERE id = p_rental_id;
  IF NOT FOUND THEN ok := false; error := 'not_found'; RETURN; END IF;
  IF v_tx.status <> 'overdue' AND NOT (v_tx.status = 'completed' AND v_tx.actual_return_date IS NOT NULL AND v_tx.actual_return_date::date > v_tx.end_date) THEN
    ok := false; error := 'not_late'; RETURN;
  END IF;
  IF p_daily_rate IS NULL OR p_daily_rate < 0 THEN
    ok := false; error := 'invalid_rate'; RETURN;
  END IF;

  v_days := GREATEST(0, COALESCE(v_tx.actual_return_date::date, CURRENT_DATE) - v_tx.end_date);
  IF v_days <= 0 THEN ok := false; error := 'not_late'; RETURN; END IF;

  v_total := v_days * p_daily_rate;
  INSERT INTO public.late_fees (transaction_id, days_late, daily_rate, total, status)
  VALUES (p_rental_id, v_days, p_daily_rate, v_total, 'unpaid')
  ON CONFLICT (transaction_id) DO UPDATE
    SET days_late = EXCLUDED.days_late, daily_rate = EXCLUDED.daily_rate,
        total = EXCLUDED.total, status = 'unpaid';

  PERFORM public.refresh_late_fee_total(p_rental_id);
  PERFORM public.log_audit('latefee_apply', 'late_fee', p_rental_id,
    jsonb_build_object('days_late', v_days, 'daily_rate', p_daily_rate, 'total', v_total));
  ok := true; error := NULL; total := v_total; RETURN;
END $$;

CREATE OR REPLACE FUNCTION public.decide_late_fee(p_late_fee_id uuid, p_decision late_fee_status)
RETURNS TABLE (ok boolean, error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_fee public.late_fees%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN ok := false; error := 'unauthenticated'; RETURN; END IF;
  SELECT * INTO v_fee FROM public.late_fees WHERE id = p_late_fee_id;
  IF NOT FOUND THEN ok := false; error := 'not_found'; RETURN; END IF;

  IF p_decision = 'waived' THEN
    IF NOT public.is_admin() THEN ok := false; error := 'forbidden'; RETURN; END IF;
    UPDATE public.late_fees SET status = 'waived' WHERE id = p_late_fee_id;
    PERFORM public.log_audit('latefee_waive', 'late_fee', p_late_fee_id, '{}'::jsonb);
  ELSIF p_decision = 'paid' THEN
    IF NOT public.owns_store_of_tx(v_fee.transaction_id) AND NOT public.is_admin() THEN
      ok := false; error := 'forbidden'; RETURN;
    END IF;
    UPDATE public.late_fees SET status = 'paid' WHERE id = p_late_fee_id;
  ELSE
    ok := false; error := 'invalid_decision'; RETURN;
  END IF;

  PERFORM public.refresh_late_fee_total(v_fee.transaction_id);
  ok := true; error := NULL; RETURN;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 13. RPC — DISPUTES & REVIEWS (§3.7)
-- ══════════════════════════════════════════════════════════════════════════

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
  IF v_user IS NULL THEN ok := false; error := 'unauthenticated'; RETURN; END IF;
  SELECT * INTO v_tx FROM public.rental_transactions WHERE id = p_rental_id;
  IF NOT FOUND THEN ok := false; error := 'not_found'; RETURN; END IF;

  v_is_buyer := v_tx.buyer_id = v_user;
  v_is_owner := public.owns_store_of_tx(p_rental_id);
  IF NOT v_is_buyer AND NOT v_is_owner THEN ok := false; error := 'forbidden'; RETURN; END IF;
  IF btrim(COALESCE(p_reason, '')) = '' THEN ok := false; error := 'reason_required'; RETURN; END IF;
  IF v_tx.status NOT IN ('ongoing', 'overdue', 'completed') THEN
    ok := false; error := 'illegal_transition'; RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.disputes
    WHERE transaction_id = p_rental_id AND status IN ('open', 'investigating')
  ) THEN ok := false; error := 'dispute_exists'; RETURN; END IF;

  INSERT INTO public.disputes (transaction_id, opened_by, reason, description)
  VALUES (p_rental_id, v_user, btrim(p_reason), btrim(COALESCE(p_description, '')))
  RETURNING id INTO v_id;

  -- Rental ikut 'disputed' hanya saat belum completed (PRD §10).
  IF v_tx.status IN ('ongoing', 'overdue') THEN
    UPDATE public.rental_transactions SET status = 'disputed' WHERE id = p_rental_id;
  END IF;

  PERFORM public.log_audit('dispute_open', 'dispute', v_id,
    jsonb_build_object('rental_id', p_rental_id, 'opened_by', v_user));
  ok := true; error := NULL; dispute_id := v_id; RETURN;
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
  IF NOT public.is_admin() THEN ok := false; error := 'forbidden'; RETURN; END IF;
  SELECT * INTO v_d FROM public.disputes WHERE id = p_dispute_id;
  IF NOT FOUND THEN ok := false; error := 'not_found'; RETURN; END IF;
  IF v_d.status NOT IN ('open', 'investigating') THEN
    ok := false; error := 'dispute_closed'; RETURN;
  END IF;
  IF p_outcome NOT IN ('resolved', 'rejected') THEN
    ok := false; error := 'invalid_outcome'; RETURN;
  END IF;
  IF btrim(COALESCE(p_resolution, '')) = '' THEN ok := false; error := 'resolution_required'; RETURN; END IF;

  UPDATE public.disputes
     SET status = p_outcome, resolution = btrim(p_resolution),
         resolved_by = auth.uid(), resolved_at = now()
   WHERE id = p_dispute_id;

  UPDATE public.rental_transactions SET status = 'completed'
   WHERE id = v_d.transaction_id AND status = 'disputed';

  PERFORM public.log_audit('dispute_resolve', 'dispute', p_dispute_id,
    jsonb_build_object('rental_id', v_d.transaction_id, 'outcome', p_outcome));
  ok := true; error := NULL; RETURN;
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
  IF v_user IS NULL THEN ok := false; error := 'unauthenticated'; RETURN; END IF;
  SELECT * INTO v_tx FROM public.rental_transactions WHERE id = p_rental_id;
  IF NOT FOUND THEN ok := false; error := 'not_found'; RETURN; END IF;
  IF v_tx.buyer_id <> v_user THEN ok := false; error := 'forbidden'; RETURN; END IF;
  IF v_tx.status <> 'completed' THEN ok := false; error := 'rental_not_completed'; RETURN; END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    ok := false; error := 'invalid_rating'; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.reviews WHERE transaction_id = p_rental_id) THEN
    ok := false; error := 'already_reviewed'; RETURN;
  END IF;

  INSERT INTO public.reviews (transaction_id, buyer_id, store_id, rating, comment)
  VALUES (p_rental_id, v_user, v_tx.store_id, p_rating, btrim(COALESCE(p_comment, '')))
  RETURNING id INTO v_id;

  PERFORM public.log_audit('review_create', 'review', v_id,
    jsonb_build_object('rental_id', p_rental_id, 'rating', p_rating));
  ok := true; error := NULL; review_id := v_id; RETURN;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 14. RPC — ADMIN USERS & AUDIT READ (§3.8)
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_set_user_status(p_user_id uuid, p_status user_status)
RETURNS TABLE (ok boolean, error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN ok := false; error := 'forbidden'; RETURN; END IF;
  IF p_user_id = auth.uid() THEN ok := false; error := 'self_action_forbidden'; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
    ok := false; error := 'not_found'; RETURN;
  END IF;
  UPDATE public.users SET status = p_status WHERE id = p_user_id;
  PERFORM public.log_audit(
    CASE WHEN p_status = 'active' THEN 'user_activate' ELSE 'user_suspend' END,
    'user', p_user_id, jsonb_build_object('to', p_status));
  ok := true; error := NULL; RETURN;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id uuid, p_role user_role)
RETURNS TABLE (ok boolean, error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN ok := false; error := 'forbidden'; RETURN; END IF;
  IF p_user_id = auth.uid() THEN ok := false; error := 'self_action_forbidden'; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
    ok := false; error := 'not_found'; RETURN;
  END IF;
  UPDATE public.users SET role = p_role WHERE id = p_user_id;
  PERFORM public.log_audit('role_change', 'user', p_user_id,
    jsonb_build_object('to', p_role));
  ok := true; error := NULL; RETURN;
END $$;

CREATE OR REPLACE FUNCTION public.list_audit_logs(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
RETURNS TABLE (
  id uuid, action text, entity_type text, entity_id uuid,
  actor_email varchar, metadata jsonb, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.id, a.action, a.entity_type, a.entity_id,
         COALESCE(u.email, a.actor_id::text) AS actor_email,
         a.metadata, a.created_at
  FROM public.audit_logs a
  LEFT JOIN public.users u ON u.id = a.actor_id
  WHERE public.is_admin()
  ORDER BY a.created_at DESC
  LIMIT least(greatest(COALESCE(p_limit, 100), 1), 500)
  OFFSET greatest(COALESCE(p_offset, 0), 0);
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- 15. RLS — ENABLE + POLICIES (security matrix §4)
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_applications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_images      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.late_fees           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlists           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs          ENABLE ROW LEVEL SECURITY;

-- users: read own / admin
CREATE POLICY users_select_own ON public.users
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY users_select_admin ON public.users
  FOR SELECT TO authenticated USING (public.is_admin());

-- categories: katalog publik
CREATE POLICY categories_read ON public.categories
  FOR SELECT TO anon, authenticated USING (true);

-- store_applications: miliknya / admin
CREATE POLICY applications_select_own ON public.store_applications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY applications_select_admin ON public.store_applications
  FOR SELECT TO authenticated USING (public.is_admin());

-- stores: katalog active + miliknya + admin
CREATE POLICY stores_read ON public.stores
  FOR SELECT TO anon, authenticated
  USING (status = 'active' OR owner_id = auth.uid() OR public.is_admin());

-- listings: katalog (listing aktif di toko aktif) + miliknya + admin
CREATE POLICY listings_read ON public.listings
  FOR SELECT TO anon, authenticated
  USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = listings.store_id AND s.owner_id = auth.uid())
    OR (
      listings.status = 'active'
      AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = listings.store_id AND s.status = 'active')
    )
  );

-- listing_images: mengikuti visibilitas listing
CREATE POLICY listing_images_read ON public.listing_images
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.listings l
      JOIN public.stores s ON s.id = l.store_id
      WHERE l.id = listing_images.listing_id
        AND (public.is_admin()
             OR s.owner_id = auth.uid()
             OR (l.status = 'active' AND s.status = 'active'))
    )
  );

-- rental_transactions: buyer / owner toko / admin (SELECT saja — tulis via RPC)
CREATE POLICY rentals_select ON public.rental_transactions
  FOR SELECT TO authenticated
  USING (
    buyer_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = rental_transactions.store_id AND s.owner_id = auth.uid())
  );

-- transaction_items & payments & late_fees & disputes: ikut transaksi
CREATE POLICY tx_items_select ON public.transaction_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rental_transactions r
      WHERE r.id = transaction_items.transaction_id
        AND (r.buyer_id = auth.uid()
             OR public.is_admin()
             OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = r.store_id AND s.owner_id = auth.uid()))
    )
  );

CREATE POLICY payments_select ON public.payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rental_transactions r
      WHERE r.id = payments.transaction_id
        AND (r.buyer_id = auth.uid()
             OR public.is_admin()
             OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = r.store_id AND s.owner_id = auth.uid()))
    )
  );

CREATE POLICY late_fees_select ON public.late_fees
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rental_transactions r
      WHERE r.id = late_fees.transaction_id
        AND (r.buyer_id = auth.uid()
             OR public.is_admin()
             OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = r.store_id AND s.owner_id = auth.uid()))
    )
  );

CREATE POLICY disputes_select ON public.disputes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rental_transactions r
      WHERE r.id = disputes.transaction_id
        AND (r.buyer_id = auth.uid()
             OR public.is_admin()
             OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = r.store_id AND s.owner_id = auth.uid()))
    )
  );

-- reviews: katalog review toko aktif + miliknya + admin
CREATE POLICY reviews_read ON public.reviews
  FOR SELECT TO anon, authenticated
  USING (
    public.is_admin()
    OR buyer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = reviews.store_id AND (s.status = 'active' OR s.owner_id = auth.uid()))
  );

-- wishlists: CRUD baris sendiri (jalur resmi tetap RPC; policy = defense-in-depth)
CREATE POLICY wishlists_select ON public.wishlists
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY wishlists_insert ON public.wishlists
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY wishlists_delete ON public.wishlists
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- audit_logs: SELECT admin saja; TANPA policy tulis apa pun (tulis via log_audit SECDEF)
CREATE POLICY audit_logs_select_admin ON public.audit_logs
  FOR SELECT TO authenticated USING (public.is_admin());

-- ══════════════════════════════════════════════════════════════════════════
-- 16. GRANTS — least privilege (revoke default Supabase, grant eksplisit)
-- ══════════════════════════════════════════════════════════════════════════

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- Katalog publik (anon + authenticated)
GRANT SELECT ON public.categories, public.stores, public.listings,
  public.listing_images, public.reviews TO anon, authenticated;

-- Read-only untuk user terautentikasi (tulis via RPC)
GRANT SELECT ON public.users, public.store_applications, public.rental_transactions,
  public.transaction_items, public.payments, public.late_fees, public.disputes
  TO authenticated;

-- wishlists: SELECT + INSERT/DELETE own (sesuai policy)
GRANT SELECT, INSERT, DELETE ON public.wishlists TO authenticated;

-- audit_logs: SELECT admin via policy; grant SELECT authenticated diperlukan agar
-- policy dievaluasi (baris non-admin tidak terlihat karena policy).
GRANT SELECT ON public.audit_logs TO authenticated;

-- PostgreSQL memberi EXECUTE ke PUBLIC secara default — cabut dulu, lalu grant
-- eksplisit sesuai kontrak (quote_rental satu-satunya RPC untuk anon).
DO $revoke_exec$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'is_admin','is_active_user','my_store','owns_store_of_tx','log_audit',
        'occupied_units','rental_unit_days','refresh_late_fee_total','sync_is_seller',
        'handle_new_user','touch_updated_at',
        'submit_store_application','get_my_applications','list_store_applications',
        'decide_store_application','get_my_stores','update_my_store',
        'set_my_store_status','admin_set_store_status','save_listing',
        'set_listing_availability','delete_listing','my_store_listings','admin_set_listing_status',
        'get_wishlist','toggle_wishlist','quote_rental','create_rental',
        'cancel_rental','submit_payment','decide_payment','start_rental',
        'mark_overdue','record_return','apply_late_fee','decide_late_fee',
        'open_dispute','resolve_dispute','create_review',
        'admin_set_user_status','admin_set_user_role','list_audit_logs')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $revoke_exec$;

-- EXECUTE RPC (helpers internal sengaja TIDAK di-grant ke client)
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_user() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_store(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_store_of_tx(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.submit_store_application(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_applications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_store_applications(application_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_store_application(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_stores() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_store(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_store_status(uuid, store_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_store_status(uuid, store_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_listing(uuid, uuid, uuid, text, text, bigint, bigint, integer, rental_unit, integer, boolean, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_listing_availability(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_listing(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_store_listings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_listing_status(uuid, listing_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_wishlist() TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_wishlist(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.quote_rental(date, date, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_rental(date, date, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_rental(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_payment(uuid, payment_method, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_payment(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_rental(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_overdue(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_return(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_late_fee(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_late_fee(uuid, late_fee_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_dispute(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_dispute(uuid, dispute_status, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_review(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_status(uuid, user_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, user_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_audit_logs(integer, integer) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- 17. SANITY CHECKS — fail loudly bila kontrak pelanggar
-- ══════════════════════════════════════════════════════════════════════════
DO $sanity$
DECLARE
  v_missing text := '';
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','categories','store_applications','stores','listings','listing_images',
    'rental_transactions','transaction_items','payments','late_fees','disputes',
    'reviews','wishlists','audit_logs']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t AND c.relrowsecurity
    ) THEN
      v_missing := v_missing || t || ' ';
    END IF;
  END LOOP;
  IF v_missing <> '' THEN
    RAISE EXCEPTION 'RLS tidak aktif pada: %', v_missing;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('rental_transactions','transaction_items','payments',
                        'late_fees','disputes','audit_logs')
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
  ) THEN
    RAISE EXCEPTION 'Tabel transaksi tidak boleh punya policy tulis (tulis via RPC)';
  END IF;
END $sanity$;

-- ══════════════════════════════════════════════════════════════════════════
-- SETUP AWAL ADMIN (sekali saja, manual oleh operator — SEPARAH INI):
--   1. Daftar akun lewat aplikasi (trigger membuat profil consumer).
--   2. Jalankan SQL berikut di SQL Editor project BARU:
--        UPDATE public.users SET role = 'admin' WHERE email = '<email-operator>';
--   Tanpa langkah ini tidak ada admin; sistem default-deny untuk fitur admin.
--   SEED DATA DEV: file terpisah (tidak termasuk baseline schema).
-- ============================================================================
