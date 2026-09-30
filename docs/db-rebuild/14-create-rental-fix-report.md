# Laporan Perbaikan BUG-1 (42702) & Regression `create_rental`/`cancel_rental` — JabSewa

> **Tanggal:** 27 September 2026 · **Project target:** Supabase `yjwlqqigbzvjbvpwybup` (terverifikasi sebelum & sesudah deploy)
> **Prasyarat:** `13-create-rental-test-report.md` (bug ditemukan) + `13-usulan-migration-status-ambiguity.sql` (usulan fix)
> **Status akhir:** ✅ Fix diterapkan, seluruh regression lulus — **79/79** create_rental suite, **26/26** quote_rental, smoke verifier PASS.

---

## 1. File migration baru & perubahan tepatnya

**File:** `supabase/migrations/20260927000001_rpcs_status_ambiguity_fix.sql`
(menantang usulan di `docs/db-rebuild/13-usulan-migration-status-ambiguity.sql`; timestamp baru, migration historis tidak disentuh)

Isi: `CREATE OR REPLACE FUNCTION` ×2 + sanity-check DO-block read-only.
**Perubahan semantik hanya 2 baris** (terverifikasi diff mekanik terhadap `pg_get_functiondef` live pra-deploy; sisanya artefak kosmetik serializer: layout `RETURNS TABLE`, tag `$function$`, `NULL::text`, rendering `SET search_path`):

| Fungsi | Sebelum (live, ambigu) | Sesudah (fixed) |
|---|---|---|
| `create_rental` | `SELECT status INTO v_store_status FROM public.stores WHERE id = v_store;` | `SELECT s.status INTO v_store_status FROM public.stores s WHERE s.id = v_store;` |
| `cancel_rental` | `UPDATE public.payments SET status='failed' WHERE transaction_id = p_rental_id AND status='pending';` | `UPDATE public.payments p SET status='failed' WHERE p.transaction_id = p_rental_id AND p.status='pending';` |

Signature, nama OUT param, return contract, business logic, RLS, grants: **tidak berubah**
(CREATE OR REPLACE dengan argumen identik mempertahankan grants; sanity-check deploy-time ikut dalam file).

## 2. Status deploy & verifikasi target

- Tahap review pra-deploy: **PASS** (laporan di chat; termasuk verifikasi registry CHECK `audit_logs`
  memuat `rental_cancel`/`payment_submit`, dan identitas argumen kedua fungsi).
- Verifikasi target: `DATABASE_URL` → username `postgres.yjwlqqigbzvjbvpwybup` → **ref cocok** ✅
- Dry-run `apply-migration.mjs` bersih → diterapkan **dengan `--yes`, satu transaksi, sukses** (PostgreSQL 17.6).
- Tidak ada reset database, tidak ada migration historis yang diedit, tidak ada perubahan RLS/grants/schema.

## 3. Hasil regression per kelompok

`node scripts/test-create-rental.mjs` → **79 PASS, 0 FAIL** (versi terkini; termasuk kasus baru H):

| Kelompok | Hasil | Catatan |
|---|---|---|
| A. Akses | 2/2 | anon `42501`; seller aktif diizinkan (kontrak tak membatasi ke buyer) |
| B. Validasi & stok | 12/12 | `user_inactive`, `empty_items`, `too_many_items`, `invalid_quantity`, `listing_not_found`, `duplicate_item`, `start_date_in_past`, `invalid_date_range` (urutan benar), `insufficient_stock` ×2, `mixed_stores`, `invalid_items` ×2; **0 sisa tulis** |
| C. Sukses + snapshot + retry | 15/15 | 1 & multi item; status `pending`; `total_days` inclusive; snapshot harga server (C1 450.000/2.000.000/2.450.000; C2 460.000/3.000.000/3.460.000; C3 koersi qty string, payload manipulasi diabaikan); duplikat → rental baru (kontrak tanpa idempotency-key); retry pasca-gagal bersih |
| D. Konsistensi parsial | 4/4 | item invalid di antara item valid → error kontrak, **0 baris tertulis** |
| E. RLS & ownership | 4/4 | seller lihat rental tokonya saja (19/20, rental store2 tak terlihat); buyer2 0 baris; admin semua (20/20); cancel orang lain `forbidden` |
| F. **Konkurensi** | 7/7 | 4 request paralel (demand 8 > stock 3): **tepat 1 sukses, 3 `insufficient_stock`, 0 exception**; terjual 2 unit (tidak oversell); kolom stock tak berubah; tanpa duplikat; window back-to-back bebas |
| G. Audit & siklus | 15/15 | invarian **audit rental_create = jumlah rental di DB (1:1)**; semua rental uji → `cancelled`; cancelled tak lagi pegang inventori |
| H. cancel_rental + payment lifecycle (baru) | 11/11 | cancel valid/`illegal_transition`/`not_found`/`forbidden`; `submit_payment` → `payment_verify` dengan amount server 580.000; cancel di `payment_verify` → payment `failed`; submit di rental cancelled `illegal_transition`; non-buyer `forbidden`; **0 exception 42702** |

