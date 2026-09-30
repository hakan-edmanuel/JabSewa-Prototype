# Laporan Uji Integrasi `create_rental` — JabSewa

> **Tanggal:** 27 September 2026 · **Project target:** Supabase `yjwlqqigbzvjbvpwybup`
> **Prasyarat:** laporan `12-rental-test-report.md` (fixture + `quote_rental` 26/26 PASS).
> **Kategori test:** LIVE Supabase (semua kasus), FIXTURE (perluasan deterministik), LOKAL (verifikasi read-only via `DATABASE_URL`).
> **Batasan dipegang:** tanpa perubahan schema/migration/RLS/grants, tanpa data pengguna sungguhan, tanpa secret di repo, tanpa transaksi rental yang tertinggal.
> **Skrip:** `scripts/test-create-rental.mjs` (baru) · **State:** `scripts/.rental-fixture.json`

---

## 1. Ringkasan eksekutif

**`create_rental` TIDAK SIAP untuk integrasi frontend.**

Ditemukan **1 bug produksi kritis**: RPC `create_rental` melempar exception SQL `42702`
(`column reference "status" is ambiguous`) pada **setiap request yang lolos validasi item** —
termasuk pembuatan rental yang sah. Bug ini juga memengaruhi `cancel_rental` (success path).
Akibatnya **nol rental berhasil dibuat** selama seluruh sesi test; semua kasus success-path
dan uji konkurensi gagal seragam oleh satu akar masalah yang sama.

| Metrik | Nilai |
|---|---|
| Hasil skrip | 28 PASS / 24 FAIL (semua FAIL bermuara ke bug 42702) |
| Rental tertulis selama test | **0** (`rental_transactions` = 0 sebelum = sesudah) |
| `transaction_items` tertulis | 0 |
| Stok listing | utuh (3 / 2 / 2 — tidak berubah) |
| Audit `rental_create` | 0 |
| Bug baru | 1 kritis (2 fungsi terdampak) — usulan migration siap, **belum diterapkan** |

---

## 2. Tahap 1 — Audit kontrak & implementasi

Sumber: `docs/db-rebuild/04-rpc-security-contract.md` §3.5 #16, PRD `02-final-prd.md`,
implementasi live (terverifikasi `pg_get_functiondef` identik dengan
`supabase/migrations/20260927000000_rpcs_guard_stop_fix.sql` baris 431+).

- **Signature:** `create_rental(p_start date, p_end date, p_items jsonb)` →
  `RETURNS TABLE (ok, error, rental_id, status, subtotal, deposit_total, total, total_days)`.
  Grant EXECUTE: `authenticated` saja (anon ditolak 42501 — terbukti test).
- **Alur 4 pass (atomik, satu transaksi RPC):**
  1. Validasi (tanpa tulis): `unauthenticated`, `user_inactive`, `invalid_date_range`
     (sebelum `start_date_in_past`), `invalid_items`, `empty_items`, `too_many_items` (>20),
     `listing_not_found`, `listing_unavailable`, `duplicate_item`, `invalid_quantity`,
     `mixed_stores` (derive store dari item pertama), `min_duration`
     (`ceil(days / rental_unit_days(unit))` vs `min_rental_duration`).
  2. **Advisory lock**: `pg_advisory_xact_lock(hashtextextended('jabsewa:listing:'||id,0))`
     per listing, **diurutkan by id** (anti-deadlock, deterministik).
  3. Re-check stok **di bawah lock**: `qty > stock − occupied_units(listing, start, end)`
     → `insufficient_stock`. `occupied_units` menjumlah `transaction_items.quantity` untuk
     status pemegang inventori `pending, payment_verify, confirmed, ongoing, overdue`,
     rentang inklusif (`start_date <= p_end AND end_date >= p_start`) → back-to-back bebas.
  4. Insert atomik: `rental_transactions` status awal **`pending`** +
     `transaction_items` (snapshot `price`/`deposit`/`subtotal` server) + audit `rental_create`.
