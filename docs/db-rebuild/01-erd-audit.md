# JabSewa — Phase 1: ERD & Repository Audit

> **Sumber desain:** ERD tekstual 13 tabel dalam master prompt (representasi resmi ERD Hakan).
> **Objek audit:** seluruh `src/` (57 file), `supabase/migrations/` (3 file legacy), `scripts/`, `.env*`, `package.json`, dokumen `db-rebuild` sebelumnya.
> **Status: READ-ONLY terhadap database & implementasi.** Tidak ada SQL dijalankan, tidak ada kode diubah pada tahap ini.
> Tanggal: 2026-09-26.

---

## 1. Ringkasan kondisi repository saat ini

### 1.1 Migration legacy (3 file, bertumpuk — semuanya digantikan baseline baru)

| File | Isi ringkas | Masalah |
|---|---|---|
| `20260921000002_full_reset_idempotent.sql` | users/stores/listings + enum TENANT/STORE_OWNER/SUPERADMIN + RPC audit + `search_hybrid` + seed demo inline | Seed di dalam schema migration; sanitasi tipe kolom `$fix_role_type$`; RPC yang tidak dipakai frontend |
| `20260924000000_rentals_wishlists_rls_rpcs.sql` | rental_transactions/wishlists/payment_records + RLS + RPC rental | Gagal jalan utuh di DB legacy (42703); kontrak berbeda dari versi compat |
| `20260925000000_legacy_schema_compat.sql` | Patch kompatibilitas 1.469 baris | **Trigger sinkron dua arah** `name↔store_name`, `owner_id↔user_id`, `price↔price_per_day`, `stock↔available`, `buyer_id↔tenant_id`; semua RPC didefinisikan ulang dengan guard/return berbeda |

