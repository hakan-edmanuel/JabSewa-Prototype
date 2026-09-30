# JabSewa — Phase 2: Final PRD & Domain Contract

> Sumber: ERD tekstual 13 tabel (master prompt) + 6 keputusan terkonfirmasi Hakan
> (D1–D6, lihat `01-erd-audit.md` §3). Dokumen ini menetapkan perilaku bisnis final
> yang menjadi dasar schema (Phase 3), RPC (Phase 4), dan migration (Phase 5).
> Perubahan atas dokumen ini hanya lewat persetujuan Hakan.

---

## 1. Aktor & Permission

| Aktor | Definisi | Permission utama |
|---|---|---|
| **Anonymous** | Belum login | Browse katalog (listing toko `active`), lihat detail, lihat kategori; tidak ada tulisan |
| **Consumer** | Role `consumer`, punya akun aktif | Semua hak anonymous + wishlist, buat rental (cart multi-item), kirim bukti pembayaran, cancel rental miliknya, buka dispute, review transaksi selesai, kelola profil sendiri |
| **Store owner** | User (role apapun) yang memiliki `stores` berstatus `active` (di-cache `users.is_seller=true`) | Consumer + CRUD listing & gambar tokonya, kelola info toko, verifikasi bukti pembayaran tokonya, confirm/ongoing/complete rental tokonya, cancel rental tokonya (batas status), catat & waive late fee tokonya, tanggapi dispute |
| **Admin** | Role `admin`, status `active` | Review & approve/reject store application (bukan milik sendiri), verifikasi pembayaran (override), suspend/aktivasi toko & listing, waiv late fee, resolve dispute, baca audit log, ubah role/status user (bootstrap kecuali) |

Aturan penting:
- **D1**: enum role hanya `consumer | admin`. "Seller" bukan role — status turunan dari
  kepemilikan store aktif. `users.is_seller` adalah **cache** yang di-maintain server
  (RPC approval/suspend), bukan sumber otorisasi; otorisasi selalu cek `stores.owner_id`.
- Pengguna **tidak dapat** menyetujui store application miliknya sendiri.
- Pengguna **tidak dapat** mengubah role/status sendiri maupun orang lain (hanya admin RPC,
  dan admin tidak bisa mendemote/menghapus dirinya sendiri — guard di RPC).
- Satu user boleh memiliki **satu store aktif** (enforcement di RPC `submit_store_application`
  dan approval; histori application lama tetap tersimpan).

---

## 2. Store Application Lifecycle (`store_applications`)

Enum status: `pending | approved | rejected` (ERD).

| Transisi | Aktor | Preconditions | Side effects |
|---|---|---|---|
| (buat) → `pending` | Consumer | Tidak punya store aktif; tidak punya application `pending` lain; field wajib terisi | Audit `application_submit` |
| `pending` → `approved` | Admin (bukan pemilik ajuan) | Ajuan masih `pending` | Buat `stores` (status `active`, owner = applicant, `rental_unit` default `day`) + set `users.is_seller=true` + audit `application_approve` |
| `pending` → `rejected` | Admin (bukan pemilik ajuan) | `rejection_reason` wajib | Audit `application_reject` |

Aturan:
- Pengajuan ulang **diperbolehkan** setelah `rejected` (buat baris baru; histori lama tersimpan).
- `reviewed_by` / `reviewed_at` terisi otomatis dari sesi verifier.
- Toko yang sudah ada tidak diubah statusnya oleh approval baru (C-23): approval pertama
  membuat toko; admin mengaktifkan kembali toko via RPC store management, bukan lewat approval.

## 3. Store Lifecycle (`stores`)

Enum status: `active | inactive | suspended`.
- `active`: dapat menerima rental, listing tampil di katalog.
- `inactive`: dimatikan oleh owner sendiri (tidak tampil, tidak menerima rental); owner bisa aktifkan lagi.
- `suspended`: hanya oleh admin (pelanggaran); tidak bisa diaktifkan owner; hanya admin yang unsuspend.
- Owner tidak dapat mengubah `owner_id`, `status` dari `suspended`, atau field lain melalui jalur
  langsung — semua lewat RPC dengan ownership check dari `auth.uid()`.

