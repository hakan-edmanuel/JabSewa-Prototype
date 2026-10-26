# JabSewa — Tahap 19: Post-Admin-Update Audit (Read-Only)

> **Tanggal:** 18 Oktober 2026 · **Mode:** read-only audit — **tidak ada perubahan kode/DB/konfigurasi/migration**
> **Objek audit:** state setelah commit `933ef6c` ("update admin big update", 7 Okt 2026) + working tree saat ini
> **Kesimpulan ringkas:** pemeriksaan statik & live **HIJAU**; 1 temuan baru **MEDIUM**
> (migration storage 20260928000000 belum diterapkan ke live sementara frontend kini
> sudah memakai bucket); sisanya temuan lama yang terbawa dan sudah/konsisten diperlakukan.

---

## 1. Status build, lint, test, verify (semua lolos)

| Pemeriksaan | Hasil |
|---|---|
| `npm run build` | ✅ exit 0 (~10 s; catatan chunk >500 kB & plugin-timings Vite — non-blocking, sama seperti lap. 18) |
| `npm run lint` | ✅ exit 0 — 0 error, 0 warning |
| `npm test` (vitest) | ✅ **93/93 PASS, 6 file** — tumbuh dari 42 (lap. 18): rentalLogic 30, rpcContract 12, **postLoginRouting 17**, **uploads 12**, **auth 4**, **adminContract 18** (4 file baru dari commit admin) |
| `npm run verify:supabase` (live) | ✅ 9/9 — RLS aktif, seed kategori 4 baris, quote_rental kontrak, anon ditolak di create_rental/get_wishlist/get_my_stores/list_audit_logs |
| Audit DB live read-only (SELECT-only `scripts/audit-db-readonly.mjs` + probe tambahan) | ✅ 14/14 tabel, semua RLS on, 11/11 enum, RPC-30 + 9 helper + 2 trigger trigger-fn lengkap, `secdef_without_search_path` = 0, tanpa write-policy pada tabel transaksi, seed kategori lengkap. Live counts: users 10, stores 3, listings 5, rentals 71 |
| Guard probe live (RETURN NEXT; RETURN;) | ✅ `quote_rental`, `create_rental`, `toggle_wishlist`, `submit_store_application`, `decide_payment` — semua versi guard-stop |

## 2. State git

- **Tracked:** 130 file (lap. 18: 36 modified + 33 untracked → kini semua ter-commit; history: `933ef6c` di atas `3ff0fe5`).
- **Modified (1):** `src/auth/AuthContext.jsx`, **151+/131− → terverifikasi murni pemformatan** (quotes/semicolon/line-wrap ala prettier). Verifikasi token-level: setiap baris removed berpasangan dengan added yang identik modulo `"`/`;`/spasi — **0 perubahan perilaku**.
- **Untracked:** 0 · **Staging:** kosong.
- **`.gitignore`:** seluruh rekomendasi lap. 18 §4 diterapkan ✅ — `supabase/.temp/`, `scripts/.audit-out.json`, `scripts/.audit-err.txt`, `scripts/.frontend-e2e-out.txt`, plus `scripts/.rental-fixture.json` (tersilik `git check-ignore`: semua ter-ignore ✅).

## 3. Keamanan repository

1. ✅ **`.env.example` sudah placeholder** (`<project-ref>.supabase.co`, `<anon-publishable-key>`) — temuan lap. 18 §4.3 ditindaklanjuti benar.
2. ✅ **Tidak ada secret ter-track**: grep `sb_publishable_`/`sb_secret_`/JWT-prefix (`eyJhbGciOi`)/nilai `service_role` pada seluruh tree ter-track hanya menemukan nama env di komentar/kode (dok kontrak, guard in `scripts/test-*.mjs`).
3. ⚠️ (terbawa, LOW, non-blocking) Ref project dev `yjwlqqigbzvjbvpwybup` masih muncul di **11 file ter-track** (9 dok `docs/db-rebuild`, `scripts/audit-db-readonly.mjs`, komentar `20260927000001_…sql`). Bukan secret; tetap relevan bila repo akan publik.
4. ✅ Kredensial sensitif (`.env`, `.env.local`, fixture password, pooler-url) tidak ter-track & ter-ignore.

## 4. Integritas migration chain (commit admin)

