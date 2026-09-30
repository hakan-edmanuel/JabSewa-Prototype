# JabSewa — Phase 4: RPC & Security Contract (Final)

> Kontrak final untuk schema `03-database-design.md` dan PRD `02-final-prd.md`.
> Semua tulisan data bisnis **hanya** lewat RPC (SECURITY DEFINER dengan alasan
> jelas + `SET search_path = public`); frontend tidak pernah dipercaya untuk
> identitas, harga, total, atau status. Error dikembalikan sebagai kode string
> dalam `error` (bukan exception) agar UI dapat menampilkannya.

---

## 1. Prinsip umum

- Identitas = `auth.uid()`. Ownership & role dicek di dalam function terhadap DB.
- Semua nilai keuangan & durasi dihitung server (PRD §8). Parameter client hanya
  identitas entitas + preferensi (tanggal, quantity, URL bukti, komentar).
- Pola return: `{ ok boolean, error text, ... }` untuk mutasi; tabel/row untuk bacaan.
- Setiap mutasi sensitif menulis `audit_logs` via helper `log_audit()` (atomik dalam
  transaksi yang sama).
- Helper & RPC SECDEF selalu `SET search_path = public`.

## 2. Helper internal

| Function | Signature | Sifat | Tujuan |
|---|---|---|---|
| `is_admin()` | `() → boolean` | SECDEF STABLE | `users.role='admin' AND status='active'` |
| `is_active_user()` | `() → boolean` | SECDEF STABLE | profil ada & status `active` |
| `my_store(p_store_id)` | `(uuid) → uuid` | SECDEF STABLE | resolve store milik pemanggil (p_store_id given → wajib miliknya; NULL → store pertama) — **tanpa filter status**; status dicek per kasus di RPC |
| `owns_store_of_tx(p_rental_id)` | `(uuid) → boolean` | SECDEF STABLE | pemanggil = owner store dari transaksi |
| `log_audit(p_action, p_entity_type, p_entity_id, p_metadata)` | `(text, text, uuid, jsonb) → void` | SECDEF | insert audit_logs; menolak nilai di luar CHECK registry |

## 3. Kontrak RPC

### 3.1 Store applications
| # | RPC | Caller | Parameter → Return | Validasi & efek |
|---|---|---|---|---|
| 1 | `submit_store_application` | consumer aktif | `(p_store_name, p_description, p_address, p_logo_url DEFAULT NULL)` → `{ok, error, application_id}` | Tolak bila punya store aktif (`already_seller`) / ajuan `pending` (`application_pending`); insert `pending`; audit `application_submit` |
| 2 | `get_my_applications` | authenticated | `()` → tabel application miliknya (terbaru dulu) | — |
| 3 | `list_store_applications` | admin | `(p_status application_status DEFAULT NULL)` → tabel semua ajuan + nama/email applicant | admin-only (`forbidden`) |
| 4 | `decide_store_application` | admin (bukan pemilik ajuan) | `(p_application_id uuid, p_approve boolean, p_reason text DEFAULT NULL)` → `{ok, error}` | wajib `pending`; approve → buat `stores` (active, rental_unit `day`) + `is_seller=true`; reject → `rejection_reason` wajib; tolak bila ajuan milik sendiri (`self_review_forbidden`); audit `application_approve`/`application_reject`. **Tidak mengubah status toko yang sudah ada** (PRD §3) |

### 3.2 Stores
| # | RPC | Caller | Parameter → Return | Validasi & efek |
|---|---|---|---|---|
| 5 | `get_my_stores` | authenticated | `()` → tabel store milik sesi (`owner_id, name, description, address, logo_url, status, rental_unit, min_rental_duration, created_at`) | — |
| 6 | `update_my_store` | owner | `(p_store_id, p_name, p_description, p_address, p_logo_url)` → `{ok, error}` | ownership; status tidak berubah |
| 7 | `set_my_store_status` | owner | `(p_store_id, p_status)` → `{ok, error}` | hanya `active`↔`inactive`; `suspended` ditolak (`admin_only_status`); audit `store_activate`/`store_deactivate` |
| 8 | `admin_set_store_status` | admin | `(p_store_id, p_status)` → `{ok, error}` | semua nilai; suspend/un-suspend + sinkron `is_seller`; audit `store_suspend`/`store_unsuspend` |

