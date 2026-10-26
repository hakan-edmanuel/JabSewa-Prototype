# Audit Kode Aktual — JabSewa (24 Oktober 2026)

> **Dasar audit:** pembacaan langsung 70 file `src/**/*.js(x)`, 5 file CSS, 9 migration,
> `package.json`, `eslint.config.js`, `vite.config.js`, plus verifikasi perintah:
> `npx eslint .` → **0 error**, `npx vitest run` → **101 test / 7 file lulus**,
> `npx vite build` → **sukses (1 chunk 612 kB)**.
> `docs/` **tidak** dipakai sebagai sumber kebenaran. Beberapa komentar di dalam kode
> juga sudah menyesatkan dan dicatat sebagai temuan (lihat F-7).

---

## 0. Angka dasar

| Metrik | Nilai |
|---|---|
| Total baris `src/` | 19.941 |
| JS/JSX | 11.716 baris / 70 file |
| CSS | 8.225 baris (App.css saja 7.114 = **86%**) |
| Test | 1.204 baris / 7 file (≈52% isinya `rentalLogic.test.js` yang menguji salinan logika) |
| `scripts/` | 3.202 baris (18 file .mjs + 3 SQL + artefak) |
| `docs/` | 3.679 baris / 25 file |
| Migration | 7.555 baris / 9 file |
| Selector CSS unik | 648 |
| Selector CSS tak terpakai | **143** |
| Selector CSS dideklarasikan >1× | **192** (`.hero-inner` 8×, `.seller-cta-box` 7×) |
| `!important` di App.css | 26 |
| Media query di App.css | 25 (tersebar, bukan terkumpul) |

---

## 1. Ringkasan eksekutif

Aplikasi ini **berjalan dan konsisten secara teknis** (lint bersih, test lulus, build sukses,
lapisan data Supabase rapi: semua tulis lewat RPC, RLS-scoped, tanpa fallback palsu).
Masalahnya bukan "kode rusak", tetapi **akumulasi lapisan revisi tanpa pembersihan**:

1. **CSS tanpa disiplin cascade** — 7.114 baris berisi 4–5 lapisan redesign yang saling
   menimpa (`.hero-inner` dideklarasikan 8×), 143 kelas mati, 26 `!important`. Ini sumber
   utama "style yang gemuk" dan biaya perubahan visual yang tidak terprediksi.
2. **Aturan bisnis tersebar di JSX** — status/kewenangan aksi (`boleh batal? boleh bayar?
   boleh review?`) dihitung ulang di tiap komponen dengan `Array.includes` dan ternary
   bersarang, tanpa satu modul kebijakan yang bisa diuji. Di sinilah bug nyata lahir.
3. **Lapisan data dengan parameter palsu & fungsi kembar** — `getRentals`, `getRentalsByStore`,
   `getAllRentals`, `getRentalsByStatuses` adalah query yang sama; `fetchListingsByStore(storeId)`
   mengabaikan argumennya; `toggleWishlist(userId, id)` mengabaikan `userId`. Nama fungsi
   menjanjikan scoping yang tidak ada (scoping sebenarnya dari sesi/RLS).
4. **Test tidak menguji aplikasi** — 52% baris test menguji fungsi yang **didefinisikan di dalam
   file test itu sendiri** (cermin SQL). Tidak ada test untuk lapisan yang justru berisi bug:
   gating aksi, `search.js`, pemetaan data. Tidak ada environment DOM → komponen/hook tak teruji.
5. **Kosa kata domain bercampur** — `buyer` / `consumer` / `penyewa` untuk peran yang sama;
   `seller` / `store` / `toko` untuk entitas yang sama; `superadmin` / `admin` untuk role yang
   di DB hanya `admin`. Ini yang membuat navigasi (`/consumer` vs `/buyer`) terasa tidak konsisten
   dan memaksa alias kompatibilitas (`sellerApplication`, `startSellerApplication`, dst).

**Kesimpulan:** yang dibutuhkan bukan rewrite, melainkan **3 pembersihan struktural**
(CSS dipisah & dipangkas, kebijakan aksi jadi modul murni + test, lapisan data dirampingkan)
ditambah perbaikan 7 bug fungsional. Estimasi: 60–70% pekerjaan bernilai tinggi ada di 8 file.

---

## 2. Bug fungsional nyata (P0 — perbaiki dulu, bukan refactor)

