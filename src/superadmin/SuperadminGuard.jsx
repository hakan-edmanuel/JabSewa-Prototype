/*
 * ============================================================================
 * SUPERADMIN GUARD — JabSewa (FITUR 2)
 * ============================================================================
 * Komponen pintu area /sys-control-jab. Menerjemahkan hasil guard menjadi
 * render:
 *   - 'pending'  → layar netral "Memuat…"
 *   - 'allowed'  → subtree superadmin (layout + halaman)
 *   - selain itu → 404 NOT FOUND palsu.
 *
 * Mengapa 404, bukan 403? Sesuai spesifikasi keamanan: user biasa yang
 * membuka /sys-control-jab tidak boleh bisa membedakan "halaman tidak ada"
 * dari "halaman ada tapi kamu tidak boleh masuk" — keberadaan route
 * tidak terdeteksi (anti-enumeration).
 * ============================================================================
 */

import { useSuperadmin } from './SuperadminContext'

/** Layar netral saat guard memverifikasi — tidak membocorkan apa pun. */
function NeutralLoading() {
  return (
    <div className="page-shell" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <p>Memuat…</p>
    </div>
  )
}

/**
 * Halaman 404 generik — IDENTIK dengan NotFoundPage publik (App.jsx).
 * Bukan 403: keberadaan route superadmin tidak boleh terdeteksi.
 */
function DisguisedNotFound() {
  return (
    <div className="page-shell" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '4rem', margin: 0, fontWeight: 700 }}>404</p>
        <p>Halaman tidak ditemukan.</p>
      </div>
    </div>
  )
}

/**
 * @param {{ children: import('react').ReactNode }} props
 */
export default function SuperadminGuard({ children }) {
  const { status } = useSuperadmin()

  if (status === 'pending') return <NeutralLoading />
  if (status !== 'allowed') return <DisguisedNotFound />
  return children
}
