/*
 * ============================================================================
 * ADMIN APP — root area /sys-control-jab
 * ============================================================================
 * Router internal area admin. Daftar subpath diambil dari SATU sumber
 * (domain/postLoginRouting → SYS_CONTROL_SUBPATHS) supaya penambahan halaman
 * tidak perlu mengubah regex return-to, router, dan test secara terpisah.
 *
 * Seluruh subtree dirender DI DALAM AdminGuard — non-admin melihat 404 palsu.
 * ============================================================================
 */

import { useEffect, useState } from 'react'
import { AdminProvider } from './AdminContext'
import AdminGuard from './AdminGuard'
import AdminLayout from './AdminLayout'
import AdminDashboard from './pages/AdminDashboard'
import AdminApplications from './pages/AdminApplications'
import AdminAudit from './pages/AdminAudit'
import AdminOrders from './pages/AdminOrders'
import AdminStores from './pages/AdminStores'
import AdminListings from './pages/AdminListings'
import AdminUsers from './pages/AdminUsers'
import { adminLogout } from '../../data/admin'
import { SYS_CONTROL_ROOT, SYS_CONTROL_SUBPATHS } from '../../domain/postLoginRouting'

/** Satu-satunya pemetaan halaman → komponen. */
const PAGE_COMPONENTS = {
  dashboard: AdminDashboard,
  applications: AdminApplications,
  orders: AdminOrders,
  stores: AdminStores,
  listings: AdminListings,
  users: AdminUsers,
  audit: AdminAudit,
}

const PAGE_IDS = ['dashboard', ...SYS_CONTROL_SUBPATHS]

/** Path publik halaman admin (dashboard = root). */
function adminPath(pageId) {
  return pageId === 'dashboard' ? SYS_CONTROL_ROOT : `${SYS_CONTROL_ROOT}/${pageId}`
}

/** Path → id halaman. Path asing di area admin jatuh ke dashboard. */
function getAdminPageFromPath(pathname) {
  return PAGE_IDS.find((id) => adminPath(id) === pathname) || 'dashboard'
}

function AdminRouter({ onExit }) {
  const [page, setPage] = useState(() => getAdminPageFromPath(window.location.pathname))

  // Sinkron tombol back/forward browser.
  useEffect(() => {
    const onPop = () => setPage(getAdminPageFromPath(window.location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Navigasi internal + pintu keluar: 'logout' mengakhiri sesi, lalu keluar
  // dari area (tanpa pushState).
  const navigate = (nextPage) => {
    if (nextPage === 'logout') {
      Promise.resolve(adminLogout()).then(onExit)
      return
    }
    window.history.pushState({}, '', adminPath(nextPage))
    setPage(nextPage)
    window.scrollTo({ top: 0 })
  }

  const Page = PAGE_COMPONENTS[page] || AdminDashboard

  return (
    <AdminLayout currentPage={page} onNavigate={navigate}>
      <Page onNavigate={navigate} />
    </AdminLayout>
  )
}

/**
 * Dipasang oleh App.jsx saat path diawali /sys-control-jab.
 * Seluruh subtree berada di bawah guard — non-admin melihat 404.
 * @param {{ onExit: () => void }} props — onExit dipanggil saat logout.
 */
export default function AdminApp({ onExit }) {
  return (
    <AdminProvider>
      <AdminGuard>
        <AdminRouter onExit={onExit} />
      </AdminGuard>
    </AdminProvider>
  )
}