| ID | Lokasi | Masalah | Dampak | Perbaikan |
|---|---|---|---|---|
| **B-1** | `components/Consumer/ProductDetail.jsx:92,271,282` | `canRent` mensyaratkan `Boolean(user)`, sehingga tamu melihat tombol **disabled** berlabel "Masuk untuk sewa". `onRequireAuth` hanya dipanggil di dalam `handleRent()` yang tidak mungkin jalan karena tombol disabled. | Tamu **tidak bisa** masuk dari halaman detail barang — dead end. Alur `goRent` di `App.jsx` jadi tidak terpakai untuk kasus ini. | Pisahkan: tamu → tombol aktif "Masuk untuk sewa" → `onRequireAuth(item)`; user login → tombol mengikuti `quote.ok`. |
| **B-2** | `ConsumerBrowser.jsx:212-228` → `ProductDetail.jsx:232-236` | `handleSelect` merekonstruksi item dari `ItemHit`, tetapi `toItemHit` (`search.js:95`) **tidak membawa** `stock`, `min_rental_duration`, `rental_unit`, dan `category_name`. Di detail: `item.stock ?? 1` selalu 1, `item.rental_unit` undefined → label jatuh ke "hari". | Jumlah (quantity) selalu 1 unit walau stok 5; batas durasi minimum hilang; listing mingguan/bulanan tampil sebagai per hari. Pengguna tidak bisa menyewa >1 unit dari hasil pencarian. | Tambahkan field yang hilang ke `ItemHit`, atau buang rekonstruksi: kirim `id` lalu `fetchListingById(id)` (fungsi ini sudah ada dan **belum dipakai**). |
| **B-3** | `Seller/SellerOrders.jsx:234-236, 375` | `cancellable` mencakup `pending` **dan** `payment_verify`, tapi tombol pemicu hanya dirender untuk `pending`. | Seller tidak bisa membatalkan pesanan yang sedang menunggu verifikasi bukti, padahal server mengizinkan. Muncul sebagai "tidak ada tombol" tanpa penjelasan. | Render pemicu berdasarkan `cancellable && cancelTarget !== order.id`. |
| **B-4** | `pages/SellerOnboardingPage.jsx:65` | `user?.sellerProfile?.storeName` — properti `sellerProfile` tidak pernah ada di profil (`mapProfile` hanya `id/email/name/role/status/isSeller`). | Nama toko kosong pada layar "approved" saat `sellerApplication` null; teks jatuh ke `undefined`. | Ambil nama toko dari `store` (`get_my_stores`) atau dari `storeApplication.storeName`. |
| **B-5** | `SellerOnboardingPage.jsx:62, 299` | (a) `sellerApplication.status !== 'draft'` — `draft` tidak ada di enum `application_status` (pending/approved/rejected), jadi kondisi selalu benar. (b) `onReapply` memanggil `startSellerApplication(form)` yang langsung **mengirim ulang** ajuan lama tanpa membuka form edit. | (a) kode mati yang menyesatkan; (b) "Ajukan Ulang" mengirim ajuan dengan data lama, pengguna tidak bisa memperbaiki alasan penolakan. | (a) hapus cek `draft`; (b) `onReapply` = reset `step` ke 1 dan kosongkan state (jangan submit). |
| **B-6** | `components/FeaturedListings.jsx:59` | Harga selalu diberi label `/ hari`. | Listing `week`/`month` menampilkan harga per minggu/bulan sebagai per hari → **salah nominal 7–30×**. | Pakai `RENTAL_UNIT_LABELS[item.rental_unit]`. |
| **B-7** | `ConsumerBrowser.jsx:233` | Filter toko membandingkan `item.store_name === storeFilter.store_name`. | Dua toko dengan nama sama (mungkin) tercampur; filter bergantung pada string tampilan, bukan identitas. | Bandingkan `item.store_id`. |

**Bug sekunder (P1):**

| ID | Lokasi | Masalah |
|---|---|---|
| B-8 | `lib/format.js:18-28, 33-44` | `try/catch` tidak menangkap tanggal invalid — `new Date('x')` tidak melempar, menghasilkan `"Invalid Date"`. Ganti dengan `Number.isNaN(d.getTime())`. |
| B-9 | `components/Navbar.jsx:18-19` | `hasPendingApplication` bernilai benar untuk ajuan **rejected** juga (komentar bilang "pending"). Label "Status Ajuan Seller" muncul untuk yang sudah ditolak. Cek `status === 'pending'`. |
| B-10 | `superadmin/pages/SysApplications.jsx:88-97` | `confirmDecision` memakai `try/finally` tanpa `catch` → kegagalan RPC menjadi unhandled rejection, UI tidak memberi tahu apa pun (bandingkan SysStores/SysUsers yang benar). |
| B-11 | `pages/BuyerPage.jsx:174-187` | "Batalkan permintaan" langsung eksekusi tanpa konfirmasi, sementara sisi seller memakai form konfirmasi. Aksi destruktif tanpa konfirmasi. |
| B-12 | `components/Consumer/ConsumerFilters.jsx:3` + `pages/ConsumerPage.jsx:17` | Batas harga `500000` di-hardcode di dua tempat; listing di atas Rp 500.000 **tidak pernah tampil** di mode jelajah. `priceRange.min` tidak pernah dipakai. |
| B-13 | `lib/search.js:160-168` + `ConsumerBrowser` | `hybridSearch` memotong 20 item & tidak pernah memanggil `page` berikutnya; UI tidak menampilkan total sebenarnya (`totals` diabaikan). Katalog >20 item tidak terjangkau. |
| B-14 | `pages/SellerOnboardingPage.jsx:330` | `application.city` tidak pernah ada di `storeApplication` (hanya `address`), jadi "Kota" selalu `—`. |

---

## 3. Logika yang tidak tepat (struktural)

### 3.1 Tidak ada modul kebijakan aksi rental
Aturan "status apa boleh aksi apa" ditulis ulang di **empat** tempat dengan bentuk berbeda:

- `BuyerPage.jsx:246-262` — `cancellable`, `payable`, `disputable`, `reviewable`
- `SellerOrders.jsx:234-236` + kondisi per tombol (`confirmed`, `ongoing`, `overdue`)
- `SysOrders.jsx:176-190` — filter & hitung status
- `lib/rentalTimeline.js` — urutan progres (ini sudah benar, tapi terpisah)

Akibat: B-3 lahir karena dua daftar status yang seharusnya satu. **Solusi:** satu modul murni

```js
// src/lib/rentalActions.js
export function getBuyerActions(rental, { reviewed }) {
  return { canCancel, canPay, canDispute, canReview, canRefreshProof }
}
export function getSellerActions(order, { hasPendingProof }) { ... }
```

Komponen hanya merender flag; modul ini 100% bisa diuji tanpa DOM (cocok dengan setup test saat ini).
**Kenapa:** aturan bisnis jadi satu sumber, bug sejenis B-3 tidak bisa terulang, dan test-nya
benar-benar menguji aplikasi (bukan cermin SQL).

### 3.2 Parameter fungsi yang tidak dipakai (API menipu)
| Fungsi | Argumen | Kenyataan |
|---|---|---|
| `fetchListingsByStore(storeId)` | `storeId` | diabaikan; scope dari RLS |
| `fetchListingsByStore(store?.id)` dipanggil di 3 komponen dengan argumen berbeda-beda | — | sebagian panggil `store?.id`, sebagian tanpa argumen |
| `getRentalsByStore(storeId)` | `storeId` | diabaikan |
| `toggleWishlist(userId, itemId)` | `userId` | diabaikan (`_userId`) — komentar di pemanggil menyiratkan user ikut dikirim |
| `fetchMyStoreListings()` + `fetchListingsByStore()` | — | dua nama untuk satu query |

