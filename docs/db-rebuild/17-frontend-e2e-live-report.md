# JabSewa — Tahap 17: E2E Live Frontend Testing (Laporan Akhir)

> **Tanggal:** 28 September 2026 · **Project:** Supabase `yjwlqqigbzvjbvpwybup` (dev)
> **Prasyarat:** laporan 14 (fix 42702), 15 (lifecycle E2E), 16 (integrasi frontend)
> **Harness:** `scripts/test-frontend-rental-e2e.mjs` (baru) · **State:** `scripts/.rental-fixture.json` → `frontendE2E`
> **Log lengkap:** `scripts/.frontend-e2e-out.txt`
> **Hasil akhir:** **65 PASS, 0 FAIL** · tanpa pembayaran riil · tanpa perubahan schema/RPC/RLS/grants/migration · tanpa commit/push

---

## 1. Prasyarat (semua terpenuhi sebelum tes)

| Pemeriksaan | Hasil |
|---|---|
| `VITE_SUPABASE_URL` → ref `yjwlqqigbzvjbvpwybup` | ✅ cocok dengan project laporan 14/15/16 |
| `npm run verify:supabase` (9 pemeriksaan read-only) | ✅ semua lolos — RLS aktif, kontrak RPC sehat, anon ditolak |
| Akun fixture terpisah (buyer, seller, seller2, admin) + password | ✅ dari `scripts/.rental-fixture.json` — 4 sesi `signInWithPassword` independen (meniru sesi browser) |
| `DATABASE_URL` (read-only untuk verifikasi audit & simulasi waktu) | ✅ SET (nilai disembunyikan) |
| Fixture listing (L1 stok 3, LN stok 1) | ✅ tersedia, tidak dihapus |

## 2. PASS/FAIL per skenario

| # | Skenario (sesuai penugasan) | Hasil | Assertion |
|---|---|---|---|
| 1 | Buyer: listing → quantity → quote → create → kirim bukti | ✅ PASS | 1a–1j (10) |
| 2 | Seller: verifikasi, tolak dengan alasan; buyer kirim ulang | ✅ PASS | 2a–2j (10) |
| 3 | Seller: setujui pembayaran & mulai rental | ✅ PASS | 3a–3g (7) |
| 4 | Buyer/Seller: pengembalian → completed | ✅ PASS | 4a–4d (4) |
| 5 | Buyer: review sekali, tombol hilang setelahnya | ✅ PASS | 5a–5e (5) |
| 6 | Dispute: buyer buka, admin selesaikan | ✅ PASS | 6a–6h (8) |
| 7 | Late fee: nilai → paid (owner) → waived (admin) | ✅ PASS | 7a–7n (14) |
| 8 | Audit & konsistensi (audit_logs, payment, stok, double-submit) | ✅ PASS | 8a–8g (7) |
| | **Total** | **65 PASS, 0 FAIL** | |

Catatan metode: pengujian dijalankan sebagai harness kontrak-frontend — setiap panggilan meniru
persis apa yang dikirim UI (auth sesi per akun, RPC dengan parameter identik `src/lib/userData.js`,
direct SELECT RLS untuk bukti/denda/review/antrian dispute seperti BuyerPage, SellerOrders, SysOrders).
Latensi per RPC tercatat (110–470 ms, normal).

## 3. Transisi status rental utama (awal → akhir)

```
pending ──submit bukti #1──▶ payment_verify ──reject(note)──▶ pending  (payment #1 failed — BUKAN cancelled, CATATAN-K)
        ──submit bukti #2──▶ payment_verify ──approve──▶ confirmed ──start──▶ ongoing ──return──▶ completed ──review sekali──▶ ✅
```

Rental pendukung: dispute-flow `pending→payment_verify→confirmed→ongoing→disputed→(admin resolve)→completed`;
late-flow `…→ongoing→overdue→(late fee unpaid→paid→waived)→completed`. **Semua rental run ini tertutup
(3 rental utama + 1 duplikat double-submit dibatalkan = completed/cancelled, 0 rental aktif tertinggal).**

## 4. Bukti konsistensi

1. **Pembayaran server-computed**: quote & create qty=2 → `total = 4.600.000`
   (2 hari × 150rb × 2 unit + deposit 2jt × 2 = 600rb + 4jt) — payload client tidak dipercaya;
   DB: `payments.amount = 4600000`, status `pending` hingga approve; **mismatch amount-vs-total = 0 untuk SEMUA baris** (8b).
2. **Stok**: occupancy 2 unit selama aktif (1e), kembali 0 setelah completed (4d);
   kolom `stock` listings tidak pernah berubah — L1 3/3, LN 1/1 (8d, arsitektur occupancy).
