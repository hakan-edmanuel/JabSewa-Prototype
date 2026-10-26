# Audit Aktual — JabSewa-Prototype (26 Oktober 2026)

Audit ini **murni dari kode yang ada di repo saat ini** (`src/`, `supabase/migrations/`,
`package.json`, `scripts/`). Dokumen di `docs/` tidak dipakai sebagai dasar — beberapa
sudah tidak sinkron dengan kode (contoh: `scripts/erd-inference.md` masih menyebut
`src/lib/userData.js`, folder itu sudah tidak ada).

## 0. Kondisi terukur (dijalankan saat audit)

| Pemeriksaan | Hasil |
|---|---|
| `npm run lint` | lulus, 0 error |
| `npx vitest run` | 129 tes lulus, 13 file |
| `npx vite build` | sukses; JS **613 kB** (gzip 164 kB) satu chunk, CSS **90,27 kB** |
| Coverage (`--coverage`, hanya `src/domain` + `src/data`) | 57,35% baris, 39,47% fungsi |
| Ukuran `src/` | 19.676 baris: CSS 8.073, JSX/JS 11.603 |

Kesimpulan singkat: **kualitas internal di atas rata-rata untuk prototype** (lapisan
`domain` murni & teruji, RPC tidak dipanggil langsung dari komponen kecuali 2 tempat,
tidak ada dead component). Masalah yang tersisa bukan "tulis ulang", melainkan:
beberapa bug UX nyata, satu pelanggaran lapisan, sisa duplikasi CSS, dan belum ada
code-splitting.

---

## 1. P0 — Bug / risiko nyata (perbaikan kecil, dampak langsung)

### 1.1 Pencarian memicu 2 query database per ketikan
`src/features/katalog/ConsumerHero.jsx:63` memanggil `onSearch` pada setiap `onChange`,
lalu `ConsumerBrowser.jsx:169` menjalankan `hybridSearch()` yang **mengambil seluruh
katalog + seluruh toko** (`domain/search.js:117 loadCatalog`). Tidak ada debounce,
tidak ada cache, tidak ada pembatalan request.

Akibat: mengetik "kamera" (6 huruf) = 12 request penuh ke Supabase; hasil lama
menimpa hasil baru bila response datang tidak berurutan (race).

**Solusi ideal:** debounce 250 ms di `ConsumerHero` + satu cache katalog di level modul
(`loadCatalog` menyimpan hasil dengan TTL singkat / invalidasi manual) + kirim
`AbortSignal` ke `supabase` (`fetchListings({ signal })`). Ini ~40 baris, bukan arsitektur baru.

### 1.2 Deep-link barang menempel setelah keluar dari halaman detail
`src/app/App.jsx:104` menyimpan `consumerItemId` dan tidak pernah mengosongkannya saat
`navigate('consumer')` dipanggil tanpa `itemId` (baris 106–112). Setelah membuka satu
barang, menekan "Cari Barang" lain kali akan langsung membuka detail barang lama
(`key={consumerItemId ?? 'consumer'}` di baris 235 meremount dengan id lama).

**Solusi:** set `consumerItemId = null` ketika tujuan tidak membawa `itemId`, satu baris.

### 1.3 Kontrol yang tidak melakukan apa pun (dead control)
- `HeroSection.jsx:47` — `<select>` kota menyimpan `selectedCity` tetapi nilainya tidak
  pernah dipakai; submit hanya `onNavigate('consumer')`.
- `CategorySection.jsx:76` — semua kartu kategori menuju katalog tanpa meneruskan
  kategori, padahal filternya sudah ada (`category` prop di `ConsumerBrowser`).
- `ConsumerFilters.jsx:59` — label "Harga maksimal **per hari**", padahal listing bisa
  `week`/`month`; `ConsumerBrowser.jsx:158` membandingkan `price_per_day <= maxPrice`
  lintas satuan (listing mingguan jadi tampak "mahal").