**Solusi:** hapus parameter, ganti nama sesuai kontrak sesungguhnya:
`listMyListings()`, `listRentals({ statuses })`, `toggleWishlist(listingId)`.
**Kenapa:** pembaca kode tidak bisa lagi salah paham soal otorisasi; signature = dokumentasi.

### 3.3 Empat query rental identik
`getRentals`, `getRentalsByStore`, `getAllRentals`, `getRentalsByStatuses` (`lib/userData.js:97, 112, 378, 392`)
memakai `RENTALS_SELECT` yang sama, urutan sama, dan hanya berbeda nama. `getRentalsByStatuses`
tidak dipakai siapa pun.

**Solusi:** satu `listRentals({ statuses = null })`; alias dihapus. **Kenapa:** 4→1, dan
perubahan select hanya di satu tempat.

### 3.4 Duplikasi kosakata status (4 definisi)
| Lokasi | Status yang dipetakan |
|---|---|
| `lib/constants.js` `TRANSACTION_STATUS_META` | transaksi |
| `superadmin/pages/SysStores.jsx` `STATUS_META` | store |
| `superadmin/pages/SysUsers.jsx` `STATUS_META` | user |
| `superadmin/pages/SysApplications.jsx` `STATUS_META` | ajuan, dengan kunci **`under_review`** padahal DB `pending`, lalu dipetakan lewat `statusKey()` |
| `lib/constants.js` `APPLICATION_STATUS_META` | ajuan (tidak dipakai siapa pun) |

**Solusi:** semua meta status ke `constants.js` dengan kunci **persis enum DB**; hapus
pemetaan `under_review` → tampilkan `pending` dengan label "Menunggu Review".
**Kenapa:** satu enum, satu label; tidak ada penerjemahan ganda yang bisa melenceng.

### 3.5 Filter berbasis string tampilan
`status === "Semua Status"`, `filter === "Aktif"`, `data.get("status") === "Aktif"`
(`SellerItems.jsx:88-94, 178, 400`). Nilai sentinel berupa teks Indonesia dipakai sebagai logika.

**Solusi:** `filter` = `'all' | 'active' | 'inactive'`; label hanya untuk `<option>`.
**Kenapa:** mengubah label UI tidak boleh mengubah perilaku filter.

### 3.6 `ConsumerPage` mengambil katalog untuk tujuan yang salah
`ConsumerPage.jsx:22-40` memanggil `fetchListings()` **hanya** untuk mencari satu item deep-link,
sementara `ConsumerBrowser` memanggil `hybridSearch()` yang juga mengambil katalog + toko.
= 2 request katalog setiap membuka `/consumer`, dan `loadError` ganda dengan pesan berbeda.

**Solusi:** `fetchListingById(initialItemId)` (sudah ada, belum dipakai) untuk deep-link;
hapus fetch katalog di page. **Kenapa:** satu request, satu sumber error.

### 3.7 Pencarian: fetch + skor fuzzy pada setiap ketikan
`ConsumerHero.jsx:41-44` memanggil `onSearch` per karakter → `ConsumerBrowser` effect
memanggil `hybridSearch` → 2 query Supabase + skor Levenshtein/Dice untuk **seluruh** katalog,
tanpa debounce, tanpa batas kandidat.

**Solusi minimal:** debounce 250 ms di `ConsumerHero` (atau hook `useDebouncedValue`),
lewati `similarity()` bila query kosong, dan prefilter `hay.includes(q)` sebelum fuzzy.
**Kenapa:** ini penyebab utama input terasa berat saat katalog membesar; 15 baris kode,
tanpa library.

### 3.8 Guest wishlist = fitur setengah jadi
`ConsumerBrowser.jsx:24-38, 142-150` menyimpan id listing tamu di `localStorage`
(`jabsewa:wishlist:guest`), tetapi (a) tidak pernah ditampilkan di mana pun,
(b) dibuang saat login, (c) bertentangan dengan klaim di `main.jsx`/`README` bahwa tidak ada
state lokal. Indentasi `const parsed` (baris 28) juga rusak.

**Solusi:** pilih satu — hapus guest wishlist (rekomendasi: paling kecil & jujur), atau
tampilkan di Buyer Dashboard + merge ke server saat login. Jangan biarkan state setengah jalan.

### 3.9 Race & duplikasi fetch profil
`AuthContext.jsx:101-155`: `getSession()` dan `onAuthStateChange` sama-sama memanggil
`fetchProfile` + `refreshApplication`. Pada mount, dua request profil berjalan berbarengan.

**Solusi:** satu jalur inisialisasi (gunakan `onAuthStateChange` saja, atau dedupe dengan cache
`userId → promise`). **Kenapa:** menghilangkan flicker status dan request ganda.

---

## 4. If bersarang & percabangan render

| Lokasi | Bentuk | Perbaikan |
|---|---|---|
| `App.jsx:218-226` | ternary 4 tingkat untuk `guardTarget` | tabel `GUARDED_ROUTES = { buyer:'buyer', profile:'profile', seller:'seller', 'seller-onboarding':'seller' }` → satu lookup |
| `App.jsx:135-160` | rantai `if (intent.page === ...)` | map `INTENT_HANDLERS` atau `switch`; sekaligus menyatukan dengan tabel route |
| `ProductDetail.jsx:274-283` | label tombol 4 tingkat (`submitting ? … : result ? … : available === false ? … : user ? …`) | `resolveRentButtonLabel({ submitting, result, available, user })` murni → bisa dites |
| `SellerOrders.jsx:290-330` | `orderProofs ? (filter.length ? map : …) : (…)` | komponen `PaymentProofBlock` dengan early-return |
| `SellerOnboardingPage.jsx:256-330` | 3 blok `if` + duplikasi shell halaman | satu `StatusScreen` + prop `variant`; shell (navbar/footer) diekstrak |
| `ConsumerPage.jsx:55-77` | `{loadError && …}{!loadError && …}` | `if (loadError) return <ErrorState />` |
| `SysApplications.jsx:60-63` | `filter === 'all' ? apps : apps.filter(...)` bersarang di `visible` | lookup `FILTER_PREDICATES[key]` |