## 4. Listing & Listing Images Lifecycle

Enum `listing_status`: `active | inactive | out_of_stock | suspended`.
- Create/update/delete hanya owner store terkait (store harus `active`).
- `stock < 0` dilarang (CHECK + validasi RPC). Menurunkan `stock` **tidak pernah** membatalkan
  ketersediaan yang sudah terikat rental aktif — ketersediaan per-periode selalu dihitung
  dari booking (lihat §9).
- `out_of_stock` diset otomatis oleh RPC saat `stock = 0`; kembali `active` saat `stock > 0`
  (dari status `out_of_stock` saja — tidak mengangkat `inactive`/`suspended`).
- `suspended` hanya oleh admin.
- Harga boleh berubah kapan saja; rental yang sudah dibuat memakai **snapshot** harga
  di `transaction_items.price` (C-10) — tidak terpengaruh perubahan berikutnya.
- `listing_images`: multi-gambar per listing, `sort_order` integer ≥ 1, unik per
  `(listing_id, sort_order)`. Hapus listing → gambar ikut (CASCADE). Ownership dicek di RPC.
- Kategori dari tabel `categories` (FK RESTRICT — kategori yang dipakai listing tidak
  dapat dihapus; pengelolaan kategori = admin, seed dev 4 kategori).

## 5. Rental Lifecycle (`rental_transactions` + `transaction_items`)

Enum `transaction_status` (8 nilai, ERD): `pending, payment_verify, confirmed, ongoing, overdue, completed, cancelled, disputed`.

### 5.1 Pembuatan (cart multi-item)
- Buyer = `auth.uid()` (tidak dari input client).
- 1 transaksi berisi 1..20 baris `transaction_items` (OQ-5); **semua item wajib dari store
  yang sama** = `rental_transactions.store_id` (C-21) — cart frontend dipisah per toko.
- Satu transaksi satu periode `start_date..end_date` untuk semua item.
- `start_date >= CURRENT_DATE`; `end_date >= start_date` (C-3/C-4: end inclusive, same-day = 1 hari).
- `min_rental_duration` per listing dihormati: durasi (dalam satuan listing) ≥ minimum.
- Setiap item divalidasi ketersediaan periode terhadap stok (§9). Semua validasi + insert
  **atomik dalam satu RPC** (`create_rental`).
- Harga snapshot server-side: `transaction_items.price` = `listings.price` saat itu;
  `transaction_items.subtotal` dihitung server (§8); `transaction_items.deposit` = `listings.deposit`.
- Status awal: `pending`. Audit `rental_create` (entity = transaksi).

### 5.2 Matriks transisi status

| Dari | Ke | Aktor berwenang | Preconditions | Side effects | Error utama |
|---|---|---|---|---|---|
| `pending` | `payment_verify` | Buyer pemilik transaksi | Bukti pembayaran disertai (URL proof) | Baris `payments` (status `pending`) dibuat | `forbidden`, `invalid_status` |
| `pending` | `cancelled` | Buyer | — | `cancelled_by/at/reason` terisi; booking dilepas | `forbidden` |
| `pending` | `cancelled` | Owner toko | — | idem + reason wajib | `forbidden`, `reason_required` |
| `payment_verify` | `confirmed` | Verifikator (owner toko / admin, D5) | Payment berstatus `pending` → diset `paid`, `paid_at=now()` | Status payment `paid`; audit `payment_verify` | `forbidden`, `payment_not_found` |
| `payment_verify` | `cancelled` | Verifikator / Buyer | Bukti ditolak / buyer menarik diri; reason wajib (verifikator) | Payment → `failed`; booking dilepas | `forbidden`, `reason_required` |
| `confirmed` | `ongoing` | Owner toko | Tanggal mulai tiba (atau serah terima) | — | `forbidden`, `not_started` |
| `confirmed` | `cancelled` | Owner toko | Serah terima gagal; reason wajib | Booking dilepas; refund payment dicatat (§7) | `forbidden`, `reason_required` |
| `ongoing` | `completed` | Owner toko | `actual_return_date` dicatat (=now) | Ketersediaan lepas otomatis (status keluar dari inventory-holding) | `forbidden` |
| `ongoing`/`overdue` | `overdue` | Owner toko / Admin | `now() > end_date` dan belum kembali | Boleh dicatatkan late fee (§8) | `not_late` |
| `overdue` | `completed` | Owner toko | Late fee dinilai (boleh 0) + `actual_return_date` | Late fee final | `forbidden` |
| `ongoing`/`overdue` | `disputed` | Buyer/Owner via buka dispute | Dispute dibuka (§9) | Status rental → `disputed` | `dispute_exists` |
| `disputed` | `completed` | Admin (resolve dispute) | `disputes.status` → `resolved`/`rejected` | Rental kembali selesai; keputusan di dispute | `dispute_open` |
| `completed`, `cancelled` | (tidak ada) | — | Status terminal; tidak ada transisi keluar (dispute di atas completed dicatat di tabel disputes tanpa mengubah status rental) | — | `illegal_transition` |