- **Idempotensi:** TIDAK ada idempotency-key di kontrak. Request duplikat (payload identik)
  = rental baru yang sah. Retry setelah gagal aman karena tidak ada efek samping sebelum validasi.
- **Harga/deposit/tanggal:** seluruh nilai dihitung server dari snapshot listing saat itu;
  field manipulasi pada payload (price/deposit/subtotal) diabaikan; `total_days` tidak dikolomkan
  (kontrak §4.7).

## 3. Tahap 2 — Fixture (perluasan, idempoten)

Fixture utama tetap dipakai (kepemilikan diverifikasi dari state file, tidak dihapus):

| Entitas | ID / nilai | Status |
|---|---|---|
| buyer / seller / admin (utama) | `02dae72e…` / `96fc90d3…` / `255ef456…` | login OK |
| Store utama | `c9578ad8…` | active |
| L1 Kamera Sony A7III | `8ccf7a2e…` | active, 150rb/hr, dep 2jt, **stock 3** |
| L2 Tripod Manfrotto | `2d20ff33…` | active, 40rb/hr, dep 500rb, **stock 2** |
| **buyer2** (baru) | `40adf04d…` | Admin API, aktif |
| **seller2** (baru) | `95cc4fd5…` | Admin API, aktif |
| **Store 2** (baru, jalur resmi application→approve) | `fcfa18b4…` | active |
| **L2a "Tripod Pro Fixture"** (baru, `save_listing` oleh seller2) | `92a75589…` | active, 75rb/hr, dep 750rb, stock 2 |

Semua user = identitas auth asli (Admin API `email_confirm: true`), sign-in diverifikasi.

## 4. Tahap 3 — Hasil per kasus

### ✅ Kasus yang lolos (28)
| Kasus | Hasil aktual |
|---|---|
| Anon dipanggil `create_rental` | ditolak `42501` (tanpa EXECUTE) |
| User `suspended` → `create_rental` | `{ok:false, error:'user_inactive'}` (buyer2 disuspend sementara lalu dipulihkan `active` — terverifikasi) |
| `items` kosong / bukan array / tanpa listing_id | `empty_items` / `invalid_items` / `invalid_items` |
| 21 item | `too_many_items` |
| quantity 0 / negatif | `invalid_quantity` |
| listing nol-uuid / listing ganda | `listing_not_found` / `duplicate_item` |
| rentang terbalik / tanggal lampau | `invalid_date_range` (dicek dulu) / `start_date_in_past` |
| dua toko dalam satu order (L1 + L2a) | `mixed_stores` |
| Item valid + item invalid (D1) | `listing_not_found`, **0 baris tertulis** (atomik) |
| Gagal qty 999 lalu periksa | 0 baris tertulis (retry aman) |
| RLS: seller & buyer2 tidak melihat rental buyer; admin melihat semua | sesuai matriks §4 |
| Semua jalur gagal | `tx 0→0, ti 0→0` — tidak ada sisa tulis |

### ❌ Kasus yang gagal (24) — semua oleh bug 42702
| Kelompok | Kasus | Hasil aktual |
|---|---|---|
| Stok (B) | qty 4 > stock 3 (L1); qty 3 > stock 2 (L2) | exception 42702, bukan `insufficient_stock` |
| Sukses (C) | C1 satu item; C2 dua item; C3 koersi qty string; C4 duplikat; C5 retry | exception 42702 — `rows=0`, tidak ada rental terbentuk |
| Konsistensi (D) | D2 item valid + stok kurang | exception 42702 (bukan `insufficient_stock`) |
| Akses (A/E) | seller membuat rental; E4 cancel-forbidden | terblokir (butuh rental sukses) |
| Konkurensi (F) | F1 4 request paralel; F5 back-to-back | 4/4 exception 42702 |
| Snapshot/audit (C/G) | verifikasi snapshot & audit rental_create | tak dapat diuji (tak ada rental) |

### Catatan verifikasi penting
- Validasi bisnis **sebelum** statement bermasalah berjalan benar dan contract-shape-nya tepat
  (persis 1 baris `{ok,error}`).
- `quote_rental` (26/26 PASS di sesi sebelumnya) **tidak terdampak** — tidak punya OUT `status`.

