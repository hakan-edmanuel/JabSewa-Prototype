# JabSewa — Tahap 16: Frontend Rental Integration (Audit & Mapping)

> **Tanggal:** 28 September 2026 · **Basis:** hasil E2E Rental Lifecycle (`15-rental-lifecycle-report.md`)
> dan fix BUG-1 (`14-create-rental-fix-report.md`) pada project Supabase `yjwlqqigbzvjbvpwybup`.
> **Prinsip:** frontend tidak pernah menghitung harga/total/status; semua tulisan data bisnis
> hanya via RPC (04-rpc-security-contract.md). **Tidak ada perubahan schema/RPC/RLS/grants/migration.**

---

## 1. Peta halaman & komponen

| Area | File | Peran |
|---|---|---|
| Buyer | `src/pages/BuyerPage.jsx` | Riwayat rental, kirim bukti, cancel, dispute, review |
| Marketplace | `src/pages/ConsumerPage.jsx` + `src/components/Consumer/ProductDetail.jsx` | Quote server-side + `create_rental` |
| Katalog/search | `src/components/Consumer/ConsumerBrowser.jsx`, `src/lib/search.js` | Pencarian client-side atas katalog Supabase |
| Seller | `src/pages/SellerPage.jsx`, `components/Seller/{SellerDashboard,SellerOrders,SellerItems,SellerStoreInfo}.jsx` | Verifikasi pembayaran, mulai/kembali/denda, katalog |
| Admin | `src/superadmin/*`, `src/lib/superadmin.js` | Ajuan toko, audit log (**belum ada modul rental**) |
| Data layer | `src/lib/{userData,listings,superadmin,search,constants,roles,format}.js` | Service Supabase |

## 2. Pemetaan aksi UI → RPC

| Aksi UI | RPC | Status sebelum tahap ini |
|---|---|---|
| Quote harga di detail barang | `quote_rental` | ✅ terintegrasi |
| Buat rental (detail barang) | `create_rental` | ✅ terintegrasi (qty fix 1) |
| Batalkan rental (buyer/seller) | `cancel_rental` | ✅ (buyer tanpa alasan — sah, seller dengan alasan) |
| Kirim bukti pembayaran | `submit_payment` | ✅ terintegrasi (input URL manual) |
| Verifikasi bukti (seller) | `decide_payment` | ✅ tapi **butuh klik "Muat bukti" manual** (UX) |
| Mulai sewa / kembalikan | `start_rental` / `record_return` | ✅ terintegrasi |
| Tandai terlambat / nilai denda | `mark_overdue` / `apply_late_fee` | ✅ terintegrasi (seller) |
| Putuskan denda (paid/waived) | `decide_late_fee` | ❌ **tidak ada pemanggil** |
| Buka sengketa / selesaikan | `open_dispute` / `resolve_dispute` | ⚠️ open ✅ (buyer), **resolve ❌ tidak ada UI** (admin-only di DB) |
| Review transaksi | `create_review` | ✅ terintegrasi |
| Riwayat rental buyer/seller | direct SELECT (RLS) | ✅ terintegrasi |
| Wishlist | `get_wishlist` / `toggle_wishlist` | ✅ terintegrasi |
| Ajuan toko (buyer & admin) | `submit/get/list/decide_store_application` | ✅ terintegrasi |
| Audit log (admin) | `list_audit_logs` | ✅ (kolom `metadata` tidak diteruskan service → kolom "Detail" selalu kosong) |

## 3. Temuan audit

### 3.1 Mock / LocalStorage / logic lama
1. **TIDAK ADA** mock data pengganti data live di jalur rental — `storage.js` sudah dihapus
   (`10-cleanup-log.md`). Sisa localStorage sah: sesi auth supabase-js (`jabsewa:auth:v1`) dan
   wishlist tamu di `ConsumerBrowser` (UX, terdokumentasi).
2. Komentar/text usang yang menyesatkan (dibersihkan):
   - `main.jsx` — "tanpa env, katalog memakai fallback demo lokal" (tidak benar; listings melempar error).
   - `SellerDashboard.jsx` — "Data demo ditampilkan dari katalog umum" saat toko belum terhubung.
   - `SysDashboard.jsx` — "audit_logs (LocalStorage — mode mock/offline)" (kini RPC server-side).
   - `SysControlApp.jsx` — header "MODE MOCK / OFFLINE".
3. `SellerDashboard.jsx` memanggil `fetchListingsByStore(store.id)` dengan argumen padahal fungsinya
   ignore argumen (menyiratkan scope per-parameter yang tidak ada) — diselaraskan.
