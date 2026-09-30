# JabSewa — Phase 3: Database Design & Schema Contract (Final)

> Sumber: ERD 13 tabel + keputusan D1–D6 (`01-erd-audit.md` §3) + aturan bisnis PRD
> (`02-final-prd.md`). Dokumen ini adalah **satu-satunya** schema contract aktif —
> desain enam tabel sebelumnya tidak berlaku. Baseline SQL (Phase 5) wajib mengikuti
> dokumen ini persis.
>
> Deviasi terdokumentasi dari ERD (disetujui Hakan):
> **D2** uang = integer IDR (bigint, bukan decimal(12,2)) · **D3** uuid semua tabel ·
> **D4** deposit ditambahkan (listings/transaction_items/rental_transactions) ·
> **D6** `action`/`entity_type` = text + CHECK registry · `payments.paid_at` nullable.

---

## 1. Ringkasan struktur

- 14 tabel: 13 ERD + `wishlists` (bagian opsional ERD, dipertahankan karena aktif dipakai).
- 9 enum PostgreSQL + 2 CHECK registry (audit).
- Semua PK uuid (`gen_random_uuid()`), `pgcrypto` tersedia via Supabase.
- Semua uang: `bigint` rupiah.
- Semua tabel punya `created_at`; tabel "dokumen bisnis" punya `updated_at` (trigger touch).

## 2. Enum

```sql
CREATE TYPE public.user_role        AS ENUM ('consumer', 'admin');
CREATE TYPE public.user_status      AS ENUM ('active', 'inactive', 'suspended');
CREATE TYPE public.application_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.store_status     AS ENUM ('active', 'inactive', 'suspended');
CREATE TYPE public.rental_unit      AS ENUM ('day', 'week', 'month');
CREATE TYPE public.listing_status   AS ENUM ('active', 'inactive', 'out_of_stock', 'suspended');
CREATE TYPE public.transaction_status AS ENUM (
  'pending', 'payment_verify', 'confirmed', 'ongoing',
  'overdue', 'completed', 'cancelled', 'disputed');
CREATE TYPE public.payment_status   AS ENUM ('pending', 'paid', 'failed', 'refunded');
CREATE TYPE public.payment_method   AS ENUM ('bank_transfer', 'e_wallet', 'credit_card', 'qris');
CREATE TYPE public.dispute_status   AS ENUM ('open', 'investigating', 'resolved', 'rejected');
CREATE TYPE public.late_fee_status  AS ENUM ('unpaid', 'paid', 'waived');
```
`action`/`entity_type` pada `audit_logs` = text + CHECK (lihat §4.14).

## 3. Urutan tabel (dependency order baseline)

1. `users` → 2. `categories` → 3. `store_applications` → 4. `stores` →
5. `listings` → 6. `listing_images` → 7. `rental_transactions` → 8. `transaction_items` →
9. `payments` → 10. `late_fees` → 11. `disputes` → 12. `reviews` → 13. `wishlists` →
14. `audit_logs`.

---

## 4. Schema contract per tabel

### 4.1 `users`
| Kolom | Tipe | Rules |
|---|---|---|
| id | uuid | PK = `auth.users.id` (FK ON DELETE CASCADE) |
| email | varchar(255) | NOT NULL UNIQUE; ditulis trigger dari auth.users |
| role | user_role | NOT NULL DEFAULT 'consumer' |
| full_name | varchar(100) | NOT NULL DEFAULT '' |
| phone | varchar(20) | NULL |
| avatar_url | text | NULL |
| is_seller | boolean | NOT NULL DEFAULT false — **cache** (di-set server saat approval/suspend store) |
| status | user_status | NOT NULL DEFAULT 'active' |
| created_at / updated_at | timestamptz | NOT NULL DEFAULT now() |

Trigger: `on_auth_user_created` (SECDEF) insert profil baru dari `auth.users`.
Catatan D1: "seller" = punya store aktif; otorisasi selalu cek `stores.owner_id`,
`is_seller` hanya cache tampilan.

### 4.2 `categories`
| Kolom | Tipe | Rules |
|---|---|---|
| id | uuid | PK |
| name | varchar(100) | NOT NULL |
| slug | varchar(100) | NOT NULL UNIQUE (C-17) |
| created_at | timestamptz | NOT NULL DEFAULT now() |

