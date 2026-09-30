# Laporan Uji Alur Rental — Fixture & `quote_rental` (JabSewa)

> **Tanggal:** 27 September 2026 · **Project target:** Supabase `yjwlqqigbzvjbvpwybup`
> **Lingkup:** Tahap 1–4 dari rencana "Rental Flow Test Preparation".
> **Batasan yang dipegang:** tanpa transaksi rental sungguhan, tanpa perubahan migration/schema,
> tanpa penurunan RLS/grants, tanpa secret di repo, tanpa penghapusan data yang sudah ada.

---

## 1. Ringkasan

| Item | Hasil |
|---|---|
| Kesiapan DB | ✅ Kosong & sesuai baseline ERD v2 (0 users/stores/listings saat mulai) |
| Konfigurasi env | ✅ Diperbaiki (lihat §6.1) — kini konsisten menunjuk project target |
| Fixture | ✅ 3 user auth asli + store aktif + 2 listing aktif (semua via jalur resmi) |
| Uji `quote_rental` | ✅ **26 PASS, 0 FAIL** (8 kasus kontrak) |
| Transaksi rental tertulis | 0 (`rental_transactions` = 0 setelah seluruh test) |
| Data tersisa | Data fixture saja — cleanup satu perintah tersedia (`scripts/test-rental-cleanup.mjs`) |

**Kategori test:** LOKAL = tidak ada (SQL verifikasi read-only via `DATABASE_URL`);
FIXTURE = 3 user, 1 store, 2 listing dibuat sekali di awal;
LIVE Supabase = seluruh 8 kasus `quote_rental` + smoke `verify:supabase` dijalankan langsung ke project.

---

## 2. Fixture yang dibuat (deterministik, idempoten)

Skrip: `scripts/test-rental-fixture.mjs` → state: `scripts/.rental-fixture.json` (di-gitignore).

| Entitas | Nilai | Cara pembuatan (jalur resmi) |
|---|---|---|
| `admin.jabsewa.test@gmail.com` | id `255ef456-422a-4bbf-9f51-a952a217080e` | Admin API `createUser(email_confirm: true)` + `UPDATE users SET role='admin'` (bootstrap §3 env-setup) |
| `seller.jabsewa.test@gmail.com` | id `96fc90d3-e417-4667-8c6a-31013ea5a076` | Admin API, lalu `submit_store_application` (seller) → `decide_store_application(approve)` (admin) |
| `buyer.jabsewa.test@gmail.com` | id `02dae72e-4e25-49e0-bed8-d9a7bbc7eec0` | Admin API (consumer biasa) |
| Store **Toko Fixture Rental** | `c9578ad8-98d0-4aa9-b62c-6da0f67a62cc`, status `active` | Hasil approve application (RPC admin) |
| Listing **Kamera Sony A7III** | `8ccf7a2e-8ba5-472f-964d-c0d4851516a8` — price 150.000, deposit 2.000.000, stock 3, `day` | `save_listing` oleh seller |
| Listing **Tripod Manfrotto** | `2d20ff33-ca10-4dc7-82f2-489c356ae240` — price 40.000, deposit 500.000, stock 2, `day` | `save_listing` oleh seller |

Password fixture (sama untuk 3 user): dibaca dari env `JABSEWA_FIXTURE_PASSWORD`
(shell lokal atau `.env.local`, keduanya di-gitignore) dan hanya disimpan di state file
`scripts/.rental-fixture.json` (di-gitignore) untuk dipakai script test downstream —
**tidak ada di source code maupun repo** (fix tahap Security Fix; sebelumnya pernah
hardcoded di `test-rental-fixture.mjs`, kini dihapus).
Audit trail yang tercipta: `application_submit` ×1, `application_approve` ×1, `listing_create` ×3
(2 fixture + 1 listing TMP untuk Kasus 5).

---

## 3. Uji `quote_rental` — input & hasil aktual

Semua kasus: RPC `quote_rental(p_start, p_end, p_items)` via PostgREST; kontrak respons
`{ok, error, total_days, subtotal, deposit_total, total, items[]}` **persis 1 baris** (no exception).

| # | Skenario | Input | Hasil aktual | Ekspektasi kontrak | Status |
|---|---|---|---|---|---|
| 1 | Rentang valid (buyer) | d+1 → d+3, L1 qty 2 | `ok=true`, `total_days=3`, subtotal 900.000, deposit 4.000.000, total 4.900.000, `duration_units=3` | sama | ✅ |
| 2 | Rentang terbalik | d+3 → d+1 | `ok=false`, `error=invalid_date_range` | `invalid_date_range` | ✅ |
| 3 | Tanggal lampau | d−2 → d−1 | `ok=false`, `error=start_date_in_past` | `start_date_in_past` | ✅ |
| 4 | Listing tidak ada | uuid nol | `ok=false`, `error=listing_not_found` | `listing_not_found` | ✅ |
| 5 | Listing nonaktif | listing TMP `p_available=false` (dibuat & dihapus test) | `ok=false`, `error=listing_unavailable` | `listing_unavailable` | ✅ |
| 6 | Stok kurang | L1 qty 4 (stock 3) | `ok=false`, `error=insufficient_stock` | `insufficient_stock` | ✅ |
| 7 | Multi item, end-inclusive | d+5 → d+7: L1 qty 1 + L2 qty 2 | `total_days=3`; item L1 450.000 + L2 240.000; subtotal 690.000; deposit 3.000.000; total 3.690.000 | sama (durasi inclusive, harga snapshot current) | ✅ |
| 8 | Kontrak respons & anon | anon client, L2 qty 1 | `ok=true`, `error=null`, semua kolom kontrak hadir; anon diizinkan EXECUTE | sesuai §4 (anon + authenticated) | ✅ |

