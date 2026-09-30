# JabSewa — FASE 1: LAPORAN AUDIT SCHEMA

> Basis audit: kode aplikasi di `src/` (lapisan data & auth), 3 file migration di
> `supabase/migrations/`, skrip verifikasi `scripts/`, dan konfigurasi env.
> Tidak ada perubahan database dilakukan. Semua temuan diverifikasi dari kode.

---

## 1. Ringkasan situasi

Project Supabase aktif **bukan** project bersih: strukturnya adalah hasil
bertumpuknya 3 migration di atas schema legacy yang tidak dikendalikan:

| Migration | Sifat | Masalah yang diwariskan |
|---|---|---|
| `20260921000002_full_reset_idempotent.sql` | CREATE IF NOT EXISTS + sanitasi | Membuat tabel bentuk baru bila kosong, tapi **melompati** tabel legacy yang sudah ada → kolom tidak pernah ditambahkan |
| `20260924000000_rentals_wishlists_rls_rpcs.sql` | Additive RPC/RLS | Gagal jalan utuh karena `listing_id` tidak ada di `rental_transactions` legacy (SQL 42703) |
| `20260925000000_legacy_schema_compat.sql` | Patch kompatibilitas | Menambah kolom + **trigger sinkron dua arah** `name↔store_name`, `price↔price_per_day`, `stock↔available`, `owner_id↔user_id`, `buyer_id↔tenant_id` — ini sumber ketidakcocokan yang terus-menerus |

Akar masalahnya bukan SQL-nya salah, tapi **dua kontrak nama kolom hidup
berdampingan** dalam satu tabel, dengan trigger sinkronisasi yang rawan
keliru (contoh nyata: `get_my_stores()` versi compat mengekspos `owner_id`
dengan alias `name`, sedangkan versi 24000000 mengembalikan `user_id` dengan
`store_name` → frontend `SellerStoreInfo` bisa menerima field yang berbeda
tergantung versi RPC yang terpasang).

**Keputusan yang dianjurkan: rebuild bersih pada project Supabase baru**
(sesuai rencana kamu), tanpa membawa kolom legacy apa pun.

---

## 2. Kontrak aktual dari kode aplikasi (sumber kebenaran)

Berikut yang **benar-benar dipakai** kode frontend — diperoleh dari semua
panggilan `.from()` dan `.rpc()` di `src/`:

### 2.1 Akses tabel langsung (PostgREST)

| Tabel | Pemakai | Kolom yang dibaca |
|---|---|---|
| `users` | `AuthContext.fetchProfile`, `superadmin.requireSuperAdmin` | `id, email, full_name, role, status, seller_application, seller_profile` |
| `listings` | `listings.fetchListings/fetchListingById` | `id, store_id, name, description, category, price_per_day, deposit, image_url, location, available, rating, successful_transactions, stores(store_name, city), created_at (order)` |
| `stores` | `listings.fetchStores` | `id, store_name, description, city, rating, is_verified` (+ `status` untuk filter `active`) |

Tidak ada tulisan langsung ke tabel mana pun dari frontend — **semua tulisan
lewat RPC** (verifikasi: hanya `.select()` yang muncul di `.from()`).

### 2.2 RPC yang wajib ada (kontrak keras frontend)

| RPC | Signature | Dipakai di | Retur yang dibaca frontend |
|---|---|---|---|
| `get_wishlist()` | — | `userData.getWishlist` | `{ listing_id, created_at }` |
| `toggle_wishlist` | `(p_listing_id bigint)` | `userData.toggleWishlist` | `{ listing_id, active }` |
| `get_rentals_for_user()` | — | `userData.getRentals` | Rental terenrichment (lihat 2.3) |
| `get_rentals_for_store()` | — | `userData.getRentalsByStore`, `SellerDashboard`, `SellerOrders` | Rental terenrichment |
| `create_rental` | `(p_listing_id bigint, p_start date, p_end date)` | `userData.addRental` | `{ ok, error, rental_id, code, status, total_days, price_per_day, deposit, subtotal, total }` |
| `set_rental_status` | `(p_rental_id uuid, p_status text, p_reason text)` | `userData.setRentalStatus` | `{ ok, error, status, rejection_reason }` |
| `rental_quote` | `(p_listing_id bigint, p_start date, p_end date)` | `userData.quoteRental` → `ProductDetail` | `{ ok, error, total_days, price_per_day, deposit, subtotal, total }` |
| `listings_for_my_store()` | — | `listings.fetchMyStoreListings` | Baris listing (kolom sama seperti tabel) |
| `save_listing` | `(p_listing_id, p_store_id, p_name, p_description, p_category, p_price_per_day, p_deposit, p_image_url, p_location, p_available)` | `listings.saveListing` | `{ ok, error, listing_id }` |
| `set_listing_availability` | `(p_listing_id bigint, p_available boolean)` | `listings.updateListingAvailability` | `{ ok, error }` |
| `delete_listing` | `(p_listing_id bigint)` | `listings.removeListing` | `{ ok, error }` — frontend sudah tahu kode `has_rentals` |
| `submit_seller_application` | `(p_store_name, p_description, p_contact, p_city, p_address)` | `AuthContext.submitSellerApplication` | `{ ok, error, application }` |
| `get_my_stores()` | — | `SellerPage` | `{ id, user_id, name, description, city, address, status, is_verified, rating, created_at }` |
| `list_seller_applications()` | — | `superadmin.listSellerApplications` (superadmin) | `{ id(email), applicant_name, applicant_email, seller_application }` |
| `decide_seller_application` | `(p_email, p_approve, p_reason)` | `superadmin.decideAdmin` | `{ ok, error }` |
| `log_admin_action` | `(p_action, p_target_type, p_target_id, p_payload)` | `superadmin.logAdminAction` | boolean |
| `list_audit_logs` | `(p_limit integer)` | `superadmin.listAuditLogs` → `SysAudit` | `{ id, action, actor_email, target_type, target_id, ip_address, created_at }` |

