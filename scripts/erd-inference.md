# JabSewa MVP V1 — Inferred ERD from Frontend Code

> **Purpose**: This document captures the data model INFERRED from frontend source code.
> It will be compared against the actual ERD (source of truth) once provided.
> **NOT** the source of truth — only a reference for gap analysis.

---

## Tables Inferred from Frontend

### 1. `users`
Source: `src/auth/AuthContext.jsx`, `src/pages/ProfilePage.jsx`

| Column | Inferred Type | Source |
|--------|--------------|--------|
| id | uuid (PK) | Supabase Auth user ID |
| email | text (unique) | AuthContext |
| full_name | text | AuthContext `name` field |
| phone | text | Seller onboarding `contact` |
| role | text/enum | Admin vs consumer vs seller |
| is_seller | boolean | SellerProfile presence check |
| status | text/enum | Account status |
| created_at | timestamptz | Standard |
| updated_at | timestamptz | Standard |

### 2. `store_applications`
Source: `src/auth/AuthContext.jsx`, `src/pages/SellerOnboardingPage.jsx`, `src/pages/AdminApplicationsPage.jsx`

| Column | Inferred Type | Source |
|--------|--------------|--------|
| id | uuid (PK) | Application ID |
| user_id | uuid (FK → users) | Applicant |
| store_name | text | `storeName` |
| description | text | `description` |
| contact | text | `contact` (WA/phone) |
| city | text | `city` |
| address | text | `address` |
| status | text/enum | `draft`, `submitted`, `under_review`, `approved`, `rejected` |
| rejection_reason | text (nullable) | `rejectionReason` |
| submitted_at | timestamptz | `submittedAt` |
| reviewed_at | timestamptz (nullable) | `reviewedAt` |
| created_at | timestamptz | Standard |
| updated_at | timestamptz | Standard |

### 3. `stores` (seller profiles)
Source: `src/auth/AuthContext.jsx` (sellerProfile), `src/components/Seller/SellerDashboard.jsx`

| Column | Inferred Type | Source |
|--------|--------------|--------|
| id | uuid (PK) | Store ID |
| user_id | uuid (FK → users) | Owner |
| application_id | uuid (FK → store_applications) | Approved application |
| store_name | text | `sellerProfile.storeName` |
| description | text | `sellerProfile.description` |
| contact | text | `sellerProfile.contact` |
| city | text | `sellerProfile.city` |
| address | text | `sellerProfile.address` |
| status | text/enum | active, suspended |
| created_at | timestamptz | Standard |
| updated_at | timestamptz | Standard |

### 4. `listings` (items/products)
Source: `src/data/catalog.js`, `src/components/Seller/SellerItems.jsx`

| Column | Inferred Type | Source |
|--------|--------------|--------|
| id | uuid/bigserial (PK) | `item.id` |
| store_id | uuid (FK → stores) | `item.seller` (resolved) |
| name | text | `item.name` |
| description | text | `item.description` |
| category | text | `item.category` |
| price_per_day | integer | `item.price` |
| deposit | integer | `item.deposit` |
| image_url | text | `item.image` |
| location | text | `item.location` |
| available | boolean | `item.available` |
| status | text/enum | active, inactive, rented |
| created_at | timestamptz | Standard |
| updated_at | timestamptz | Standard |

### 5. `categories`
Source: `src/data/catalog.js` (category field), `src/components/Seller/SellerItems.jsx`

| Column | Inferred Type | Source |
|--------|--------------|--------|
| id | uuid/bigserial (PK) | Standard |
| name | text (unique) | `category` values: photography, gadget, sports, event |
| slug | text (unique) | URL-friendly |
| created_at | timestamptz | Standard |

### 6. `rental_transactions`
Source: `src/lib/userData.js`, `src/pages/BuyerPage.jsx`, `src/components/Seller/SellerOrders.jsx`

| Column | Inferred Type | Source |
|--------|--------------|--------|
| id | uuid/bigserial (PK) | `rental.id` |
| buyer_id | uuid (FK → users) | Renting user |
| seller_id | uuid (FK → users) | Item owner |
| store_id | uuid (FK → stores) | Seller's store |
| listing_id | uuid (FK → listings) | `rental.itemId` |
| start_date | date | `rental.startDate` |
| end_date | date | `rental.endDate` |
| total_days | integer | `rental.totalDays` |
| price_per_day | integer | `rental.pricePerDay` |
| deposit | integer | `rental.deposit` |
| total_amount | integer | `rental.total` |
| status | text/enum | pending, accepted, active, completed, cancelled |
| created_at | timestamptz | `rental.createdAt` |
| updated_at | timestamptz | Standard |

