# JabSewa — FASE 2: DESAIN DATABASE BARU

> Target: project Supabase **baru** yang dibangun dari kosong oleh satu
> baseline migration (Fase 3). Tidak ada kompatibilitas legacy.
> Kontrak frontend (`src/lib/*`) dijadikan acuan — frontend tidak berubah,
> kecuali 1 perbaikan kecil (§7).

---

## 1. ERD final

```
                                   ┌──────────────────────┐
                                   │        auth.users     │  (Supabase Auth, skema auth)
                                   │  id uuid PK           │
                                   └──────────┬───────────┘
                                              │ 1:1 (ON DELETE CASCADE)
                                              ▼
┌──────────────────────────────────────────────────────────────┐
│  users                                                        │
│  id          uuid PK  ──→ auth.users(id) ON DELETE CASCADE    │
│  email       text NOT NULL UNIQUE                             │
│  full_name   text NOT NULL DEFAULT ''                         │
│  role        user_role NOT NULL DEFAULT 'TENANT'              │  enum: TENANT|STORE_OWNER|SUPERADMIN
│  status      text NOT NULL DEFAULT 'active'                   │
│  seller_application  jsonb        (nullable)                  │  key camelCase, kontrak UI
│  seller_profile      jsonb        (nullable)                  │
│  created_at  timestamptz NOT NULL DEFAULT now()               │
└──────────────────────────────────────────────────────────────┘
                                              │ 1:N (ON DELETE CASCADE)
                                              ▼
┌──────────────────────────────────────────────────────────────┐
│  stores                                                       │
│  id           uuid PK DEFAULT gen_random_uuid()               │
│  user_id      uuid      ──→ users(id) ON DELETE CASCADE       │  pemilik toko
│  store_name   text NOT NULL                                   │
│  description  text NOT NULL DEFAULT ''                        │
│  contact      text NOT NULL DEFAULT ''                        │
│  city         text NOT NULL DEFAULT ''                        │
│  address      text NOT NULL DEFAULT ''                        │
│  status       text NOT NULL DEFAULT 'active'                  │  'active' | 'inactive'
│  is_verified  boolean NOT NULL DEFAULT false                  │
│  rating       numeric(3,2) NOT NULL DEFAULT 0                 │
│  created_at   timestamptz NOT NULL DEFAULT now()              │
│  CHECK (status IN ('active','inactive'))                      │
└──────────────────────────────────────────────────────────────┘
                                              │ 1:N (ON DELETE CASCADE)
                                              ▼
┌──────────────────────────────────────────────────────────────┐
│  listings                                                     │
│  id                       bigserial PK                        │  ← bigint, kontrak frontend
│  store_id                 uuid NOT NULL ──→ stores(id)        │
│  name                     text NOT NULL                       │
│  description              text NOT NULL DEFAULT ''            │
│  category                 text NOT NULL DEFAULT ''            │  'photography'|'gadget'|'sports'|'event'
│  price_per_day            integer NOT NULL CHECK (>= 0)       │
│  deposit                  integer NOT NULL CHECK (>= 0)       │
│  image_url                text NOT NULL DEFAULT ''            │
│  location                 text NOT NULL DEFAULT ''            │
│  available                boolean NOT NULL DEFAULT true       │  saklar on/off listing
│  status                   text NOT NULL DEFAULT 'active'      │  dipakai rental_quote
│  rating                   numeric(3,2) NOT NULL DEFAULT 0     │
│  successful_transactions  integer NOT NULL DEFAULT 0          │
│  created_at / updated_at  timestamptz NOT NULL DEFAULT now()  │
└──────────────────────────────────────────────────────────────┘
        │ 1:N (ON DELETE RESTRICT — listings berriwayat tak boleh terhapus)   │ 1:N (ON DELETE CASCADE)
        ▼                                                                     ▼
┌───────────────────────────────────────────────┐   ┌──────────────────────────────────────┐
│  rental_transactions                          │   │  wishlists                           │
│  id                uuid PK                    │   │  id          bigserial PK             │
│  code              text UNIQUE                │   │  user_id     uuid ──→ users(id)       │
│  tenant_id         uuid ──→ users(id) CASCADE │   │  listing_id  bigint ──→ listings(id)  │
│  listing_id        bigint ──→ listings RESTRICT│  │  created_at  timestamptz              │
│  store_id          uuid ──→ stores(id) SET NULL│  │  UNIQUE (user_id, listing_id)         │
│  start_date        date NOT NULL              │   └──────────────────────────────────────┘
│  end_date          date NOT NULL              │
│  total_days        integer NOT NULL CHECK > 0 │   ┌──────────────────────────────────────┐
│  price_per_day     integer NOT NULL CHECK >= 0│   │  admin_audit_logs                    │
│  deposit           integer NOT NULL CHECK >= 0│   │  id           bigserial PK            │
│  subtotal          integer NOT NULL CHECK >= 0│   │  admin_id     uuid ──→ auth.users     │
│  total             integer NOT NULL CHECK >= 0│   │               ON DELETE CASCADE       │
│  status            text NOT NULL 'pending'    │   │  action       text NOT NULL           │
│  rejection_reason  text                       │   │  target_type  text NOT NULL DEFAULT ''│
│  payment_status    text NOT NULL 'unpaid'     │   │  target_id    text NOT NULL DEFAULT ''│
│  created_at / updated_at                      │   │  ip_address   inet                    │
│  CHECK (end_date >= start_date)               │   │  user_agent   text                    │
│  CHECK (status IN (6 nilai RENTAL_STATUS))    │   │  payload      jsonb DEFAULT '{}'      │
│  CHECK (payment_status IN (4 nilai))          │   │  created_at   timestamptz             │
│  EXCLUDE gist anti-double-booking (§5)        │   └──────────────────────────────────────┘
└───────────────────────────────────────────────┘
```