Ini bukan kosmetik: pengguna mengira sudah memfilter, padahal tidak.

**Solusi:** teruskan `{ query, category }` lewat `navigate('consumer', opts)` → state
awal `ConsumerPage`, dan ganti label menjadi "Harga maksimal per satuan".

### 1.4 Logika mati di seller center
`SellerPage.jsx:45-46` — `handleOrdersChanged` hanya reload bila `activeMenu === 'dashboard'`,
tetapi `SellerOrders` hanya dirender saat `activeMenu === 'orders'`. Kondisi itu **tidak
pernah** bernilai benar; callback tidak pernah melakukan apa pun.

**Solusi:** hapus `onChanged`/`handleOrdersChanged`, atau panggil `loadStore()` tanpa syarat.

### 1.5 Label satuan mentah & tanggal ISO mentah di UI
- `WishlistSection.jsx:38` → `/{item.rental_unit}` menampilkan "week"/"month" (Inggris)
  padahal `RENTAL_UNIT_LABELS` sudah tersedia.
- `RentalCard.jsx:50`, `SellerOrderCard.jsx:84`, `AdminOrders.jsx:188,298` menampilkan
  `2026-10-01 → 2026-10-03`, sementara `formatDate()` sudah dipakai di file yang sama
  untuk field lain. Inkonsisten dan sulit dibaca pengguna Indonesia.

### 1.6 Pesan error admin tidak diterjemahkan
`AdminOrders.jsx:114` memakai `err?.message` mentah (mis. `forbidden`), sedangkan
`AdminStores/AdminListings/AdminUsers` memakai `translateServerError`. Satu jalur,
dua bahasa.

### 1.7 Gambar Unsplash palsu ditulis ke database
`ListingForm.jsx:66` → `images = ... : [DEFAULT_IMG]`, jadi listing tanpa foto
menyimpan URL stok Unsplash ke `listing_images`. Ini data semu yang tercampur data nyata.

**Solusi:** simpan `[]` dan render placeholder lokal (`<div className="img-placeholder">`)
saat kosong — bukan URL pihak ketiga.

### 1.8 Dua alur "Mulai Jadi Seller"
`Navbar` memakai `onSellerIntent` (lifecycle lengkap di `App.goSeller`), tetapi
`ConsumerNavbar.jsx:43,83` langsung `go('seller-onboarding')`. Guest jadi diarahkan ke
route yang butuh login dengan intent berbeda; label "Status Ajuan Seller" tidak muncul
di navbar katalog.

### 1.9 Enter setelah login membuka form login lagi
`App.navigate()` memakai `pushState`, sehingga `/login` tetap ada di history. Setelah
login sukses, tombol back mengembalikan ke form login meski sesi aktif.

**Solusi:** `replaceState` khusus untuk transisi auth → tujuan.

---

## 2. P1 — Struktur, penamaan, tanggung jawab

### 2.1 `domain/` berisi I/O (pelanggaran aturan yang repo ini tulis sendiri)
`src/domain/search.js:12` mengimpor `fetchListings/fetchStores` dan melakukan network.
Semua folder domain lain murni. `main.jsx` bahkan mendokumentasikan "domain/ = logika
murni tanpa I/O".

**Solusi:** pindahkan `hybridSearch` + `loadCatalog` ke `src/data/search.js`; sisakan
`similarity`, `textMatchScore`, `toItemHit` (murni) di `domain/scoring.js`.
Keuntungan: skoring bisa diuji tanpa mock jaringan (tesnya sudah ada dan akan makin ringan).

### 2.2 Komponen memanggil `getClient()` langsung
`SellerPage.jsx:31` dan `ProfilePage.jsx:34` memanggil `getClient().rpc('get_my_stores')`.
Dua tempat ini melewati aturan "satu-satunya tempat I/O = `data/`".

**Solusi:** `src/data/stores.js` → `getMyStore()`. Sekali tulis, tiga pemakai
(SellerPage, ProfilePage, nanti Info Toko) beres.

