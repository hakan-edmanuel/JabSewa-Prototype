# Laporan E2E Rental Lifecycle Audit & Testing — JabSewa

> **Tanggal:** 27 September 2026 · **Project target:** Supabase `yjwlqqigbzvjbvpwybup`
> **Prasyarat:** `14-create-rental-fix-report.md` (fix BUG-1 42702 diterapkan; create/cancel/payment jalur utama lulus).
> **Skrip:** `scripts/test-rental-lifecycle.mjs` (baru) · **State:** `scripts/.rental-fixture.json` → `state.e2e`
> **Kategori test:** LIVE Supabase (semua skenario), FIXTURE (buyer3 + listing LN/LO), LOKAL (verifikasi read-only via `DATABASE_URL`).
> **Batasan dipegang:** tanpa perubahan schema/RLS/grants/kontrak; tanpa pembayaran riil; tanpa cleanup penuh; tanpa commit/push.
> **Hasil:** **90 PASS, 0 FAIL** (run final; idempoten & re-runnable dengan auto-recovery).

---

## 1. Ringkasan per RPC

| # | RPC | Skenario | Hasil | Catatan utama |
|---|---|---|---|---|
| 1 | `submit_payment` | B2, C2, C5, D1, G1, G11 | ✅ | amount = total server (bukan payload); `payment_verify` setelah sukses; `forbidden` non-buyer; `not_found` ghost; `proof_required` tanpa bukti → **0 baris payment terbuat** (atomik) |
| 2 | `decide_payment` | B3, C3–C6, D2–D3, D6, G2 | ✅ | owner sah & admin; owner toko lain & buyer ditolak `forbidden`; reject tanpa note `reason_required` **tanpa efek samping**; approve idempoten-tunggal (`payment_not_pending` implisit via guard) |
| 3 | `start_rental` | B4, D4, G3 | ✅ | confirmed→ongoing; berulang `illegal_transition`; owner lain `forbidden`; ghost `forbidden` (anti-enumeration) |
| 4 | `record_return` | B5, D5, E10, G4 | ✅ | ongoing/overdue→completed; `actual_return_date` terisi; berulang `illegal_transition` |
| 5 | `apply_late_fee` | E5–E8, G6 | ✅ | completed on-time → `not_late` (days_late=0); overdue 1 hari → total=days×rate; **upsert 1 baris** (rate baru menimpa, `late_fee_total` ikut); owner lain `forbidden` |
| 6 | `decide_late_fee` | E9, E11–E13, G9 | ✅ | paid oleh owner; `waived` admin-only (`forbidden` utk owner); waived **tidak dihitung** (`late_fee_total`→0); decision invalid ditolak |
| 7 | `mark_overdue` | E3–E4, G5 | ✅ | sebelum end `not_late`; sesudah end → overdue; berulang `illegal_transition` (kontrak tidak menjanjikan idempoten — perilaku kontrak) |
| 8 | `open_dispute` | A2, F3–F4, F4b, G7 | ✅ | buyer/owner; tx ongoing→disputed; guard status dulu (disputed→`illegal_transition`); pasca-resolve boleh buka **dispute baru** (partial unique = satu AKTIF) |
| 9 | `resolve_dispute` | F5, F7, F4b, G8 | ✅ | admin-only; rejected & resolved; `resolved_by/at` terisi; tx disputed→completed (juga saat outcome=rejected — implementasi sederhana atas PRD §5.2; diberi catatan, bukan diubah) |
| 10 | `create_review` | B6, E14, F8, G10 | ✅ | rating 1..5 (`invalid_rating` di luar); UNIQUE per tx (`already_reviewed`); store_id dari tx; hanya tx `completed` |

## 2. Transisi status terverifikasi (uji langsung)

```
pending ──cancel──▶ cancelled
pending ──submit_payment──▶ payment_verify ──approve──▶ confirmed
                                       └─reject(note)──▶ pending (payment failed) ──submit ulang──▶ payment_verify ──▶ confirmed
confirmed ──start──▶ ongoing ──mark_overdue──▶ overdue ──record_return──▶ completed
ongoing/overdue ──open_dispute──▶ disputed ──resolve──▶ completed
semua status aktif ──cancel (sesuai matriks)──▶ cancelled
completed: tidak bisa cancel / start / return; review sekali
```
Seluruh transisi sesuai matriks PRD §5.2 + kontrak §3.6–3.7; penjaga `illegal_transition`/`not_late`/`forbidden` bekerja di setiap jalur yang dites.

## 3. Bukti konsistensi (verifikasi DB live)