4. Dead code `firstName`/`firstName2` + `void` di `userData.js` (sisa refactor) — dihapus.

### 3.2 Status, role, error, loading/empty state
- 8 status `TRANSACTION_STATUS_META` dipakai Buyer & Seller — konsisten dengan enum DB. ✅
- Role: seller = kepemilikan store (bukan role), admin guard via `requireSuperAdmin` server-side. ✅
- Error codes diterjemahkan penuh (`SERVER_ERROR_MESSAGES`). ✅
- Loading/empty/error state ada di semua list utama. ✅

### 3.3 Gap fungsional (akar masalah integrasi)
1. **`decide_late_fee` tidak pernah dipanggil** — denda tercatat tapi statusnya selamanya `unpaid`;
   owner tidak bisa menandai lunas, admin tidak bisa waived. Service & UI ditambahkan.
2. **`resolve_dispute` tidak punya jalur UI** — dispute masuk tidak bisa diproses siapa pun dari
   frontend; buyer tidak punya cara melihat dispute-nya (baca `disputes` via RLS).
3. **Buyer melihat tombol "Beri ulasan" permanen** pada rental completed meski sudah review
   (server menolak `already_reviewed` setelahnya). Solusi: baca `reviews` (RLS-scoped) → sembunyikan.
4. **Alasan penolakan pembayaran tidak sampai ke buyer** — reject mengembalikan tx ke `pending`
   (bukan `cancelled` — CATATAN-K), jadi `cancel_reason` kosong; buyer hanya melihat "Menunggu
   Pembayaran" tanpa penjelasan. Solusi: buyer membaca payment `failed` terakhir
   (RLS mengizinkan `payments_select` untuk buyer) + panel info.
5. **Admin tidak punya modul transaksi** — verifikasi pembayaran (D5: owner **atau admin**) dan
   resolusi dispute (admin-only) hanya bisa lewat seller dashboard. Ditambahkan halaman SysOrders.
6. **`quote_rental` / `create_rental` selalu qty 1** — kontrak menerima `[{listing_id, quantity}]`;
   ditambahkan quantity selector (stok dibatasi server: `insufficient_stock`).
7. `cancel_rental` buyer selalu kirim `reason=''` — kontrak: reason wajib hanya untuk owner;
   tetap dipertahankan (sah), seller wajib alasan.
8. `getPaymentsForRental` memilih kolom `paid_at` tanpa `external_reference` padahal SellerOrders
   menampilkannya — diselaraskan.
9. **`decide_payment` reject tanpa note** di SellerOrders (`"Bukti tidak valid"` hardcode) — kontrak
   mewajibkan note (`reason_required`). Kini admin & seller wajib mengisi alasan penolakan.
10. **Double-submit**: `create_rental` dilindungi `inFlight` ref + `submitting`; aksi seller pakai
    `busyId`; wishlist `wishBusyId`. Kontrak tanpa idempotency-key → pola ini dipertahankan &
    diterapkan pada semua aksi baru.
11. `SysDashboard` hanya menampilkan ajuan — ditambah statistik rental live dari DB (bukan mock).

## 4. Rencana implementasi (Tahap 2)

1. `userData.js`: `getLateFeeForRental`, `decideLateFee`, `getReviewsByUser`,
   `getPaymentsForRental` + `external_reference`, `getDisputesForBuyer`.
2. `SellerOrders.jsx`: auto-load bukti untuk status `payment_verify`; wajib alasan saat menolak;
   tombol "Tandai denda dibayar" (owner); info dispute/fee.
3. `BuyerPage.jsx`: sembunyikan review yang sudah ada; tampilkan info penolakan bukti (payment failed)
   & dispute aktif; tetap tanpa asumsi tx cancelled.
4. Admin (`superadmin.js` + `SysOrders.jsx` + menu): verifikasi bukti (decide_payment), resolusi
   dispute (resolve_dispute), waived denda (decide_late_fee), daftar rental (RLS admin semua baris).
5. `ProductDetail.jsx`: quantity selector (1..stok) untuk quote & create.
6. Bersihkan komentar mock usang + dead code (tanpa perubahan perilaku).
7. Jalankan `npm run build`, `npm run lint`, `npm test`.

## 5. Batasan yang dipegang

- Tidak ada perubahan `supabase/migrations/*`, RPC, RLS, grants.
- Tidak ada mock data pengganti live; tidak ada dependency baru.
- UI hanya berubah dalam ruang lingkup integrasi rental.
- Double-submit dicegah di UI (busy-state per aksi).
- Tx TIDAK diasumsikan `cancelled` saat pembayaran ditolak (aktual: `pending`).
- Tanpa secret baru; tanpa commit/push otomatis.

