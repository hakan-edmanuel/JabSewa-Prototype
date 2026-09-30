# Laporan Audit Database JabSewa — ERD v2 (Read-Only)

> **Tanggal audit:** 27 September 2026
> **Project target:** Supabase `yjwlqqigbzvjbvpwybup` — **terverifikasi langsung**
> (koneksi via `DATABASE_URL` Session pooler `aws-0-ap-northeast-2.pooler.supabase.com`,
> PostgreSQL 17.6; smoke test `npm run verify:supabase` pada sesi yang sama menunjukkan
> perilaku RLS/RPC yang konsisten dengan project ini).
> **Metode:** 100% read-only — hanya `SELECT` ke `pg_catalog`/`information_schema`,
> `COUNT` katalog, dan probe `pg_get_functiondef`. Tidak ada DDL/DML, tidak ada
> transaksi rental, tidak ada secret yang ditampilkan.
> **Alat:** `scripts/audit-db-readonly.mjs` (output JSON), `scripts/probe-audit-extra.mjs`,
> pembanding lokal `supabase/migrations/20260926000000_baseline_erd_v2.sql`,
> `scripts/verify-schema-readonly.sql`, `docs/db-rebuild/06-migration-plan.md`.

---

## 1. Ringkasan kondisi database

| Aspek | Status |
|---|---|
| Konektivitas & identitas project | ✅ PostgreSQL 17.6, DB `postgres`, user `postgres` (pooler) |
| Tabel schema `public` | ✅ **14/14** tabel baseline; **0** tabel legacy tersisa |
| Enum tipe | ✅ **11/11** enum sesuai kontrak, tanpa enum liar |
| RLS | ✅ Aktif di **semua 14 tabel**; `FORCE RLS` tidak diaktifkan (sesuai baseline) |
| RPC | ✅ **30/30** RPC kontrak ada, signature & bahasa sesuai; versi live = fix guard terbaru |
| Helper & trigger | ✅ 9 helper + `handle_new_user`/`touch_updated_at` lengkap; 6 trigger pasang benar |
| RLS & grants | ✅ Tidak ada policy tulis pada tabel transaksi; anon EXECUTE sesuai kontrak |
| Data | ✅ DB praktis kosong (users 0, stores 0, listings 0, rentals 0); seed 4 kategori dev ada |
| Temuan terbuka | ⚠️ 2 LOW (fungsi `my_store_listings`/`rls_auto_enable` di luar daftar kontrak; default ACL longgar) — lihat §6 |

**Kesimpulan singkat:** struktur aktif di project target **sesuai ERD v2 + dua migration
fix**. Tidak ditemukan penyimpangan schema, RLS, atau grants yang berisiko tinggi.
Database siap dipakai untuk pengujian alur rental.

---

## 2. Status migration lokal vs database

Urutan migration yang diakui repo (`docs/db-rebuild/06-migration-plan.md`):

| # | File lokal | Status terpasang | Bukti langsung di database |
|---|---|---|---|
| 1 | `20260926000000_baseline_erd_v2.sql` | ✅ Terpasang | 14 tabel, 11 enum, 30 RPC + 9 helper, RLS & grants sesuai baseline |
| 2 | `20260926000001_seed_dev_categories.sql` | ✅ Terpasang | `categories` = `event, gadget, photography, sports` (4 baris) |
| 3 | `20260926000002_rpcs_return_next_fix.sql` | ✅ Terpasang | Semua RPC punya `RETURN NEXT` (`has_return_next = true`) |
| 4 | `20260927000000_rpcs_guard_stop_fix.sql` | ✅ Terpasang | Probe `guard_stop = true` pada `quote_rental`, `create_rental`, `toggle_wishlist`, `submit_store_application`, `decide_payment`; smoke test e2e lolos (RPC error path = **persis 1 baris**) |
| — | 3 migration legacy (`20260921…`, `20260924…`, `20260925…`) | ➖ Tidak diterapkan | Tidak ada jejak: 0 tabel legacy (`payment_records`, `admin_audit_logs`), 0 overload legacy (`toggle_wishlist(bigint)` hanya ada versi `uuid`), `users` tidak punya kolom `total_days` di transaksi |

Catatan: project **tidak dikelola supabase CLI** — tabel `schema_migrations` hanya ada di
schema `auth`/`storage`/`realtime` (bawaan platform), tidak di `public`. Status migration
disimpulkan dari objek database (bukti di kolom terakhir) dan sudah dikonfirmasi
`docs/db-rebuild/10-cleanup-log.md` bahwa migration legacy diarsipkan, tidak dijalankan.