Aturan pembatalan (OQ-1 default): Buyer boleh cancel di `pending`/`payment_verify`;
Owner di `pending`→`confirmed`; setelah `ongoing` hanya lewat dispute. Refund mengikuti §7.

## 6. Payment Lifecycle (`payments`)

- Enum `payment_status`: `pending | paid | failed | refunded`; `payment_method`:
  `bank_transfer | e_wallet | credit_card | qris`.
- **Manual transfer + bukti, tanpa gateway** (kondisi aktual MVP — dinyatakan eksplisit).
- Buyer membuat 1 payment `pending` saat mengirim bukti (transisi §5.2 pertama).
- `paid_at` **nullable** (C-5); wajib terisi saat status → `paid` (divalidasi RPC).
- Verifikator: owner toko terkait + admin (D5). Frontend tidak pernah mengirim
  amount/status untuk dipercaya; amount divalidasi server terhadap
  `rental_transactions.total` (toleransi 0 — harus sama persis di MVP).
- Satu rental ≥ 1 payment. Penolakan bukti → payment `failed`, buyer boleh membuat
  payment baru (bukti baru). **Refund** = baris payment baru berstatus `refunded`
  dengan `amount` sesuai yang dikembalikan, dibuat oleh owner/admin (mis. saat cancel
  setelah `confirmed`). Tidak ada partial payment/cicil di MVP.
- Amount wajib > 0. `external_reference` bebas (nomor transfer, dsb.), tidak dipercaya
  untuk keputusan bisnis.

## 7. Late Fee Lifecycle (`late_fees`)

- Enum `late_fee_status`: `unpaid | paid | waived`.
- Dihitung per **hari** keterlambatan: `days_late = max(0, date(actual_return_date) − end_date)`.
- `daily_rate` = rate yang disetujui penilai (owner menetapkan saat penilaian; admin dapat
  menetapkan/mengubah) — **snapshot disimpan**; OQ-2 default saran: 10% harga harian item,
  tetapi nilai final selalu input penilai (bukan perhitungan otomatis yang tak terlihat).
- `total = days_late × daily_rate` (server-computed, wajib konsisten — CHECK).
- Satu transaksi dapat punya beberapa baris late fee (per penilaian), tetapi MVP:
  satu penilaian final per transaksi (unique `transaction_id`).
- Waiver: owner (tokonya) atau admin; `waived` tidak dihitung dalam `late_fee_total`.
- `rental_transactions.late_fee_total` = Σ `late_fees.total` berstatus `unpaid|paid`
  — di-maintain server setiap perubahan late fee (tidak pernah dihitung frontend).
- `rental_transactions.total` **tidak** mencakup denda (snapshot biaya awal stabil);
  denda ditagih terpisah (§5.2 catatan §8).

## 8. Financial Consistency (kontrak matematis)

