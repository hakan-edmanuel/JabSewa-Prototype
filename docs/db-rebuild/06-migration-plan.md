# JabSewa — Phase 5: Migration Plan

## 1. File migration

| File | Isi | Target |
|---|---|---|
| `supabase/migrations/20260926000000_baseline_erd_v2.sql` | **Baseline tunggal**: extensions, 11 enum, 14 tabel + constraint + index, trigger (`touch_updated_at`, `handle_new_user`), 9 helper, 30 RPC, RLS, grants/revoke, sanity checks | Project Supabase **baru & kosong** |
| `supabase/migrations/20260926000002_rpcs_return_next_fix.sql` | **Fix forward-only** (post-baseline): CREATE OR REPLACE 25 RPC plpgsql ber-RETURNS TABLE — `RETURN;` → `RETURN NEXT;` (bug 0-baris) + sanity check keras di akhir. Idempotent. **Wajib** setelah baseline | Project yang sudah menjalankan baseline |
| `supabase/migrations/20260927000000_rpcs_guard_stop_fix.sql` | **Fix forward-only** (post-…000002): CREATE OR REPLACE 25 RPC plpgsql yang sama — guard error kini `RETURN NEXT; RETURN;` (emit lalu berhenti). Bug multi-baris: RETURN NEXT tidak menghentikan eksekusi → guard beruntun menghasilkan 3–4 baris dan ditutup `ok=true`; pada `create_rental` INSERT tetap jalan meski validasi gagal. Sanity check keras: tanpa fall-through, tanpa `RETURN;` tanpa emit. Idempotent. **Wajib** setelah …000002 | Project yang sudah menjalankan baseline + …000002 |
| `supabase/migrations/20260927000001_rpcs_status_ambiguity_fix.sql` | **Fix forward-only** (post-…000000): CREATE OR REPLACE 2 RPC (`create_rental`, `cancel_rental`) — kualifikasi referensi kolom `status` yang ambigu dengan OUT param RETURNS TABLE (bug 42702 `column reference "status" is ambiguous` di seluruh success-path): `SELECT s.status … FROM public.stores s` dan `UPDATE public.payments p … WHERE p.status = 'pending'`. Kontrak, signature, RLS, grants tidak berubah; + sanity check deploy-time. Idempotent. **Wajib** setelah …000000 | Project yang sudah menjalankan baseline + …000000 |
| `supabase/migrations/20260928000000_storage_buckets_policies.sql` | **Storage forward-only** (post-…000001): 2 bucket (`listing-images` public-read, `payment-proofs` private) + policy storage.objects (INSERT/UPDATE/DELETE listing-images = owner toko via listings→stores.owner_id; INSERT payment-proofs = buyer via rental_transactions.buyer_id; SELECT proofs = buyer/owner/admin matriks payments_select; proofs tanpa UPDATE/DELETE — immutable) + helper `storage_path_in_namespace` + sanity check. **TIDAK mengubah** schema public/RPC/RLS public. Idempotent. Wajib koneksi operator (SQL Editor / apply-migration.mjs). Status: **BELUM diterapkan ke live** — menunggu approval owner | Project yang sudah menjalankan baseline + semua fix |
| `supabase/migrations/20260926000001_seed_dev_categories.sql` (opsional, terpisah) | Seed 4 kategori dev (`photography, gadget, sports, event`) — seed **tidak pernah** di dalam baseline | Dev/staging bila disetujui |

Migration legacy (3 file lama) **tidak dijalankan** dan tidak dijadikan dasar; statusnya
diarsipkan (lihat `10-cleanup-log.md`). Tidak ada perubahan pada migration yang sudah
diterapkan di environment bersama — baseline ini hanya untuk project baru.