**Tidak dipakai kode (hanya eksistensinya didokumentasikan):** `search_hybrid`
(frontend melakukan scoring di client), `list_admin_audit_logs` (digantikan
`list_audit_logs`), `payment_records` (tabel opsional, tidak pernah ditulis UI).

### 2.3 Bentuk Rental yang dikonsumsi `normalizeRental`

```
id, code, tenant_id, listing_id, store_id,
start_date, end_date, total_days,
price_per_day, deposit, subtotal, total,
status, rejection_reason, payment_status,
created_at, updated_at,
item_name, item_image, seller_name, tenant_name   ← enrichment dari RPC
```

### 2.4 Kode error server yang dipahami UI

`RENTAL_ERROR_MESSAGES` di `src/lib/userData.js`: `unauthenticated`,
`listing_not_found`, `invalid_date_range`, `start_date_in_past`,
`listing_unavailable`, `store_inactive`, `date_conflict`, `quote_failed`,
`not_found`, `forbidden`, `rejection_reason_required`, `illegal_transition`,
`has_rentals`, `not_found_or_forbidden`, `no_active_store`, `name_required`,
`invalid_amount`, `application_already_pending`, `store_name_required`,
`profile_not_found`. RPC baru harus memakai **kode-kode ini persis**.

### 2.5 Konstanta yang harus cocok dengan DB

* Role (`src/lib/roles.js`): `TENANT` | `STORE_OWNER` | `SUPERADMIN`
  → enum `user_role` DB harus memakai label persis ini (uppercase).
* Status rental (`src/lib/constants.js`): `pending, accepted, rejected,
  active, completed, cancelled` (lowercase) → CHECK constraint harus
  mengizinkan set ini.
* Kategori: `photography, gadget, sports, event` (id katalog di
  `constants.js`, disimpan sebagai teks di `listings.category`).
* Timezone operasional: `Asia/Jakarta` (dipakai kode rental & backfill).

---

## 3. Pemetaan alur aplikasi → objek DB

### Register / Login
`auth.signUp` (meta `full_name`) → trigger `on_auth_user_created` →
`public.users(id, email, full_name, role='TENANT')`. Login membaca profil
sendiri (RLS read-own). **Wajib:** trigger profil + RLS `users`.

### Seller onboarding
`submit_seller_application` → `users.seller_application` (jsonb, key
camelCase: `status, storeName, description, contact, city, address,
submittedAt`). Superadmin approve via `decide_seller_application` → role
jadi `STORE_OWNER`, `seller_profile` diisi, toko dibuat/diaktifkan
(`status='active'`). `get_my_stores()` membaca toko milik sesi.

### Katalog & pencarian
`fetchListings`/`fetchStores` dibaca langsung (RLS: hanya listing toko
aktif + toko sendiri untuk seller). Scoring pencarian di client
(`src/lib/search.js`) — **tidak butuh `search_hybrid`**; `pg_trgm` hanya
opsional untuk index.

### Booking (rental)
`rental_quote` (pratinjau) → `create_rental` (validasi + harga snapshot +
advisory lock per listing + exclusion constraint anti double-booking) →
`set_rental_status` (transisi terjaga). Baca via `get_rentals_for_user`
/ `get_rentals_for_store`. Transisi legal:
`pending→accepted|rejected(+reason)|cancelled`, `accepted→active`,
`active→completed`. `payment_status` hanya kolom (default `unpaid`),
tidak ada RPC pembayaran di MVP.

### Wishlist
`toggle_wishlist` (idempoten via unique `(user_id, listing_id)`) +
`get_wishlist`. Baca langsung tidak dipakai frontend (via RPC saja).