### 2.3 Nama folder tidak satu bahasa
`katalog` (ID) berdampingan dengan `rental`, `seller`, `admin`, `landing` (EN).
`features/rental` isinya bukan "rental" saja: `ConsumerOrdersPage` (pesanan penyewa)
dan `useWishlistItems`/`WishlistSection` (wishlist).

**Solusi ideal (pilih satu bahasa, saya sarankan Inggris karena 4 dari 6 sudah Inggris):**
```
features/
  catalog/     ← katalog (dari "katalog")
  buyer/       ← ConsumerOrdersPage, RentalCard, form, wishlist (dari "rental")
  seller/
  admin/
  landing/
  legal/
  about/, auth/, profile/
```
Penamaan file sudah konsisten (`PascalCase` komponen, `camelCase` hook/util) — jangan diubah.

### 2.4 `data/admin.js` berisi alias tipis
`adminListRentals`, `adminDecidePayment`, `adminResolveDispute`, `adminDecideLateFee`
hanya meneruskan ke fungsi di `data/rentals.js` (baris 148–175). Halaman admin bisa
mengimpor langsung; alias ini menambah nama tanpa perilaku.

**Solusi:** hapus alias, sisakan `admin.js` untuk guard + RPC moderasi (users/stores/listings/applications).

### 2.5 Lima salinan pola aksi async
`useConsumerRentals.runAction`, `useSellerOrders.run`, `AdminStores.runAction`,
`AdminListings.runAction`, `AdminUsers.runAction`, `AdminOrders.run` — semuanya:
kosongkan error → set busy → try/catch terjemahkan → reload. ~15 baris × 6.

**Solusi:** satu hook `useAsyncAction({ onSuccess })` yang mengembalikan
`{ run, busyId, error, notice }`. Bukan state library, cukup satu file 40 baris.

### 2.6 `AdminApplications` tidak memakai komponen bersama admin
Saat ini `AdminPageHead`, `AdminFilters`, `AdminList`, `AdminConfirm` dipakai 3 halaman
(Stores/Listings/Users), tetapi `AdminApplications.jsx:137-260` menulis ulang head,
filter bar, list, dan konfirmasi secara inline. Itu sumber inkonsistensi pertama
saat ada perubahan gaya admin.

### 2.7 Route admin yang tak bisa dicapai
`AdminApp.jsx` mendaftarkan `stores`, `listings`, `users`, tetapi `AdminLayout.jsx:30`
hanya menampilkan 4 menu (dashboard, applications, orders, audit). Halaman itu hanya
hidup lewat URL manual. Selain itu subpath asing di `/sys-control-jab/*` jatuh ke
dashboard (`AdminApp.jsx:53`) — seharusnya 404, agar tidak menyesatkan.

**Putuskan satu:** tampilkan menunya (moderasi memang sudah lengkap di backend) **atau**
hapus 3 halaman itu. Jangan biarkan keduanya setengah jadi.

### 2.8 Dua peta terjemahan error
`QuoteSummary.jsx:5-11` menduplikasi 5 kunci yang sudah ada di
`SERVER_ERROR_MESSAGES` (`domain/constants.js`). Pakai `translateServerError` +
satu penanganan khusus `min_duration`.

### 2.9 CSS: 134 grup selector duplikat, 26 `!important`, `design-system.css` jadi tempat pembuangan
Angka aktual: `admin.css` 696, `design-system.css` 1.716 (diimpor **terakhir**),
`auth-about.css` 597. Duplikasi terbanyak justru di `auth-about.css` (`.about-*`,
`.hero-copy`, `.footer-top`) yang menimpa `base.css`/`landing.css`.

**Solusi bertahap, tanpa redesign:** (1) hapus hanya duplikat yang deklarasinya
identik; (2) pindahkan token/utility dari `design-system.css` ke `base.css` supaya
urutan impor tidak lagi menentukan pemenang; (3) `!important` dihapus per blok setelah
mengecek bahwa selector aslinya sudah menang. **Jangan** migrasi ke Tailwind/CSS-in-JS —
itu menambah lapisan baru, bukan menghilangkan yang ada.