### 7. `wishlists`
Source: `src/lib/userData.js`, `src/pages/BuyerPage.jsx`

| Column | Inferred Type | Source |
|--------|--------------|--------|
| id | uuid/bigserial (PK) | Standard |
| user_id | uuid (FK → users) | Owner |
| listing_id | uuid (FK → listings) | `wishlist` item IDs |
| created_at | timestamptz | Standard |

**Unique constraint**: (user_id, listing_id) — one wishlist entry per user per listing

---

## Enums / Status Values Inferred

### `store_application_status`
- `draft`
- `submitted`
- `under_review`
- `approved`
- `rejected`

### `rental_status`
- `pending` (Menunggu konfirmasi)
- `accepted` (Diterima)
- `active` (Sedang berlangsung)
- `completed` (Selesai)
- `cancelled` (Dibatalkan)

### `listing_status`
- `active` (Aktif/Tersedia)
- `inactive` (Nonaktif)
- `rented` (Tersewa)

### `user_role`
- `consumer` (default)
- `admin`

---

## Relationships Inferred

```
auth.users ──(1:1)── public.users
public.users ──(1:N)── store_applications
store_applications ──(1:1)── stores (after approval)
public.users ──(1:N)── stores (owner)
stores ──(1:N)── listings
categories ──(1:N)── listings
public.users ──(1:N)── rental_transactions (as buyer)
stores ──(1:N)── rental_transactions
listings ──(1:N)── rental_transactions
public.users ──(1:N)── wishlists
listings ──(1:N)── wishlists
```

---

## Auth Integration Expected

- **Supabase Auth** (`auth.users`) for authentication
- **Trigger**: `auth.users INSERT → public.users INSERT` (auto-create profile)
- **RLS**: `auth.uid()` used in policies to match `users.id`

---

## Notes for Comparison with Actual ERD

- The frontend does NOT reference: `reviews`, `payments`, `notifications` tables
- The frontend uses `seller` as a string (store name), not a foreign key in catalog data
- The frontend mock data uses integer IDs (1, 2, 3...) — actual DB should use UUIDs
- No image upload logic exists yet — `image_url` is just a string field
- The `contact` field in store_applications may duplicate with `phone` in users

## Integration Notes (Supabase, Sept 2026)

- `src/lib/listings.js` queries `listings` joined to `stores` via `store_id`
  (`stores:store_id ( name )`) to resolve the seller/store name.
- Column mapping used by the frontend data layer: `price_per_day` → `price`,
  `image_url` → `image`, `available` → `available`, `stores.name` → `seller`.
- If actual column names differ (e.g. `price` instead of `price_per_day`),
  update `LISTING_SELECT` dan `mapListing` di `src/lib/listings.js`.
- RLS: `listings` hanya bisa di-SELECT oleh role `authenticated`; browse
  dilakukan setelah login.
- DB IDs bisa UUID — frontend membandingkan dengan `Number(initialItemId)`,
  jadi jaga mapping tetap toleran (atau bandingkan sebagai string untuk UUID).

## Auth Integration (Supabase Auth, Sept 2026)

- `src/auth/AuthContext.jsx` kini memakai Supabase Auth asli:
  `signInWithPassword` (login), `signUp` (register, metadata `full_name`),
  `signOut`, `getSession()` + `onAuthStateChange` untuk sinkronisasi sesi.
- Sesi persisten via localStorage (GoTrueClient) — refresh tetap login.
- Jika konfirmasi email aktif di proyek, register mengembalikan
  `needsEmailConfirmation: true` dan AuthPage menampilkan notice cek email.
- Belum dipindahkan ke DB (masih overlay localStorage per-user):
  `store_applications` (status ajuan toko) dan registri akun untuk mock
  admin review. Saat tabel tersedia, ganti overlay dengan query
  `store_applications` dan keputusan admin lewat service/backend.
- Registrasi menulis `user_metadata.full_name`; `public.users` (jika ada)
  bisa diisi via trigger `auth.users` INSERT — belum diimplementasi.