Pengelolaan via admin/seed; tidak dihapus bila dipakai listing (FK RESTRICT).

### 4.3 `store_applications`
| Kolom | Tipe | Rules |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | NOT NULL FK → users ON DELETE CASCADE |
| store_name | varchar(100) | NOT NULL |
| description | text | NOT NULL DEFAULT '' |
| address | text | NOT NULL DEFAULT '' |
| logo_url | text | NULL |
| status | application_status | NOT NULL DEFAULT 'pending' |
| reviewed_by | uuid | NULL FK → users ON DELETE SET NULL |
| reviewed_at | timestamptz | NULL |
| rejection_reason | text | NULL |
| created_at / updated_at | timestamptz | NOT NULL DEFAULT now() |

Index: `(user_id)`, `(status, created_at DESC)`. Check: `rejection_reason` wajib bila
status `rejected` (dicek RPC; CHECK ringan `NOT (status='rejected' AND rejection_reason IS NULL)`).
Contact: kontak applicant = `users.phone`/email (tidak duplikat kolom di sini — beda dari
jsonb lama yang menyimpan `contact`).

### 4.4 `stores`
| Kolom | Tipe | Rules |
|---|---|---|
| id | uuid | PK |
| owner_id | uuid | NOT NULL FK → users ON DELETE RESTRICT (retensi histori; akun lewat soft delete) |
| name | varchar(100) | NOT NULL |
| description | text | NOT NULL DEFAULT '' |
| address | text | NOT NULL DEFAULT '' |
| logo_url | text | NULL |
| status | store_status | NOT NULL DEFAULT 'active' |
| rental_unit | rental_unit | NOT NULL DEFAULT 'day' — default untuk listing baru |
| min_rental_duration | integer | NULL CHECK (IS NULL OR > 0) — default listing baru |
| created_at / updated_at | timestamptz | NOT NULL DEFAULT now() |

Index: `owner_id`. C-09: satu kolom `owner_id` (tanpa mirror `user_id`).

### 4.5 `listings`
| Kolom | Tipe | Rules |
|---|---|---|
| id | uuid | PK (D3) |
| store_id | uuid | NOT NULL FK → stores ON DELETE CASCADE |
| category_id | uuid | NOT NULL FK → categories ON DELETE RESTRICT |
| name | varchar(100) | NOT NULL |
| description | text | NOT NULL DEFAULT '' |
| price | bigint | NOT NULL CHECK (price >= 0) — IDR per rental_unit (D2) |
| deposit | bigint | NOT NULL DEFAULT 0 CHECK (deposit >= 0) — **deviasi D4** |
| stock | integer | NOT NULL CHECK (stock >= 0) |
| rental_unit | rental_unit | NOT NULL DEFAULT 'day' |
| min_rental_duration | integer | NULL CHECK (IS NULL OR > 0) |
| status | listing_status | NOT NULL DEFAULT 'active' |
| created_at / updated_at | timestamptz | NOT NULL DEFAULT now() |

Index: `store_id`, `category_id`, partial `(store_id) WHERE status='active'`,
partial `(status) WHERE status='active'`.
Satuan harga: per `rental_unit` (day/week/month) — see PRD §8.

### 4.6 `listing_images`
| Kolom | Tipe | Rules |
|---|---|---|
| id | uuid | PK |
| listing_id | uuid | NOT NULL FK → listings ON DELETE CASCADE |
| image_url | text | NOT NULL DEFAULT '' |
| sort_order | integer | NOT NULL CHECK (sort_order >= 1) |
| created_at | timestamptz | NOT NULL DEFAULT now() |

UNIQUE `(listing_id, sort_order)`. Index: `listing_id`.