### 2.10 Dua konvensi lokasi tes
`domain/format.test.js` (co-located) berdampingan dengan `src/test/adminContract.test.js`
(sentral). Pilih satu aturan: **unit test co-located**, **kontrak SQL di `src/test/contract/`**.

### 2.11 Konfigurasi lint tidak menjangkau `scripts/*.mjs`
`eslint.config.js` hanya `**/*.{js,jsx}`; 19 script `.mjs` (termasuk yang memegang
kredensial Supabase) tidak pernah dilint. Tambahkan satu blok `files: ['scripts/**/*.mjs']`
dengan `globals.node`.

---

## 3. P2 — Performa & file gemuk

### 3.1 Semua kode dalam satu chunk 613 kB
Tidak ada `lazy()`/`Suspense`. Area admin, halaman legal, dan seller center ikut
terkirim ke pengunjung landing.

**Solusi (paling berdampak, risiko rendah):**
```jsx
const AdminApp = lazy(() => import('../features/admin/AdminApp'))
const TermsPage = lazy(() => import('../features/legal/TermsPage'))
const PrivacyPage = lazy(() => import('../features/legal/PrivacyPage'))
const SellerPage = lazy(() => import('../features/seller/SellerPage'))
```
dibungkus satu `<Suspense fallback={<SessionLoading/>}>` di `App`. Perkiraan: admin +
legal + seller ≈ 30–35% bundle keluar dari jalur kritis.

### 3.2 File yang masih gemuk (dan apakah perlu dipecah)
| File | Baris | Perlu dipecah? |
|---|---|---|
| `admin/pages/AdminOrders.jsx` | 425 | **Ya** — mencampur 3 domain: antrian sengketa, verifikasi bayar, denda. Pecah jadi `DisputesPanel`, `PaymentsPanel`, `LateFeeRow`. |
| `data/rentals.js` | 385 | Tidak wajib — semuanya satu kontrak RPC; memecahnya justru menambah impor. |
| `katalog/ConsumerBrowser.jsx` | 366 | **Ya, tipis** — `StoreCard` + `ItemCard` sebaiknya jadi file sendiri (sudah ada pola `ProductSummary`). |
| `seller/ListingForm.jsx` | 339 | Tidak wajib — form panjang itu wajar; kecuali blok unggah foto dijadikan `ImageUploader`. |
| `legal/TermsContent.jsx` | 330 | Tidak — konten statis, bukan logika. |
| `app/App.jsx` | 305 | **Ya** — 8 cabang `if` render + guard. Pindahkan `resolveEffectivePage()` (murni) ke `routes.js` agar bisa diuji, dan render halaman lewat peta. |

### 3.3 `if`/ternary bersarang
- `App.jsx:181-300`: delapan `if (effectivePage === ...)` berurutan.
- `SellerStoreInfo.jsx:47`: ternary tiga tingkat untuk label satuan → pakai `RENTAL_UNIT_LABELS`.
- `AdminDashboard.jsx`: ternary di dalam template string untuk meta antrian.
- `ConsumerBrowser.jsx:214-290`: kondisi loading/error/empty/grid bersarang dalam satu JSX.

Aturan praktis: lebih dari 2 tingkat → jadikan komponen kecil atau peta nilai
(`const LABEL = {...}[key] ?? fallback`). Tidak perlu state machine.

### 3.4 Inline style masih 17 tempat
`ReviewForm`, `DisputeForm`, `PaymentProofForm` (`style={{ marginTop: 8 }}`),
`NotFoundPage`, `ErrorBoundary`, `ConsumerFilters`, `AdminOrders`, `AdminUsers`.
Pindahkan ke kelas CSS yang sudah ada polanya (`.order-reject-box`, `.sys-note`).