**Prinsip:** ganti percabangan bertingkat dengan **lookup map** bila yang bervariasi adalah data
(route, label, meta status); pakai **early return** bila yang bervariasi adalah alur render.
Jangan mengekstrak komponen yang hanya dipakai sekali tanpa alasan keterbacaan — itu menambah
indireksi tanpa manfaat.

---

## 5. Dead code, alias kompatibilitas, dan komentar menyesatkan

| ID | Item | Bukti | Tindakan |
|---|---|---|---|
| D-1 | `switchRole` | `AuthContext.jsx:239,275` — tidak dipanggil siapa pun; badan fungsi hanya `console.warn` + `return false` | hapus |
| D-2 | `refreshStoreApplication` | diekspos, tidak dipakai | hapus |
| D-3 | `sellerApplication`, `startSellerApplication`, `submitSellerApplication` | alias dari `storeApplication` dkk. Pemakaian alias: Navbar, ProfilePage, SellerOnboardingPage | migrasikan pemanggil ke nama baru (1 kata), hapus alias |
| D-4 | `APPLICATION_STATUS`, `APPLICATION_STATUS_META` | `constants.js:68-78`, tidak diimpor siapa pun | hapus (atau jadikan satu-satunya sumber, lihat 3.4) |
| D-5 | `ALL_ROLES` | `roles.js:15` | hapus |
| D-6 | `hybridSearchLocal` | `search.js:173` — alias tanpa pemakai | hapus |
| D-7 | `summarizeApplications` | `superadmin.js:163` — tidak dipakai; SysDashboard menghitung sendiri | hapus / pakai |
| D-8 | `getDisputesForRental`, `getRentalsByStatuses` | tidak dipakai | hapus |
| D-9 | `fetchMyStoreListings` | hanya dipakai oleh alias `fetchListingsByStore` | satukan (lihat 3.2) |
| D-10 | `resetSuperadminCache()` | `superadmin.js:63` — **fungsi kosong**, dipanggil di cleanup provider | hapus pemanggilan & fungsi (menyesatkan: terlihat seperti ada cache) |
| D-11 | `effectiveCategories = categories.length ? categories : []` | `SellerItems.jsx:104` — ekspresi identitas | hapus |
| D-12 | `sellerApplication` duplikat di `listSellerApplications` | `superadmin.js:125-135` — menyalin field + `city` hasil `split(',')` | hapus; kirim `address` mentah |
| D-13 | `DEFAULT_IMG` Unsplash | `SellerItems.jsx:16` dipakai sebagai fallback gambar listing | ganti aset lokal/placeholder netral |
| D-14 | `public/favicon.svg` 0 byte | `index.html` merujuk file kosong | isi atau hapus referensi |
| D-15 | Artefak di `scripts/` | `.audit-out.json` 42 KB, `.frontend-e2e-out.txt`, `.rental-fixture.json` (**berisi kredensial test**) | sudah di-`.gitignore`; hapus dari disk, dan rotasi kredensial fixture |
| D-16 | Komentar menyesatkan | `FeaturedListings.jsx:8` "LocalStorage store"; `ConsumerPage.jsx:20` "Sumber data barang dari LocalStorage"; `App.jsx:196` komentar ganda soal "LocalStorage" | perbarui/hapus |

---

## 6. Hardcode

| Lokasi | Nilai hardcoded | Risiko | Solusi |
|---|---|---|---|
| `HeroSection.jsx:37-52` | 7 kota (duplikat `CITIES` di `constants.js`, minus Bekasi) | dua daftar kota berbeda | satu `CITIES` |
| `HeroSection.jsx:71-93` | gambar Unsplash + kartu contoh "Sony Alpha A7 III / Rp150.000 / Jakarta Utara · Sony Alpha A7 III" | data palsu di landing; nama tampil 2× | ambil 1 listing nyata (atau ilustrasi netral, bukan data listing palsu) |
| `HeroSection.jsx:17, 61` | `popularTags`, select kota — keduanya tidak melakukan apa pun (submit hanya `navigate('consumer')`) | kontrol yang tidak berfungsi | teruskan query/kota ke `/consumer`, atau hapus kontrolnya |
| `CategorySection.jsx:1-50` | 6 kategori + gambar Unsplash, tombol tidak mengirim filter kategori | bertentangan dengan aturan "kategori dari tabel `categories`"; klik tidak memfilter | render dari `fetchCategories()` + kirim `category` ke halaman jelajah |
| `ConsumerFilters.jsx:3`, `ConsumerPage.jsx:17` | `500000`, step `50000` | batas katalog tersembunyi (B-12) | ambil `max(price)` dari data atau naikkan batas & jadikan konstanta bernama |
| `FeaturedListings.jsx:59` | `/ hari` | harga salah unit (B-6) | `RENTAL_UNIT_LABELS` |
| `Footer.jsx:47-52` | `JabsewaOfficial@gmail.com`, `Consumer Help: Jabsewa_com` | satu entri rusak, keduanya bukan link `mailto:` | jadikan konstanta kontak + `mailto:` |
| `uploads.js:36` | `MAX_LISTING_IMAGES = 5` (klien) vs server menerima array penuh | batas hanya di UI | dokumentasikan sebagai batas UX (sudah cukup) |
| `App.css` | 26 `!important` + warna literal (`#dc2626`, `#0f172a`, `#ffffff`) | tidak mengikuti token | ganti ke token (`--jabsewa-*`), hapus `!important` |

Catatan: token warna di `index.css:4-60` sudah bagus. Masalahnya bukan absennya sistem desain,
melainkan **lapisan lama yang tidak dihapus** sehingga sistem itu ditimpa `!important`.