**Riwayat deploy terverifikasi — `20260927000001_rpcs_status_ambiguity_fix.sql`:**
diterapkan 27 Sep 2026 ke project target `yjwlqqigbzvjbvpwybup` (project aktif
`.env.local`) via `node scripts/apply-migration.mjs … --yes` — satu transaksi, sukses
(PostgreSQL 17.6); ref target diverifikasi (`postgres.yjwlqqigbzvjbvpwybup`) sebelum deploy.
Regression pasca-deploy: `test-create-rental.mjs` **79/79 PASS**, `test-quote-rental.mjs
**26/26 PASS**, `npm run verify:supabase` PASS penuh; definisi live terverifikasi bebas pola
ambigu (`s.status`/`p.status` terpasang). Detail lengkap: `14-create-rental-fix-report.md`.
Migration historis lain tidak disentuh; tidak ada reset database atau perubahan RLS/grants/schema.

## 2. Urutan dependency dalam baseline

1. `pgcrypto` (gen_random_uuid).
2. 11 enum (tidak ada enum yang dimodifikasi setelah pembuatan — aman satu transaksi;
   tidak ada pola `ALTER TYPE ADD VALUE` dalam transaksi yang sama karena baseline
   membuat enum baru penuh, bukan menambah nilai).
3. Tabel sesuai FK: users → categories → store_applications → stores → listings →
   listing_images → rental_transactions → transaction_items → payments → late_fees →
   disputes → reviews → wishlists → audit_logs.
4. Index & constraint (dibuat bersama tabel).
5. Trigger + fungsi trigger.
6. Helper functions (SECDEF + search_path).
7. RPC functions.
8. RLS enable + policies.
9. Revoke default + grants eksplisit (EXECUTE, SELECT tabel).
10. Sanity checks (RAISE EXCEPTION bila RLS salah).

## 3. Checklist penerapan (manual, setelah approval)

1. Buat project Supabase baru.
2. SQL Editor → jalankan `20260926000000_baseline_erd_v2.sql` (satu kali, dari kosong).
3. (Opsional dev) jalankan seed kategori.
4. Jalankan `scripts/verify-schema-readonly.sql` → semua baris wajib PASS.
5. Bootstrap admin: daftar akun lewat aplikasi, lalu
   `UPDATE public.users SET role='admin' WHERE email='<email-operator>';`
6. Update `.env.local` frontend dengan URL + anon key project baru.
7. Smoke test: `npm run verify:supabase` (setelah script diadaptasi, Phase 8).

## 4. Rollback / pemulihan

- Project baru: bila baseline gagal di tengah, drop schema `public` objects dan jalankan ulang
  (atau buat ulang project). Tidak ada data bisnis pada tahap ini.
- Project lama **tidak disentuh** — tetap sebagai backup.

## 5. Status

- [x] Baseline ditulis + direview terhadap kontrak (schema, RLS, 30 RPC, grants,
      sanity checks). Dua bug ditemukan & diperbaiki: (1) saat review — INSERT
      `create_rental` menyebut kolom `total_days` yang tidak ada di kontrak §4.7;
      (2) post-deploy — seluruh RPC plpgsql ber-RETURNS TABLE menutup dengan
      `RETURN;` yang tidak mem-emit baris (di-fix forward-only oleh
      `20260926000002_rpcs_return_next_fix.sql`).
- [x] Seed dev kategori ditulis terpisah (`20260926000001_seed_dev_categories.sql`).
- [x] `scripts/verify-schema-readonly.sql` ditulis ulang untuk baseline (read-only).
- [x] `scripts/verify-supabase-connection.mjs` ditulis ulang untuk RPC baru
      (+ regresi: persis-satu-baris & `start_date_in_past`).
- [x] Eksekusi baseline ke project Supabase baru — SELESAI (project
      `ucbfmygxkquugrtnvvqf`), diikuti fix migration + seed kategori dev.
- [x] Eksekusi `20260927000000_rpcs_guard_stop_fix.sql` ke project target
      (`yjwlqqigbzvjbvpwybup` — project aktif `.env.local`/`.env`) — SELESAI
      via `node scripts/apply-migration.mjs … --yes`, diikuti smoke test
      `npm run verify:supabase` PASS penuh. Catatan: `DATABASE_URL` awal gagal
      auth karena password terbungkus `[...]` dan tanpa `@` — diperbaiki oleh
      `scripts/fix-dburl.mjs` (uji varian, tulis varian yang sukses).
- [x] Eksekusi `20260927000001_rpcs_status_ambiguity_fix.sql` ke project target
      (`yjwlqqigbzvjbvpwybup` — project aktif `.env.local`) — SELESAI 27 Sep 2026
      via `node scripts/apply-migration.mjs … --yes` (satu transaksi, PostgreSQL 17.6);
      regression 79/79 + 26/26 + verifier PASS (detail `14-create-rental-fix-report.md`).
- [ ] Eksekusi `20260928000000_storage_buckets_policies.sql` — **MENUNGGU APPROVAL**
      (migration storage ditulis & ter-audit, TIDAK diterapkan otomatis; setelah
      diterapkan, jalankan smoke upload manual — lihat report tahap storage).
- [x] Verifikasi via `verify-schema-readonly.sql` di project baru — PASS.
- [ ] Bootstrap admin — menunggu registrasi akun operator + UPDATE role.
- [x] Env frontend mengarah ke project baru — SELESAI (`.env.local`).
- [x] Sinkronisasi Supabase CLI — SELESAI 27 Sep 2026: `supabase/.temp/linked-project.json`
      kini menunjuk project aktif `yjwlqqigbzvjbvpwybup` (sama dengan `.env.local`).
      (Historis: sebelumnya menunjuk project lama `ucbfmygxkquugrtnvvqf`.)