**Hasil: lokal dan database sinkron penuh. Seluruh 4 migration resmi terpasang; tidak ada
migration lokal yang tertinggal, tidak ada objek liar dari migration lain.**

---

## 3. Inventarisasi tabel dan relasi

### 3.1 Tabel (14/14, semua RLS aktif)

| Tabel | Kolom | PK | FK | UNIQUE/CHECK penting |
|---|---|---|---|---|
| `users` | 10 | `id uuid` → `auth.users` CASCADE | — | `email UNIQUE`; `role user_role DEFAULT consumer`; `status user_status DEFAULT active`; `is_seller bool` |
| `categories` | 4 | `id uuid` | — | `slug UNIQUE` |
| `store_applications` | 12 | `id uuid` | `user_id→users CASCADE`, `reviewed_by→users SET NULL` | CHECK `status='rejected' ⇒ rejection_reason NOT NULL` |
| `stores` | 11 | `id uuid` | `owner_id→users RESTRICT` | CHECK `min_rental_duration > 0` atau NULL |
| `listings` | 13 | `id uuid` | `store_id→stores CASCADE`, `category_id→categories RESTRICT` | CHECK `price≥0`, `deposit≥0`, `stock≥0`; partial index `status='active'` |
| `listing_images` | 5 | `id uuid` | `listing_id→listings CASCADE` | `UNIQUE(listing_id, sort_order)`; CHECK `sort_order≥1` |
| `rental_transactions` | 16 | `id uuid` | `buyer_id→users RESTRICT`, `store_id→stores RESTRICT`, `cancelled_by→users SET NULL` | CHECK `end_date≥start_date`; CHECK `cancelled ⇒ cancelled_by & cancelled_at`; `total = subtotal+deposit_total` dijaga RPC; `late_fee_total` ada, **`total_days` memang tidak ada** (sesuai kontrak §4.7 — durasi turun dari start/end inclusive) |
| `transaction_items` | 7 | `id uuid` | `transaction_id→rental_transactions CASCADE`, `listing_id→listings RESTRICT` | CHECK `quantity>0`; kolom snapshot `price/deposit/subtotal` |
| `payments` | 9 | `id uuid` | `transaction_id→rental_transactions RESTRICT` | CHECK `amount>0`; `paid_at` nullable |
| `late_fees` | 7 | `id uuid` | `transaction_id UNIQUE →rental_transactions CASCADE` | CHECK `total = days_late*daily_rate` |
| `disputes` | 10 | `id uuid` | `transaction_id→rental_transactions RESTRICT`, `opened_by→users RESTRICT` | Partial UNIQUE `uq_disputes_active_per_tx` untuk status aktif |
| `reviews` | 7 | `id uuid` | `transaction_id UNIQUE`, `buyer_id→users RESTRICT`, `store_id→stores RESTRICT` | CHECK `rating 1..5` |
| `wishlists` | 4 | `id uuid` | `user_id→users CASCADE`, `listing_id→listings CASCADE` | `UNIQUE(user_id, listing_id)` |
| `audit_logs` | 7 | `id uuid` | `actor_id→users RESTRICT` | CHECK registry `action` (24 nilai) & `entity_type` (11 nilai) |

Tabel lain di `public`: **tidak ada** (0 legacy). Views: 0. Extensions: `pgcrypto`,
`uuid-ossp`.

### 3.2 Relasi utama (sesuai ERD)

```
auth.users 1─1 users (trigger handle_new_user di auth.users)
users 1─N store_applications ──(approve via RPC)──▶ stores
users 1─N stores 1─N listings 1─N listing_images
categories 1─N listings
users 1─N rental_transactions N─1 stores
rental_transactions 1─N transaction_items N─1 listings
rental_transactions 1─N payments / 1─1 late_fees / 1─N disputes / 1─1 reviews
users 1─N wishlists N─1 listings
users 1─N audit_logs (actor)
```

Tidak ada tabel/relasi hilang dan tidak ada relasi liar (FK ke tabel non-baseline).

---

## 4. Inventarisasi RPC

**Total 43 fungsi di `public`** = 30 RPC kontrak + 9 helper + 2 fungsi trigger + 2 di luar
daftar (`my_store_listings`, `rls_auto_enable` — dibahas §6). Tidak ada overload legacy
(`toggle_wishlist` hanya versi `uuid`; `list_audit_logs` hanya versi `(integer, integer)`;
`create_rental` hanya `(date, date, jsonb)`).

### 4.1 30 RPC kontrak — signature sesuai kontrak §4

