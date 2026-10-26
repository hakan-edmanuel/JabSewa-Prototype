/*
 * ============================================================================
 * RENTAL MATH — JabSewa
 * ============================================================================
 * Perhitungan tanggal sewa yang dipakai UI. Fungsi murni (tanpa I/O) supaya
 * bisa diuji langsung dan tidak diduplikasi di beberapa komponen.
 *
 * Aturan kontrak server (lihat migration + docs kontrak RPC):
 *   total_days = (end_date - start_date) + 1   ← end_date INCLUSIVE
 * Nilai uang TIDAK dihitung di sini: harga, deposit, dan total selalu datang
 * dari RPC server (quote_rental / create_rental).
 * ============================================================================
 */

const MS_PER_DAY = 86400000

/**
 * Jumlah hari kalender sewa, end_date ikut dihitung.
 * @param {string} startDate `YYYY-MM-DD`
 * @param {string} endDate   `YYYY-MM-DD`
 * @returns {number} 0 bila tanggal tidak lengkap / rentang terbalik.
 */
export function countRentalDays(startDate, endDate) {
  if (!startDate || !endDate) return 0
  const start = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T00:00:00Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0
  const diff = Math.floor((end - start) / MS_PER_DAY)
  return diff >= 0 ? diff + 1 : 0
}
