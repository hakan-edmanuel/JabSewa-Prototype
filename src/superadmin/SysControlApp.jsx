/*
 * ============================================================================
 * SYS-CONTROL APP (root) — JabSewa (FITUR 2, MODE MOCK / OFFLINE)
 * ============================================================================
 * Root area superadmin: router internal berbasis path (konsisten dengan
 * pola router App.jsx) + handler logout.
 *
 * Semua halaman di sini dirender DI DALAM SuperadminGuard — subtree ini
 * tidak pernah tampil untuk non-superadmin (ditukar 404 palsu).
 * ============================================================================
 */

import { useEffect, useState } from 'react'
import { SuperadminProvider } from './SuperadminContext'
import SuperadminGuard from './SuperadminGuard'
import SuperadminLayout from './SuperadminLayout'
import SysDashboard from './pages/SysDashboard'
import SysApplications from './pages/SysApplications'
import SysAudit from './pages/SysAudit'
import { superadminLogout } from '../lib/superadmin'

/** Petakan path /sys-control-jab/* → key halaman internal (lokal file ini). */
function getSysPageFromPath(pathname) {
  if (pathname === '/sys-control-jab/applications') return 'applications'
  if (pathname === '/sys-control-jab/audit') return 'audit'
  return 'dashboard' // /sys-control-jab dan /sys-control-jab/ lainnya
}

function SysControlRouter({ onExit }) {
  const [page, setPage] = useState(() => getSysPageFromPath(window.location.pathname))

  // Sinkron tombol back/forward browser.
  useEffect(() => {
    const onPop = () => setPage(getSysPageFromPath(window.location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Navigasi internal + pintu keluar: 'logout' mengakhiri sesi lokal,
  // lalu keluar dari area (tanpa pushState).
  const navigate = (nextPage) => {
    if (nextPage === 'logout') {
      superadminLogout()
      onExit()
      return
    }
    const path = nextPage === 'dashboard' ? '/sys-control-jab' : `/sys-control-jab/${nextPage}`
    window.history.pushState({}, '', path)
    setPage(nextPage)
    window.scrollTo({ top: 0 })
  }

  let content = <SysDashboard onNavigate={navigate} />
  if (page === 'applications') content = <SysApplications />
  if (page === 'audit') content = <SysAudit />

  return (
    <SuperadminLayout currentPage={page} onNavigate={navigate}>
      {content}
    </SuperadminLayout>
  )
}

/**
 * Dipasang oleh App.jsx saat path diawali /sys-control-jab.
 * Seluruh subtree berada di bawah guard — non-superadmin melihat 404.
 * @param {{ onExit: () => void }} props — onExit dipanggil saat logout.
 */
export default function SysControlApp({ onExit }) {
  return (
    <SuperadminProvider>
      <SuperadminGuard>
        <SysControlRouter onExit={onExit} />
      </SuperadminGuard>
    </SuperadminProvider>
  )
}
