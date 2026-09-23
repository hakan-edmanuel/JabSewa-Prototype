-- ============================================================================
-- JabSewa — SINGLE-FILE IDEMPOTENT MIGRATION (RESET TOTAL & SANITASI)
-- ============================================================================
-- Jalankan di Supabase Dashboard > SQL Editor. Aman dijalankan BERKALI-KALI.
--
-- Strategi:
--   A. CLEANUP   — drop SEMUA overload fungsi target + trigger lama (CASCADE).
--                  Tidak pernah menebak signature → tidak ada "function
--                  already exists with same signature but different types".
--   B. REBUILD   — enum role, tabel users, trigger pendaftaran, guard
--                  superadmin, audit log + RPC, pg_trgm + hybrid search.
--   C. IDEMPOTEN — CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
--                  konversi tipe kolom otomatis bila skema lama desync.
--
-- DATA BISNIS AMAN: stores/listings/admin_audit_logs/users tidak pernah
-- di-DROP di jalur normal — hanya dilengkapi/diperbaiki strukturnya.
-- (Lihat bagian OPSIONAL di paling bawah bila ingin reset total data.)
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION A — CLEANUP: hapus fungsi & trigger lama secara aman
-- ════════════════════════════════════════════════════════════════════════════

-- Drop SEMUA overload fungsi milik JabSewa apa pun signature-nya.
-- Dibangun ulang dari nol di bagian berikutnya (menghindari konflik tipe).
DO $cleanup$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'search_hybrid',
        'log_admin_action',
        'list_admin_audit_logs',
        'is_superadmin',
        'handle_new_user'
      )
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.signature);
  END LOOP;
END $cleanup$;

-- Trigger auth lama di-drop eksplisit (CASCADE pada drop fungsi sudah
-- menangani, ini untuk kasus trigger dibiarkan menggantung).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Policy lama pada tabel target di-drop agar bisa dibuat ulang bersih.
DROP POLICY IF EXISTS audit_logs_select_superadmin ON public.admin_audit_logs;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION B — ENUM user_role (TENANT | STORE_OWNER | SUPERADMIN)
-- ════════════════════════════════════════════════════════════════════════════
-- Idempotent: enum dibuat penuh bila belum ada; bila sudah ada (dari run
-- lain), nilai yang kurang ditambahkan dengan ADD VALUE IF NOT EXISTS —
-- tanpa pernah memunculkan "invalid input value for enum".
DO $enum$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'user_role'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.user_role AS ENUM ('TENANT', 'STORE_OWNER', 'SUPERADMIN');
  ELSE
    -- Enum sudah ada — pastikan ketiga nilai tersedia (no-op bila lengkap).
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'user_role' AND e.enumlabel = 'TENANT'
    ) THEN
      EXECUTE 'ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS ''TENANT''';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'user_role' AND e.enumlabel = 'STORE_OWNER'
    ) THEN
      EXECUTE 'ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS ''STORE_OWNER''';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'user_role' AND e.enumlabel = 'SUPERADMIN'
    ) THEN
      EXECUTE 'ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS ''SUPERADMIN''';
    END IF;
  END IF;
END $enum$;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION C — TABEL users + TRIGGER pendaftaran otomatis
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.users (
  id         uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email      text NOT NULL UNIQUE,
  full_name  text NOT NULL DEFAULT '',
  phone      text,
  role       public.user_role NOT NULL DEFAULT 'TENANT',
  is_seller  boolean NOT NULL DEFAULT false,
  status     text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Lengkapi kolom untuk tabel users lama yang strukturnya belum lengkap.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email      text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS full_name  text NOT NULL DEFAULT '';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone      text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_seller  boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status     text NOT NULL DEFAULT 'active';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role       public.user_role NOT NULL DEFAULT 'TENANT';

-- SANITASI DESYNC: bila kolom role sudah ada tetapi bertipe SALAH (mis.
-- text / varchar dari skema lama), konversi ke enum dengan pemetaan nilai
-- lama → nilai enum. Nilai tak dikenal jatuh ke TENANT (default-deny).
-- Kolom bertipe benar atau baru dibuat → blok ini no-op.
DO $fix_role_type$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'users'
      AND column_name  = 'role'
      AND udt_name    <> 'user_role'
  ) THEN
    ALTER TABLE public.users ALTER COLUMN role DROP DEFAULT;
    ALTER TABLE public.users
      ALTER COLUMN role TYPE public.user_role
      USING (
        CASE lower(coalesce(role::text, ''))
          WHEN 'superadmin'                THEN 'SUPERADMIN'::public.user_role
          WHEN 'store_owner'               THEN 'STORE_OWNER'::public.user_role
          WHEN 'seller'                    THEN 'STORE_OWNER'::public.user_role
          WHEN 'tenant'                    THEN 'TENANT'::public.user_role
          WHEN 'consumer'                  THEN 'TENANT'::public.user_role
          WHEN 'admin'                     THEN 'TENANT'::public.user_role
          ELSE 'TENANT'::public.user_role
        END
      );
    ALTER TABLE public.users
      ALTER COLUMN role SET DEFAULT 'TENANT'::public.user_role;
  END IF;
