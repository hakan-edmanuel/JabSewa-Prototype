# JabSewa — Phase 1: Full Read-Only Audit Report

> **Status: READ-ONLY — tidak ada perubahan database, migration, frontend, atau backend yang dilakukan.**
> Basis audit: `src/` (57 file), `supabase/migrations/` (3 file SQL), `scripts/` (6 file),
> `docs/db-rebuild/` (2 dokumen lama), `.env.example`, `package.json`.
> Semua temuan ditarik langsung dari source code; tidak ada asumsi tersembunyi.
> Tanggal: 2026-09-26.

---

## 0. Konteks: mengapa rebuild diperlukan

Project Supabase aktif bukan project bersih. Tiga migration bertumpuk di atas schema
legacy yang tidak dikendalikan:

| # | Migration | Sifat | Masalah yang diwariskan |
|---|---|---|---|
| 1 | `20260921000002_full_reset_idempotent.sql` (1.356 bks) | CREATE IF NOT EXISTS + sanitasi + RPC + search | Melompati tabel legacy yang sudah ada → `CREATE TABLE IF NOT EXISTS` tidak menambah kolom; perlu blok "sanitasi desync" khusus (`$fix_role_type$`) hanya untuk menyelamatkan kolom `role` bbertipe salah. Menyertakan **seed demo inline** di dalam migration schema. |
| 2 | `20260924000000_rentals_wishlists_rls_rpcs.sql` (1.270 bks) | Tabel rental/wishlist/payment + RLS + RPC rental | **Gagal jalan utuh** pada DB legacy (SQL 42703: `listing_id` tidak ada). RPC direstuktur ulang oleh migration #3. |
| 3 | `20260925000000_legacy_schema_compat.sql` (1.469 bks) | Patch kompatibilitas | Menambah **kolom legacy duplikat** + **trigger sinkron dua arah**: `name↔store_name`, `owner_id↔user_id`, `price↔price_per_day`, `stock↔available`, `buyer_id↔tenant_id`. Ini compatibility layer yang secara eksplisit dilarang master prompt, dan sumber schema drift yang terus-menerus. |

