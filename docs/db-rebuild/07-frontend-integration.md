# JabSewa — Phase 6: Frontend & Backend Integration Contract

> Semua kontrak mengikuti `04-rpc-security-contract.md`. Dokumen ini memetakan
> perubahan yang diperlukan di frontend dan status pelaksanaannya.
> Prinsip: **tidak ada fallback otomatis ke LocalStorage** saat Supabase gagal
> (aturan §11); mode demo (bila dibutuhkan) harus eksplisit terpisah.

---

## 1. Peta integrasi per service

| Service | Kontrak lama | Kontrak baru | Status |
|---|---|---|---|
| `src/lib/supabaseClient.js` | env `VITE_SUPABASE_*`, `isSupabaseConfigured` | Tetap; **tanpa fallback demo** — pemanggil menampilkan error konfigurasi | ✅ Tidak berubah |
| `src/lib/roles.js` | `TENANT / STORE_OWNER / SUPERADMIN` | `CONSUMER / ADMIN` (D1); helper `hasActiveStore` via profil | 🔄 Diubah |
| `src/lib/constants.js` | `RENTAL_STATUS` 6 nilai; `CATEGORIES` hardcode | `TRANSACTION_STATUS` 8 nilai + label; `PAYMENT_METHODS`; kategori dari DB | 🔄 Diubah |
| `src/lib/userData.js` | 7 RPC lama (wishlist/rental single-item) | `get_wishlist`, `toggle_wishlist`, `quote_rental`, `create_rental` (cart multi-item), `cancel_rental`, `submit_payment`, read rentals (direct SELECT via RLS) | 🔄 Ditulis ulang |
| `src/lib/listings.js` | direct read `price_per_day`, `image_url`, `stores(store_name)`; seller RPC lama | direct read kolom ERD (`price`, `listing_images`, `stores(name, owner_id)`); seller RPC `save_listing` baru | 🔄 Ditulis ulang |
| `src/lib/superadmin.js` | guard SUPERADMIN; RPC lama | guard `ADMIN`; `list_store_applications`, `decide_store_application`, `admin_*`, `list_audit_logs` baru | 🔄 Ditulis ulang |
| `src/auth/AuthContext.jsx` | profil users + `seller_application` jsonb | profil users; ajuan via `store_applications` (`get_my_applications`); `hasSellerAccess` = `user.is_seller` (cache server) | 🔄 Diubah |
| `src/pages/SellerPage.jsx` | `rpc('get_my_stores')` → `store.name` | RPC sama, kolom baru (`owner_id`, `name` langsung) | 🔄 Diubah (sedikit) |
| `src/pages/SellerOnboardingPage.jsx` | submit ajuan jsonb | `submit_store_application`; status screen baca `get_my_applications` | 🔄 Diubah |
| `src/components/Seller/*` | status 6 nilai; single listing form | status 8 nilai + aksi baru (payment verify, ongoing/return, late fee); form listing (kategori, stok, rental_unit, multi-gambar) | 🔄 Diubah |
| `src/components/Consumer/*` | `Number(itemId)`, `price` = price_per_day, `image` tunggal | id **string uuid**; `price` = price (per rental_unit); `image` = gambar sort_order 1; cart multi-item per toko | 🔄 Diubah |
| `src/pages/BuyerPage.jsx` | daftar rental + cancel | daftar rental + cancel + bayar (kirim bukti) + review setelah completed | 🔄 Diubah |
| `src/superadmin/*` | guard + tabel applications/audit lama | admin guard + shape RPC baru | 🔄 Diubah |
| `src/lib/storage.js` | fallback demo LocalStorage (aktif otomatis) | **Dihapus dari jalur produksi** — lihat §3 | 🔄 Diubah |
| `src/lib/rentalLogic.test.js` | mirror logika lama | mirror kontrak baru (durasi inclusive, pricing §8, transisi §5.2) | 🔄 Diubah |

## 2. Perubahan lintas-kontrak yang wajib diperhatikan

1. **ID sebagai string uuid** — semua perbandingan `Number(id)` / `parseInt` dihapus;
   `initialItemId`, wishlist ids, dsb. dibandingkan sebagai string.
2. **Status rental 8 nilai** — badge/label/aksi UI memakai
   `TRANSACTION_STATUS_META` baru; alur aksi buyer: submit bukti → payment_verify →
   (confirmed) → (ongoing) → completed → review.
3. **Cart per toko** — `create_rental` menolak item lintas toko (`mixed_stores`);
   UI cart memisahkan item per store dan membuat satu transaksi per toko.