---

## 7. Struktur folder & penamaan

### 7.1 Kondisi saat ini (masalah)

```
src/
├─ App.css                  ← 7.114 baris global, diimpor App.jsx
├─ App.jsx                  ← router + guard + komposisi landing (233 baris fungsi)
├─ components/
│  ├─ Seller/SellerItems.jsx (568) SellerOrders.jsx (520)   ← sebenarnya halaman
│  ├─ Consumer/…            ← "consumer" = buyer
│  ├─ legal/…               ← isi konten legal (bukan komponen UI)
│  └─ Navbar, HeroSection, AboutUs, DevRoleSwitcher, …
├─ pages/                   ← BuyerPage (663), ConsumerPage, SellerPage, …
├─ superadmin/              ← role DB-nya `admin`, bukan `superadmin`
│  └─ pages/Sys*.jsx        ← 6 halaman 274–425 baris
├─ lib/                     ← data layer + konstanta + helper (11 file, 2.600 baris)
└─ styles/                  ← hanya 3 file; App.css tidak di sini
```

Ketidakkonsistenan konkret:
1. **`pages/` vs `components/`**: `SellerItems` (568 baris, punya header halaman, filter, form)
   adalah halaman, bukan komponen; ia hidup di `components/Seller/`. Sebaliknya `ProfilePage`
   mendapat folder `pages/`.
2. **`src/styles/` tidak lengkap**: 3 file kecil di sana, tetapi 86% CSS tinggal di `src/App.css`.
3. **`lib/` tercampur**: data layer (`listings`, `userData`, `superadmin`, `uploads`), domain
   (`constants`, `roles`, `format`, `search`, `rentalTimeline`), dan routing (`postLoginRouting`).
   Tidak ada batas yang jelas antara "I/O" dan "logika murni" — akibatnya test murni dan test I/O
   bercampur tanpa pola.
4. **Nama domain ganda**: `buyer`/`consumer`, `seller`/`store`, `superadmin`/`admin`.
   Rute `/consumer` (jelajah) dan `/buyer` (dashboard) memperkuat kebingungan ini di URL.
5. **Nama file halaman admin**: `Sys*` (singkatan internal) vs `Seller*`, `BuyerPage` (kata penuh).
6. **Nama test**: `auth/auth.test.js` (generik) untuk menguji `resolveSignUpOutcome`.
7. **`docs/db-rebuild/`**: 25 file dengan nomor bertabrakan (`01-AUDIT.md`,
   `01-audit-report.md`, `01-erd-audit.md`; `02-DESAIN.md` vs `02-final-prd.md`;
   `03-database-design.md` vs `03-erd.mmd`) dan 3 file `.sql` di dalam folder dokumen.

### 7.2 Struktur target (rekomendasi, tanpa library baru)

```
src/
├─ app/
│  ├─ App.jsx              ← komposisi route saja (~80 baris)
│  ├─ routes.js            ← SATU tabel path ↔ page (dipakai App + SysControl + post-login)
│  └─ guards.js            ← guardTarget table (ganti ternary App.jsx:218)
├─ features/
│  ├─ auth/                AuthContext.jsx, AuthPage.jsx, auth.test.js
│  ├─ katalog/             ConsumerPage, ConsumerBrowser, ConsumerFilters, ProductDetail
│  ├─ rental/              BuyerPage, RentalCard, PaymentProofForm, DisputeForm, ReviewForm
│  ├─ seller/              SellerPage, SellerDashboard, SellerItems, SellerOrders, onboarding/
│  └─ admin/               AdminApp, AdminGuard, AdminLayout, pages/…
├─ domain/                 MURNI (tanpa Supabase): constants, rentalActions, rentalTimeline,
│                          format, search, roles
├─ data/                   I/O: supabaseClient, listings, rentals, wishlist, uploads, admin
├─ ui/                     Navbar, Footer, UserMenu, ErrorBoundary, ProofLink, status badge
└─ styles/
   ├─ tokens.css           ← isi index.css saat ini (warna/font/spacing)
   ├─ base.css
   └─ <area>.css           ← diimpor oleh halaman pemiliknya
```

**Kenapa `features/` dan bukan `pages/`+`components/`?** Aplikasi ini punya 4 area produk yang
jelas (auth, katalog, rental, seller, admin). Memecah per area membuat 8 file gemuk terbelah
sendiri dan menghapus pertanyaan "ini komponen atau halaman?". **Kenapa bukan CSS-in-JS / Tailwind?**
Tidak perlu: masalahnya bukan alat styling, tetapi berkas tunggal 7.114 baris berisi lapisan
ganda. Memindahkan 8.225 baris CSS ke sistem baru = risiko besar tanpa manfaat yang sepadan.

**Biaya:** rename folder = sentuhan import di ±40 file, tetapi mekanis (bisa diverifikasi
`eslint` + `vite build`). Tidak ada perubahan perilaku.

### 7.3 Konvensi penamaan yang diusulkan (pilih satu, konsisten)

| Konsep | Satu istilah | Alasan |
|---|---|---|
| Orang yang menyewa | **`consumer`** (kode) / "Penyewa" (UI) | sudah jadi nama role DB (`user_role`); jangan tambah `buyer` |
| Orang yang menyewakan | **`seller`** (kode) / "Seller" (UI) | sudah dipakai DB (`is_seller`); `store` = entitas toko, bukan orang |
| Pemilik platform | **`admin`** (kode) / "Admin" (UI) | enum DB hanya `admin`; `superadmin` hanya nama folder lama |
| Rute | `/jelajah` + `/pesanan` **atau** tetap `/consumer` + `/buyer` | pilih satu; jangan campur istilah di URL dan kode. Jika URL dipertahankan (menghindari 404 bookmark), cukup seragamkan **kode**-nya. |

---

## 8. File & fungsi gemuk