---

## 6. Status implementasi (hasil Tahap 2 & 3)

**Build PASS · lint 0 error · test 42/42 PASS.** (E2E live per akun menyusul — lihat §7.)

| Perubahan | File | Status |
|---|---|---|
| `decideLateFee` + baca `late_fees` (RLS) | `src/lib/userData.js` | ✅ |
| `resolveDispute` (RPC `resolve_dispute`) | `src/lib/userData.js` | ✅ baru |
| `getActiveDisputes`, `getRentalsByStatuses`, `getAllRentals`, `getMyReviewedRentalIds` | `src/lib/userData.js` | ✅ baru |
| `getPaymentsForRental` + `external_reference` | `src/lib/userData.js` | ✅ diperbaiki |
| Auto-load bukti; alasan penolakan wajib; cancel saat `payment_verify`; tandai denda dibayar (owner) | `src/components/Seller/SellerOrders.jsx` | ✅ |
| Sembunyikan "Beri ulasan" bila sudah review; info penolakan bukti (payment failed) | `src/pages/BuyerPage.jsx` | ✅ |
| Quantity selector (1..stok) untuk quote & create | `src/components/Consumer/ProductDetail.jsx` | ✅ |
| Service rental admin + wrapper | `src/lib/superadmin.js` | ✅ |
| Halaman **Transaksi & Sengketa** admin (verifikasi, resolve dispute, denda paid/waived) | `src/superadmin/pages/SysOrders.jsx` | ✅ baru |
| Menu + route `/sys-control-jab/orders` | `SuperadminLayout.jsx`, `SysControlApp.jsx` | ✅ |
| Statistik rental live + aksi cepat ke Transaksi | `src/superadmin/pages/SysDashboard.jsx` | ✅ |
| `metadata` diteruskan ke SysAudit (kolom "Detail" kini terisi) | `src/lib/superadmin.js` | ✅ |
| Komentar/text mock usang dibersihkan (perilaku tak berubah) | `main.jsx`, `SellerDashboard`, `SysDashboard`, `SysControlApp`, `dev-switcher.css` | ✅ |
| Dead code `firstName`/`void` dihapus | `src/lib/userData.js` | ✅ |

### Endpoint terintegrasi penuh (frontend ↔ RPC live)

`quote_rental`, `create_rental`, `cancel_rental`, `submit_payment`, `decide_payment`
(seller **dan** admin), `start_rental`, `record_return`, `mark_overdue`, `apply_late_fee`,
`decide_late_fee` (owner paid / admin waived), `open_dispute`, `resolve_dispute` (admin),
`create_review`, wishlist, ajuan toko, `list_audit_logs`.

### Yang BELUM terintegrasi (di luar ruang lingkup rental)

- `update_my_store`, `set_my_store_status` — UI edit info toko seller belum ada (read-only).
- Storage upload foto (bukti pembayaran & listing masih input URL manual).
- Wishlist guest → merge saat login (preferensi lokal tidak dimigrasi ke server).

## 7. Blocker & catatan untuk pengujian live

1. **CATATAN-K (perilaku aktif, bukan blocker):** reject bukti → tx kembali `pending`.
   Frontend sudah mengikuti perilaku ini (bukan `cancelled`); owner tetap perlu memutuskan
   (a) perbarui kalimat kontrak §3.5 #20, atau (b) migration forward-only.
2. **CATATAN-O:** `resolve_dispute` outcome `rejected` tetap menutup tx → `completed`.
   UI admin menampilkan pilihan outcome apa adanya; konfirmasi ke owner kontrak.
3. **CATATAN-I:** `occupied_units` tidak menghitung `disputed` — listing ber-dispute masih
   bisa dibooking window sama (risiko UX, sesuai kontrak §4.5).
4. **Uji live yang disarankan** (akun buyer & seller terpisah, lalu admin):
   quote+create (qty > 1 & insufficient_stock) → submit bukti → reject oleh seller
   (alasan sampai ke buyer, tx tetap pending) → submit ulang → approve → start → return →
   review (tombol hilang setelah review) → dispute → resolve admin → late fee unpaid →
   paid/waived admin → verifikasi audit_logs untuk tiap aksi.
5. `.env.example` berisi URL + anon key project dev yang sudah terisi — pastikan kredensial
   produksi tidak mengikuti pola commit kredensial ini (anon key memang public-safe, tapi
   URL project dev tidak seharusnya jadi default template).