END $fix_role_type$;

-- Trigger bootstrap profil: setiap user auth baru otomatis masuk public.users
-- dengan role TENANT. SUPERADMIN tidak pernah dibuat lewat sini — hanya via
-- SQL manual oleh operator (lihat SECTION H).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
END $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION D — HELPER is_superadmin() (SECURITY DEFINER)
-- ════════════════════════════════════════════════════════════════════════════
-- Dipakai semua policy & RPC guard. STABLE agar efisien dalam policy.
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND role = 'SUPERADMIN'
      AND status = 'active'
  );
$$;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION E — TABEL admin_audit_logs + RLS + RPC audit
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id          bigserial PRIMARY KEY,
  admin_id    uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  action      text NOT NULL,
  target_type text NOT NULL DEFAULT '',
  target_id   text NOT NULL DEFAULT '',
  ip_address  inet,
  user_agent  text,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id
  ON public.admin_audit_logs (admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target
  ON public.admin_audit_logs (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action
  ON public.admin_audit_logs (action, created_at DESC);

COMMENT ON TABLE public.admin_audit_logs IS
  'Audit trail aksi Superadmin. Tulis hanya via log_admin_action (SECDEF).';

-- RLS: tidak ada policy SELECT/INSERT/UPDATE/DELETE untuk anon/authenticated
-- selain yang eksplisit di bawah — role biasa tidak melihat apa pun.
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_select_superadmin
  ON public.admin_audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_superadmin());

-- Defense in depth: anon tidak diberi grant apa pun.
REVOKE ALL ON public.admin_audit_logs FROM anon;

-- ---------------------------------------------------------------------------
-- RPC tulis audit log — SECURITY DEFINER + cek is_superadmin di dalam.
-- IP & user-agent dibaca dari header PostgREST (GUC request.headers) di sisi
-- server — TIDAK dari input client, sehingga tidak bisa dipalsukan.
-- Pemanggilan frontend:
--   supabase.rpc('log_admin_action', { p_action, p_target_type, p_target_id, p_payload })
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_action      text,
  p_target_type text DEFAULT '',
  p_target_id   text DEFAULT '',
  p_payload     jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin   uuid := auth.uid();
  v_ip      inet;
  v_ua      text;
  v_headers jsonb;
BEGIN
  IF v_admin IS NULL OR NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'FORBIDDEN: hanya superadmin yang dapat menulis audit log';
  END IF;

  -- Konteks request; header bisa hilang/tidak valid → NULL (jangan gagalkan
  -- pencatatan aksi hanya karena header tidak standar).
  BEGIN
    v_headers := NULLIF(current_setting('request.headers', true), '')::jsonb;
    v_ip := split_part(COALESCE(v_headers ->> 'x-forwarded-for', v_headers ->> 'client-ip', ''), ',', 1)::inet;
    v_ua := v_headers ->> 'user-agent';
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL;
    v_ua := NULL;
  END;

  INSERT INTO public.admin_audit_logs
    (admin_id, action, target_type, target_id, ip_address, user_agent, payload)
  VALUES
    (v_admin, p_action, p_target_type, p_target_id, v_ip, v_ua, p_payload);

  RETURN true;
END $$;

GRANT EXECUTE ON FUNCTION public.log_admin_action(text, text, text, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.log_admin_action(text, text, text, jsonb) FROM anon, public;

-- ---------------------------------------------------------------------------
-- RPC baca audit log — hanya superadmin (dicek di dalam query).
-- Pemanggilan frontend:
--   supabase.rpc('list_admin_audit_logs', { p_limit: 100 })
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_admin_audit_logs(p_limit integer DEFAULT 100)
RETURNS TABLE (
  id          bigint,
  admin_id    uuid,
  action      text,
  target_type text,
  target_id   text,
  ip_address  inet,
  user_agent  text,
  created_at  timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.admin_id, a.action, a.target_type, a.target_id,
         a.ip_address, a.user_agent, a.created_at
  FROM public.admin_audit_logs a
  WHERE public.is_superadmin()
  ORDER BY a.created_at DESC
  LIMIT least(greatest(COALESCE(p_limit, 100), 1), 500);
$$;

GRANT EXECUTE ON FUNCTION public.list_admin_audit_logs(integer) TO authenticated;
REVOKE ALL ON FUNCTION public.list_admin_audit_logs(integer) FROM anon, public;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION F — PG_TRGM + KOLOM PENCARIAN + INDEX
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Tabel bisnis dibuat bila belum ada (bentuk minimal sesuai ERD frontend);
-- bila sudah ada, hanya dilengkapi kolom pencarian — data tidak disentuh.
CREATE TABLE IF NOT EXISTS public.stores (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  store_name  text NOT NULL,
  description text NOT NULL DEFAULT '',
  contact     text NOT NULL DEFAULT '',
  city        text NOT NULL DEFAULT '',
  address     text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.listings (
  id            bigserial PRIMARY KEY,
  store_id      uuid REFERENCES public.stores (id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text NOT NULL DEFAULT '',
  category      text NOT NULL DEFAULT '',
  price_per_day integer NOT NULL DEFAULT 0,
  deposit       integer NOT NULL DEFAULT 0,
  image_url     text NOT NULL DEFAULT '',
  location      text NOT NULL DEFAULT '',
  available     boolean NOT NULL DEFAULT true,
  status        text NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS username    text UNIQUE,
  ADD COLUMN IF NOT EXISTS rating      numeric(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS tags                    text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rating                  numeric(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS successful_transactions integer NOT NULL DEFAULT 0;

-- GIN index: ILIKE '%q%' & similarity tetap ter-index.
CREATE INDEX IF NOT EXISTS idx_stores_name_trgm
  ON public.stores USING gin (store_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_stores_username_trgm
  ON public.stores USING gin (username gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_listings_name_trgm
  ON public.listings USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_listings_desc_trgm
  ON public.listings USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_listings_store_available
  ON public.listings (store_id) WHERE available;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION G — RPC search_hybrid (pencarian toko & barang)
-- ════════════════════════════════════════════════════════════════════════════
-- Struktur skor:
--   STORE : exact(100) > username-exact(95) > prefix(80) > word-boundary(65)
--           > substring(45) > trigram(×50) + bonus verified(5) + rating(×2)
--   ITEM  : text relevance (title > tags > category > description)
--           + rating (0–20) + transaksi sukses (0–20)
-- SECURITY INVOKER: hasil tunduk RLS — pencarian hanya melihat data yang
-- boleh dilihat pemanggil.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_hybrid(
  p_query    text DEFAULT '',
  p_category text DEFAULT NULL,
  p_type     text DEFAULT 'all',
  p_page     integer DEFAULT 1,
  p_limit    integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_q        text := lower(btrim(coalesce(p_query, '')));
  v_type     text := lower(coalesce(p_type, 'all'));
  v_page     integer := greatest(coalesce(p_page, 1), 1);
  v_limit    integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset   integer := (v_page - 1) * v_limit;
  v_qre      text;
  v_items    jsonb;
  v_stores   jsonb;
  v_items_total  integer := 0;
  v_stores_total integer := 0;
  v_store_cap    integer := 6;
  v_want_items   boolean := v_type IN ('all', 'items');
  v_want_stores  boolean := v_type IN ('all', 'stores');
BEGIN
  IF v_type NOT IN ('all', 'items', 'stores') THEN
    RAISE EXCEPTION 'p_type harus salah satu dari: all, items, stores';
  END IF;

  -- Escape metachar regex agar input user tidak menjadi pola regex.
  v_qre := regexp_replace(v_q, '[][\\^$.|?*+(){}]', '\\&', 'g');

  ------------------------------------------------------------------
  -- STORES — diprioritaskan bila nama toko cocok dengan query.
  ------------------------------------------------------------------
  IF v_want_stores THEN
    WITH scored AS (
      SELECT
        s.id,
        s.store_name,
        s.username,
        s.rating,
        s.is_verified,
        s.city,
        (SELECT count(*) FROM public.listings li
          WHERE li.store_id = s.id AND li.available) AS total_items,
        (
          CASE WHEN lower(s.store_name) = v_q THEN 100 ELSE 0 END
          + CASE WHEN lower(coalesce(s.username, '')) = v_q THEN 95 ELSE 0 END
          + CASE WHEN v_q <> '' AND lower(s.store_name) LIKE v_q || '%' THEN 80 ELSE 0 END
          + CASE WHEN v_q <> '' AND s.store_name ~* ('\y' || v_qre || '\y') THEN 65 ELSE 0 END
          + CASE WHEN v_q <> '' AND s.store_name ILIKE '%' || v_q || '%' THEN 45 ELSE 0 END
          + COALESCE(similarity(s.store_name, p_query), 0) * 50
          + COALESCE(similarity(coalesce(s.username, ''), p_query), 0) * 25
          + CASE WHEN s.is_verified THEN 5 ELSE 0 END
          + COALESCE(s.rating, 0) * 2
        ) AS score
      FROM public.stores s
      WHERE s.status = 'active'
        AND (
          v_q = ''
          OR s.store_name ILIKE '%' || v_q || '%'
          OR coalesce(s.username, '') ILIKE '%' || v_q || '%'
          OR similarity(s.store_name, p_query) > 0.25
        )
    ),
    ranked AS (
      SELECT *, row_number() OVER (ORDER BY score DESC, total_items DESC) AS rn
      FROM scored
    )
    SELECT
      COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'store_name', store_name, 'username', username,
        'rating', rating, 'total_items', total_items,
        'is_verified', is_verified, 'city', city,
        'score', round(score::numeric, 2)
      ) ORDER BY rn), '[]'::jsonb),
      (SELECT count(*) FROM scored)
    INTO v_stores, v_stores_total
    FROM ranked
    -- mode 'all': maks v_store_cap kartu toko; mode 'stores': ambil sampai
    -- ujung halaman aktif (slice offset dilakukan di bawah).
    WHERE rn <= CASE WHEN v_type = 'stores' THEN v_offset + v_limit ELSE v_store_cap END;

    -- Buang baris halaman-halaman sebelumnya (mode 'stores' saja).
    IF v_type = 'stores' AND v_offset > 0 THEN
      v_stores := (
        SELECT COALESCE(jsonb_agg(e ORDER BY ord), '[]'::jsonb)
        FROM jsonb_array_elements(v_stores) WITH ORDINALITY AS t(e, ord)
        WHERE ord > v_offset
      );
    END IF;
  ELSE
    v_stores := '[]'::jsonb;
  END IF;

  ------------------------------------------------------------------
  -- ITEMS — relevance text + rating + transaksi sukses.
  ------------------------------------------------------------------
  IF v_want_items THEN
    WITH scored AS (
      SELECT
        li.id,
        li.name AS title,
        li.description,
        li.category,
        li.tags,
        li.price_per_day,
        li.image_url,
        li.location,
        li.available,
        li.rating,
        li.successful_transactions,
        li.store_id,
        st.store_name,
        (
          CASE WHEN lower(li.name) = v_q THEN 120 ELSE 0 END
          + CASE WHEN v_q <> '' AND lower(li.name) LIKE v_q || '%' THEN 90 ELSE 0 END
          + CASE WHEN v_q <> '' AND li.name ~* ('\y' || v_qre || '\y') THEN 70 ELSE 0 END
          + CASE WHEN v_q <> '' AND li.name ILIKE '%' || v_q || '%' THEN 50 ELSE 0 END
          + COALESCE(similarity(li.name, p_query), 0) * 40
          + CASE WHEN v_q <> '' AND EXISTS (
              SELECT 1 FROM unnest(li.tags) t WHERE t ILIKE '%' || v_q || '%'
            ) THEN 30 ELSE 0 END
          + CASE WHEN v_q <> '' AND li.category ILIKE '%' || v_q || '%' THEN 25 ELSE 0 END
          + CASE WHEN v_q <> '' AND li.description ILIKE '%' || v_q || '%' THEN 15 ELSE 0 END
          + COALESCE(li.rating, 0) / 5.0 * 20
          + least(COALESCE(li.successful_transactions, 0), 100) / 100.0 * 20
        ) AS score
      FROM public.listings li
      JOIN public.stores st ON st.id = li.store_id
      WHERE li.available
        AND st.status = 'active'
        AND (p_category IS NULL OR p_category = '' OR li.category = p_category)
        AND (
          v_q = ''
          OR li.name ILIKE '%' || v_q || '%'
          OR li.description ILIKE '%' || v_q || '%'
          OR li.category ILIKE '%' || v_q || '%'
          OR EXISTS (SELECT 1 FROM unnest(li.tags) t WHERE t ILIKE '%' || v_q || '%')
          OR similarity(li.name, p_query) > 0.25
        )
    ),
    ranked AS (
      SELECT *, row_number() OVER (ORDER BY score DESC, successful_transactions DESC) AS rn
      FROM scored
    )
    SELECT
      COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'title', title, 'description', description,
        'category', category, 'tags', to_jsonb(tags),
        'price_per_day', price_per_day, 'image_url', image_url,
        'location', location, 'available', available,
        'rating', rating, 'successful_transactions', successful_transactions,
        'store_id', store_id, 'store_name', store_name,
        'score', round(score::numeric, 2)
      ) ORDER BY rn), '[]'::jsonb),
      count(*)
    INTO v_items, v_items_total
    FROM ranked
    WHERE rn > v_offset AND rn <= v_offset + v_limit;
  ELSE
    v_items := '[]'::jsonb;
    v_items_total := 0;
  END IF;

  RETURN jsonb_build_object(
    'stores', v_stores,
    'items', v_items,
    'totals', jsonb_build_object('stores', v_stores_total, 'items', v_items_total),
    'page', v_page,
    'limit', v_limit
  );
END $$;

-- Hanya user ter-autentikasi yang boleh memanggil pencarian
-- (listings dilindungi RLS untuk authenticated).
REVOKE ALL ON FUNCTION public.search_hybrid(text, text, text, integer, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.search_hybrid(text, text, text, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.search_hybrid(text, text, text, integer, integer) IS
  'Hybrid search JabSewa: nama toko + barang, skor gabungan relevance/rating/transaksi.';


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION H — SETUP AWAL SUPERADMIN (wajib, sekali saja)
-- ════════════════════════════════════════════════════════════════════════════
-- Tanpa langkah ini, TIDAK SEORANG PUN bisa masuk /sys-control-jab
-- (guard bersifat default-deny — memang by design).
--
-- 1. Daftar/login dulu lewat aplikasi agar user dibuat trigger, lalu:
--
-- UPDATE public.users
-- SET role = 'SUPERADMIN', status = 'active'
-- WHERE email = 'operator@jabsewa.id';   -- ← ganti email operator asli
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- OPSIONAL — RESET TOTAL DATA (JANGAN dijalankan kecuali benar-benar yakin)
-- ════════════════════════════════════════════════════════════════════════════
-- MENGHAPUS SEMUA DATA BISNIS. Uncomment hanya untuk environment dev kosong:
--
-- DROP TABLE IF EXISTS public.wishlists CASCADE;
-- DROP TABLE IF EXISTS public.rental_transactions CASCADE;
-- DROP TABLE IF EXISTS public.listings CASCADE;
-- DROP TABLE IF EXISTS public.stores CASCADE;
-- DROP TABLE IF EXISTS public.admin_audit_logs CASCADE;
-- DROP TABLE IF EXISTS public.users CASCADE;
-- ============================================================================