- **`20260927000001_rpcs_status_ambiguity_fix.sql` (file TER-DEPLOY) diedit di commit admin** → diperiksa: **0 baris SQL berubah** (`grep` non-komentar pada diff = 0); hanya header komentar: status naik dari "PROPOSAL — BELUM DITERAPKAN" → "canonical repository" + riwayat deploy. Perilaku tidak berubah ✅.
- `20260921000002_full_reset_idempotent.sql`: hanya perubahan newline di EOF (kosmetik) ✅.
- **Migration baru `20260928000000_storage_buckets_policies.sql`** (210 baris): 2 bucket (listing-images public-read, payment-proofs private) + policy `storage.objects` + helper path — **idempotent, forward-only, tidak menyentuh schema public/RPC/RLS public**. Diragukan di lap. 06 dengan checklist "MENUNGGU APPROVAL".
- Cross-check kontrak frontend ↔ migration (parser statik): **28 RPC unik dipakai `src/**` — semuanya terdefinisi di migration (0 missing)**; 58 nama fungsi unik terdefinisi (termasuk helper & trigger), 30 di antaranya belum dipakai frontend (reserved/tooling) — konsisten dengan kontrak lap. 11.

## 5. Temuan utama — GAP functional (MEDIUM, non-blocking)

⚠️ **Storage migration BELUM diterapkan ke project live, frontend sudah mengirim file.**
- Bukti live (probe SELECT-only `storage.buckets`/`pg_policies`+`storage.objects`): **bucket = 0, policy storage = 0, objects = 0.**
- Bukti kode: commit admin menambah `src/lib/uploads.js` (`LISTING_IMAGES_BUCKET = 'listing-images'`, `PAYMENT_PROOFS_BUCKET = 'payment-proofs'`) + UI terkait; `uploads.test.js` 12/12 PASS (statik, tidak sentuh storage nyata).
- **Implikasi**: saat fitur upload dipakai di env live, request akan gagal (bucket tidak ada) sampai (a) owner menyetujui/menjalankan `20260928000000` via koneksi operator, (b) bucket provider dibuat sesuai prasyarat di header file migration.
- Dok mutlak konsisten (lap. 06 checklist `20260928000000` masih `[ ]`), jadi ini **gap kode-vs-live, bukan gap dokumentasi**. Status fitur frontend "dibangun, menunggu backend".
- Catatan: 2 fungsi di luar daftar kontrak yang muncul di audit DB (`my_store_listings`, `rls_auto_enable`) **sudah dijelaskan di lap. 11 §6** (LOW; bagian baseline & event-trigger platform) — bukan drift baru.

## 6. Blocker / keputusan yang tersisa (terbawa)

1. **Approval & eksekusi `20260928000000_storage_buckets_policies.sql`** — kini juga block-UNTUK-FITUR-UPLOAD (bukan hanya housekeeping); temuan ini naik prioritasnya sejak commit admin.
2. Keputusan owner CATATAN-K (kontrak §3.5 #20 vs tx-kembali-pending) & CATATAN-O — belum ada migration keputusan; frontend mengikuti implementasi.
3. Engine side: UI `update_my_store` / `set_my_store_status` masih belum dibangun; smoke success-path tiap deploy RPC & rotasi kredensial (lap. 18 §6) tetap berlaku.

## 7. Yang TIDAK dijalankan dalam audit ini (batasan read-only)

- `scripts/test-frontend-rental-e2e.mjs`, `test-create-rental.mjs`, `test-rental-lifecycle.mjs`, `apply-migration.mjs` — **sengaja tidak dijalankan**: menulis fixture/data uji → di luar batasan read-only. Angka live E2E terakhir tetap lap. 17 (65/65, 8 skenario).
- Tidak ada `git add`/commit/push; tidak ada perubahan `.gitignore`/`.env*`; tidak ada SQL non-SELECT.

## 8. Rekomendasi (urutan minimal)

**Commit working tree: SIAP** — satu-satunya diff adalah pemformatan `AuthContext.jsx` (terverifikasi 0 perubahan perilaku). Saran: commit dengan pesan eksplisit "style only" agar mudah ditelusuri.

Sebelum fitur upload dinyatakan selesai: jalankan langkah §6.1 (approval owner + eksekusi migration + buat bucket provider), lalu verifikasi upload end-to-end di env live.