### 4.7 `rental_transactions`
| Kolom | Tipe | Rules |
|---|---|---|
| id | uuid | PK |
| buyer_id | uuid | NOT NULL FK → users ON DELETE RESTRICT (retensi) |
| store_id | uuid | NOT NULL FK → stores ON DELETE RESTRICT |
| status | transaction_status | NOT NULL DEFAULT 'pending' |
| start_date | date | NOT NULL |
| end_date | date | NOT NULL |
| subtotal | bigint | NOT NULL CHECK (subtotal >= 0) — server-computed |
| deposit_total | bigint | NOT NULL DEFAULT 0 CHECK (>= 0) — **deviasi D4** |
| total | bigint | NOT NULL CHECK (total >= 0) — = subtotal + deposit_total (server) |
| late_fee_total | bigint | NOT NULL DEFAULT 0 CHECK (>= 0) — Σ unpaid+paid late_fees |
| actual_return_date | timestamptz | NULL |
| cancelled_by | uuid | NULL FK → users ON DELETE SET NULL |
| cancelled_at | timestamptz | NULL |
| cancel_reason | text | NULL |
| created_at / updated_at | timestamptz | NOT NULL DEFAULT now() |

CHECK: `end_date >= start_date`; `NOT (status='cancelled' AND cancelled_by IS NULL)`.
Index: `(buyer_id, created_at DESC)`, `(store_id)`, `(status)`,
`transaction_items`-driven availability index (lihat §4.8).
Catatan: `listing_id` tidak ada di tabel ini (pindah ke transaction_items — C-03).

### 4.8 `transaction_items`
| Kolom | Tipe | Rules |
|---|---|---|
| id | uuid | PK |
| transaction_id | uuid | NOT NULL FK → rental_transactions ON DELETE CASCADE |
| listing_id | uuid | NOT NULL FK → listings ON DELETE RESTRICT (riwayat tak boleh hilang) |
| quantity | integer | NOT NULL CHECK (quantity > 0) |
| price | bigint | NOT NULL CHECK (price >= 0) — snapshot listings.price |
| deposit | bigint | NOT NULL DEFAULT 0 CHECK (>= 0) — snapshot listings.deposit (**D4**) |
| subtotal | bigint | NOT NULL CHECK (subtotal >= 0) — server = price × quantity × duration_units |
| created_at | timestamptz | NOT NULL DEFAULT now() |

Index: `(transaction_id)`, `(listing_id)`.
Availability index kunci (dipakai re-check ketersediaan + advisory lock di RPC):
```sql
CREATE INDEX idx_transaction_items_listing_active
  ON public.transaction_items (listing_id, quantity)
  WHERE EXISTS (SELECT 1);  -- filter status via join di query; partial btree cukup
```
(Secara efektif query availability: JOIN rental_transactions + filter status
`pending|payment_verify|confirmed|ongoing|overdue`; index btree di
`rental_transactions(status)` + `transaction_items(listing_id)` menutupi kebutuhan.)

### 4.9 `payments`
| Kolom | Tipe | Rules |
|---|---|---|
| id | uuid | PK |
| transaction_id | uuid | NOT NULL FK → rental_transactions ON DELETE RESTRICT |
| amount | bigint | NOT NULL CHECK (amount > 0) |
| status | payment_status | NOT NULL DEFAULT 'pending' |
| payment_method | payment_method | NOT NULL DEFAULT 'bank_transfer' |
| external_reference | varchar(100) | NULL |
| payment_proof_url | text | NULL |
| paid_at | timestamptz | NULL (C-5: wajib saat status paid — divalidasi RPC) |
| created_at | timestamptz | NOT NULL DEFAULT now() |

Index: `(transaction_id, created_at DESC)`, `(status)`.
C-20: refund = baris baru status `refunded` (amount = yang dikembalikan).

### 4.10 `late_fees`
| Kolom | Tipe | Rules |
|---|---|---|
| id | uuid | PK |
| transaction_id | uuid | NOT NULL FK → rental_transactions ON DELETE CASCADE |
| days_late | integer | NOT NULL CHECK (days_late >= 0) |
| daily_rate | bigint | NOT NULL CHECK (daily_rate >= 0) — snapshot keputusan penilai |
| total | bigint | NOT NULL CHECK (total = days_late × daily_rate) |
| status | late_fee_status | NOT NULL DEFAULT 'unpaid' |
| created_at | timestamptz | NOT NULL DEFAULT now() |

UNIQUE `(transaction_id)` (MVP: satu penilaian final per transaksi — PRD §7).