## 5. Tahap 4 — Uji konkurensi

Dijalankan sesuai rencana (aman: hanya fixture, window d+60..d+62 yang terverifikasi kosong):
4 request paralel (2 buyer qty 2 + 2 buyer2 qty 2, total demand 8 > stock 3).
**Hasil: 4/4 exception `42702`.** Karena advisory lock dieksekusi setelah pass validasi tapi
sebelum re-check stok — dan semuanya crash di `SELECT status INTO v_store_status FROM public.stores`
(PASS 1, sebelum lock) — **mekanisme locking belum dapat dinyatakan aman dari test ini.**
Tidak ada oversell yang terjadi (juga tidak ada rental sama sekali). Uji konkurensi ulang
wajib dilakukan setelah bug diperbaiki; pengguna tidak akan terpengaruh karena hanya
bisa terjadi pada request yang sah terhadap fixture.

## 6. Tahap 5 — Verifikasi data (sebelum → sesudah)

| Objek | Sebelum | Sesudah |
|---|---|---|
| `rental_transactions` | 0 | **0** |
| `transaction_items` | 0 | **0** |
| `audit_logs` rental_create / rental_cancel | 0 / 0 | 0 / 0 |
| `listings.stock` (L1/L2/L2a) | 3/2/2 | **3/2/2** (tidak berubah) |
| `users` status buyer2 | active | suspended→**active** (dipulihkan, terverifikasi) |
| Fixture users total | 3 | 5 (buyer2, seller2 baru) |
| Stores / listings | 1 / 2 | 2 / 3 (store2, L2a baru) |

**Konsistensi pasca-gagal: sempurna** — setiap request gagal (baik error kontrak maupun
exception 42702) tidak meninggalkan satu baris pun. Ini sesuai desain (validasi tanpa efek
samping; exception menyebabkan rollback penuh transaksi RPC).

## 7. Bug & root cause (dengan bukti)

### BUG-1 (KRITIS): `42702 column reference "status" is ambiguous` di success-path

- **Gejala:** setiap `create_rental` yang lolos validasi item melempar exception PostgREST;
  `cancel_rental` akan gagal sama di success path (pola identik, terverifikasi dari definisi live).
- **Root cause:** PL/pgSQL menyelesaikan referensi kolom tak-terkualifikasi **variabel dulu**
  (default `plpgsql.variable_conflict = error`). Kedua fungsi punya OUT parameter bernama
  `status` (dari `RETURNS TABLE`), sehingga referensi kolom `status` yang tidak dikualifikasi
  menjadi ambigu:
  - `create_rental` baris 63 (live `pg_get_functiondef`):
    `SELECT status INTO v_store_status FROM public.stores WHERE id = v_store;`
  - `cancel_rental` baris 46 (live):
    `UPDATE public.payments SET status='failed' WHERE transaction_id = p_rental_id AND status = 'pending';`
    (`SET status` tidak ambigu — yang ambigu adalah `status` di WHERE; `payments` juga punya kolom `status`.)
- **Mengapa lolos verifikasi sebelumnya:** smoke test & verifier hanya mengetok jalur error
  (`invalid_date_range`, `start_date_in_past`, `listing_not_found`) yang semuanya RETURN
  sebelum statement bermasalah. Sanity-check migration hanya memeriksa invariant control-flow
  (RETURN NEXT/RETURN), bukan resolusi nama. Jalur sukses/insufficient-stock tidak pernah dipanggil.
- **Cakupan:** dipindai seluruh 25 RPC plpgsql — **hanya 2 fungsi terdampak**
  (`create_rental`, `cancel_rental`). Fungsi lain yang memakai `SELECT status INTO`
  (`set_my_store_status`, `admin_set_store_status`, `save_listing`, `set_listing_availability`,
  `admin_set_listing_status`) aman karena tidak punya variabel bernama `status`
  (parameternya bernama `p_status`); referensi `status` lain sudah terkualifikasi (`v_tx.status`, dsb.).