Relasi ringkas:

```
auth.users 1:1 users 1:N stores 1:N listings 1:N rental_transactions N:1 users (tenant)
                                  └───────1:N──────→ wishlists N:1 users
admin_audit_logs N:1 auth.users
```

Tipe ID **dipertahankan persis** seperti kontrak frontend sekarang:
`listings.id`/`wishlists.listing_id` = bigint (bigserial); sisanya uuid.
`stores.user_id` CASCADE (toko ikut terhapus bila akun dihapus),
`rental_transactions.store_id` SET NULL (riwayat rental bertahan),
`listings` dari toko terhapus CASCADE, rental dari listing terhapus
RESTRICT (dilindungi RPC `delete_listing` dengan kode `has_rentals`).

---

## 2. Enum & konstanta

* `user_role` : `'TENANT' | 'STORE_OWNER' | 'SUPERADMIN'` (label uppercase —
  cocok dengan `src/lib/roles.js` dan pemetaan `decide_seller_application`).
* `rental_transactions.status` : **text + CHECK** (bukan enum) dengan nilai
  `pending, accepted, rejected, active, completed, cancelled` — cocok
  `RENTAL_STATUS` frontend. Text + CHECK dipilih karena lebih mudah
  di-evolusi dan frontend menerima string.
* `payment_status` : `unpaid, awaiting_confirmation, paid, refunded`.
* `stores.status` : `active | inactive`; `listings.status` : `active`
  (default; nilai lain tidak dipakai frontend).
* Timezone operasional: `Asia/Jakarta` (kode rental + format `code`).

---

## 3. Perancangan RLS & otorisasi per role

Prinsip (sama dengan model sekarang, dibersihkan):

* **Semua tulisan via RPC SECURITY DEFINER** yang mengambil identitas dari
  `auth.uid()` — tidak ada INSERT/UPDATE/DELETE policy untuk client.
* Helper:
  * `is_superadmin()` — SECDEF, `users.role='SUPERADMIN' AND status='active'`.
  * `get_my_store(p_store_id)` — SECDEF, resolve toko milik pemanggil yang
    **aktif** (fail-closed bila toko non-aktif).

| Tabel | anon | TENANT (authenticated) | STORE_OWNER | SUPERADMIN |
|---|---|---|---|---|
| `users` | ❌ | read baris sendiri | read sendiri | read semua |
| `stores` | read `active` | read `active` | + read toko sendiri | (via RPC read katalog) |
| `listings` | read listing toko `active` | sama | + read listing toko sendiri | sama |
| `rental_transactions` | ❌ | read rental `tenant_id = auth.uid()` | + read rental `store_id` miliknya | read semua |
| `wishlists` | ❌ | CRUD baris sendiri | — | — |
| `admin_audit_logs` | ❌ | ❌ | ❌ | read saja |