| File | Baris | Isi | Pecah menjadi |
|---|---|---|---|
| `App.css` | 7.114 | 5 lapisan redesign + 25 media query | `styles/{tokens,base,landing,katalog,product,seller,buyer,auth,profile,legal}.css` |
| `pages/BuyerPage.jsx` | 663 (fungsi 629) | daftar rental + 4 form inline + wishlist + CTA | `RentalList`, `RentalCard`, `PaymentProofForm`, `DisputeForm`, `ReviewForm`, `WishlistSection`, `useBuyerRentals()` |
| `components/Seller/SellerItems.jsx` | 568 (fungsi 536) | daftar + filter + form 200 baris + upload | `SellerItemsPage`, `ListingCard`, `ListingForm`, `useListingUpload()` |
| `components/Seller/SellerOrders.jsx` | 520 (fungsi 482) | daftar + 5 panel aksi inline | `SellerOrdersPage`, `OrderCard`, `PaymentDecision`, `LateFeePanel`, `CancelPanel` |
| `pages/SellerOnboardingPage.jsx` | 346 | wizard 3 langkah + 3 layar status + shell ×3 | `OnboardingWizard`, `ApplicationStatusScreen`, `AgreementText` (sudah ada) |
| `components/Consumer/ProductDetail.jsx` | 318 (fungsi 294) | detail + form sewa + quote + pesan error | `ProductInfo`, `RentalPanel`, `useRentalQuote()`; hapus baris `item.category_name \|\| CATEGORY_LABELS… \|\| item.category \|\| '—'` (4 fallback) |
| `components/Navbar.jsx` | 196 | menu desktop + panel mobile (duplikat markup) | satu `NAV_ITEMS` array dirender 2× (desktop & mobile) |
| `superadmin/pages/SysOrders.jsx` | 425 (fungsi 385) | sengketa + transaksi + aksi | `DisputeQueue`, `RentalTable`, `PaymentDecision` (dipakai juga oleh seller!) |
| `superadmin/pages/SysUsers.jsx` / `SysListings` / `SysStores` | 352 / 336 / 305 | pola list-detail + konfirmasi **identik** | satu `AdminListDetail` + kolom per entitas; hapus ±300 baris duplikasi |
| `components/legal/TermsContent.jsx` | 330 | konten statis | biarkan (konten, bukan logika); pindah ke `content/legal/` |

Ambang praktis yang saya sarankan (bukan aturan kaku): **komponen ≤ 150 baris, halaman ≤ 200
baris, satu komponen satu alasan untuk berubah**. Semua file di atas melewati ambang karena
menggabungkan "ambil data + atur state + render daftar + render form".

---

## 9. CSS: diagnosis dan target

**Diagnosis.** `App.css` adalah hasil *append* berulang; blok komentar di dalam file mengakui
hal ini (`"ditata di bagian DESIGN SYSTEM v4 di akhir file"`, `"the ONE accent-color audit block"`).
Konsekuensinya:

- 192 selector dideklarasikan >1× → pemenang ditentukan urutan file, bukan niat desain.
- 143 kelas tidak pernah dipakai JSX (contoh: seluruh keluarga `.admin-*` — sisa UI admin lama
  yang sudah diganti `.sys-*`; `.analytics-*`, `.metric-*`, `.testimonials-*`, `.cart-*`).
- 26 `!important` dipakai untuk "menang" dari lapisan sebelumnya.
- 25 media query tersebar → satu perubahan breakpoint butuh audit manual.
- Global CSS diimpor dari komponen (`ConsumerBrowser` → `hybrid-search.css`,
  `SuperadminLayout` → `sys-control.css`) sehingga **urutan cascade bergantung graf import**.
  Ini rapuh: memindahkan satu import bisa mengubah tampilan halaman lain.

**Target (tanpa perubahan desain):**

1. Pindahkan `index.css` → `styles/tokens.css` + `styles/base.css`; pertahankan token yang ada.
2. Pecah `App.css` berdasarkan area, impor dari halaman pemilik (bukan dari `App.jsx`).
3. Hapus 143 kelas mati (daftar sudah tersedia — lihat lampiran A).
4. Untuk 192 duplikat: sisakan **satu** deklarasi final per selector; hapus lapisan yang kalah.
5. Ganti `!important` dengan spesifisitas wajar; hapus hanya setelah langkah 4 (supaya tidak
   ada regresi visual).
6. Satukan media query per breakpoint di akhir tiap file area.

**Cara verifikasi tanpa screenshot:** `vite build` (CSS size turun), lalu bandingkan daftar
selector sebelum/sesudah secara mekanis. Ukuran target realistis: **7.114 → ±3.000 baris**
tanpa mengubah tampilan, karena ±55% isinya adalah deklarasi yang kalah/tak terpakai.

---

## 10. Testing: apa yang salah dan apa yang benar

### Yang benar (pertahankan)
- `postLoginRouting.test.js` (17 test) — menguji modul murni nyata, termasuk input jahat.
- `uploads.test.js` (12) — kontrak path storage, sesuai policy migration.
- `auth.test.js` (4) — regresi CASE A/B/C `resolveSignUpOutcome`.
- `rentalTimeline.test.js` (8) — menguji modul nyata.
- `adminContract.test.js` + `rpcContract.test.js` — asersi statis atas SQL. Ini **bukan**
  unit test biasa, tapi berguna sebagai penjaga kontrak migrasi (bug `RETURN NEXT` nyata pernah
  terjadi). Pertahankan, tapi pindahkan ke `test/contracts/` agar jelas beda kelasnya.

### Yang salah
1. **`rentalLogic.test.js` (262 baris, 30 test) menguji fungsi yang didefinisikan di file itu
   sendiri** (`calcTotalDays`, `availableUnits`, `isLegalTransition`, dst. di-`export` dari file
   test). Tidak ada satu baris pun kode aplikasi yang dieksekusi. Test ini hanya membuktikan
   salinan JS konsisten dengan dirinya sendiri — bukan dengan SQL, bukan dengan aplikasi.
   *Ini memberi rasa aman palsu: 30 test hijau, 0 coverage.*
