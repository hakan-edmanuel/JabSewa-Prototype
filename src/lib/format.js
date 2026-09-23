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

/** Format tanggal ISO → "28 Sep 2026" (locale Indonesia). */
export function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

/** Format tanggal + jam ISO → "28 Sep 2026, 14.30" (locale Indonesia). */
export function formatDateTime(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

/** Inisial nama untuk avatar: "Budi Penyewa" → "B". */
export function initialOf(name) {
  return (name || '?').trim().charAt(0).toUpperCase()
}