### 3.3 Listings & gambar
| # | RPC | Caller | Parameter → Return | Validasi & efek |
|---|---|---|---|---|
| 9 | `save_listing` | owner store aktif | `(p_listing_id DEFAULT NULL, p_store_id, p_category_id, p_name, p_description, p_price numeric-ish bigint, p_deposit DEFAULT 0, p_stock, p_rental_unit DEFAULT 'day', p_min_rental_duration DEFAULT NULL, p_available DEFAULT true, p_image_urls text[] DEFAULT NULL)` → `{ok, error, listing_id}` | store milik pemanggil & `active`; kategori ada; price/stock ≥ 0; `p_available` → status `active`/`inactive` (owner tidak bisa set lain); create/update atomik; `p_image_urls` bila disertakan → tulis `listing_images` `sort_order` 1..n (replace); audit `listing_create`/`listing_update` |
| 10 | `set_listing_availability` | owner | `(p_listing_id, p_available boolean)` → `{ok, error}` | toggle `active`/`inactive` saja; audit `listing_update` |
| 11 | `delete_listing` | owner | `(p_listing_id)` → `{ok, error}` | gagal `has_rentals` bila dirujuk `transaction_items` (RESTRICT) → sarankan nonaktifkan; audit `listing_delete` |
| 12 | `admin_set_listing_status` | admin | `(p_listing_id, p_status)` → `{ok, error}` | termasuk `suspended`; audit `listing_suspend` |

Baca katalog (listing, gambar, kategori, toko) = **direct SELECT dengan RLS**, tanpa RPC.

### 3.4 Wishlist
| # | RPC | Caller | Parameter → Return | Validasi & efek |
|---|---|---|---|---|
| 13 | `get_wishlist` | authenticated | `()` → wishlist sendiri terenrichment (listing name/price/image pertama/store) | — |
| 14 | `toggle_wishlist` | authenticated | `(p_listing_id)` → `{ok, error, active}` | idempoten (UNIQUE); listing harus eksis |

### 3.5 Rental
| # | RPC | Caller | Parameter → Return | Validasi & efek |
|---|---|---|---|---|
| 15 | `quote_rental` | anon + authenticated | `(p_start date, p_end date, p_items jsonb — [{listing_id, quantity}])` → satu baris `{ok, error, total_days, subtotal, deposit_total, total, items[]}` (item memuat `duration_units` per entri) | STABLE, tanpa tulis; validasi tanggal (`invalid_date_range`, `start_date_in_past`), item, listing aktif, toko aktif, min duration, ketersediaan per item; harga snapshot current |
| 16 | `create_rental` | consumer aktif | `(p_start, p_end, p_items jsonb)` → `{ok, error, rental_id, status, subtotal, deposit_total, total, total_days}` | Atomik: derive store dari item pertama & wajib satu store (`mixed_stores`); 1..20 item (`too_many_items`); quantity > 0 (`invalid_quantity`); `start_date >= CURRENT_DATE` (`start_date_in_past`); durasi ≥ min per listing (`min_duration`); ketersediaan per listing dicek **di bawah `pg_advisory_xact_lock(hashtextextended('jabsewa:listing:'||id,0))`** → gagal `insufficient_stock`; snapshot price/deposit & hitung subtotal server; insert tx (`pending`) + items; audit `rental_create`. Retry aman: tidak ada efek samping sebelum validasi; konflik → error, bukan duplikat |
| 17 | `cancel_rental` | sesuai matriks PRD §5.2 | `(p_rental_id, p_reason)` → `{ok, error, status}` | buyer: `pending`/`payment_verify`; owner: s.d. `confirmed`; reason wajib untuk owner/verifikasi-tolak; set `cancelled_by/at/reason`; payment `pending` → `failed`; audit `rental_cancel` |
| 18 | `mark_overdue` | owner / admin | `(p_rental_id)` → `{ok, error, status}` | `ongoing`→`overdue` (atau `overdue` bila sudah); `now() > end_date` (`not_late`); tanpa audit khusus (perubahan status tercatat updated_at) |