Setiap RPC inti ada dua versi (migration #2 dan #3) — perilaku produksi bergantung urutan eksekusi. Ini akar masalah yang dijawab oleh clean rebuild.

### 1.2 Model lama vs ERD baru — perubahan fundamental

| Aspek | Implementasi lama | ERD baru | Dampak |
|---|---|---|---|
| Tabel | 6–7 (`users, stores, listings, rental_transactions, wishlists, admin_audit_logs, payment_records`) | **13 + 1 opsional** (tambah `store_applications, categories, listing_images, transaction_items, payments, late_fees, disputes, reviews`; `audit_logs` menggantikan `admin_audit_logs`) | Baseline baru total |
| Role | `TENANT / STORE_OWNER / SUPERADMIN` | **`consumer / admin`** + `is_seller` cache | ✅ Keputusan D1 — migrasi role di frontend |
| Ajuan toko | jsonb di `users.seller_application` | **Tabel `store_applications`** dengan lifecycle + `reviewed_by` | ✅ ERD; hapus jsonb |
| Rental | 1 transaksi = 1 listing (`listing_id` langsung) | **1 transaksi = N `transaction_items`** | ✅ ERD; RPC `create_rental` didesain ulang (multi-item) |
| Status rental | `pending, accepted, rejected, active, completed, cancelled` | **`pending, payment_verify, confirmed, ongoing, overdue, completed, cancelled, disputed`** | ✅ ERD; state machine baru |
| Pembayaran | kolom `payment_status` + tabel `payment_records` tak terpakai | **Tabel `payments`** dengan bukti + verifikasi | ✅ ERD; drop `payment_records` |
| Kategori | teks bebas `photography|gadget|sports|event` | **Tabel `categories`** dengan FK | ✅ ERD; seed kategori dev |
| Gambar | `listings.image_url` tunggal | **Tabel `listing_images`** (multi, `sort_order`) | ✅ ERD; frontend perlu penyesuaian |
| Uang | integer IDR | ERD `decimal(12,2)` → ✅ Keputusan D2: **integer IDR** | Deviasi terdokumentasi |
| ID | `listings.id` bigint, lainnya uuid | ERD uuid semua → ✅ Keputusan D3: **uuid semua** | Deviasi terdokumentasi; frontend `Number(id)` harus diganti perbandingan string |
| Deposit | kolom `deposit` + masuk total | ERD tidak punya → ✅ Keputusan D4: **tambah deposit** (listing + snapshot item) | Deviasi terdokumentasi |
| Wishlist | `wishlists` + RPC | `wishlists` di ERD (bagian OPTIONAL) | ✅ Keputusan D2s (di luar sesi): dipertahankan — frontend aktif memakainya |
| Stok | boolean `available` + `stock` legacy | **`stock integer`** + ketersediaan per-periode dihitung | ✅ ERD; model inventori multi-unit |
| Audit | `admin_audit_logs` (admin_id, action text bebas) | **`audit_logs`** (`actor_id`, `action_type`, `entity_type`, `entity_id uuid`, `metadata jsonb`) | ✅ ERD; nilai enum via CHECK registry (D6) |

### 1.3 Status 13 tabel ERD terhadap kebutuhan bisnis

| Tabel | Ada di kode lama? | Keputusan | Catatan |
|---|---|---|---|
| `users` | ✅ | Masuk | enum role diganti; `is_seller` jadi cache (D1); `avatar_url` baru |
| `store_applications` | ❌ (jsonb di users) | Masuk | Replaces `users.seller_application`; histori ajuan tersimpan per baris |
| `stores` | ✅ | Masuk | `name/description/address` tanpa mirror; `rental_unit` + `min_rental_duration` baru |
| `categories` | ❌ | Masuk | Seed 4 kategori dev; FK dari listings |
| `listings` | ✅ | Masuk | `price` decimal→integer, `stock` integer serius, `rental_unit`, multi-status |
| `listing_images` | ❌ (image_url tunggal) | Masuk | Frontend perlu mapping `image` = gambar `sort_order` pertama |
| `rental_transactions` | ✅ | Masuk | Multi-item; `listing_id` pindah ke `transaction_items`; enum status baru |
| `transaction_items` | ❌ | Masuk | Snapshot `price` + `subtotal` per item |
| `payments` | ❌ (`payment_records` tak terpakai) | Masuk | Bukti transfer + verifikasi manual; tanpa gateway |
| `late_fees` | ❌ | Masuk | Di Override ERD disebut `late_fees` — nama final konsisten |
| `disputes` | ❌ | Masuk | Lifecycle sendiri; tidak mengubah rental otomatis |
| `reviews` | ❌ | Masuk | 1 review per transaksi; hanya buyer, hanya completed |
| `audit_logs` | ✅ (`admin_audit_logs`) | Masuk (rename) | `action_type`/`entity_type` = text + CHECK registry (D6) |
| `wishlists` | ✅ | Masuk | ERD menandai opsional; frontend aktif → dipertahankan |

**Semua 13 tabel + `wishlists` dipertahankan; tidak ada yang dihapus atau digabung.**

---

## 2. Conflict Register

| ID | Konflik | Dampak | Solusi yang diusulkan | Status |
|---|---|---|---|---|
| C-01 | ERD punya `store_applications` (tabel), kode menyimpan ajuan di jsonb `users.seller_application` | Dua sumber status approval; histori tidak bisa di-query | Ganti total ke tabel `store_applications`; hapus kolom jsonb | ✅ Resolved (baseline) |
| C-02 | ERD role `consumer/admin` vs kode `TENANT/STORE_OWNER/SUPERADMIN` | Seluruh guard frontend & RPC perlu diganti | D1: pakai ERD; "seller" = punya store aktif; `is_seller` cache di-maintain trigger/RPC; frontend diganti di Phase 6 | ✅ Resolved |
| C-03 | ERD rental 1-transaksi-1-listing (implisit) vs kebutuhan multi-item via `transaction_items` | Struktur harga & availability berubah | Baseline multi-item; `subtotal` transaksi = Σ subtotal item; satuan harga di item | ✅ Resolved |
| C-04 | Status rental ERD (8 nilai, flow pembayaran) vs kode lama (6 nilai, tanpa pembayaran) | State machine + UI badge + RPC transisi semua baru | Baseline pakai enum ERD; matriks transisi di 02-final-prd.md | ✅ Resolved |
| C-05 | ERD `payments.paid_at` "Required" vs pembayaran pending belum punya waktu bayar | Constraint mustahil untuk status pending | `paid_at` nullable, divalidasi di RPC (wajib saat status → `paid`) | ✅ Resolved (deviasi terdokumentasi) |
| C-06 | ERD tidak punya deposit; flow berjalan wajib deposit | Total & pembayaran berbeda dari ERD | D4: tambah `listings.deposit`, snapshot `transaction_items.deposit`, `rental_transactions.deposit_total`; total = subtotal + deposit_total | ✅ Resolved (deviasi terdokumentasi) |
| C-07 | ERD uang `decimal(12,2)` vs IDR tanpa sen + frontend `Number()` | Bug floating point bila decimal dipakai mentah | D2: integer IDR semua kolom uang (bigint) | ✅ Resolved (deviasi terdokumentasi) |
| C-08 | ERD ID uuid vs `listings.id` bigint lama + frontend `Number(itemId)` | Perbandingan ID rusak bila uuid | D3: uuid semua; frontend bandingkan sebagai string | ✅ Resolved (deviasi terdokumentasi) |
| C-09 | ERD `stores.owner_id` vs kode lama `user_id` (+ mirror legacy `owner_id`) | Duplikasi kolom pemilik | Satu kolom `owner_id` sesuai ERD; frontend service di-update (bukan menambah alias) | ✅ Resolved |
| C-10 | ERD `listings.price` vs kode lama `price_per_day` | Dua nama untuk harga harian | Satu kolom `price` (ERD) dengan satuan `rental_unit`; frontend mapping eksplisit | ✅ Resolved |
| C-11 | ERD `stores.rental_unit` vs `listings.rental_unit` — mana yang mengikat? | Ambiguitas satuan sewa | Listing wajib punya sendiri; store = default saat create listing; perbedaan perbolehkan dengan validasi `min_rental_duration` per listing. Detail di PRD | ✅ Resolved (aturan di PRD) |
| C-12 | `action_type`/`entity_type` tanpa daftar nilai di ERD | Audit tidak bisa dikunci | D6: text + CHECK registry terdokumentasi; menambah nilai = ubah CHECK di migration baru | ✅ Resolved |
| C-13 | Frontend memanggil 17 RPC dengan kontrak lama (shape/param/status) | Semua service layer perlu penulisan ulang | Kontrak RPC baru di 04-rpc-security-contract.md; frontend di-update Phase 6 | 🔄 Akan dikerjakan |
| C-14 | `search_hybrid` & `list_admin_audit_logs` ada di DB tapi tak dipakai frontend | Dead objects | Tidak dibawa ke baseline | ✅ Resolved |
| C-15 | Fallback LocalStorage otomatis (`storage.js`) saat env tidak diset | Melanggar aturan master prompt §11 | Dihapus: tanpa env → error jelas, bukan demo diam-diam (mode demo eksplisit dipisah bila nanti dibutuhkan) | 🔄 Akan dikerjakan (Phase 6) |
| C-16 | Wishlist tamu di localStorage (`jabsewa:wishlist:guest`) tidak pernah dimigrasi ke DB saat login | Data tamu hilang | UX tamu tetap boleh (bukan DB contract); saat login wishlist dimuat dari DB; merge tamu→DB ditandai NOT VERIFIED untuk MVP (opsional) | ✅ Resolved (didokumentasikan) |
| C-17 | ERD `categories` tanpa kolom status/is_active | Perilaku listing saat kategori dihapus tidak jelas | FK RESTRICT + kategori tidak dihapus (hanya dinonaktifkan di aplikasi); tanpa kolom tambahan di MVP | ✅ Resolved (aturan di PRD) |
| C-18 | `reviews.store_id` redundan (bisa via transaction) | Denormalisasi | Dipertahankan sesuai ERD (query per-toko); konsistensi dijaga RPC (store_id harus = transaksi) | ✅ Resolved |
| C-19 | ERD `late_fees` tidak punya kolom `daily_rate` policy sumber | Dihitung dari mana? | `daily_rate` = rate disetujui saat penilaian (input admin/owner, disimpan sebagai snapshot); PRD menetapkan default | 🔄 Perlu keputusan D5 di PRD |
| C-20 | ERD `payments` satu-baris-per-rental vs pencicilan/multi-payment | Refund & partial payment ambigu | Satu rental ≥1 payment; refund = payment baru dengan status `refunded` referencing amount asli via `external_reference`/metadata; tidak ada partial di MVP | ✅ Resolved (aturan di PRD) |
| C-21 | ERD `transaction_items` tidak menyebut store constraint | Item lintas toko dalam 1 transaksi? | Dilarang: semua item wajib satu store = `rental_transactions.store_id` (dicek RPC) | ✅ Resolved |
| C-22 | `users.email` varchar(255) vs `auth.users.email` | Sumber kebenaran email | email di-copy trigger dari auth.users (bukan ditulis client); unique | ✅ Resolved |
| C-23 | ERD `stores.status` suspended vs approval baru mengaktifkan toko non-aktif (perilaku lama) | Approval mengubah status toko yang sengaja dimatikan | Aturan baru: approval hanya membuat/mengaktifkan toko saat pertama; toko `suspended`/`inactive` TIDAK otomatis aktif oleh approval | ✅ Resolved (aturan di PRD) |

---

## 3. Keputusan bisnis yang sudah dikonfirmasi Hakan (26 Sep 2026)

| ID | Keputusan | Pilihan |
|---|---|---|
| D1 | Model role | **ERD penuh: `consumer` + `admin`**; seller = pemilik store aktif; `is_seller` cache |
| D2 | Tipe uang | **Integer IDR** (bigint) untuk semua kolom uang — deviasi dari `decimal(12,2)` ERD |
| D3 | Tipe ID | **UUID di semua tabel** termasuk `listings` — deviasi dari bigserial lama |
| D4 | Deposit | **Ditambahkan**: kolom `listings.deposit`, snapshot di `transaction_items.deposit`, agregat `rental_transactions.deposit_total` — deviasi terdokumentasi dari ERD |
| D5 | Verifikator pembayaran | **Store owner + admin** berhak memverifikasi bukti pembayaran tokonya; admin dapat override |
| D6 | Enum audit | **`action_type` & `entity_type` = text + CHECK registry** (bukan PostgreSQL ENUM) |

## 4. Open questions tersisa (tidak memblokir desain, ditetapkan di PRD dengan default)

| ID | Pertanyaan | Default yang diusulkan |
|---|---|---|
| OQ-1 | Periode larangan pembatalan (sebelum `confirmed` saja, atau sampai ongoing?) | Tenant boleh cancel saat `pending`/`payment_verify`; owner boleh cancel saat `pending`–`confirmed`; setelah `ongoing` hanya lewat dispute |
| OQ-2 | Sumber `late_fees.daily_rate` | Rate disetujui admin/owner saat penilaian; snapshot disimpan; default usulan = 10% harga harian item per hari keterlambatan (contoh, bukan kebijakan final) |
| OQ-3 | Apakah `start_date` boleh di masa lalu? | Tidak — harus `>= CURRENT_DATE` (mewarisi aturan terverifikasi lama) |
| OQ-4 | Moderasi review | Tanpa moderasi di MVP; admin bisa suspend listing/toko, bukan hapus review |
| OQ-5 | Batas jumlah item & quantity per transaksi | Maks 20 baris item per transaksi (guard sanitas RPC) |

Keputusan-keputusan ini akan dituliskan eksplisit di `02-final-prd.md`; bila Hakan mengubahnya, hanya PRD dan bagian terkait RPC/SQL yang perlu direvisi — struktur tabel tidak terpengaruh.

## 5. Jejak dependency frontend yang harus mengikuti kontrak baru (input Phase 6)

- `src/lib/userData.js` — 7 RPC lama (get_wishlist, toggle_wishlist, get_rentals_for_user, get_rentals_for_store, create_rental, set_rental_status, rental_quote) → semua diganti kontrak baru (cart/multi-item, status baru).
- `src/lib/listings.js` — direct read `listings` + `stores` (`store_name`, `price_per_day`, `image_url`) → kolom ERD (`name`, `price`, `listing_images`), `stores.owner_id`.
- `src/lib/superadmin.js` + `src/superadmin/*` — guard role `SUPERADMIN` → `admin`; RPC applications/audit baru.
- `src/auth/AuthContext.jsx` — profil `users` (role/status/seller_application jsonb) → `users` baru + `store_applications`.
- `src/pages/SellerPage.jsx` — `rpc('get_my_stores')` → kontrak baru (owner_id, tanpa alias legacy).
- `src/pages/SellerOnboardingPage.jsx` — submit ajuan → RPC `store_applications`.
- `src/components/Consumer/*` — `Number(itemId)`, field `price`, `image`, `seller` → mapping uuid-string + kolom ERD.
- `src/lib/constants.js` — `RENTAL_STATUS` (6 nilai) → 8 nilai ERD; `CATEGORIES` → dari tabel `categories`.
- `src/lib/roles.js` — konstanta TENANT/STORE_OWNER/SUPERADMIN → `CONSUMER`/`ADMIN`.
- `src/lib/storage.js` — fallback demo → dipisah/dihapus dari jalur produksi.

## 6. Yang tidak dapat diverifikasi pada tahap ini

1. State live project Supabase aktif (butuh akses dashboard — di luar lingkup agent).
2. Hasil `npm run verify:supabase` terhadap project aktif (butuh env live).
3. Kualitas data aktual di project lama (tidak relevan untuk clean rebuild, dicatat untuk arsip).

## 7. Kesimpulan

- ERD 13 tabel **feasible** dan menggantikan total model lama; tidak ada entitas yang perlu digabung/dihapus. Tiga deviasi terkontrol (uang integer, deposit, uuid listings↔uuid) sudah disetujui dan terdokumentasi.
- Sumber konflik terbesar bukan struktur, melainkan **kontrak RPC & frontend** — seluruh service layer perlu diselaraskan di Phase 6.
- Migration legacy (3 file) tidak dipakai sebagai dasar apa pun; arsip + cleanup di Phase 7.
