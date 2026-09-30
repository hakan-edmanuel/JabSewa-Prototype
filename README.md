# JabSewa

Marketplace sewa barang peer-to-peer untuk area Jabodetabek. Konsumen menemukan
dan menyewa barang dari toko-toko terdaftar; pemilik toko mengelola katalog,
memverifikasi pembayaran transfer manual, dan menangani pengembalian/denda.

## Stack

- **Frontend**: React 19 + Vite (SPA, tanpa framework router eksternal)
- **Backend**: Supabase — Auth (GoTrue), Postgres (RLS + 30 RPC `SECURITY DEFINER`)
- **Pembayaran**: transfer bank manual + bukti (tanpa gateway — MVP)

## Arsitektur singkat

- **Role model (D1)**: enum DB hanya `consumer | admin`. "Seller" bukan role —
  status turunan dari kepemilikan `stores` aktif (`users.is_seller` hanyalah
  cache yang di-maintain server).
- **Sumber kebenaran**: Supabase. Frontend tidak pernah menghitung harga/total;
  semua nilai keuangan dihitung RPC server-side (snapshot di `transaction_items`).
- **Tulis data bisnis hanya via RPC**: RLS menutup INSERT/UPDATE/DELETE pada
  tabel transaksi; 30 RPC memvalidasi identitas (`auth.uid()`), ownership, dan
  transisi status di dalam database.
- **Kontrak**: lihat `docs/db-rebuild/` (01 audit, 02 PRD, 03 schema + ERD,
  04 RPC & security contract, 05→07 rencana migrasi & integrasi frontend).

## Setup

### 1. Database (Supabase project baru & kosong)

1. Buat project Supabase baru.
2. SQL Editor → jalankan `supabase/migrations/20260926000000_baseline_erd_v2.sql`
   (sekali, dari kosong — berisi enum, 14 tabel, trigger, helper, 30 RPC, RLS,
   grants, sanity check).
3. (Dev/staging saja) jalankan `supabase/migrations/20260926000001_seed_dev_categories.sql`
   untuk 4 kategori awal.
4. Jalankan fix migrations (berurutan, idempotent):
   `supabase/migrations/20260926000002_rpcs_return_next_fix.sql` lalu
   `supabase/migrations/20260927000000_rpcs_guard_stop_fix.sql`.
5. Verifikasi: SQL Editor → jalankan `scripts/verify-schema-readonly.sql` —
   semua baris wajib `PASS` (skrip 100% read-only).
6. Bootstrap admin (sekali, manual):
   - Daftar akun lewat aplikasi (trigger membuat profil `consumer`).
   - `UPDATE public.users SET role = 'admin' WHERE email = '<email-operator>';`

> Migration legacy (`20260921…`, `20260924…`, `20260925…`) TIDAK dijalankan —
> hanya arsip. Baseline ini untuk project baru; lihat `docs/db-rebuild/06-migration-plan.md`.
>
> Alternatif tooling lokal: `node scripts/apply-migration.mjs <file.sql> [--yes]`
> (butuh `DATABASE_URL` di `.env`; server-side saja).

### 2. Environment

```bash
cp .env.example .env.local
```

Isi:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon/publishable key>
```

Keduanya publik-safe (dibundle frontend). Jangan pernah menaruh
`SUPABASE_SERVICE_ROLE_KEY` / `DATABASE_URL` di env frontend.

### 3. Jalankan

```bash
npm install
npm run dev        # development
npm run build      # production build
npm run lint       # eslint
npm test           # unit test kontrak rental (vitest)
npm run verify:supabase   # smoke test read-only terhadap project live
```

## Alur bisnis utama

1. **Consumer**: daftar/masuk → browse katalog (toko & listing aktif) →
   quote harga server-side → buat rental multi-item (satu toko per transaksi) →
   kirim bukti pembayaran → admin/owner verifikasi → serah terima → pengembalian
   → review.
2. **Seller lifecycle**: consumer mengajukan toko (`submit_store_application`)
   → admin approve (`decide_store_application` membuat store aktif) → kelola
   listing (CRUD via RPC, kategori dari tabel `categories`) → verifikasi
   pembayaran masuk → confirm/ongoing/complete rental, nilai denda.
3. **Admin**: review ajuan (self-review ditolak), suspend/aktivasi toko &
   listing, kelola role/status user (tidak bisa mengubah dirinya), baca audit
   log. Semua keputusan otomatis tercatat di `audit_logs` (server-side).

## Status

Lihat `docs/db-rebuild/07-frontend-integration.md` (status integrasi frontend)
dan `docs/db-rebuild/10-cleanup-log.md` (yang dihapus & alasannya).
Kode, test, dan dokumentasi telah diselaraskan dengan kontrak ERD v2;
eksekusi baseline ke project Supabase live memerlukan approval (lihat
`docs/db-rebuild/06-migration-plan.md` §5).