Setiap RPC (`rental_quote`, `create_rental`, `set_rental_status`, `get_rentals_for_user`,
`get_rentals_for_store`, `get_wishlist`, `toggle_wishlist`, `get_my_stores`,
`submit_seller_application`, `decide_seller_application`, `save_listing`,
`set_listing_availability`, `delete_listing`, `listings_for_my_store`,
`list_seller_applications`, `list_audit_logs`) didefinisikan **dua kali** (migration #2 dan #3)
dengan perbedaan kecil tapi nyata — perilaku produksi bergantung pada urutan eksekusi.

---

## 1.1 Inventory

### 1.1.1 Tabel (state ekspektasi migration #3 = state aktual DB)

| Tabel | PK | FK | Kolom utama | Catatan |
|---|---|---|---|---|
| `users` | `id uuid` → `auth.users` CASCADE | — | `email` UNIQUE, `full_name`, `phone`, `role user_role DEF 'TENANT'`, `is_seller bool`, `status text DEF 'active'`, `seller_application jsonb`, `seller_profile jsonb`, `created_at`, `updated_at` | Kolom `phone`, `is_seller` tidak pernah dibaca frontend |
| `stores` | `id uuid` | `user_id → auth.users` (CASCADE via patch #3 — di migration #2 `SET NULL`), `owner_id legacy → ?` | `store_name` + mirror `name`, `description`, `contact`, `city`, `address`, `username`, `status`, `is_verified`, `rating numeric(3,2)`, `created_at`, `updated_at` | Dua kolom pemilik hidup berdampingan |
| `listings` | `id bigserial (bigint)` | `store_id → stores` CASCADE | `name`, `description`, `category`, `price_per_day` + mirror `price`, `deposit`, `available` + derivasi `stock`, `image_url`, `location`, `tags text[]`, `status`, `rating`, `successful_transactions` | `tags` & `stock` tidak dipakai frontend |
| `rental_transactions` | `id uuid` | `tenant_id → auth.users` CASCADE, `listing_id → listings` RESTRICT, `store_id → stores` SET NULL, `buyer_id legacy` (nullable) | `code UNIQUE`, tanggal, `total_days`, snapshot harga (`price_per_day`, `deposit`, `subtotal`, `total`), `status`, `rejection_reason`, `payment_status` | Exclusion constraint anti double-booking |
| `wishlists` | `id bigserial` | `user_id → users` CASCADE, `listing_id → listings` CASCADE | UNIQUE `(user_id, listing_id)` | Bersih |
| `payment_records` | `id bigserial` | `rental_id → rental_transactions` CASCADE | `amount`, `method`, `status`, `recorded_by`, `note` | **Tidak pernah ditulis/dibaca frontend** |
| `admin_audit_logs` | `id bigserial` | `admin_id → auth.users` CASCADE | `action`, `target_type`, `target_id`, `ip_address inet`, `user_agent`, `payload jsonb` | Bersih |

### 1.1.2 Enum & domain types

- `user_role` enum: `TENANT | STORE_OWNER | SUPERADMIN` (uppercase, cocok `src/lib/roles.js`).
- Semua status lain (`stores.status`, `listings.status`, `rental_transactions.status`,
  `payment_status`) = **text + CHECK constraint**, bukan enum.

### 1.1.3 Trigger

| Trigger | Tabel | Sifat | Status |
|---|---|---|---|
| `on_auth_user_created` → `handle_new_user()` | `auth.users` | SECDEF; insert profil `TENANT` | ✅ Dibutuhkan, dibuat ulang identik di 3 migration |
| `trg_rentals_touch` → `touch_updated_at()` | `rental_transactions` | set `updated_at` | ✅ Dibutuhkan |
| `trg_stores_sync` → `jabsewa_stores_sync()` | `stores` | sinkron dua arah kolom legacy | ❌ Legacy-only, harus hilang pada rebuild |
| `trg_listings_sync` → `jabsewa_listings_sync()` | `listings` | sinkron dua arah kolom legacy | ❌ Legacy-only, harus hilang pada rebuild |

### 1.1.4 RPC (semua versi yang pernah terpasang)

| RPC | Signature | Versi | Dipakai frontend | Status audit |
|---|---|---|---|---|
| `rental_quote` | `(bigint, date, date)` | #2 & #3 | `userData.quoteRental` → ProductDetail | ✅ Kontrak sama; #3 grant ke `anon` juga |
| `create_rental` | `(bigint, date, date)` | #2 & #3 | `userData.addRental` | ✅ Atomic; advisory lock + exclusion constraint |
| `set_rental_status` | `(uuid, text, text)` | #2 & #3 | `userData.setRentalStatus` | ✅ Transisi terjaga |
| `get_rentals_for_user` | `()` | #2 & #3 | `userData.getRentals` | ✅ Enrichment item/toko/tenant |
| `get_rentals_for_store` | `()` | #2 & #3 | `userData.getRentalsByStore` | ✅ |
| `get_wishlist` | `()` | #2 & #3 | `userData.getWishlist` | ✅ |
| `toggle_wishlist` | `(bigint)` | #2 & #3 | `userData.toggleWishlist` | ✅ |
| `get_my_stores` | `()` | #2 & #3 | `SellerPage` | ⚠️ Return shape berbeda antar versi (lihat C-04) |
| `get_my_store` | `(uuid DEF NULL)` | #2 & #3 | internal (helper) | ✅ |
| `is_superadmin` | `()` | #2 & #3 | internal (helper) | ✅ |
| `submit_seller_application` | `(text, text, text, text, text)` | #2 & #3 | `AuthContext.submitSellerApplication` | ✅ jsonb camelCase |
| `decide_seller_application` | `(text, boolean, text)` | #2 & #3 | `superadmin.decideAdmin` | ⚠️ #2 tulis role dengan CASE enum; #3 tulis literal; perilaku `stores.status` berbeda (lihat C-06) |
| `list_seller_applications` | `()` | #2 & #3 | `superadmin.listSellerApplications` | ⚠️ #2 filter superadmin via WHERE pada tabel; #3 via `WHERE is_superadmin()` |
| `save_listing` | `(bigint, uuid, text×4, int×2, text, boolean)` | #2 & #3 | `listings.saveListing` | ✅ |
| `set_listing_availability` | `(bigint, boolean)` | #2 & #3 | `listings.updateListingAvailability` | ✅ |
| `delete_listing` | `(bigint)` | #2 & #3 | `listings.removeListing` | ✅ `has_rentals` |
| `listings_for_my_store` | `()` | #2 & #3 | `listings.fetchMyStoreListings` | ✅ |
| `list_audit_logs` | `(integer)` | #2 & #3 | `superadmin.listAuditLogs` | ✅ supersedes `list_admin_audit_logs` |
| `log_admin_action` | `(text, text, text, jsonb)` | #1 | `superadmin.logAdminAction` | ✅ IP/UA dari header server |
| `list_admin_audit_logs` | `(integer)` | #1 | ❌ tidak dipakai | Legacy — tergantikan |
| `search_hybrid` | `(text, text, text, int, int)` | #1 | ❌ tidak dipakai | Frontend melakukan scoring di client (`src/lib/search.js`) |
| `handle_new_user`, `touch_updated_at`, `jabsewa_stores_sync`, `jabsewa_listings_sync` | — | trigger fns | — | 2 pertama dibutuhkan; 2 terakhir legacy-only |

**Total 17 RPC dipakai frontend + 2 helper internal. Estimasi "19 RPC" master prompt terkonfirmasi.**

### 1.1.5 RLS & grants

| Tabel | RLS | Policy aktif |
|---|---|---|
| `users` | ✅ | `users_select_own` (read-own), `users_select_superadmin` |
| `stores` | ✅ | `stores_read_active` (`anon, authenticated`: status active OR milik sendiri) |
| `listings` | ✅ | `listings_read_catalog` (listing toko active OR toko sendiri) |
| `rental_transactions` | ✅ | select: own / store-owner / superadmin; **tanpa policy INSERT/UPDATE/DELETE** (default-deny, tulisan via RPC) |
| `wishlists` | ✅ | select/insert/delete own |
| `payment_records` | ✅ | select tenant / store-owner |
| `admin_audit_logs` | ✅ | select superadmin saja; `REVOKE ALL FROM anon` |

Grants: SELECT saja untuk client pada semua tabel bisnis; EXECUTE per RPC eksplisit
(`anon+authenticated` untuk `rental_quote`; `authenticated` untuk sisanya).
Tidak ada tulisan langsung dari frontend — **diverifikasi**: hanya `.select()` pada `.from()`.

### 1.1.6 Frontend service layer

| Modul | Peran | Sumber data |
|---|---|---|
| `src/lib/supabaseClient.js` | Singleton client, normalisasi URL, `isSupabaseConfigured` | env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `src/lib/listings.js` | Katalog + seller CRUD | `listings`, `stores` (direct read) + RPC seller |
| `src/lib/userData.js` | Wishlist + rental | 7 RPC |
| `src/lib/search.js` | Hybrid search | client-side scoring di atas `fetchListings`/`fetchStores` |
| `src/lib/superadmin.js` | Guard + audit + applications | `users` (read-own) + 5 RPC |
| `src/auth/AuthContext.jsx` | Sesi + profil | `auth.*` + `users` (read-own) + `submit_seller_application` |
| `src/lib/roles.js` | Konstanta role | — |
| `src/lib/constants.js` | `RENTAL_STATUS`, `CATEGORIES`, `CITIES` | — |
| `src/lib/storage.js` | **Fallback demo LocalStorage** (seed users w/ plaintext password, stores, items, audit) | LocalStorage |
| `src/lib/format.js`, `src/lib/rentalLogic.test.js` | Util + unit test mirror kontrak rental | — |

### 1.1.7 Script & dokumentasi

- `scripts/verify-schema-readonly.sql` — read-only precheck (menargetkan patch #3, akan diperbarui untuk baseline baru).
- `scripts/verify-supabase-connection.mjs` — smoke test anon (RLS + quote + create_rental menolak anon).
- `scripts/audit-schema.mjs`, `scripts/audit-schema.sql`, `scripts/parse-sql-results.mjs`, `scripts/erd-inference.md` — tooling audit lama.
- `docs/db-rebuild/01-AUDIT.md`, `docs/db-rebuild/02-DESAIN.md` — draft audit & desain sebelumnya (akurasi tinggi, belum mengikuti struktur kontrak master prompt).

---

## 1.2 Dependency Map

Format: `Halaman/Komponen → Service → RPC / Direct Query → Tabel → RLS/Authorization`

### Jalur publik (anon)

```
Landing (FeaturedListings, CategorySection)
  → listings.fetchListings() → .from('listings').select(…, stores(store_name,city))
    → listings ⋈ stores → RLS listings_read_catalog (hanya toko active) [TERVERIFIKASI]

ConsumerPage / ConsumerBrowser / ConsumerHero
  → search.hybridSearch() → fetchListings + fetchStores (scoring client)
  → listings.fetchListingById() → .from('listings') → RLS sama [TERVERIFIKASI]

ProductDetail (pratinjau harga)
  → userData.quoteRental() → rpc('rental_quote') → listings ⋈ stores
    → SECURITY INVOKER; RLS katalog mengizinkan anon [TERVERIFIKASI]

ConsumerBrowser (belum login)
  → wishlist tamu → localStorage 'jabsewa:wishlist:guest' (tanpa DB) [TERVERIFIKASI]
```

### Jalur tenant (authenticated)

```
AuthPage → AuthContext.login/register
  → auth.signInWithPassword / signUp → auth.users
  → trigger on_auth_user_created → users (role TENANT) [TERVERIFIKASI]
  → fetchProfile → .from('users').select(…) → RLS users_select_own [TERVERIFIKASI]

ConsumerBrowser (login) → userData.getWishlist/toggleWishlist
  → rpc('get_wishlist'/'toggle_wishlist') → wishlists
    → SECDEF, auth.uid() server-side [TERVERIFIKASI]

ProductDetail → userData.addRental
  → rpc('rental_quote') lalu rpc('create_rental')
    → rental_transactions INSERT (SECDEF, advisory lock, exclusion constraint) [TERVERIFIKASI]

BuyerPage → userData.getRentals / setRentalStatus
  → rpc('get_rentals_for_user') / rpc('set_rental_status')
    → rental_transactions (SECDEF; transisi terjaga) [TERVERIFIKASI]
```

### Jalur store owner

```
SellerPage → rpc('get_my_stores') → stores (SECDEF by auth.uid()) [TERVERIFIKASI]

SellerOnboardingPage → AuthContext.submitSellerApplication
  → rpc('submit_seller_application') → users.seller_application (jsonb) [TERVERIFIKASI]

SellerDashboard/SellerItems/SellerOrders/SellerStoreInfo
  → rpc('listings_for_my_store'), rpc('save_listing'),
    rpc('set_listing_availability'), rpc('delete_listing'),
    rpc('get_rentals_for_store'), rpc('set_rental_status')
    → stores/listings/rental_transactions (SECDEF, scope toko AKTIF milik sesi) [TERVERIFIKASI]
```

### Jalur superadmin

```
SysControlApp → SuperadminGuard → superadmin.requireSuperAdmin()
  → .from('users').select(id,email,role,status).eq(id, sesi) → RLS read-own
    → role='SUPERADMIN' AND status='active' [TERVERIFIKASI]

SysApplications → listSellerApplications / decideAdmin
  → rpc('list_seller_applications'), rpc('decide_seller_application')
    → users.seller_application, users.role, stores (SECDEF superadmin) [TERVERIFIKASI]

SysAudit → superadmin.listAuditLogs / logAdminAction
  → rpc('list_audit_logs'), rpc('log_admin_action') → admin_audit_logs [TERVERIFIKASI]

SysDashboard → summarizeApplications (pure client) + listSellerApplications [TERVERIFIKASI]
```

### Jalur yang TIDAK terverifikasi terhadap DB live

> Audit ini read-only terhadap source code. Berikut yang belum bisa diverifikasi
> tanpa akses ke project Supabase aktif:

1. State aktual project Supabase aktif (kolom eksak, signature RPC terpasang, policy live) —
   hanya bisa dipastikan dengan `scripts/verify-schema-readonly.sql` di SQL Editor.
2. Apakah `npm run verify:supabase` saat ini PASS terhadap project aktif.
3. Ada tidaknya object orphan dari eksekusi parsial migration #2 (mis. `payment_records`
   tanpa index, policy duplikat).
4. Data aktual di tabel (jumlah baris, kebersihan backfill, baris legacy tanpa `tenant_id`).

---

## 1.3 Conflict Register

| ID | Conflict | Source A | Source B | Impact | Proposed Resolution | Approval |
|---|---|---|---|---|---|---|
| C-01 | Dua kontrak nama kolom hidup bersamaan: `stores.name↔store_name`, `owner_id↔user_id`, `listings.price↔price_per_day`, `stock↔available`, `rental.buyer_id↔tenant_id` | Migration #3 (compat triggers) | Migration #2 + kontrak frontend | Trigger sinkron dua arah menimpa data, rawan bug, `get_my_stores` versi compat mengekspos field berbeda | Clean rebuild: satu kolom saja (kolom kontrak), tanpa trigger sinkron | PENDING |
| C-02 | `rental_quote` return `deposit` NULL vs 0: #2 kembalikan `vListing.deposit`, #3 `COALESCE(…,0)` | Migration #2 | Migration #3 | Frontend menormalkan ke 0; tidak fatal, tapi dua versi berbeda | Satu definisi di baseline: `COALESCE(deposit,0)`; kolom NOT NULL DEF 0 | PENDING |
| C-03 | `list_seller_applications` #2 memfilter `WHERE u.seller_application IS NOT NULL` tanpa guard superadmin eksplisit pada query (guard via REVOKE + policy lain), #3 menambah `WHERE public.is_superadmin()` | Migration #2 | Migration #3 | #2 hanya aman karena grant EXECUTE + policy; tetap lebih lemah dari #3 | Baseline pakai pola #3: guard `is_superadmin()` di dalam query | PENDING |
| C-04 | `get_my_stores` #2 → `store_name AS name, user_id`; #3 → `COALESCE(store_name, name) AS name, user_id` + kolom `owner_id` di WHERE | Migration #2 | Migration #3 | SellerStoreInfo menerima `name` dua-duanya, tapi sumber kolom berbeda; drift saat schema berubah | Baseline: `store_name AS name` + `user_id`, terdokumentasi eksplisit di kontrak (sesuai §9.2 master prompt) | PENDING |
| C-05 | `users.role` konversi tipe dilakukan via blok sanitasi khusus (#1 `$fix_role_type$`), lalu #3 memilih menulis role type-agnostic (`role::text`) | Migration #1 | Migration #3 | Dua strategi berbeda untuk masalah yang sama; menandakan tipe role pernah desync | Baseline: enum `user_role` dari awal, tidak perlu konversi; semua RPC menulis enum langsung | PENDING |
| C-06 | Perilaku `decide_seller_application(approve=true)` terhadap `stores.status`: #2 selalu set `status='active'` (toko yang dinonaktifkan akan aktif kembali); #3 juga demikian (dokumentasinya mengakui trade-off ini) | Migration #2 | Migration #3 (header §7) | Keputusan bisnis: approval ulang mengaktifkan toko yang sengaja dinonaktifkan | OPEN QUESTION Q-3 — perlu keputusan sebelum PRD final | PENDING |
| C-07 | Keberadaan `payment_records`: dibuat di #2 dan #3, ditandai "OPTIONAL, unused by the app", tetap diisi RLS + policy + index | Migration #2 & #3 | Audit pemakaian frontend (tidak pernah diakses) | Permukaan serangan & biaya maintenance tanpa fungsi | Drop dari MVP; `payment_status` di `rental_transactions` cukup. Konfirmasi Q-1 | PENDING |
| C-08 | `search_hybrid` (SEC INVOKER, skor server pg_trgm) ada di DB, tidak pernah dipanggil frontend; frontend melakukan scoring sendiri di client | Migration #1 | `src/lib/search.js` | Dua mesin pencarian hidup; RPC hanya menambah beban maintenance | Tidak dibawa ke baseline (kecuali keputusan Q-2 memindahkan scoring ke server) | PENDING |
| C-09 | Seed demo ditanam di dalam migration schema (#1 & #3, blok SECTION 8/M) | Migration #1 & #3 | Aturan master prompt §11: seed terpisah dari schema migration | Schema migration tidak bersih; seed sulit dimatikan | Baseline migration murni DDL; seed dev jadi file terpisah yang hanya dijalankan bila disetujui | PENDING |
| C-10 | `listings.tags text[]` diisi seed & dipakai scoring RPC `search_hybrid`, tapi frontend client-side search tidak membacanya | Migration #1 (seed & RPC) | `src/lib/search.js` (pakai nama/deskripsi/kategori) | Kolom mati di kontrak aktif | Hapus dari baseline, atau pertahankan hanya jika Q-2 memilih search server | PENDING |
| C-11 | Role `admin` biasa: master prompt §7.3 mensyaratkan admin dengan permission terbatas, sedangkan sistem saat ini hanya punya TENANT / STORE_OWNER / SUPERADMIN — tidak ada tabel/enum admin & permission | Master prompt | Migrations + `src/lib/roles.js` | Tidak ada mekanisme delegasi admin; semua keputusan membutuhkan superadmin | OPEN QUESTION Q-4 — apakah admin biasa dibutuhkan di MVP? | PENDING |
| C-12 | `handle_new_user` di tiga migration identik tapi dibuat ulang berkali-kali; `on_auth_user_created` di-drop/create ulang tiap run | Migration #1, #2, #3 | — | Tidak fatal, tapi menandakan tidak ada baseline tunggal | Satu baseline, trigger didefinisikan sekali | PENDING |
| C-13 | `stores.user_id` ON DELETE berbeda: #2 `SET NULL`, #3 (via re-ADD constraint tak mengubah FK) — desain baru mengusulkan CASCADE | Migration #2 | docs/db-rebuild/02-DESAIN.md §1 | Perilaku hapus akun berbeda antar versi | OPEN QUESTION Q-5 — kebijakan penghapusan akun/toko | PENDING |
| C-14 | Wishlist tamu disimpan di localStorage (`jabsewa:wishlist:guest`) dan tidak pernah dimigrasi ke DB saat login | `ConsumerBrowser.jsx` | `userData.getWishlist()` | Data wishlist tamu hilang saat login; tidak tercatat di kontrak backend | Tetap diterima di MVP (UX, bukan DB), tapi harus terdokumentasi eksplisit di kontrak frontend | PENDING |
| C-15 | `storage.js` seed LocalStorage berisi akun + **password plaintext** (mock) dan `AuthPage` mungkin menampilkan akun demo | `src/lib/storage.js` | Master prompt §11: tanpa password asli di seed | Aman (mock lokal), tapi pola ini jangan terbawa ke seed Supabase | Seed Supabase dev (bila disetujui) hanya berisi akun test dengan email dummy; tidak ada password di kode | PENDING |
| C-16 | `docs/db-rebuild/01-AUDIT.md` & `02-DESAIN.md` lama memakai struktur/nomor fase berbeda dari kontrak master prompt | Dokumen lama | Master prompt §3–§12 | Ambiguitas sumber kebenaran saat implementasi | Dokumen lama dipertahankan sebagai riwayat; laporan ini (01-audit-report.md) jadi sumber Phase 1; fase berikutnya menulis 02-final-prd.md dst. | PENDING |
| C-17 | `users.phone` dan `users.is_seller` tidak pernah dibaca UI tetapi tetap dikolomkan di semua versi | Migrations | Audit pemakaian frontend | Kolom mati | Hapus dari baseline (usulan desain lama §7 setuju); konfirmasi di PRD | PENDING |
| C-18 | `stores.username` hanya dipakai RPC `search_hybrid` (skor username-exact) yang tidak pernah dipanggil frontend | Migration #1 | — | Kolom mati + index trgm ekstra | Hapus dari baseline bersama C-08/C-10 | PENDING |
| C-19 | `get_rentals_for_user/store` versi #3 membaca `buyer_id` legacy sebagai fallback (`OR buyer_id = auth.uid()`) | Migration #3 | Migration #2 | Kompatibilitas legacy bocor ke RPC aktif | Baseline: hanya `tenant_id` | PENDING |
| C-20 | RLS `stores_read_active` mengizinkan anon membaca toko non-aktif miliknya sendiri via `user_id = auth.uid()` — untuk anon `auth.uid()` NULL, aman; tetapi policy yang sama memberi seller akses baca tokonya yang non-aktif. Di migration #3 pola identik dengan tambahan `owner_id`. | Migration #2 | Migration #3 | Perilaku sama; tidak ada kebocoran aktual. Diverifikasi aman | Baseline: satu policy tanpa fallback legacy | PENDING (no-op, didokumentasikan) |

---

## 1.4 Legacy Compatibility (inventarisasi — untuk dihapus pada clean rebuild)

Compatibility layer yang **tidak akan dibawa** ke baseline baru:

1. Kolom legacy + trigger sinkron: `stores.name`, `stores.owner_id`,
   `listings.price`, `listings.stock`, `rental_transactions.buyer_id`
   (`jabsewa_stores_sync`, `jabsewa_listings_sync`).
2. RPC ganda: `list_admin_audit_logs` (tergantikan `list_audit_logs`), `search_hybrid`
   (tidak dipanggil frontend).
3. Tabel `payment_records` (tidak pernah diakses aplikasi).
4. Blok "sanitasi desync" (`$fix_role_type$`), backfill one-shot, FK `NOT VALID`.
5. Seed demo inline di migration schema.
6. Fallback LocalStorage (`src/lib/storage.js`) untuk katalog/seller CRUD —
   **fitur demo UI ini bukan bagian DB contract**, tapi perlu keputusan eksplisit
   apakah tetap dipertahankan sebagai mode demo frontend (lihat Q-6).

Fitur bisnis yang tetap dipertahankan (bukan legacy): seluruh 17 RPC kontrak frontend,
wishlist tamu (localStorage, UX), unit test mirror `rentalLogic.test.js`,
smoke test `verify-supabase-connection.mjs`.

---

## 2. Temuan keamanan (ringkas, detail di Phase 5)

Positif (sudah benar di kode/migration):
- Tidak ada `service_role` key di repo; `.env.example` hanya var publik; `.env*` di-gitignore ✅
- Semua RPC SECDEF memakai `SET search_path = public` ✅
- Identitas selalu dari `auth.uid()`, bukan parameter client ✅
- Harga/durasi/total dihitung server-side (`create_rental`) ✅
- Exclusion constraint + advisory lock untuk double-booking ✅
- `log_admin_action` membaca IP/UA dari `request.headers` server, bukan input client ✅
- Tidak ada INSERT/UPDATE/DELETE policy pada `rental_transactions` ✅

Perlu perhatian pada desain final (bukan blocker, tapi masuk security contract):
1. `requireSuperAdmin` membaca `users` via RLS read-own — aman, tapi guard frontend
   hanyalah UX; otorisasi sesungguhnya ada di dalam tiap RPC (sudah benar).
2. `rental_quote` di-grant ke `anon` — sengaja (pratinjau harga), perlu dinyatakan eksplisit.
3. `toggle_wishlist` melempar `RAISE EXCEPTION 'unauthenticated'` (bukan return ok/error)
   — pola error tidak seragam dengan RPC lain. Seragamkan di baseline.
4. Tidak ada rate limiting / audit untuk `submit_seller_application` (spam ajuan) —
   keputusan bisnis (terima risiko di MVP atau tambahkan cooldown).
5. Bootstrap superadmin via SQL manual (`UPDATE users SET role='SUPERADMIN'`) —
   sesuai master prompt §7.2; harus terdokumentasi di environment setup.

---

## 3. Status output wajib Phase 1

| Output wajib | Status |
|---|---|
| `docs/db-rebuild/01-audit-report.md` | ✅ Dokumen ini |
| Perubahan kode/database | ❌ Tidak ada (read-only) |

---

## 4. Yang tidak dapat diverifikasi pada tahap ini

1. State live project Supabase aktif (kolom, policy, signature RPC terpasang) —
   perlu menjalankan `scripts/verify-schema-readonly.sql` di SQL Editor project.
2. Hasil `npm run verify:supabase` terhadap project aktif.
3. Kualitas data aktual (backfill legacy, baris tanpa `tenant_id`, duplikat wishlist).
4. Perilaku runtime Vercel/deploy (di luar cakupan audit DB).