### 4.11 `disputes`
| Kolom | Tipe | Rules |
|---|---|---|
| id | uuid | PK |
| transaction_id | uuid | NOT NULL FK → rental_transactions ON DELETE RESTRICT |
| opened_by | uuid | NOT NULL FK → users ON DELETE RESTRICT |
| reason | text | NOT NULL |
| description | text | NOT NULL DEFAULT '' |
| status | dispute_status | NOT NULL DEFAULT 'open' |
| resolved_by | uuid | NULL FK → users ON DELETE SET NULL |
| resolution | text | NULL |
| resolved_at | timestamptz | NULL |
| created_at | timestamptz | NOT NULL DEFAULT now() |

Partial unique: **satu dispute aktif per transaksi**:
```sql
CREATE UNIQUE INDEX uq_disputes_active_per_tx
  ON public.disputes (transaction_id)
  WHERE status IN ('open', 'investigating');
```

### 4.12 `reviews`
| Kolom | Tipe | Rules |
|---|---|---|
| id | uuid | PK |
| transaction_id | uuid | NOT NULL FK → rental_transactions ON DELETE RESTRICT, UNIQUE |
| buyer_id | uuid | NOT NULL FK → users ON DELETE RESTRICT |
| store_id | uuid | NOT NULL FK → stores ON DELETE RESTRICT |
| rating | integer | NOT NULL CHECK (rating BETWEEN 1 AND 5) |
| comment | text | NOT NULL DEFAULT '' |
| created_at | timestamptz | NOT NULL DEFAULT now() |

CHECK konsistensi ditambah di RPC (`buyer_id`/`store_id` = transaksi). Index: `(store_id, created_at DESC)`.

### 4.13 `wishlists`
| Kolom | Tipe | Rules |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | NOT NULL FK → users ON DELETE CASCADE |
| listing_id | uuid | NOT NULL FK → listings ON DELETE CASCADE |
| created_at | timestamptz | NOT NULL DEFAULT now() |

UNIQUE `(user_id, listing_id)`. Index: `(user_id, created_at DESC)`.

### 4.14 `audit_logs`
| Kolom | Tipe | Rules |
|---|---|---|
| id | uuid | PK |
| actor_id | uuid | NOT NULL FK → users ON DELETE RESTRICT |
| action | text | NOT NULL — CHECK registry (PRD §13) |
| entity_type | text | NOT NULL — CHECK registry (PRD §13) |
| entity_id | uuid | NOT NULL |
| metadata | jsonb | NOT NULL DEFAULT '{}' |
| created_at | timestamptz | NOT NULL DEFAULT now() |

CHECK `action` (28 nilai) & `entity_type` (11 nilai) sesuai PRD §13.
Index: `(created_at DESC)`, `(actor_id)`, `(entity_type, entity_id)`, `(action, created_at DESC)`.
Tulis hanya via RPC SECDEF `log_audit()`; tanpa policy INSERT/UPDATE/DELETE.

---

## 5. Relasi & kardinalitas (final)

```
auth.users 1:1 users
users 1:N store_applications          (RESTRICT via reviewed_by SET NULL)
users 1:N stores (owner_id, RESTRICT)
stores 1:N listings (CASCADE)         N:1 categories (RESTRICT)
listings 1:N listing_images (CASCADE)
users 1:N rental_transactions (RESTRICT)   stores 1:N rental_transactions (RESTRICT)
rental_transactions 1:N transaction_items (CASCADE)   listings 1:N transaction_items (RESTRICT)
rental_transactions 1:N payments (RESTRICT)   1:1 late_fees (CASCADE)   1:N disputes (RESTRICT)
rental_transactions 1:1 reviews (RESTRICT)
users 1:N wishlists (CASCADE)         listings 1:N wishlists (CASCADE)
users 1:N audit_logs (RESTRICT)
```
Kardinalitas terverifikasi terhadap PRD; CASCADE hanya untuk dependensi murni
(gambar, item transaksi ikut transaksi, wishlist), RESTRICT untuk histori bernilai retensi.

## 6. ERD Mermaid

Lihat `docs/db-rebuild/03-erd.mmd` (sumber diagram; dapat dirender Mermaid).
Rangkuman kunci:
- Identitas: users ← store_applications, stores, rental_transactions, reviews, disputes, audit_logs, wishlists.
- Katalog: stores → listings → listing_images; categories → listings.
- Rental: rental_transactions → transaction_items → listings; rental_transactions → payments/late_fees/disputes/reviews.