Catatan desain:

1. Policy katalog `anon, authenticated` (browse tanpa login tetap jalan —
   dibutuhkan `ConsumerBrowser`/`fetchStores`).
2. `rental_quote` di-grant ke `anon + authenticated` (pratinjau harga di
   `ProductDetail` sebelum login). `create_rental` menolak anon dengan kode
   `unauthenticated`.
3. Wishlist boleh via policy langsung (tulisannya sederhana & milik
   sendiri), TETAPI frontend memakai RPC `toggle_wishlist`/`get_wishlist`
   — policy INSERT/DELETE tetap dipasang agar RPC INVOKER-safe; RPC kita
   SECDEF jadi tidak tergantung policy. (Sumber kebenaran tetap RPC.)
4. `admin_audit_logs`: tanpa policy tulis apa pun; tulis hanya via
   `log_admin_action` yang membaca IP/UA dari `request.headers` server.
5. `payment_records` **dihapus dari MVP** (hasil audit §4) — mengurangi
   permukaan tanpa mengurangi fungsi. Bila nanti dibutuhkan ledger manual,
   tambahkan sebagai migration terpisah.

---

## 4. RPC final (19)

Semua RPC meniru **persis** kontrak §2 laporan audit. Daftar + guard:

| # | RPC | Guard | Catatan |
|---|---|---|---|
| 1 | `rental_quote(bigint, date, date)` | anon+authenticated, STABLE | end_date INCLUSIVE; `start_date >= CURRENT_DATE`; cek listing available + status + toko aktif |
| 2 | `create_rental(bigint, date, date)` | authenticated | SECDEF; `pg_advisory_xact_lock` per listing; cek overlap; snapshot harga; `code` unik `R-<timestamp>-<hash>`; `ON CONFLICT DO NOTHING` → `date_conflict` |
| 3 | `set_rental_status(uuid, text, text)` | authenticated | SECDEF; transisi legal: pending→accepted/rejected(+reason)/cancelled (tenant), accepted→active, active→completed (owner toko aktif / superadmin) |
| 4 | `get_rentals_for_user()` | authenticated | SECDEF read; enrichment item/toko/tenant |
| 5 | `get_rentals_for_store()` | authenticated | SECDEF; toko aktif milik sesi |
| 6 | `get_wishlist()` | authenticated | SECDEF |
| 7 | `toggle_wishlist(bigint)` | authenticated | SECDEF; idempoten (unique) |
| 8 | `get_my_stores()` | authenticated | SECDEF; **bentuk kontrak §7** |
| 9 | `submit_seller_application(text,text,text,text,text)` | authenticated | 1 ajuan aktif per user; jsonb camelCase |
| 10 | `decide_seller_application(text, boolean, text)` | superadmin | approve → role STORE_OWNER + seller_profile + toko aktif; reject wajib reason |
| 11 | `list_seller_applications()` | superadmin | id=email, kontrak UI |
| 12 | `save_listing(10 param)` | authenticated (toko aktif) | validasi nama/amount; scope store server-side |
| 13 | `set_listing_availability(bigint, boolean)` | authenticated (toko aktif) | |
| 14 | `delete_listing(bigint)` | authenticated (toko aktif) | FK RESTRICT → `has_rentals` |
| 15 | `listings_for_my_store()` | authenticated | read listing toko aktif sendiri |
| 16 | `log_admin_action(text,text,text,jsonb)` | superadmin | IP/UA dari header server |
| 17 | `list_audit_logs(integer)` | superadmin | join email aktor |
| 18 | `get_my_store(uuid default null)` | internal (helper) | SECDEF STABLE |
| 19 | `is_superadmin()` | internal (helper) | SECDEF STABLE |