### 3.6 Payment & verifikasi (D5)
| # | RPC | Caller | Parameter → Return | Validasi & efek |
|---|---|---|---|---|
| 19 | `submit_payment` | buyer pemilik tx | `(p_rental_id, p_method payment_method, p_proof_url text, p_external_reference DEFAULT NULL)` → `{ok, error, payment_id, status}` | tx `pending`; amount = total transaksi (server); insert payment `pending`; tx → `payment_verify`; audit `payment_submit` |
| 20 | `decide_payment` | owner store / admin (D5) | `(p_payment_id, p_approve boolean, p_note DEFAULT NULL)` → `{ok, error, tx_status}` | payment `pending`; tx `payment_verify`; approve → payment `paid` + `paid_at=now()` + tx `confirmed`; reject → payment `failed` + tx `cancelled` (`cancelled_by`=verifier, reason wajib `reason_required`); audit `payment_verify`/`payment_reject` |

### 3.7 Pengembalian, denda, dispute, review
| # | RPC | Caller | Parameter → Return | Validasi & efek |
|---|---|---|---|---|
| 21 | `start_rental` | owner | `(p_rental_id)` → `{ok, error, status}` | `confirmed`→`ongoing` |
| 22 | `record_return` | owner | `(p_rental_id)` → `{ok, error, status}` | `ongoing`/`overdue`→`completed`; `actual_return_date=now()`; audit `return_record` |
| 23 | `apply_late_fee` | owner tokonya / admin | `(p_rental_id, p_daily_rate)` → `{ok, error, total}` | transaksi `overdue` atau `completed`-dari-overdue; `days_late = max(0, date(actual_return|now) − end_date)` wajib > 0 (`not_late`); upsert satu baris (UNIQUE tx); `total = days_late × daily_rate`; refresh `late_fee_total`; audit `latefee_apply` |
| 24 | `decide_late_fee` | owner (paid) / admin (paid|waived) | `(p_late_fee_id, p_decision)` → `{ok, error}` | set status; `waived` admin-only (`forbidden`); refresh `late_fee_total` (waived tidak dihitung); audit `latefee_waive` |
| 25 | `open_dispute` | buyer / owner | `(p_rental_id, p_reason, p_description DEFAULT '')` → `{ok, error, dispute_id}` | tx `ongoing`/`overdue`/`completed`; satu dispute aktif (partial unique); bila tx `ongoing`/`overdue` → status `disputed`; audit `dispute_open` |
| 26 | `resolve_dispute` | admin | `(p_dispute_id, p_outcome ('resolved'|'rejected'), p_resolution)` → `{ok, error}` | status dispute → outcome; `resolved_by/at` terisi; bila tx `disputed` → `completed`; TIDAK otomatis mengubah payment/denda; audit `dispute_resolve` |
| 27 | `create_review` | buyer | `(p_rental_id, p_rating int, p_comment)` → `{ok, error, review_id}` | tx `completed`; buyer = tx.buyer; rating 1..5; UNIQUE per tx (`already_reviewed`); `store_id` dari tx; audit `review_create` |

### 3.8 Admin & audit
| # | RPC | Caller | Parameter → Return | Validasi & efek |
|---|---|---|---|---|
| 28 | `admin_set_user_status` | admin | `(p_user_id, p_status)` → `{ok, error}` | tidak boleh diri sendiri (`self_action_forbidden`); sinkron non-aktif → toko? (toko biarkan; RLS memblokir via user status); audit `user_suspend`/`user_activate` |
| 29 | `admin_set_user_role` | admin | `(p_user_id, p_role)` → `{ok, error}` | tidak boleh diri sendiri; audit `role_change` |
| 30 | `list_audit_logs` | admin | `(p_limit DEFAULT 100, p_offset DEFAULT 0)` → tabel log + email aktor | maks 500/baris panggilan |

**Total: 30 RPC publik + 5 helper.** Tidak ada RPC legacy yang dibawa (`search_hybrid`,
`list_admin_audit_logs`, dsb.).

## 4. Security Matrix (RLS)