2. **Tidak ada test untuk lapisan yang paling berisiko**: `search.js` (Levenshtein + filter +
   pagination), `listings.js` (`mapListing`), `userData.js` (`normalizeRental`), dan aturan aksi
   rental (yang melahirkan B-3).
3. **Tidak ada infrastruktur DOM**: `vite.config.js` tidak punya blok `test`, tidak ada `jsdom`
   maupun `@testing-library/react` → komponen/hook mustahil diuji. Itu sebabnya semua bug di
   §2 hanya bisa ditemukan dengan membaca kode.
4. **Tidak ada coverage report** (tidak ada `@vitest/coverage-v8`), jadi tidak ada sinyal
   "file mana yang nol test".
5. **Test tidak dijalankan otomatis** — tidak ada CI config di repo.

### Target minimum (proporsional, tidak berlebihan)
1. Hapus `rentalLogic.test.js`; pindahkan matematika yang benar-benar dipakai aplikasi ke
   `domain/rentalMath.js` (`countDays`, `durationUnits`, `itemPricing`) dan **impor dari sana**
   di `userData.js`/`ProductDetail` → test-nya jadi menguji kode produksi.
2. Tambah `domain/rentalActions.js` + test (menutup B-3 secara permanen).
3. Tambah test `search.js` (skor, filter kategori, pagination) — murni, cepat.
4. Tambah 1 blok `test` di `vite.config.js`: `environment: 'jsdom'` + `coverage` untuk
   `src/domain` dan `src/data` (bukan seluruh `src`, agar tidak mengejar angka).
5. Uji 2 komponen paling berisiko dengan Testing Library: `ProductDetail` (B-1/B-2) dan
   `SellerOrders` (B-3). Cukup 6–8 test; tidak perlu snapshot.
6. Jalankan `lint + test + build` di CI (GitHub Actions, 1 file).

---

## 11. Performance

| Temuan | Dampak | Aksi |
|---|---|---|
| 1 chunk JS 612 kB (161 kB gzip) | seluruh kode admin & halaman legal ikut diunduh semua pengunjung | `React.lazy` untuk `AdminApp` + halaman legal/About; target ±30% turun di first load |
| `hybridSearch` per ketikan (2 query + fuzzy seluruh katalog) | input berat saat katalog >200 item | debounce 250 ms + prefilter substring (lihat 3.7) |
| `fetchListings()` dua kali di `/consumer` | request ganda | lihat 3.6 |
| `fetchListings` mengambil `description`, semua gambar, join stores untuk kartu | payload besar | select ringan untuk kartu; detail memakai `fetchListingById` |
| Gambar Unsplash tanpa `sizes`/lebar tetap (landing, kategori, hero) | LCP buruk di jaringan lambat | pakai aset lokal teroptimasi atau `loading="lazy"` + dimensi eksplisit |
| 25 media query + CSS 110 kB | parse CSS di setiap halaman | ikut pemecahan CSS §9 |

---

## 12. Fungsi yang belum ada (gap fungsional, bukan bug)

| Gap | Bukti | Catatan |
|---|---|---|
| Edit profil toko | `SellerStoreInfo.jsx` read-only + teks "UI edit menyusul"; RPC `update_my_store` ada di migration | fitur setengah jadi yang terlihat oleh user |
| Booking multi-item / cart | `ProductDetail` hanya 1 item; server menerima array & menolak lintas toko | kode server siap, UI belum |
| Halaman detail barang ber-URL | detail = state React; refresh kembali ke grid, `fetchListingById` tak terpakai | perlu rute `/barang/:id` (atau `?item=`) |
| Pagination / "muat lebih banyak" | `hybridSearch` mendukung `page`/`limit`, UI tidak | katalog >20 item tidak terjangkau |
| Lupa password / reset | `AuthPage` hanya login & daftar | Supabase Auth mendukungnya |
| Filter kategori dari landing | `CategorySection` tidak mengirim kategori | klik kategori = jelajah tanpa filter |
| Konfirmasi aksi destruktif di buyer | B-11 | konsisten dengan pola seller |
| Error state untuk aksi admin | B-10 | sudah ada polanya di SysStores/SysUsers |
| Konfirmasi di `removeItem` (hapus listing) | `SellerItems.jsx:229-237` langsung hapus | server menolak bila ada riwayat (`has_rentals`), tapi UX tanpa konfirmasi |

---

## 13. Rencana eksekusi bertahap

Urutan dipilih agar setiap fase **independen, bisa diverifikasi, dan tidak menumpuk risiko**.

### Fase 0 — Perbaikan bug (½ hari, tanpa refactor)
B-1 … B-14. Semua perubahan lokal (<10 baris per bug), verifikasi: `lint`, `test`, `build`,
plus cek manual alur tamu→login→sewa dan seller→cancel.
**Kenapa dulu:** bug ini memblokir alur bisnis inti; menunda refactor sampai setelahnya
menghindari memperbaiki kode yang akan dipindah.

### Fase 1 — Sumber kebenaran domain (1 hari)
1. `domain/rentalActions.js` + test (menutup B-3 secara struktural).
2. `domain/theme`? tidak perlu. Yang perlu: `constants.js` jadi satu-satunya meta status
   (transaksi, store, user, ajuan) dengan kunci = enum DB.
3. Hapus dead code D-1 … D-12 (mekanis, grep-driven).
4. `rentalMath.js` + pindahkan perhitungan dari `normalizeRental`.
Verifikasi: test baru + `grep` memastikan tidak ada sisa alias.

### Fase 2 — Lapisan data dirampingkan (½ hari)
`listMyListings()`, `listRentals({statuses})`, `toggleWishlist(listingId)`; hapus 4 fungsi kembar
& parameter palsu; `ConsumerPage` pakai `fetchListingById`. Verifikasi: build + pemakaian nyata
tiap pemanggil (grep hasil kosong untuk nama lama).

