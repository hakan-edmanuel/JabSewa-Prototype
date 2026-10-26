/*
 * ============================================================================
 * ADMIN GUARD — JabSewa
 * ============================================================================
 * Pintu area /sys-control-jab. Menerjemahkan status guard menjadi render:
 *   - 'pending'  → layar netral "Memuat…"
 *   - 'allowed'  → subtree admin (layout + halaman)
 *   - selain itu → halaman 404 yang IDENTIK dengan NotFoundPage publik.
 *
 * Mengapa 404, bukan 403? User biasa yang membuka /sys-control-jab tidak
 * boleh bisa membedakan "halaman tidak ada" dari "halaman ada tapi kamu tidak
 * boleh masuk" — keberadaan route tidak terdeteksi (anti-enumeration).
 * ============================================================================
 */

import { useAdmin } from './AdminContext'
import NotFoundPage from '../../ui/NotFoundPage'

/** Layar netral saat guard memverifikasi — tidak membocorkan apa pun. */
function NeutralLoading() {
  return (
    <div className="page-shell centered-screen">
      <p>Memuat…</p>
    </div>
  )
}

export default function AdminGuard({ children }) {
  const { status } = useAdmin()

  if (status === 'pending') return <NeutralLoading />
  if (status !== 'allowed') return <NotFoundPage />
  return children
}
