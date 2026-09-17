/*
 * ============================================================================
 * USER DATA STORE (wishlist & pesanan sewa) — JabSewa
 * ============================================================================
 * Penyimpanan SEMENTARA client-side (localStorage) supaya flow penyewa bisa
 * berfungsi ujung-ke-ujung: wishlist bertahan antar halaman, dan permintaan
 * sewa muncul di Buyer Dashboard.
 *
 * Bukan database — data lokal tiap perangkat, bisa hilang, dan tidak aman.
 * Saat backend tersedia, ganti fungsi di bawah dengan panggilan API:
 *
 *   getWishlist()  → GET  /api/wishlist
 *   toggleWishlist → POST /api/wishlist/{itemId}  atau  DELETE /api/wishlist/{itemId}
 *   getRentals()   → GET  /api/rentals  (pesanan milik user yang login)
 *   addRental(...) → POST /api/rentals  (kirim permintaan sewa)
 * ============================================================================
 */

const WISHLIST_KEY = 'jabsewa:wishlist:v1'
const RENTALS_KEY = 'jabsewa:rentals:v1'

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
    // storage penuh / tidak tersedia — abaikan
  }
}

export function getWishlist() {
  return read(WISHLIST_KEY, [])
}

export function toggleWishlist(itemId) {
  const list = getWishlist()
  const next = list.includes(itemId)
    ? list.filter((id) => id !== itemId)
    : [...list, itemId]
  write(WISHLIST_KEY, next)
  return next
}

export function getRentals() {
  return read(RENTALS_KEY, [])
}

export function addRental({ itemId, itemName, seller, pricePerDay, deposit, startDate, endDate, totalDays, total }) {
  const list = getRentals()
  const rental = {
    id: `R-${Date.now()}`,
    itemId,
    itemName,
    seller,
    
    pricePerDay,
    deposit,
    startDate,
    endDate,
    totalDays,
    total,
    status: 'Menunggu konfirmasi',
    createdAt: new Date().toISOString(),
  }
  write(RENTALS_KEY, [rental, ...list])
  return rental
}