Tidak dibawa ulang: `search_hybrid` (scoring ada di client), 
`list_admin_audit_logs` (tergantikan #17), trigger sinkron legacy
`jabsewa_stores_sync`/`jabsewa_listings_sync` (tidak ada lagi kolom yang
perlu disinkronkan).

---

## 5. Anti double-booking (dua lapis)

1. **Exclusion constraint** (btree_gist):
   ```sql
   EXCLUDE USING gist (
     listing_id WITH =,
     daterange(start_date, end_date, '[]') WITH &&
   ) WHERE (status IN ('pending','accepted','active'))
   ```
   `end_date` inclusive; back-to-back (selesai 5 Okt, mulai 6 Okt) tidak
   konflik. Status terminal (rejected/cancelled/completed) otomatis
   membebaskan tanggal.
2. **Advisory lock per listing** di `create_rental`
   (`pg_advisory_xact_lock(hashtextextended('jabsewa:listing:'||id,0))`)
   + re-check overlap di bawah lock → permintaan konkuren mendapat
   `date_conflict` deterministik, bukan error 500.

Index pendukung: `idx_rentals_listing_dates (listing_id, start_date,
end_date) WHERE status IN ('pending','accepted','active')` — cocok dengan
predikat constraint.

---

## 6. Strategi data awal (admin & superadmin)

1. **Superadmin** (tanpa ini area `/sys-control-jab` tak terpaksa —
   default-deny by design):
   1. Daftar akun lewat aplikasi (trigger buat profil `TENANT`).
   2. Operator jalankan SQL sekali di project baru:
      ```sql
      UPDATE public.users
      SET role = 'SUPERADMIN', status = 'active'
      WHERE email = '<email-operator>';
      ```
2. **Seed katalog demo** (opsional, hanya bila tabel kosong): 4 toko aktif +
   8 listing (kamera/PS5/tenda/proyektor/dll) — sama dengan seed lama, harga
   & deposit jadi acuan test UI. Bisa dimatikan dengan flag di baseline
   migration.
3. **Toko seller**: tidak di-seed manual — lahir dari alur
   `submit_seller_application` → approve superadmin (menghasilkan toko
   `active` otomatis). Ini sekaligus menguji alur onboarding end-to-end.
4. Env project baru: isi `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
   baru di `.env.local` (lihat checklist setup di laporan Fase 4 nanti).
   Auth provider (email) diaktifkan di dashboard project baru; konfirmasi
   email boleh dimatikan untuk dev.

---

## 7. Perubahan kode yang diperlukan (kecil, 1 file)

`get_my_stores()` versi compat mengekspos `owner_id` (dengan alias `name`),
sedangkan desain bersih mengembalikan `user_id` + `store_name` dan **alias
`name`** demi komponen seller (`SellerStoreInfo` membaca `store.name`,
`store.description`, `store.address`, `store.rating`, `store.status`,
`store.is_verified`):

* `get_my_stores` baru: `SELECT id, user_id, store_name AS name, description,
  city, address, status, is_verified, rating, created_at` → semua komponen
  seller tetap bekerja tanpa perubahan apa pun.
* Tidak ada perubahan lain: semua kontrak data lain sudah dipenuhi desain ini
  (verifikasi ulang saat Fase 4 dengan checklist).

Opsi tambahan (disetujui → dieksekusi di Fase 3):
* `tags text[]` di `listings` **dihapus** (tidak dipakai frontend).
* `users.phone` & `users.is_seller` **dihapus** (tidak dibaca UI).
* `stores.username` **dihapus**.
* `payment_records` **tidak dibuat**.

---

## 8. Urutan pembuatan objek (untuk baseline Fase 3)

1. Extension `btree_gist` (+ `pg_trgm` opsional untuk index pencarian).
2. Enum `user_role`.
3. Tabel: `users` → `stores` → `listings` → `rental_transactions` →
   `wishlists` → `admin_audit_logs` (urutan FK).
4. Index + constraint (termasuk exclusion) + trigger
   `on_auth_user_created` & `touch_updated_at`.
5. Helper `is_superadmin`, `get_my_store`.
6. RLS enable + policy semua tabel.
7. RPC + grants (REVOKE/GRANT eksplisit).
8. Sanity check (RAISE EXCEPTION bila RLS tidak aktif) + seed opsional.

Satu file, idempoten penuh (aman dijalankan ulang), tanpa kolom legacy.