### Fase 3 — Struktur folder & penamaan (1–1,5 hari, mekanis)
Pindah ke `features/` + `data/` + `domain/` + `ui/`; seragamkan istilah (consumer/seller/admin);
rename `superadmin/` → `admin/`. Verifikasi: `eslint` (import rusak langsung terlihat),
`build`, smoke test 10 rute.

### Fase 4 — File gemuk & render (1–1,5 hari)
Pecah 8 file di §8; ganti ternary bersarang dengan lookup/early-return (§4). Tidak mengubah
perilaku; verifikasi: `git diff --stat` menunjukkan pemindahan murni + test tetap hijau.

### Fase 5 — CSS (1–1,5 hari)
Ikuti §9 langkah 1→6. Verifikasi: build size turun, daftar selector dibandingkan,
`!important` = 0, tidak ada kelas mati.

### Fase 6 — Test & CI (½ hari)
Ikuti §10 target 1→6.

**Total realistis: 5–6 hari kerja.** Jika harus dipotong: **Fase 0 + 1 + 5** memberi
pengurangan risiko terbesar per jam (bug hilang, aturan terpusat, CSS bisa diubah dengan aman).

---

## 14. Yang **tidak** perlu dilakukan (anti over-engineering)

| Usulan yang menggoda | Mengapa tidak |
|---|---|
| Ganti ke TypeScript sekarang | 11.700 baris JS + data layer Supabase generic; migrasi besar, manfaat utama (kontrak RPC) sudah dijaga test SQL statis. Tunda sampai Fase 1–3 stabil. |
| Adopsi state manager (Redux/Zustand/TanStack Query) | Tidak ada masalah state global: hanya auth (context) + data per halaman. Yang kurang adalah *cache* & *dedupe*, bisa diselesaikan 20 baris hook / 1 `queryClient` di masa depan. |
| Tambah `react-router` | 10 rute, 1 parameter opsional. Yang benar-benar rusak hanya detail barang yang tidak ber-URL. Cukup perbaiki dengan rute `?item=`; tambah router hanya jika nanti butuh nested layout/loader. |
| Pindah ke Tailwind / CSS-in-JS / design system baru | Masalahnya lapisan CSS ganda, bukan alatnya. Memindahkan 8.200 baris menambah risiko regresi visual besar. |
| Rewrite lapisan Supabase | Ini bagian terbaik dari kode: RPC-only write, RLS, audit server-side. Jangan disentuh. |
| Pisahkan `docs/db-rebuild` jadi repo wiki / 30 file baru | Cukup arsipkan yang usang ke `docs/archive/` dan sisakan 1 dokumen kontrak aktif. |
| GraphQL / BFF / microservice | Skala aplikasi belum menuntut; RPC Postgres sudah menjadi "API" yang valid. |
| 100% coverage | Tidak proporsional. Target: domain + data layer + 2 komponen berisiko. |

---

## Lampiran A — 143 kelas CSS tak terpakai (bukti)

```
about-main-title about-photo about-photo-strip about-text accent-pill admin-btn-approve
admin-card admin-confirm-actions admin-confirm-block admin-confirm-hint admin-content
admin-decision admin-decision-actions admin-decision-note admin-desc admin-detail
admin-detail-badge admin-detail-cols admin-detail-head admin-detail-id admin-detail-placeholder
admin-detail-ref admin-detail-store admin-empty admin-field-group admin-field-title admin-filter
admin-filter-count admin-filters admin-head admin-kicker admin-list admin-list-items admin-page
admin-pending admin-pending-label admin-pending-num admin-reject-row admin-row admin-row-avatar
admin-row-avatar-lg admin-row-cta admin-row-date admin-row-main admin-row-name admin-row-side
admin-row-store admin-saved-note admin-sub analytics-header analytics-metrics analytics-section
benefit-icon blue browser-item-buttons browser-item-rating browser-sort btn-icon-cart
btn-reset-filters cart-badge cart-btn category-arrow category-card-header category-count-badge
category-tag-badge center-heading consumer-footer-structured consumer-hero-kicker
consumer-hero-subtitle consumer-search-icon deposit-tag detail-rating detail-rules eyebrow-light
featured-header-wrap footer-brand-desc footer-brand-name footer-legal footer-structured-bottom
footer-structured-brand footer-structured-col footer-structured-container footer-structured-links
footer-structured-main hero-badge hero-highlight hero-kicker hero-search-icon hero-trust-bar
how-subtitle is-done item-image-large listing-category-badge listing-meta-row listing-price-box
listing-rating listing-seller-row listing-specs metric-card metric-change metric-label metric-value
mini-button mini-stat mini-stat-label mini-stat-value notification-badge notification-btn
onboarding-step onboarding-steps page-admin-shell price-label price-title product-thumbnails
profile-mode-switch rating-value seller-analytics seller-app-mock seller-app-mock-actions
seller-app-mock-label seller-avatar seller-marketplace-link seller-name seller-profile
seller-sidebar-footer seller-stats-mini seller-summary stat-icon status-aktif
status-dalam-pengiriman status-nonaktif status-tersewa step-card step-card-top step-number-badge
step-tip-box step-tip-icon step-tip-text testimonials-grid trust-grid trust-stat
verified-badge-small yellow
```

Dua kelompok besar di atas menunjukkan sejarah fitur yang dihapus tanpa membersihkan CSS:
`.admin-*` (UI admin lama, kini `.sys-*`), `.analytics-*`/`.metric-*`/`.testimonials-*`/
`.cart-*`/`.mini-stat*` (dashboard & cart versi awal).

## Lampiran B — Bukti perintah

```
$ npx eslint .            → (tidak ada output, exit 0)
$ npx vitest run          → 7 file, 101 test lulus
$ npx vite build          → dist/assets/index-*.js 612.50 kB │ gzip 161.73 kB
                            dist/assets/index-*.css 109.81 kB │ gzip 18.05 kB
                            (!) chunk > 500 kB
```