Perhitungan durasi terverifikasi: `total_days = (end − start) + 1` (inclusive), diterapkan konsisten
per item (`duration_units`) dan agregat; `total = subtotal + deposit_total`.
Urutan validasi sesuai kontrak: `invalid_date_range` **sebelum** `start_date_in_past`.

---

## 4. Perhitungan harga & durasi (bukti angka)

- Kasus 1: 3 hari × 2 unit × 150.000 = **900.000**; deposit 2 × 2.000.000 = **4.000.000**; total **4.900.000** ✅
- Kasus 7: L1 = 3 × 1 × 150.000 = **450.000**; L2 = 3 × 2 × 40.000 = **240.000**;
  subtotal **690.000** (== jumlah item); deposit 2.000.000 + 2×500.000 = **3.000.000**; total **3.690.000** ✅

---

## 5. Data yang perlu dibersihkan (opsional, saat ini masih ada)

Tidak ada yang **wajib** dibersihkan sekarang — tidak ada transaksi rental. Sisa fixture:

- 3 auth users (`auth.users`) + 3 profil (`public.users`)
- 1 store (`c9578ad8…`) + 2 listing (`8ccf7a2e…`, `2d20ff33…`)
- 1 store application (`a54a1d86…`, approved)
- 5 baris `audit_logs` (submit, approve, listing_create ×3)

Cleanup aman satu perintah (urutan FK benar, hanya menyentuh id fixture dari state file):

```bash
node scripts/test-rental-cleanup.mjs   # data bisnis via SQL + auth.users via service key/SQL
```

---

## 6. Masalah yang ditemukan & tindakan

1. **`.env.local` menunjuk project lama** `ucbfmygxkquugrtnvvqf` (menimpa `.env` yang benar).
   Semua loader (skrip test & Vite) membaca `.env.local` terakhir → test akan mengarah ke project salah.
   *Tindakan (disetujui user):* `.env.local` diselaraskan ke `yjwlqqigbzvjbvpwybup`.
   Catatan: `docs/db-rebuild/06-migration-plan.md` §5 berisi dua klaim yang kini tertukar
   ("Env frontend mengarah ke project baru — `.env.local`" sudah tidak akurat; status `supabase link`
   juga menyebut project lama). Disarankan diperbarui saat berikutnya menyentuh dokumen itu.
2. **Sign-up mandiri terblokir** pada project target: error `email_address_invalid` untuk alamat
   gmail yang valid secara sintaks (indikasi verifikasi mailbox), ditambah rate limit SMTP
   (`over_email_send_rate_limit`) dan konfirmasi email aktif. *Tindakan:* provisioning fixture
   dialihkan ke **Admin API** `createUser(email_confirm: true)` (mode default skrip sekarang)
   — identitas auth tetap asli, dapat `signInWithPassword`, tanpa kirim email.
3. **Cleanup auth.users tanpa service key** akan meninggalkan user yatim. *Tindakan:*
   `test-rental-cleanup.mjs` diberi fallback hapus `auth.users` via `DATABASE_URL`.
4. **Minor:** state fixture berisi password test — kini eksplisit masuk `.gitignore`
   (`scripts/.rental-fixture.json`).

---

## 7. Rekomendasi untuk tahap `create_rental`

1. **Pakai fixture yang sama** (sudah deterministik + idempoten); tambahkan kasus berbasis id di state file.
2. Kasus wajib: sukses 1 item (snapshot price/deposit tersimpan di `transaction_items`),
   `mixed_stores` (butuh store/listing kedua — tambahkan via jalur resmi jika akan diuji),
   `too_many_items` (21 item), `invalid_quantity` (0/negatif), `min_duration`
   (set `min_rental_duration` listing via `save_listing` update), `start_date_in_past`,
   dan `insufficient_stock`.
3. **Konkurensi (advisory lock):** jalankan dua `create_rental` paralel untuk qty yang sama;
   ekspektasi tepat satu sukses, satu `insufficient_stock` — tanpa duplikat baris.
4. **Retry aman:** panggilan gagal (mis. `min_duration`) tidak boleh meninggalkan baris transaksi;
   verifikasi `count(*)` tetap 0 setelah tiap kasus gagal.
5. **Audit:** setiap sukses harus menambah `audit_logs` `rental_create` (cek actor = buyer).
6. Setelah sukses: satu transaksi `pending` dibuat → gunakan `cancel_rental` (buyer, `pending`)
   sebagai penutup siklus test agar data tetap terkonsolidasi, lalu cleanup transaksi bersama fixture.
7. Catat bahwa `total_days` **tidak** ada di `rental_transactions` (by design, kontrak §4.7) —
   jangan jadikan kegagalan test.
8. Jangan ubah kontrak/skrip verifikasi hanya agar test lolos (prinsip yang dipegang di sesi ini:
   semua kasus lolos terhadap kontrak apa adanya).