---

## 4. Tes — apa yang sudah benar, apa yang keliru

**Benar:** `domain` diuji langsung tanpa mock (rentalActions, rentalTimeline, rentalMath,
search, postLoginRouting, format), ada tes kontrak SQL statis, dan tes komponen jsdom
untuk dua bug regresi nyata. Smoke test halaman hasil pemecahan juga tepat sasaran.

**Kurang/keliru:**
1. `routes.js` **tidak punya tes**, padahal murni dan menjadi sumber guard
   (`getPageFromPath`, `getGuardTarget`, `resolveIntentDestination`). Ini tes termurah
   dengan nilai tertinggi — 10 menit, tanpa DOM.
2. `AdminGuard` (non-admin melihat 404) belum diuji; itu perilaku keamanan-UX utama.
3. `data/*` nyaris tak teruji (39% fungsi), padahal isinya kontrak RPC. Tes tidak perlu
   jaringan: cukup mock `getClient()` dan pastikan **nama parameter** RPC serta
   normalisasi baris (`mapListing`, `normalizeRental`) benar. Bug seperti
   `p_listing_id` salah ketik tidak akan tertangkap lint.
4. Daftar migrasi di `adminContract.test.js:30` dan `rpcContract.test.js:44` **hardcoded** —
   migrasi berikutnya tidak ikut dianalisis tanpa sadar. Ganti dengan pembacaan
   direktori + filter nama.
5. `extractFunctions` diduplikasi di dua file tes, dan `rpcContract.test.js` mengekspor
   `mirrorQuoteRental` dari file tes. Pindahkan ke `src/test/contract/parseSql.js`.
6. Tidak ada tes untuk debounce/pagination `ConsumerBrowser` (setelah 1.1 diperbaiki,
   ini yang paling perlu dijaga).

**Yang tidak perlu:** Playwright/E2E sekarang. Alur auth + RLS belum stabil dan
biaya perawatannya tinggi; `scripts/test-frontend-rental-e2e.mjs` sudah menutup
kebutuhan verifikasi manual.

---

## 5. Hardcode yang masih tersisa

| Lokasi | Isi | Saran |
|---|---|---|
| `landing/HeroSection.jsx:20-24, 92-99` | Daftar kota sendiri (tanpa Bekasi) + kartu contoh "Sony Alpha A7 III / Rp150.000" | Kota dari `CITIES`; kartu contoh sebaiknya barang nyata (`fetchListings().slice(0,1)`) atau dihapus. |
| `landing/CategorySection.jsx:1-46` | 6 kategori + gambar Unsplash | Kategori sudah ada di tabel `categories`; ambil dari `fetchCategories()` (sudah dipakai `ConsumerFilters`). |
| `listingDefaultImage.js` | URL Unsplash sebagai gambar default | Placeholder lokal (lihat 1.7). |
| `ui/Footer.jsx:55-60` | `JabsewaOfficial@gmail.com`, `Jabsewa_comm` | Konstanta di `domain/constants.js` atau env. |
| `katalog/ProductDetail.jsx:34-42` | Paragraf "Aturan sewa" statis | Pindah ke `constants` atau kolom toko saat tersedia. |
| `domain/search.js:169` | `rating: 0`, `is_verified: false` | Sudah diberi komentar "menyusul" — biarkan, tapi sembunyikan bintang 0.0 di `StoreCard` agar tidak menyesatkan. |
| `data/admin.js:190,236` | `limit = 200` | Tambah pagination atau naikkan dengan catatan. |

---

## 6. Fungsi yang belum ada (celah produk, bukan bug)

Diurutkan dari yang paling terasa bagi pengguna:

1. **Halaman toko publik** — pembeli tidak bisa melihat profil/barang satu toko
   (tombol "Lihat Toko" hanya memfilter grid di halaman yang sama).
2. **Ubah profil toko** — RPC `update_my_store` sudah ada di DB, UI-nya belum
   (`SellerStoreInfo` menyatakan "UI edit menyusul").
