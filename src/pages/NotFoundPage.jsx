/*
 * ============================================================================
 * NOT FOUND — JabSewa
 * ============================================================================
 * Halaman 404 publik. Dipakai untuk path yang tidak dikenal DAN sebagai
 * samaran untuk area /sys-control-jab (SuperadminGuard) — markup harus
 * tetap identik agar keberadaan route superadmin tidak terdeteksi.
 * ============================================================================
 */

export default function NotFoundPage() {
  return (
    <div className="page-shell" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '4rem', margin: 0, fontWeight: 700 }}>404</p>
        <p>Halaman tidak ditemukan.</p>
      </div>
    </div>
  )
}
