/*
 * ============================================================================
 * USER DATA STORE (wishlist & rental requests) — JabSewa (MODE MOCK)
 * ============================================================================
 * Lapisan data SEMENTARA berbasis localStorage untuk menyimulasikan sisi
 * penyewa sebelum Supabase terpasang. KOMPONEN TIDAK BOLEH memanggil
 * localStorage langsung — semua akses lewat modul ini.
 *
 * Kontrak disusun agar penukaran ke backend nanti tidak mengubah komponen:
 *
 *   Rental {
 *     id, tenant_id, listing_id, store_id,
 *     start_date, end_date, total_days,
 *     price_per_day, deposit, subtotal, total,
 *     status, rejection_reason, created_at, updated_at
 *   }
 *
 * Ganti implementasi di modul ini dengan panggilan API/Supabase saat backend
 * siap — nama fungsi & bentuk data sengaja dibuat stabil:
 *   getWishlist(userId)            → GET  /api/wishlist?user_id=
 *   toggleWishlist(userId,itemId)  → POST/DELETE /api/wishlist
 *   getRentals()                   → GET  /api/rentals (milik user login)
 *   getRentalsByStore(storeId)     → GET  /api/rentals?store_id=
 *   addRental(...)                 → POST /api/rentals
 *   setRentalStatus(id, status)    → PATCH /api/rentals/{id}
 *
 * CATATAN (bukan backend): tidak ada validasi ketersediaan barang, tidak ada
 * persistensi server, dan status berpindah lewat kesepakatan UI saja.
 * ============================================================================
 */

import { getCurrentUser, getItems, getStores, getUsers } from './storage'
import { RENTAL_STATUS } from './constants'

const WISHLIST_KEY = 'jabsewa:wishlist:v2' // per-user: { [userId]: [listingId] }
const RENTALS_KEY = 'jabsewa:rentals:v2' // per-user: { [userId]: [Rental] }

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage penuh / tidak tersedia — abaikan (mode demo tetap jalan)
  }
}

/* ------------------------------- WISHLIST -------------------------------- */

/** Wishlist milik SATU user (dulu global — sekarang per akun). */
export function getWishlist(userId) {
  const all = read(WISHLIST_KEY, {})
  return all[userId] || []
}

/** Toggle wishlist; mengembalikan daftar terbaru (pola state functional). */
export function toggleWishlist(userId, itemId) {
  const all = read(WISHLIST_KEY, {})
  const list = all[userId] || []
  const next = list.includes(itemId) ? list.filter((id) => id !== itemId) : [...list, itemId]
  write(WISHLIST_KEY, { ...all, [userId]: next })
  return next
}

/* ------------------------------- RENTALS --------------------------------- */

/*
 * Enrichment tampilan: nama barang/toko/penyewa di-join saat pembacaan
 * (bukan saat penyimpanan) supaya perubahan di koleksi utama selalu segar.
 * Kolom join di sini yang nanti diganti foreign-key select di Supabase.
 */
function enrichRental(rental) {
  const item = getItems().find((i) => String(i.id) === String(rental.listing_id))
  const store = rental.store_id
    ? getStores().find((s) => s.id === rental.store_id)
    : undefined
  const tenant = getUsers().find((u) => u.id === rental.tenant_id)
  return {
    ...rental,
    item_name: item?.title || 'Barang dihapus',
    item_image: item?.image_url || '',
    seller_name: store?.name || 'Mitra JabSewa',
    tenant_name: tenant?.name || 'Penyewa',
  }
}

/**
 * Semua rental milik user yang sedang login (tenant side).
 * Mengembalikan array kontrak Rental + kolom tampilan (item_name, dst).
 */
export function getRentals() {
  const userId = getCurrentUser()?.id
  if (!userId) return []
  return (read(RENTALS_KEY, {})[userId] || []).map(enrichRental)
}

/**
 * Rental yang masuk ke SATU toko (seller side). Menyaring semua rental
 * berdasarkan store_id — sebelumnya seller melihat order semua orang.
 */
export function getRentalsByStore(storeId) {
  if (!storeId) return []
  const all = read(RENTALS_KEY, {})
  return Object.values(all)
    .flat()
    .filter((rental) => rental.store_id === storeId)
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    .map(enrichRental)
}

/**
 * Kirim permintaan sewa (tenant). Hanya membentuk data & menyimpan status
 * awal `pending` — TIDAK ada validasi ketersediaan (urusan backend nanti).
 */
export function addRental({
  listingId,
  storeId,
  startDate,
  endDate,
  totalDays,
  pricePerDay,
  deposit,
}) {
  const user = getCurrentUser()
  if (!user) return null

  const now = new Date().toISOString()
  const subtotal = Number(totalDays || 0) * Number(pricePerDay || 0)
  const rental = {
    id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tenant_id: user.id,
    listing_id: listingId,
    store_id: storeId ?? null,
    start_date: startDate,
    end_date: endDate,
    total_days: Number(totalDays || 0),
    price_per_day: Number(pricePerDay || 0),
    deposit: Number(deposit || 0),
    subtotal,
    total: subtotal + Number(deposit || 0),
    status: RENTAL_STATUS.PENDING,
    rejection_reason: null,
    created_at: now,
    updated_at: now,
  }

  const all = read(RENTALS_KEY, {})
  write(RENTALS_KEY, { ...all, [user.id]: [rental, ...(all[user.id] || [])] })
  return rental
}

/**
 * Perbarui status satu rental (dipakai alur demo: tenant membatalkan,
 * seller menerima/menolak/memulai/menyelesaikan). Mock — bukan backend.
 */
export function setRentalStatus(rentalId, status, extra = {}) {
  const all = read(RENTALS_KEY, {})
  let updated = null
  Object.keys(all).forEach((userId) => {
    all[userId] = all[userId].map((rental) => {
      if (rental.id !== rentalId) return rental
      updated = {
        ...rental,
        status,
        updated_at: new Date().toISOString(),
        ...extra,
      }
      return updated
    })
  })
  if (updated) write(RENTALS_KEY, all)
  return updated
}