```
unit_days            = day:1 | week:7 | month:30            (dari rental_unit listing)
duration_units       = ceil(total_days / unit_days)
total_days           = (end_date - start_date)::int + 1     (end_date INCLUSIVE; same-day = 1)
item.subtotal_item   = item.price × item.quantity × duration_units
transaction.subtotal = Σ item.subtotal_item
transaction.deposit_total = Σ (item.deposit × item.quantity)
transaction.total    = subtotal + deposit_total             (tanpa denda)
payment.amount       = transaction.total                    (satu pembayaran penuh)
late_fee.total       = days_late × daily_rate
late_fee_total       = Σ late_fees.total (unpaid|paid)
```
Semua nilai dihitung dan ditulis **hanya oleh RPC** (D2: integer IDR, semua kolom uang bigint).

## 9. Inventory & Availability

- `stock` = jumlah unit fisik listing (ERD). 
- Ketersediaan periode `[s,e]` untuk listing L:
  `available_units(L,s,e) = L.stock − Σ quantity(transaction_items ti)`
  untuk semua item listing L yang transaksinya berstatus
  **`pending, payment_verify, confirmed, ongoing, overdue`** dan periodenya
  overlap `[s,e]` (overlap inklusif: `s1 ≤ e2 AND s2 ≤ e1`; back-to-back boleh —
  barang kembali tanggal `end_date` dan bisa disewa mulai `end_date + 1`).
- **Tidak ada pengurangan stok fisik** saat booking (availabilitas selalu dihitung) —
  menghindari dua sumber kebenaran. `out_of_stock` hanya reaksi `stock = 0` (§4).
- Perubahan stok saat ada rental aktif: diperbolehkan; booking berjalan tetap sah
  (snapshot sudah terbentuk); booking **baru** memakai stok terbaru.
- Listing dengan `stock > 1` **boleh** disewa beberapa transaksi overlap selama
  Σ quantity ≤ stock. Karena itu exclusion constraint sederhana **tidak cukup**:
  `create_rental` memakai **advisory lock per listing** + re-check ketersediaan
  di dalam lock, semua dalam satu transaksi (double-booking mustahil walau konkuren).
- Konflik dikembalikan ke frontend sebagai error `insufficient_stock` (bukan 500).

## 10. Dispute Lifecycle (`disputes`)

- Enum: `open | investigating | resolved | rejected`.
- Boleh dibuka oleh buyer (pemilik transaksi) atau owner toko, saat rental
  `ongoing`/`overdue`/`completed` (setelah `completed` status rental tidak berubah —
  dispute berjalan sendiri); saat `ongoing`/`overdue` rental ikut berstatus `disputed`.
- Satu transaksi satu dispute aktif (unique partial index: satu baris per transaksi
  yang tidak berstatus resolved/rejected — dinegasi via RPC check + unique index).
- Investigasi & resolusi hanya oleh **admin**: `resolved` wajib `resolution` +
  `resolved_by` + `resolved_at`; `rejected` wajib alasan di `resolution`.
- Resolusi TIDAK otomatis mengubah payment/late fee — admin dapat menindaklanjuti
  via RPC terkait (refund, waive) secara eksplisit. Audit `dispute_open`/`dispute_resolve`.

## 11. Review Rules (`reviews`)

- Hanya **buyer** transaksi; hanya saat rental `completed`; `rating` 1..5 (CHECK);
  `comment` wajib; **satu review per transaksi** (UNIQUE `transaction_id`).
- `store_id` wajib = store transaksi (divalidasi RPC; redundansi sesuai ERD untuk query per-toko).
- Tidak ada edit/hapus di MVP; tidak ada moderasi otomatis (OQ-4). Rating toko agregat
  tidak dihitung di MVP (kolom agregat tidak ada di ERD).

## 12. Wishlist Rules (`wishlists`)

- UNIQUE `(user_id, listing_id)`; hanya pemilik yang lihat/ubah (RLS + RPC).
- Listing dihapus → baris ikut (CASCADE). Listing nonaktif → baris tetap (UI menyaring).
- Wishlist tamu (localStorage) adalah UX, bukan bagian DB contract; tidak di-merge otomatis di MVP.