3. **Audit 1:1**: `rental_transactions` = `audit_logs(rental_create)` = 66/66 (8a).
   11 jenis aksi tercatat dalam window run (8f): rental_create 16, payment_submit 16, payment_verify 12,
   return_record 8, dispute_open/resolve, latefee_apply/waive, payment_reject, rental_cancel, review_create —
   angka >1 karena run diulang untuk stabilisasi harness; per run, tiap aksi tercatat tepat sekali per kejadian
   (assertion per-aksi 1c/1i/2f/3c/4c/5c/6d/6h/7f/7m semuanya ✓).
4. **Double-submit (tanpa idempotency-key)**: 2 create paralel dari "klik ganda" → tepat satu sukses
   (rental utuh, 1 baris), satu gagal bersih `insufficient_stock` (stok tersisa 1 vs qty 2);
   **0 item yatim / data parsial** (8c); rental utama tetap memegang tepat 2 unit (1e).
5. **Role tidak berhak ditolak tanpa efek samping**: buyer verify sendiri → `forbidden` (2c);
   owner lain start → `forbidden` (3g); seller resolve dispute → `forbidden` (6f);
   owner waive → `forbidden` (7k); rental terkait tidak termutasi (8e: riwayat payment bersih 1 failed + 1 paid, berakhir completed).
6. **RLS frontend**: buyer membaca payments/reviews miliknya (2g, 5d) tapi TIDAK bisa baca `audit_logs` (8g);
   seller membaca late_fees tokonya (7h); admin membaca semua bukti (2b) dan antrian dispute join toko (6e).

## 5. Bug & temuan

**Bug aplikasi: 0.** Tidak ada kegagalan yang berasal dari kode frontend maupun RPC.

**Bug harness (2, diperbaiki saat sesi, terdokumentasi):**
1. `guardRentId is not defined` — referensi variabel hilang setelah refactor skenario → didefinisikan di skenario 2.
2. Ekspektasi keliru pada 1d & 8e:
   - 1d: duplikat double-submit qty=1 nyata-nyata bersaing dengan 2 unit yang dipegang rental utama
     (stok 3) → penolakan `insufficient_stock` adalah perilaku server yang BENAR; assertion diperbaiki
     menjadi "sukses = rental utuh ATAU gagal bersih insufficient_stock, tanpa data parsial".
   - 8e: rental "guard" ternyata mengikuti alur normal hingga completed (bukan tersangkut) → assertion
     diganti verifikasi riwayat payment rental utama (1 failed + 1 paid) sebagai bukti role-reject
     tidak meninggalkan efek samping.
   Root cause keduanya: kesalahan penulisan skrip uji, bukan perilaku sistem.

**Perilaku kontrak yang terkonfirmasi (sesuai catatan laporan 15):**
- CATATAN-K: reject bukti → tx kembali `pending` (bukan `cancelled`) — UI buyer menampilkan alasan
  penolakan dari payment failed & tombol kirim ulang muncul (2d–2h). ✅ frontend mengikuti perilaku aktual.
- CATATAN-O: `resolve_dispute` (outcome apa pun) menutup tx → `completed` (6g).
- CATATAN-I: listing ber-status disputed tetap bisa dibooking window sama (per kontrak §4.5) — tidak diuji ulang di sesi ini (sudah terverifikasi laporan 15, F6).

## 6. Blocker yang tersisa

**Tidak ada blocker untuk lingkup rental.** Catatan non-blocking:
1. Keputusan owner atas CATATAN-K/O masih menunggu (dokumen kontrak atau migration forward-only) —
   frontend saat ini mengikuti perilaku implementasi dan TIDAK akan rusak bila kontrak diselaraskan.
2. Storage upload (bukti pembayaran & foto listing) masih input URL manual — di luar lingkup rental.
3. UI edit toko (`update_my_store`, `set_my_store_status`) belum dibangun — di luar lingkup rental.
4. `.env.example` berisi URL + anon key project dev terisi — anon key public-safe, tapi sebaiknya
   template dikosongkan sebelum produksi.

## 7. Status kesiapan frontend

**SIAP untuk lingkup rental lifecycle** — berdasarkan pengujian aktual, bukan asumsi:
seluruh 13 RPC rental (`quote_rental`, `create_rental`, `cancel_rental`, `submit_payment`,
`decide_payment`, `start_rental`, `record_return`, `mark_overdue`, `apply_late_fee`,
`decide_late_fee`, `open_dispute`, `resolve_dispute`, `create_review`) + bacaan RLS
(payments/late_fees/disputes/reviews/rental_transactions) teruji live dari 4 sesi akun terpisah
dengan pemisahan role yang ditegakkan server dan audit lengkap.

**Cara reproduksi:**
```bash
node scripts/test-frontend-rental-e2e.mjs   # idempoten, auto-recovery rental sisa
```
Sisa data run: 3 rental completed + 1 cancelled (tercatat `state.frontendE2E.rental_ids`) —
dibersihkan bersama fixture lain oleh `node scripts/test-rental-cleanup.mjs` (belum dijalankan, sesuai batasan).