- **Impact:** alur inti produk (buat rental, batalkan rental) mati total di server.
  Frontend akan melihat error 500-ish PostgREST (bukan `{ok,error}` contract).

### Usulan migration (FORWARD-ONLY, BELUM diterapkan — menunggu persetujuan)

File usulan: `docs/db-rebuild/13-usulan-migration-status-ambiguity.sql` (SQL lengkap siap terap,
ditempatkan di docs — **bukan** `supabase/migrations` — agar tidak tereksekusi tooling sebelum disetujui):

```sql
-- Fix BUG-1: kualifikasi referensi kolom `status` yang ambigu dengan OUT param `status`.
-- create_rental: 1 baris; cancel_rental: 1 baris. Perilaku kontrak TIDAK berubah.
CREATE OR REPLACE FUNCTION public.create_rental(p_start date, p_end date, p_items jsonb)
-- …definisi identik dengan 20260927000000_rpcs_guard_stop_fix.sql, dengan SATU perubahan:
--   SELECT status INTO v_store_status FROM public.stores WHERE id = v_store;
-- + SELECT s.status INTO v_store_status FROM public.stores s WHERE s.id = v_store;
-- (sanity check DO-block dipertahankan)

CREATE OR REPLACE FUNCTION public.cancel_rental(p_rental_id uuid, p_reason text DEFAULT NULL)
-- …definisi identik, dengan SATU perubahan:
--   UPDATE public.payments SET status='failed'
--    WHERE transaction_id = p_rental_id AND status='pending';
-- + UPDATE public.payments p SET p.status='failed'
--    WHERE p.transaction_id = p_rental_id AND p.status='pending';
```

Alternatif yang ditolak: `#variable_conflict use_column` per fungsi (menyerang kelas bug lain:
`total`, `error`, `ok` bisa jadi ambigu diam-diam di masa depan) — kualifikasi eksplisit lebih aman
dan forward-only.

**Verifikasi pasca-fix yang diusulkan:** jalankan ulang `node scripts/test-create-rental.mjs`
(28 PASS sebelumnya harus tetap PASS; 24 FAIL harus berubah PASS, termasuk F1 konkurensi:
tepat 1 sukses dari 4 paralel, 3 `insufficient_stock`, 0 exception), lalu `npm run verify:supabase`.

## 8. Status cleanup fixture

- **Rental uji:** 0 (tidak ada yang perlu dibersihkan — semua request sukses/insufficient gagal
  dibentuk oleh bug).
- **Fixture tetap ada** (sengaja, untuk re-run pasca-fix): 5 user auth, 2 store, 3 listing,
  2 application, audit log application/listing.
- Cleanup penuh tetap satu perintah: `node scripts/test-rental-cleanup.mjs`
  (mencakup users/state; listing & store perlu penambahan id `extra.*` bila ingin ikut dihapus —
  state file sudah mencatat semuanya).

## 9. Kesimpulan

1. **`create_rental` belum siap untuk frontend.** Satu bug kritis memblokir seluruh success path.
2. Semua **validasi bisnis, atomikitas jalur gagal, RLS, dan contract-shape jalur error** terbukti
   benar (28 PASS) — kualitas implementasi di luar bug ini baik.
3. **Uji konkurensi belum konklusif** — harus diulang setelah fix (re-run skrip yang sama).
4. Usulan migration forward-only sudah disiapkan penuh
   (`docs/db-rebuild/13-usulan-migration-status-ambiguity.sql` — CREATE OR REPLACE 2 fungsi +
   sanity-check deploy-time) dan **menunggu persetujuan** sebelum diterapkan — tidak ada
   perubahan schema yang dilakukan dalam sesi ini, sesuai batasan tugas.
5. Rekomendasi tambahan: tambahkan satu jalur smoke success-path `create_rental` + `cancel_rental`
   ke `verify-supabase-connection.mjs` (dengan fixture) agar kelas bug ini tertangkap verifier
   di masa depan; pertimbangkan idempotency-key opsional untuk `create_rental` di kontrak
   ( perilaku saat ini: duplikat = rental baru — sah, tapi rentan double-submit dari UI).