4. **Harga per `rental_unit`** — UI menampilkan "Rp X / hari|minggu|bulan".
5. **Error codes** — `RENTAL_ERROR_MESSAGES` diganti dengan registry baru:
   `unauthenticated, user_inactive, forbidden, not_found, illegal_transition,
   mixed_stores, duplicate_item, too_many_items, invalid_quantity, insufficient_stock,
   min_duration, start_date_in_past, invalid_date_range, empty_items, invalid_items,
   listing_not_found, listing_unavailable, store_inactive, proof_required,
   reason_required, payment_not_pending, payment_not_found, already_seller,
   application_pending, application_not_pending, application_not_found,
   self_review_forbidden, rejection_reason_required, category_not_found,
   name_required, invalid_amount, invalid_stock, invalid_min_duration,
   no_active_store, not_found_or_forbidden, admin_only_status, has_rentals,
   dispute_exists, dispute_closed, invalid_outcome, resolution_required,
   rental_not_completed, invalid_rating, already_reviewed, not_late, invalid_rate,
   invalid_decision, self_action_forbidden, store_name_required`.
6. **Multi-gambar** — form seller mengirim `p_image_urls text[]`; detail barang
   menampilkan galeri (gambar pertama = sort_order 1).

## 3. Mode demo / LocalStorage

- Fallback otomatis dihapus: bila `VITE_SUPABASE_*` tidak diset, service melempar
  error konfigurasi yang jelas; UI menampilkan pesan setup, bukan data demo diam-diam.
- `src/lib/storage.js` dan akun mock (termasuk password plaintext mock) dikeluarkan
  dari jalur produksi (lihat `10-cleanup-log.md`).
- Bila nanti mode demo dibutuhkan, buat entry point terpisah (mis. `?demo=1` eksplisit)
  yang tidak pernah aktif di build produksi — dicatat sebagai usulan, bukan bagian MVP.

## 4. Environment

```
VITE_SUPABASE_URL=<url project BARU>
VITE_SUPABASE_ANON_KEY=<anon/publishable key project baru>
```
- Tidak ada variabel lain yang dibaca frontend. Service role key / DATABASE_URL
  hanya untuk tooling server-side lokal (tidak pernah di bundle).
- Cara memastikan mengarah ke project benar: cek `VITE_SUPABASE_URL` di `.env.local`,
  bandingkan dengan dashboard project baru; `npm run verify:supabase` mencetak URL.

## 5. Status pelaksanaan

- [x] Kontrak baru terdokumentasi (04-rpc-security-contract.md).
- [x] Service layer baru ditulis (`userData.js`, `listings.js`, `superadmin.js`,
      `roles.js`, `constants.js`, `AuthContext`) — sesuai kontrak 30 RPC.
- [x] Komponen halaman diselaraskan (Seller, Consumer, Buyer, Onboarding, SysControl):
      id uuid string, status 8 nilai, `get_my_stores` → kolom `name`/`owner_id`,
      ajuan via `store_applications` (store_name/description/address), admin guard
      role `admin`, review + dispute di Buyer Dashboard, filter kategori dari DB.
- [x] Fallback LocalStorage dihapus dari jalur produksi — `src/lib/storage.js`
      DIHAPUS; sisa LocalStorage hanya sesi auth (supabase-js) + wishlist tamu
      (preferensi UX, terdokumentasi di 10-cleanup-log.md §3).
- [x] Audit admin kini server-side (RPC menulis `audit_logs` via `log_audit`);
      `logAdminAction()` client-side dihapus.
- [x] Unit test `rentalLogic.test.js` ditulis ulang: durasi inclusive, pricing
      per rental_unit (ceil), ketersediaan multi-unit, transisi 8 status (30 test).
- [x] `npm run build`, `npm run lint`, `npm test` — PASS.
- [ ] Uji end-to-end terhadap project Supabase baru — **NOT VERIFIED** (menunggu
      eksekusi baseline + bootstrap admin; lihat 06-migration-plan.md §5).

### Catatan deviasi kecil dari kontrak 04 (terdokumentasi)

1. `decide_payment` reject → transaksi kembali `pending` (bukan `cancelled`)
   agar buyer bisa mengirim bukti ulang (PRD §6: "buyer boleh membuat payment
   baru"); pembatalan tetap tersedia via `cancel_rental` di `payment_verify`.
2. Bacaan katalog seller (`fetchMyStoreListings`) memakai direct SELECT
   RLS-scoped alih-alih RPC `my_store_listings` — pola §3.3 "baca katalog =
   direct SELECT dengan RLS"; RPC helper tetap ada di baseline.
3. Ajuan toko tidak lagi mengumpulkan `contact`/`city` terpisah — kolom kontrak
   §4.3 hanya store_name/description/address (+logo_url); kota digabung ke
   address, kontak applicant = email akun.