### Superadmin
Guard `requireSuperAdmin` membaca `users` sendiri (`role=SUPERADMIN &&
status=active`). Ajuan seller via 2 RPC di atas; audit via
`log_admin_action` + `list_audit_logs` → tabel `admin_audit_logs`
(RLS: superadmin-only, tulis via RPC SECDEF; IP/UA dari header server).

---

## 4. Dependensi schema legacy di kode

Hasil grep menyeluruh (`buyer_id`, `owner_id`, `stock`, `price`, `subtotal`,
`is_seller`):

| Simbol legacy | Dipakai kode aplikasi? | Kesimpulan |
|---|---|---|
| `rental_transactions.buyer_id` | ❌ Tidak — semua lewat `tenant_id` (RPC memakai `OR buyer_id = auth.uid()` hanya sebagai jaring pengaman patch) | **Bisa dihapus** di schema baru |
| `stores.owner_id` | ❌ Hanya di `src/lib/storage.js` (fallback demo LocalStorage, bukan DB) | **Bisa dihapus** |
| `stores.name` (non-`store_name`) | ❌ Frontend membaca `name` **dari hasil RPC** `get_my_stores` (alias), bukan kolom DB | **Tidak perlu** — kolom `store_name` + alias `name` di RPC |
| `listings.price` | ❌ Frontend memakai `price_per_day` (`mapListing`) | **Bisa dihapus** |
| `listings.stock` | ❌ Tidak pernah dibaca/tulis UI. Patch compat sendiri mendokumentasikan bahwa `stock` bukan penghitung unit | **Bisa dihapus** |
| `rental_transactions.subtotal/total` | ✅ Dipakai (dikirim RPC, ditampilkan) | **Dipertahankan** — snapshot harga saat booking |
| `users.is_seller` | ❌ Tidak dibaca (frontend pakai `seller_profile`) | Bisa dihapus |
| `users.phone` | ❌ Tidak dibaca UI | Opsional — bisa dipertahankan untuk masa depan atau dihapus |
| `listings.status` | ✅ Dicek RPC `rental_quote` (`<> 'active'`) | **Dipertahankan** |
| `stores.username`, `stores.contact`, `stores.address` | `username` ❌ (RPC lama saja), `contact` ✅ (RPC decide), `address` ✅ | `username` bisa dihapus; `contact`/`address` dipertahankan |
| `listings.tags` | ❌ Tidak dibaca frontend (search client memakai nama/deskripsi/kategori) | Bisa dihapus (atau dipertahankan bila ingin search server nanti) |
| `payment_records` | ❌ Tidak pernah ditulis/dibaca UI | **Drop dari MVP** — kolom `payment_status` di rentals sudah cukup; bila ledger manual ingin dipertahankan, buat sebagai migration opsional terpisah |

---

## 5. Temuan penting lain

1. **Tipe ID bervariasi antar tabel** — `listings.id` bigserial (bigint),
   `stores.id`/`users.id`/`rental_transactions.id` uuid. Kontrak frontend
   sudah cocok dengan ini (`Number(itemId)`, `Number(listingId)`).
   Schema baru harus mempertahankan tipe ini agar frontend tidak berubah.
2. **RLS `users` read-own** diperlukan oleh `requireSuperAdmin` dan
   `fetchProfile` — tanpa itu semua login gagal.
3. **Grants anon**: katalog (`stores`, `listings`) harus terbaca `anon`
   (browse tanpa login), tapi `rental_quote` juga di-grant ke `anon`
   (dipakai `ProductDetail` sebelum login; `create_rental` sendiri
   menolak anon dengan `unauthenticated`).
4. **Seed demo** (`stores`+`listings`) berguna agar project baru langsung
   bisa diuji — migrasi lama pun menyertakannya. Rekomendasi: pertahankan
   sebagai bagian opsional baseline.
5. **Toko bisa non-aktif**: `stores.status` membedakan `active` — RPC seller
   (`get_my_store`, `save_listing`, dst.) harus fail-closed ke toko aktif.
6. **`updated_at`** dipakai kontrak rental (`normalizeRental`) → trigger
   `touch_updated_at` perlu ada.
7. **Keamanan**: tidak ada service_role key di repo (`.env*` di-gitignore,
   `.env.example` hanya berisi var publik) ✅.

---

## 6. Kesimpulan audit

* Kontrak frontend sudah **stabil dan konsisten** (semua tulisan via RPC,
  pembacaan lewat RLS).
* Schema legacy + patch sinkronisasi adalah **satu-satunya** sumber
  ketidakcocokan. Membangun project baru dari baseline bersih akan
  menghapus seluruh kelas masalah tersebut tanpa mengubah satu baris pun
  lapisan data frontend (kecuali 1 perbaikan kecil lihat laporan desain).
* Daftar objek DB final yang wajib ada: 6 tabel, 1 enum, ~19 RPC,
  trigger auth + updated_at, exclusion constraint, RLS + grants.
  Rinciannya di `docs/db-rebuild/02-DESAIN.md`.