| RPC | Signature | Language / SECDEF | EXECUTE |
|---|---|---|---|
| `submit_store_application` | `(text, text, text, text)` → `(ok, error, application_id)` | plpgsql, SECDEF | authenticated |
| `get_my_applications` | `()` | **sql**, SECDEF | authenticated |
| `list_store_applications` | `(application_status)` | **sql**, SECDEF | authenticated |
| `decide_store_application` | `(uuid, boolean, text)` | plpgsql, SECDEF | authenticated |
| `get_my_stores` | `()` | **sql**, SECDEF | authenticated |
| `update_my_store` | `(uuid, text, text, text, text)` | plpgsql, SECDEF | authenticated |
| `set_my_store_status` | `(uuid, store_status)` | plpgsql, SECDEF | authenticated |
| `admin_set_store_status` | `(uuid, store_status)` | plpgsql, SECDEF | authenticated |
| `save_listing` | `(uuid, uuid, uuid, text, text, bigint, integer, rental_unit, integer, boolean, text[])` | plpgsql, SECDEF | authenticated |
| `set_listing_availability` | `(uuid, boolean)` | plpgsql, SECDEF | authenticated |
| `delete_listing` | `(uuid)` | plpgsql, SECDEF | authenticated |
| `admin_set_listing_status` | `(uuid, listing_status)` | plpgsql, SECDEF | authenticated |
| `get_wishlist` | `()` | **sql**, SECDEF | authenticated |
| `toggle_wishlist` | `(uuid)` | plpgsql, SECDEF | authenticated |
| `quote_rental` | `(date, date, jsonb)` | plpgsql STABLE, SECDEF | **anon + authenticated** |
| `create_rental` | `(date, date, jsonb)` | plpgsql, SECDEF | authenticated |
| `cancel_rental` | `(uuid, text)` | plpgsql, SECDEF | authenticated |
| `submit_payment` | `(uuid, payment_method, text)` | plpgsql, SECDEF | authenticated |
| `decide_payment` | `(uuid, boolean, text)` | plpgsql, SECDEF | authenticated |
| `start_rental` | `(uuid)` | plpgsql, SECDEF | authenticated |
| `mark_overdue` | `(uuid)` | plpgsql, SECDEF | authenticated |
| `record_return` | `(uuid)` | plpgsql, SECDEF | authenticated |
| `apply_late_fee` | `(uuid, bigint)` | plpgsql, SECDEF | authenticated |
| `decide_late_fee` | `(uuid, late_fee_status)` | plpgsql, SECDEF | authenticated |
| `open_dispute` | `(uuid, text, text)` | plpgsql, SECDEF | authenticated |
| `resolve_dispute` | `(uuid, dispute_status, text)` | plpgsql, SECDEF | authenticated |
| `create_review` | `(uuid, integer, text)` | plpgsql, SECDEF | authenticated |
| `admin_set_user_status` | `(uuid, user_status)` | plpgsql, SECDEF | authenticated |
| `admin_set_user_role` | `(uuid, user_role)` | plpgsql, SECDEF | authenticated |
| `list_audit_logs` | `(integer, integer)` | **sql**, SECDEF | authenticated |

Catatan konsistensi versi (probe `pg_get_functiondef`):
- `RETURN NEXT; RETURN;` (guard-stop, fix 20260927000000) terdeteksi di semua 5 RPC yang
  di-probe — `quote_rental`, `create_rental`, `toggle_wishlist`, `submit_store_application`,
  `decide_payment`. Dikombinasikan dengan smoke test e2e yang lolos (error path mengembalikan
  **persis satu baris** `{ok:false, error}`), fix migration terakhir **aktif di live**.
- Semua fungsi SECDEF punya `search_path` eksplisit (`public`, event trigger `pg_catalog`)
  — **0 fungsi** SECDEF tanpa `search_path` (probe `secdef_without_search_path = []`).

### 4.2 Helper & fungsi trigger

9 helper (`is_admin`, `is_active_user`, `my_store`, `owns_store_of_tx`, `log_audit`,
`occupied_units`, `rental_unit_days`, `refresh_late_fee_total`, `sync_is_seller`) +
`handle_new_user` (trigger `auth.users`) + `touch_updated_at` — semua ada, sesuai baseline.
`is_admin` & `is_active_user` diekspos ke `anon` (dibutuhkan policy RLS) — sesuai kontrak.

### 4.3 Domain rental / wishlist / store / payment / return / audit

Semua domain di atas lengkap dan perilaku e2e-nya sudah diuji verifier:

- ✅ `quote_rental` menolak rentang terbalik (`invalid_date_range`) & tanggal lampau
  (`start_date_in_past`) dengan **satu baris** respons.