## 13. Audit Logging (`audit_logs`)

- Semua aksi administratif & sensitif dicatat server-side oleh RPC (bukan client).
- D6: `action` & `entity_type` = **text + CHECK registry**:

```sql
action     CHECK (action IN (
  'application_submit','application_approve','application_reject',
  'store_activate','store_deactivate','store_suspend','store_unsuspend',
  'listing_create','listing_update','listing_delete','listing_suspend',
  'rental_create','rental_cancel','payment_submit','payment_verify','payment_reject',
  'return_record','latefee_apply','latefee_waive',
  'dispute_open','dispute_resolve','review_create',
  'role_change','user_suspend','user_activate'))
entity_type CHECK (entity_type IN (
  'user','store_application','store','category','listing','listing_image',
  'rental_transaction','payment','late_fee','dispute','review'))
```
- Menambah nilai = migration baru (CHECK diganti), bukan tulisan runtime.
- Tidak ada password/token/secret/PIN dalam `metadata`. Retensi: tanpa penghapusan
  otomatis di MVP; kebijakan retensi jangka panjang = OPEN QUESTION tercatat (OQ-6).
- `actor_id` dari `auth.uid()`; `entity_id` uuid dari operasi nyata.
- RLS: SELECT hanya admin; **tidak ada** policy INSERT/UPDATE/DELETE (tulis via RPC SECDEF).

## 14. Penghapusan Akun & Retensi

- Penghapusan akun = **soft delete**: `users.status = 'inactive'` (oleh admin).
- Histori transaksi **wajib retensi**: FK dari `rental_transactions.buyer_id`,
  `payments`, `disputes`, `reviews`, `audit_logs` ke users = **RESTRICT**
  (hard delete via dashboard tidak boleh merusak histori; soft delete adalah jalur resmi).
- `stores.owner_id` RESTRICT — toko harus ditutup/disuspend dulu. Listing milik toko
  yang dinonaktifkan hanya `inactive` (bukan dihapus) bila punya riwayat transaction_items
  (RESTRICT FK `transaction_items.listing_id`); listing tanpa riwayat boleh dihapus
  (CASCADE ke listing_images; wishlist ikut CASCADE).

## 15. Acceptance Criteria ringkas (diuji di Phase 8)

1. Tanpa login: katalog terbaca; semua tulisan ditolak.
2. Consumer dapat mendaftar; profil otomatis via trigger; role `consumer`.
3. Ajuan toko: submit → pending; admin approve → store aktif + is_seller; reject wajib alasan; tidak bisa approve sendiri.
4. Listing CRUD hanya oleh owner toko aktif; stok tak boleh negatif.
5. create_rental multi-item atomik: lintas toko ditolak; quantity melebihi stok ditolak (`insufficient_stock`); dua request konkuren untuk unit terakhir → tepat satu sukses.
6. Alur status lengkap mengikuti matriks §5.2; transisi ilegal ditolak (`illegal_transition`).
7. Harga/durasi/total = §8; frontend tidak bisa memalsukan nilai.
8. Payment: hanya verifikator berwenang yang bisa `paid`; `paid_at` wajib saat paid.
9. Late fee: total konsisten; waived tidak dihitung.
10. Dispute & review mengikuti §10–§11.
11. Audit log tertulis untuk semua aksi §13; tidak dapat ditulis/diubah user biasa.
12. RLS membatasi sesuai security matrix (04-rpc-security-contract.md).

## 16. Open questions terkait PRD

| ID | Isi | Default dipakai |
|---|---|---|
| OQ-1 | Batas pembatalan | §5.2 (buyer: pending/payment_verify; owner: s.d. confirmed) |
| OQ-2 | Sumber daily_rate | Input penilai; snapshot (usulan 10%/hari) |
| OQ-3 | start_date masa lalu | Ditolak (`>= CURRENT_DATE`) |
| OQ-4 | Moderasi review | Tidak ada di MVP |
| OQ-5 | Batas item per transaksi | 20 baris |
| OQ-6 | Retensi audit log | Tanpa penghapusan otomatis di MVP |