`node scripts/test-quote-rental.mjs` → **26 PASS, 0 FAIL** (tidak terdampak, tetap hijau).
`npm run verify:supabase` → **Semua pemeriksaan lolos** (RLS, grant, bentuk kontrak).

## 4. Bukti 42702 hilang

1. **Fungsional langsung pasca-deploy:** success-path (dulu selalu exception) → `{ok:true, status:'pending', …}`;
   overstock (dulu exception) → `{ok:false, error:'insufficient_stock'}`.
2. **Definisi live pasca-deploy:** pola ambigu `SELECT status INTO … FROM public.stores WHERE` dan
   `AND status = 'pending'` **TIDAK ADA**; pola fixed `s.status`/`p.status` ADA (kedua fungsi).
3. **Runtime menyeluruh:** 79+26 assertion + kasus H tanpa satu pun exception PostgREST
   (pra-fix: 4/4 request konkurensi exception).

## 5. Konkurensi & stok (detail)

- 4 request paralel (buyer ×2 + buyer2 ×2, qty 2 masing-masing, window kosong d+60..62, stock 3):
  tepat 1 sukses — advisory lock per-listing + re-check di bawah lock bekerja sesuai desain (PRD §9).
- Occupancy pasca-test: tepat 2 unit terjual; 3 request gagal tidak meninggalkan apa pun.
- Kolom `stock` tidak dimutasi (desain: availability = stock − occupied_units, status `pending..overdue`).

## 6. Status fixture & data setelah test

- Rental uji: **24, semuanya `cancelled`** (tidak ada transaksi riil; `transaction_items` 26, `payments` 2 `failed`).
- Stok listing utuh: 3/2/2, semua `active`.
- Audit: `rental_create` 24 (1:1 dengan rental), `rental_cancel` 23 (+1 via SQL closing probe), `payment_submit` 2, application/listing sesuai fixture.
- Fixture users/store/listing **semua dipertahankan** (tidak dihapus): 5 users, 2 stores, 3 listings.
- Cleanup tersedia & **diperluas** (payments + rental + store2/L2a + users extra) namun **belum dijalankan**:
  `node scripts/test-rental-cleanup.mjs` (id dari state file, urutan FK aman).

## 7. Risiko & blocker tersisa

1. `decide_payment`, `start_rental`, `record_return`, `apply_late_fee`, dispute, review **belum diuji E2E**
   (di luar lingkup tugas ini) — pola kode mereka sudah diverifikasi bebas dari pola ambigu, tapi jalur
   success-nya belum dieksekusi. Disarankan satu sesi test lanjutan sebelum integrasi frontend penuh.
2. Tidak ada idempotency-key di `create_rental` (per kontrak) — UI harus mencegah double-submit.
3. Sanity-check migration memverifikasi control-flow & pola ambigu, tetapi tidak mensimulasikan
   success-path — pertahankan kebiasaan smoke success-path (kasus GATE di skrip test) setiap deploy RPC.
4. Migration `20260927000001` belum tercatat di `06-migration-plan.md` (status dokumen diperbarui
   terpisah; tidak mengubah migrasi historis).
5. Klaim "siap integrasi frontend" **dibatasi pada lingkup yang teruji**: `create_rental`, `cancel_rental`,
   `submit_payment` (jalur utama) dan `quote_rental` lulus penuh terhadap kontrak di project
   `yjwlqqigbzvjbvpwybup` — bukan klaim atas seluruh 30 RPC.