- **Invarian 1:1**: `rental_transactions` = `audit_logs(rental_create)` = 50/50.
- **Payments**: 16 `paid` (18.760.000) + 5 `failed` (4.280.000); `amount = tx.total` untuk **semua** baris (mismatch 0); semua amount diturunkan server.
- **Rental akhir**: 10 `completed`, 40 `cancelled` — **0 rental tertinggal di status aktif**.
- **Inventori**: occupancy listing E2E (LN/LO) kembali 0 unit; kolom `stock` semua listing tak berubah (3/2/2/1/1), semua `active`.
- **Orphan/mismatch**: reviews/disputes/late_fees tanpa tx = 0; payment-vs-total mismatch = 0.
- **Lifecycle rows run ini**: +3 reviews, +2 disputes (1 rejected, 1 resolved), +1 late_fee (waived) — sesuai desain skenario.
- **Audit lifecycle tercatat**: payment_submit 21, payment_verify 16, payment_reject 3, return_record 8, latefee_apply 5, latefee_waive 2, dispute_open 3, dispute_resolve 3, review_create 9.

## 4. Bug & catatan (root cause + status)

1. **CATATAN-K (divergensi kontrak, bukan bug runtime)** — `decide_payment(reject)`:
   kontrak §3.5 #20 menyatakan "reject → payment `failed` + tx `cancelled`";
   implementasi: tx kembali **`pending`** (payment `failed`) agar buyer dapat kirim bukti ulang.
   Jalur `cancelled` tetap tersedia via `cancel_rental` (diizinkan pada `payment_verify`).
   **Tindakan:** tidak diubah (batasan tugas). Dua opsi owner: (a) perbarui kalimat kontrak,
   (b) usulan migration forward-only mengubah satu `UPDATE rental_transactions` di `decide_payment`.
   Frontend JANGAN berasumsi tx `cancelled` setelah reject.
2. **CATATAN-O (resolusi dispute outcome=rejected tetap menutup tx → completed)** — implementasi
   menyederhanakan PRD §5.2 ("dispute berjalan sendiri" setelah completed tercapai). Perilaku
   konsisten & teruji; layak dikonfirmasi ke owner kontrak (dokumen, bukan SQL).
3. **CATATAN-I (inventory vs disputed)** — `occupied_units` tidak menghitung status `disputed`
   (kontrak §4.5), sehingga listing ber-status `disputed` tetap bisa dibooking window sama
   (terbukti F6). Kontrak sudah eksplisit; dicatat sebagai risiko UX (double-booking logis
   saat dispute menunda penyelesaian).
4. **Anti-enumeration**: RPC owner-only (`start_rental`, `record_return`, `mark_overdue`,
   `apply_late_fee`) menjawab `forbidden` (bukan `not_found`) untuk ghost id — perilaku bagus,
   diverifikasi & didokumentasikan sebagai ekspektasi verifier.
5. Tanpa bug baru yang membutuhkan migration — tidak ada usulan SQL dalam laporan ini.

## 5. Fixture & status cleanup

- **Dipertahankan semua fixture lama** (tidak dihapus): 5 users, 2 stores, 3 listings, seluruh rental create-rental suite.
- **Tambahan E2E**: buyer3 `4c6b6957…` (Admin API, aktif), listing **GoPro Hero Fixture** `507d2641…` (store1, stock 1), **Drone Mini Fixture** `67fad51f…` (store2, stock 1).
- **Rental E2E run ini**: semuanya tertutup (completed/cancelled) — termasuk rental sisa run crash yang ditutup via **auto-recovery berbasis DB + RPC** (bukan SQL).
- **Simulasi waktu (SQL) yang pernah dilakukan**: geser `start_date+end_date` rental E-LF ke masa lalu — tercatat di `state.e2e.sql_mutations`; rental kini completed, tidak memegang inventori.
- **Cleanup**: `test-rental-cleanup.mjs` **diperluas** (reviews, disputes, late_fees, payments, rental, store2, L2a, buyer2/seller2/buyer3 — id dari state file, urutan FK aman) dan **belum dijalankan** sesuai batasan.

## 6. Kesimpulan kesiapan frontend

**Lulus penuh dan dapat diandalkan untuk frontend:**
`create_rental`, `cancel_rental`, `submit_payment`, `decide_payment`, `start_rental`,
`record_return`, `mark_overdue`, `apply_late_fee`, `decide_late_fee`, `open_dispute`,
`resolve_dispute`, `create_review`, plus `quote_rental` (26/26 dari sesi sebelumnya).

**Belum teruji (di luar cakupan suite ini):** store application/decision (sudah terpakai fixture),
`update_my_store`, `set_my_store_status`, `admin_set_*`, wishlist, `list_audit_logs`,
foto listing (`listing_images`), storage upload — klausul "seluruh sistem siap" **tidak dinyatakan**;
klaim dibatasi pada RPC lifecycle di atas terhadap project `yjwlqqigbzvjbvpwybup`.

**Prasyarat sebelum produksi (rekomendasi):**
1. Owner memutuskan CATATAN-K (kontrak atau migration) sebelum UI payment-reject dibangun.
2. Konfirmasi CATATAN-O & evaluasi CATATAN-I di level PRD.
3. Jalankan `test-rental-cleanup.mjs` saat fixture tidak lagi dibutuhkan.