| Tabel | anon | consumer | store owner (miliknya) | admin |
|---|---|---|---|---|
| `users` | ❌ | SELECT sendiri | SELECT sendiri | SELECT semua |
| `categories` | SELECT | SELECT | SELECT | SELECT |
| `store_applications` | ❌ | SELECT miliknya | SELECT miliknya | SELECT semua |
| `stores` | SELECT `active` | SELECT `active` | + SELECT miliknya | SELECT semua |
| `listings` | SELECT listing toko `active` | sama | + SELECT miliknya | SELECT semua |
| `listing_images` | ikut visibilitas listing | sama | sama | sama |
| `rental_transactions` | ❌ | SELECT miliknya (buyer) | + SELECT tokonya | SELECT semua |
| `transaction_items` | ❌ | ikut tx | ikut tx | semua |
| `payments` | ❌ | ikut tx | ikut tx | semua |
| `late_fees` | ❌ | ikut tx | ikut tx | semua |
| `disputes` | ❌ | ikut tx | ikut tx | semua |
| `reviews` | SELECT review toko aktif | SELECT toko aktif + miliknya | + tokonya | semua |
| `wishlists` | ❌ | CRUD miliknya | CRUD miliknya | — (via RPC) |
| `audit_logs` | ❌ | ❌ | ❌ | SELECT |

- **Tidak ada** policy INSERT/UPDATE/DELETE pada tabel bisnis kecuali `wishlists`
  (insert/delete own sebagai defense-in-depth; jalur resmi tetap RPC).
- `anon`: SELECT katalog saja; EXECUTE hanya `quote_rental`.
- **Kontrak bentuk respons RPC**: RPC dengan `RETURNS TABLE` (PL/pgSQL + OUT
  params) mengembalikan **persis satu baris** per panggilan — kolom `ok`/`error`
  di baris itu, BUKAN exception PostgREST. Dua bug historis (keduanya sudah
  diperbaiki forward-only): (1) `RETURN;` tanpa `RETURN NEXT;` → 0 baris
  (fix `20260926000002_rpcs_return_next_fix.sql`); (2) guard error yang hanya
  `RETURN NEXT;` **fall-through** — RETURN NEXT mem-emit baris TETAPI TIDAK
  berhenti (docs PostgreSQL §41.6.1.2) → beberapa baris + baris `ok=true` di
  akhir, dan pada RPC mutasi INSERT tetap dieksekusi meski validasi gagal
  (fix `20260927000000_rpcs_guard_stop_fix.sql`). Pola wajib:
  guard `ok := false; error := 'x'; RETURN NEXT; RETURN;` — emit sukses selalu
  statement terakhir. Fungsi ber-cabang eksklusif (approve/reject) boleh tanpa
  emit final; semua cabangnya berupa guard. `quote_rental` mengecek rentang
  tanggal dulu (`invalid_date_range`), kemudian `start_date_in_past`.
- Semua tabel lain: `REVOKE ALL FROM anon` lalu grant eksplisit.
- EXECUTE per RPC: `authenticated` (kecuali `quote_rental`: anon+authenticated).

## 5. Pertahanan kunci (ringkas)

1. **Privilege escalation**: role/status hanya via RPC admin; admin tidak bisa memodifikasi
   dirinya sendiri (28–29). Tidak ada jalur tulis `users` lain (trigger SECDEF hanya INSERT).
2. **IDOR**: semua id target divalidasi ownership terhadap `auth.uid()` di dalam RPC;
   RLS membatasi SELECT.
3. **Manipulasi harga/total**: amount/subtotal/total/late fee selalu dihitung server;
   frontend hanya mengirim listing_id/quantity/tanggal/URL bukti.
4. **Double-booking konkuren**: advisory lock per listing + re-check ketersediaan di
   dalam transaksi (stock multi-unit aman — PRD §9).
5. **Search path**: semua SECDEF `SET search_path = public`.
6. **Audit**: tulis hanya via `log_audit` SECDEF; nilai CHECK registry; RLS admin-only.
7. **Secrets**: hanya `VITE_SUPABASE_URL` + anon key di frontend (lihat 09-environment-setup.md).