3. **Kelola foto listing** — bisa menambah, tidak bisa menghapus/mengurutkan foto lama.
4. **Menampilkan ulasan** — `create_review` + tabel `reviews` ada, tetapi tidak ada tempat
   menampilkan rating toko/barang. Ini yang membuat `rating: 0` terasa palsu.
5. **Lupa password** — Supabase Auth mendukung, belum ada tautannya.
6. **Edit profil akun** (nama) — belum ada.
7. **Filter di URL** (`/consumer?q=kamera&category=kamera`) — sekarang mustahil
   membagikan hasil pencarian atau memakai tombol back untuk kembali ke filter.
8. **Notifikasi pesanan baru** untuk seller — minimal badge jumlah di menu (data sudah
   ada di `SellerOrders`).

Jangan kerjakan semuanya: 1, 2, dan 4 adalah yang paling menaikkan kesan "produk jadi".

---

## 7. Yang **tidak** perlu dilakukan (menghindari over-engineering)

- **Jangan pasang react-router.** Ada 10 route + satu subtree; router manual 114 baris
  sudah cukup. Cukup perbaiki 5 hal: normalisasi trailing slash, `document.title`,
  `replaceState` setelah auth, reset `consumerItemId`, 404 untuk subpath admin asing.
- **Jangan migrasi styling** ke Tailwind/styled-components. 8.000 baris CSS sudah
  terpecah per area; masalahnya duplikasi, bukan teknologi.
- **Jangan tambah state library** (Redux/Zustand/TanStack Query). Beban terbesar bukan
  state global, melainkan fetch per ketikan — selesaikan dengan debounce + cache modul.
- **Jangan memecah semua file > 300 baris.** Hanya `AdminOrders`, `ConsumerBrowser`,
  dan `App` yang benar-benar mencampur tanggung jawab.
- **Jangan kejar coverage angka.** Target realistis: `routes.js`, `AdminGuard`, dan
  3 modul `data` terpenting (listings, rentals, admin) ternaungi tes kontrak.

---

## 8. Urutan kerja yang disarankan

| # | Pekerjaan | Ukuran | Alasan |
|---|---|---|---|
| 1 | Perbaiki 1.2, 1.4, 1.5, 1.6, 1.9 | ±1 jam | Bug nyata, masing-masing 1–10 baris. |
| 2 | Debounce + cache katalog (1.1) | ±1 jam | Menghentikan pemborosan query paling mahal. |
| 3 | Sambungkan filter kota/kategori/harga (1.3) | ±2 jam | Fitur yang tampak ada tapi tidak bekerja. |
| 4 | Code-splitting admin/legal/seller (3.1) | ±30 menit | Turunkan bundle awal drastis, risiko rendah. |
| 5 | `data/stores.js` + `data/search.js` (2.1, 2.2) | ±1 jam | Menutup pelanggaran lapisan, memudahkan tes. |
| 6 | Ekstrak `useAsyncAction` (2.5) + pakai di 6 tempat | ±1,5 jam | Menghapus ~90 baris duplikasi. |
| 7 | Samakan `AdminApplications` dengan komponen bersama (2.6) | ±1 jam | Mencegah UI admin bercabang. |
| 8 | Rename `katalog`→`catalog`, `rental`→`buyer` (2.3) | ±30 menit | Sekali saja, sebelum makin banyak impor. |
| 9 | Tes: `routes.js`, `AdminGuard`, kontrak `data/*` (bagian 4) | ±2 jam | Menutup area yang paling rawan regresi. |
| 10 | Bersihkan duplikasi CSS bertahap (2.9) | ±3 jam | Risiko visual — kerjakan terakhir, commit kecil per langkah. |

Item 1–4 bisa selesai dalam satu sesi dan sudah menghilangkan sebagian besar keluhan
pengguna nyata. Sisanya pekerjaan kebersihan yang aman ditunda.