- ✅ `create_rental` menolak caller anonim (`permission denied` — EXECUTE hanya authenticated).
- ✅ `get_wishlist`, `get_my_stores`, `list_audit_logs` tidak bocor ke anonim.
- ✅ Trigger rental lifecycle (`start_rental` → `mark_overdue` → `record_return` →
  `apply_late_fee`) tersedia; pengujian transaksi nyata belum dilakukan (di luar lingkup
  audit read-only — DB kosong: 0 rentals).

---

## 5. Audit RLS dan grants

### 5.1 RLS

| Tabel | RLS | Policy (cmd) |
|---|---|---|
| `users` | ✅ | `users_select_own [SELECT]`, `users_select_admin [SELECT]` |
| `categories` | ✅ | `categories_read [SELECT]` (publik) |
| `store_applications` | ✅ | `applications_select_own`, `applications_select_admin` (keduanya SELECT) |
| `stores` | ✅ | `stores_read [SELECT]` |
| `listings` | ✅ | `listings_read [SELECT]` |
| `listing_images` | ✅ | `listing_images_read [SELECT]` |
| `rental_transactions` | ✅ | `rentals_select [SELECT]` |
| `transaction_items` | ✅ | `tx_items_select [SELECT]` |
| `payments` | ✅ | `payments_select [SELECT]` |
| `late_fees` | ✅ | `late_fees_select [SELECT]` |
| `disputes` | ✅ | `disputes_select [SELECT]` |
| `reviews` | ✅ | `reviews_read [SELECT]` |
| `wishlists` | ✅ | `wishlists_select/insert/delete` (satu-satunya tabel ber-policy tulis, sesuai baseline) |
| `audit_logs` | ✅ | `audit_logs_select_admin [SELECT]` |

- **Tidak ada policy INSERT/UPDATE/DELETE pada tabel transaksi** — semua penulisan
  via RPC SECDEF. ✅
- Setiap tabel punya minimal satu policy (`tables_without_any_policy = []`). ✅
- Bukti perilaku: verifier e2e — `rental_transactions` diblokir untuk anon (RLS aktif),
  `categories` terbaca publik. ✅
- `FORCE ROW LEVEL SECURITY` tidak diaktifkan pada 14 tabel — sesuai desain baseline
  (owner tabel = `postgres`, bukan role yang dipakai aplikasi).

### 5.2 Grants tabel (role `anon` / `authenticated`)

| Grantee | Pola | Penilaian |
|---|---|---|
| `anon` | SELECT hanya pada `categories`, `stores`, `listings`, `listing_images`, `reviews` | ✅ sesuai baseline (katalog publik) |
| `authenticated` | SELECT pada 13 tabel + wishlists INSERT/DELETE/SELECT; **tanpa** INSERT/UPDATE/DELETE di tabel lain | ✅ sesuai baseline |
| `service_role` | FULL semua tabel | ✅ bawaan platform |

Tidak ada GRANT tulis melebar ke `anon`/`authenticated` pada tabel transaksi. ✅

### 5.3 Grants EXECUTE fungsi

- `anon`: hanya `quote_rental`, `is_admin`, `is_active_user` + event trigger platform.
  ✅ sesuai kontrak (diverifikasi probe: 0 kebocoran di 30 RPC kontrak).
- `authenticated`: 30 RPC + helper sesuai baseline. ✅
- RPC admin & mutasi (`admin_set_*`, `decide_*`, `resolve_dispute`, `list_audit_logs`)
  memang ber-EXECUTE ke `authenticated`, tetapi guard `is_admin()`/ownership ada di
  dalam body (SECDEF + default-deny). Perilaku sudah dibuktikan verifier: anon →
  `permission denied`. ✅

### 5.4 SECURITY DEFINER

43 fungsi di `public` diperiksa: semua yang SECDEF memiliki `SET search_path` eksplisit.
Tidak ada SECDEF dengan `search_path` tidak aman. ✅

---

## 6. Daftar temuan berdasarkan tingkat risiko

### 🟡 SEDANG

**M-1. Default ACL schema `public` memberi privileges luas untuk objek baru.**
- Bukti: `pg_default_acl` — `defaclacl` untuk tabel (`r`), fungsi (`f`), sequence (`S`)
  owner `postgres` memberikan `arwdDxtm` (semua privilege) ke `anon`/`authenticated`/
  `service_role`, dan `EXECUTE` ke semua role.
