/*
 * ============================================================================
 * ADMIN LAYOUT — JabSewa
 * ============================================================================
 * Layout engine TERPISAH untuk area admin. Tidak berbagi satu kelas CSS,
 * satu komponen, atau satu state pun dengan layout user (Navbar, SellerSidebar,
 * Footer, dll.).
 *
 * Struktur visual: sidebar kiri + header atas + konten. Identitas visual
 * dibedakan (aksen gelap) supaya operator selalu sadar sedang berada di area
 * kontrol platform.
 * ============================================================================
 */

import { useState } from 'react'
import '../../styles/admin.css'
import { useAdmin } from './AdminContext'
import logo from '../../assets/logo-jabsewa.jpeg'

/**
 * Menu sidebar admin — statik, tidak membaca role user biasa.
 * Scope Admin MVP 1.0: review ajuan seller, laporan & sengketa, audit trail.
 * Moderasi users/stores/listings tidak ditampilkan di menu (halaman tetap
 * dapat diakses lewat URL; RPC backend tidak berubah).
 */
const SYS_MENU = [
  { id: 'dashboard', label: 'Dashboard', hint: 'Antrian kerja' },
  { id: 'applications', label: 'Ajuan Seller', hint: 'Review & keputusan' },
  { id: 'orders', label: 'Laporan & Sengketa', hint: 'Dispute rental' },
  { id: 'audit', label: 'Audit Log', hint: 'Jejak aksi admin' },
]

export default function AdminLayout({ currentPage, onNavigate, children }) {
  const { admin } = useAdmin()
  const [navOpen, setNavOpen] = useState(false)

  const go = (page) => {
    setNavOpen(false)
    if (page !== currentPage) onNavigate(page)
  }

  return (
    <div className="sys-shell">
      {/* --- Sidebar terisolasi — tidak ada impor dari fitur user --- */}
      <aside className={`sys-sidebar ${navOpen ? 'is-open' : ''}`}>
        <div className="sys-brand">
          <img src={logo} alt="JabSewa SysControl" className="sys-brand-logo" />
          <div>
            <p className="sys-brand-name">JabSewa</p>
            <p className="sys-brand-sub">SysControl</p>
          </div>
        </div>

        <nav className="sys-nav" aria-label="Menu admin">
          {SYS_MENU.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`sys-nav-item ${currentPage === item.id ? 'is-active' : ''}`}
              onClick={() => go(item.id)}
            >
              <span className="sys-nav-label">{item.label}</span>
              <span className="sys-nav-hint">{item.hint}</span>
            </button>
          ))}
        </nav>

        <div className="sys-sidebar-foot">
          <p className="sys-user-email">{admin?.email || '—'}</p>
          <p className="sys-user-role">{admin?.role || 'ADMIN'}</p>
          <button type="button" className="sys-logout" onClick={() => onNavigate('logout')}>
            Keluar
          </button>
        </div>
      </aside>

      {/* --- Konten --- */}
      <div className="sys-main">
        <header className="sys-topbar">
          <button
            type="button"
            className="sys-burger"
            aria-label={navOpen ? 'Tutup menu' : 'Buka menu'}
            onClick={() => setNavOpen((o) => !o)}
          >
            <span />
            <span />
            <span />
          </button>
          <p className="sys-topbar-title">
            {SYS_MENU.find((m) => m.id === currentPage)?.label || 'Dashboard'}
          </p>
          <span className="sys-topbar-badge">SYS</span>
        </header>
        <main className="sys-content">{children}</main>
      </div>
    </div>
  )
}
