/*
 * ============================================================================
 * FORMAT UTILS — JabSewa
 * ============================================================================
 * Util format tampilan yang dipakai lintas komponen (sebelumnya tiap
 * komponen mendefinisikan formatPrice sendiri — kini satu sumber).
 * Murni fungsi tampilan; tidak menyentuh data.
 * ============================================================================
 */

/** Format angka jadi Rupiah: 150000 → "Rp 150.000". */
export function formatPrice(value) {
  const n = Number(value ?? 0)
  return `Rp ${n.toLocaleString('id-ID')}`
}

/**
 * Tanggal valid? `new Date('bukan-tanggal')` TIDAK melempar error, melainkan
 * menghasilkan Invalid Date — jadi try/catch saja tidak cukup.
 */
function parseDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Format tanggal ISO → "28 Sep 2026" (locale Indonesia). */
export function formatDate(iso) {
  const date = parseDate(iso)
  if (!date) return '—'
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Format tanggal + jam ISO → "28 Sep 2026, 14.30" (locale Indonesia). */
export function formatDateTime(iso) {
  const date = parseDate(iso)
  if (!date) return '—'
  return date.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Inisial nama untuk avatar: "Budi Penyewa" → "B". */
export function initialOf(name) {
  return (name || '?').trim().charAt(0).toUpperCase()
}
