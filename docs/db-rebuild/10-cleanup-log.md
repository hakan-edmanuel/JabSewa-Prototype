# JabSewa — Phase 10: Cleanup Log (Legacy → ERD v2)

> Inventaris objek/kode legacy yang dihapus atau diarsipkan saat migrasi ke
> baseline ERD v2, beserta alasannya. Dokumen lama (01-AUDIT.md, 02-DESAIN.md)
> dipertahankan sebagai riwayat; sumber kebenaran aktif adalah
> 02-final-prd.md, 03-database-design.md, 04-rpc-security-contract.md.

## 1. Database (tidak dibawa ke baseline baru)

| Objek legacy | Status | Alasan |
|---|---|---|
| Migration `20260921000002_full_reset_idempotent.sql` | Diarsipkan (tidak dijalankan) | Berisi schema legacy + seed demo inline + `search_hybrid` |
| Migration `20260924000000_rentals_wishlists_rls_rpcs.sql` | Diarsipkan | Gagal jalan utuh di DB legacy; digantikan baseline |
| Migration `20260925000000_legacy_schema_compat.sql` | Diarsipkan | Compatibility layer (kolom mirror + trigger sinkron dua arah) yang dilarang kontrak |
| Kolom mirror: `stores.name`, `stores.owner_id` (duplikat `user_id`), `listings.price`, `listings.stock`, `rental_transactions.buyer_id`/`tenant_id` | Dihapus dari baseline | Satu kolom kontrak saja (`stores.name`, `owner_id`, `listings.price`, `stock`, `rental_transactions.buyer_id`) |
| Trigger `jabsewa_stores_sync` / `jabsewa_listings_sync` | Tidak dibawa | Sumber schema drift |
| RPC lama: `rental_quote(bigint,…)`, `create_rental(bigint,…)`, `set_rental_status`, `get_rentals_for_user`, `get_rentals_for_store`, `submit_seller_application`, `decide_seller_application`, `list_seller_applications`, `listings_for_my_store`, `list_admin_audit_logs`, `search_hybrid`, `is_superadmin`, `get_my_store` | Tidak dibawa | Digantikan 30 RPC kontrak (04-rpc-security-contract.md §3); `search_hybrid` tidak pernah dipanggil frontend |
| Tabel `payment_records` / `admin_audit_logs` | Tidak dibawa | Digantikan `payments` / `audit_logs` sesuai ERD |
| Seed demo inline di migration schema | Dihapus | Seed terpisah (`20260926000001_seed_dev_categories.sql`), hanya kategori produk, tanpa akun/password |

## 2. Frontend (dihapus dari jalur produksi)

| Objek | Status | Alasan |
|---|---|---|
| `src/lib/storage.js` (451 baris) | **Dihapus** | Fallback demo LocalStorage berisi akun mock + password plaintext; semua data bisnis kini dari Supabase |
| Role constants `ROLE_TENANT` / `ROLE_STORE_OWNER` / `ROLE_SUPERADMIN` | Dihapus dari `roles.js` | D1: enum hanya `consumer | admin`; seller = lifecycle store |
| `DevRoleSwitcher` switch role | Diganti panel info sesi | Role tidak pernah diubah dari frontend |
| `logAdminAction()` client-side audit | Dihapus | Audit ditulis server-side oleh RPC via `log_audit()` — tidak bisa dilewati/dipalsukan |
| `users.seller_application` / `seller_profile` (jsonb) | Dihapus dari kontrak profil | Digantikan tabel `store_applications` + kepemilikan `stores` |
| Konversi `Number(id)` / `parseInt(id)` pada id listing | Dihapus | D3: semua id uuid string |
| `search_hybrid` RPC reference | Tidak ada | Pencarian tetap client-side di `lib/search.js` di atas data RLS-scoped |

## 3. LocalStorage yang SENGJAKA dipertahankan (bukan data bisnis)

| Key | Sifat | Alasan |
|---|---|---|
| `jabsewa:auth:v1` | Sesi Supabase (dikelola supabase-js) | Persist sesi login standar |
| `jabsewa:wishlist:guest` | Preferensi UX tamu | Wishlist belum-login disimpan lokal; tidak pernah di-merge otomatis ke DB (PRD §12); setelah login memakai server |

## 4. Verifikasi pembersihan

- `grep -rn "TENANT\|STORE_OWNER\|SUPERADMIN" src/` → hanya komentar riwayat & docstring yang menjelaskan migrasi.
- `grep -rn "lib/storage" src/` → tidak ada impor tersisa.
- `npm run build` / `npm run lint` / `npm test` → PASS setelah pembersihan.

## 5. Catatan post-deploy (2026-09-27) — bug RETURN NEXT

Baseline ERD v2 diterapkan ke project dev `ucbfmygxkquugrtnvvqf`, lalu
`npm run verify:supabase` gagal pada dua cek `quote_rental`: RPC tereksekusi
tanpa error tetapi PostgREST mengembalikan 0 baris. Akar masalah: seluruh 25 RPC
plpgsql ber-RETURNS TABLE di baseline menutup body dengan `RETURN;` biasa — pada
PL/pgSQL, `RETURNS TABLE` adalah SETOF record + OUT params, dan baris result set
hanya di-emit oleh `RETURN NEXT;` (docs PostgreSQL §41.6.1/§41.6.1.2); `RETURN;`
hanya mengakhiri eksekusi. RPC LANGUAGE sql (get_wishlist, get_my_stores,
list_audit_logs, dst.) tidak terdampak.

Tindakan:
- Migrasi forward-only `20260926000002_rpcs_return_next_fix.sql` — CREATE OR
  REPLACE 25 RPC (identik kecuali `RETURN;` → `RETURN NEXT;`, 157 jalur keluar)
  + sanity check keras di akhir migrasi. Idempotent.
- Verifier `scripts/verify-supabase-connection.mjs` diperketat: assert persis
  satu baris + jalur `start_date_in_past`; kasus 0 baris kini gagal dengan
  diagnosa eksplisit (sebelumnya `ok=true` false-positive karena `anyQuote?.[0]`
  hanya cek truthiness elemen pertama).
- Regresi statis vitest baru `src/lib/rpcContract.test.js` — mem-parse migrasi &
  mengunci kontrak return.
- Kontrak doc §15 quote_rental dikoreksi (tidak ada `p_store_id` dan
  `duration_units` top-level di implementasi 3-param; item memuat
  `duration_units`).

Pelajaran: untuk RPC Supabase ber-RETURNS TABLE di plpgsql, selalu tutup jalur
keluar dengan `RETURN NEXT;` — atau deklarasikan parameter `p_ok boolean OUT,
...` dan `RETURN;` hanya pada fungsi non-set.