- Artinya: **objek baru** yang dibuat kelak di `public` otomatis dapat akses luas
  sebelum RLS/policy-nya dibuat (jendela kebocoran), dan fungsi baru otomatis callable.
- Konteks: semua objek yang ada saat ini sudah dikunci eksplisit oleh baseline, jadi
  risiko ini tidak aktif hari ini; ini pembeda antara konfigurasi platform Supabase
  dan prinsip least-privilege baseline.
- (Ini juga menjelaskan kenapa `rls_auto_enable` di bawah tereksekusi platform.)

### 🟢 RENDAH

**L-1. Dua fungsi di `public` di luar daftar 30 RPC + 9 helper + 2 trigger:**
- `my_store_listings()` — **bagian dari baseline** (baseline §4.x, dibuat & di-GRANT
  EXECUTE ke `authenticated` di baseline §7), hanya tidak masuk daftar "30 RPC" di
  verifier. Bukti live: ada di katalog. Perilaku aman (SECDEF, search_path ok).
  → **Tindakan: dokumentasi** — tambahkan ke daftar resmi agar verifier/audit berikut
  tidak menandainya sebagai anomali.
- `rls_auto_enable()` — event trigger bawaan **platform Supabase** (`ensure_rls`),
  bukan objek project (0 kecocokan di repo). Ber-EXECUTE ke `anon` adalah default
  platform, tidak dapat di-revoke dari sisi project, dan tidak mengekspos data JabSewa.
  → **Tindakan: tidak perlu**; cukup dicatat sebagai known-platform-object.

**L-2. Tidak ada tabel penanda migration (`public.schema_migrations`).**
- Project tidak dikelola supabase CLI; status migration hanya bisa disimpulkan dari
  objek (seperti dilakukan laporan ini). Risiko operasional rendah karena migration
  dibuat idempotent + sanity check keras, tetapi jejak audit "migration mana yang
  sudah jalan" bergantung pada dokumentasi manual (`06-migration-plan.md`).

**L-3. Sanity check "RPC persis satu baris" hanya diuji pada 5 dari 25 RPC plpgsql.**
- Probe `guard_stop` hanya men-sampling 5 fungsi; 20 lainnya diverifikasi lewat
  invarian sanity check migration (yang gagal-keras bila dilanggar) + smoke test.
- Risiko sangat rendah (invarian dijaga migration), tetapi cakupan e2e bisa
  diperluas nanti saat alur rental diuji.

### Tidak ditemukan temuan berisiko KRITIS / TINGGI.

---

## 7. Rekomendasi perbaikan (urutan prioritas)

1. **(Menyusul M-1, opsional tapi murah)** Kunci default ACL `public` agar objek baru
   tidak otomatis terbuka: `ALTER DEFAULT PRIVILEGES ... REVOKE ALL` sesuai pola
   least-privilege baseline. Lakukan ketika ada jendela maintenance, tidak mendesak.
2. **(Menyusul L-1)** Perbarui `docs/db-rebuild/04-rpc-security-contract.md` dan
   `scripts/verify-schema-readonly.sql` agar `my_store_listings()` masuk daftar fungsi
   resmi — menghilangkan flag palsu pada audit berikutnya.
3. **(Menyusul L-2)** Sebelum pengujian alur rental dimulai: catat status migration di
   `06-migration-plan.md` sebagai sumber kebenaran (sudah dilakukan untuk fix
   20260927000000) atau mulai gunakan supabase CLI (`supabase link` + migration history).
4. **(Menyusul L-3)** Saat pengujian alur rental dimulai, tambahkan kasus e2e untuk
   seluruh 25 RPC plpgsql (khususnya jalur error) di verifier, bukan hanya 5 sampel.

**Tidak ada perbaikan yang bersifat mendesak.** Database **layak** dipakai sebagai
basis pengujian alur rental sesuai rencana.

---

## Lampiran — jejak pemeriksaan

- Script audit (read-only): `scripts/audit-db-readonly.mjs` (16 query katalog),
  `scripts/probe-audit-extra.mjs` (trigger/tipe/FK). Koneksi: Session pooler,
  IPv6, SSL. Password tidak pernah ditampilkan/dicatat.
- Data mentah JSON: `scripts/.audit-out.json` (42 KB) — menyertakan daftar kolom
  lengkap per tabel, definisi fungsi, grants detail, policies per tabel.
- Smoke test perilaku (`npm run verify:supabase`): 9/9 PASS pada sesi yang sama.
- Pembanding lokal: baseline 20260926000000 (§3 tabel, §4 RPC, §7 grants),
  migration fix 20260926000002 & 20260927000000, kontrak 04-rpc-security-contract.md.
