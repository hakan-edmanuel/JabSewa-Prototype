import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import UserMenu from '../UserMenu'
import logo from '../../assets/logo-jabsewa.jpeg'

/*
 * Navbar marketplace (mode penyewa), sadar status login:
 *   guest  → Cari Barang · Tentang · Masuk / Daftar
 *   buyer  → Cari Barang · Tentang · Dashboard · Mulai Jadi Seller · profil
 *   seller → Cari Barang · Tentang · Dashboard · Mode Penyewa / Mode Seller · profil
 */
export default function ConsumerNavbar({ onNavigate }) {
  const { user, hasSellerAccess, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  const close = () => setMobileOpen(false)
  const go = (page, opts) => { close(); onNavigate(page, opts) }

  return (
    <nav className="consumer-navbar">
      <div className="consumer-navbar-container">
        <button className="consumer-logo consumer-logo-button" onClick={() => go('home')} aria-label="Kembali ke halaman utama">
          <img src={logo} alt="JabSewa" className="consumer-logo-img" />
          <span className="consumer-brand">JabSewa</span>
        </button>

        <div className="consumer-nav-menu">
          <button type="button" className="nav-menu-item" onClick={() => go('consumer')}>
            Cari Barang
          </button>
          <button type="button" className="nav-menu-item" onClick={() => go('about')}>Tentang</button>
        </div>

        <div className="consumer-navbar-actions">
          {user && (
            <button type="button" className="consumer-nav-action" onClick={() => go('buyer')}>
              Dashboard
            </button>
          )}
          {user && !hasSellerAccess && (
            <button type="button" className="consumer-nav-action consumer-nav-accent" onClick={() => go('seller-onboarding')}>
              Mulai Jadi Seller
            </button>
          )}
          {hasSellerAccess && (
            <div className="nav-mode-switch" role="group" aria-label="Ganti mode">
              <button type="button" className="nav-mode-btn is-active" onClick={() => go('consumer')}>
                Mode Penyewa
              </button>
              <button type="button" className="nav-mode-btn" onClick={() => go('seller')}>
                Mode Seller
              </button>
            </div>
          )}
          {user ? (
            <UserMenu onLogout={() => go('home')} onNavigate={onNavigate} />
          ) : (
            <button className="nav-login" onClick={() => go('auth', { mode: 'login' })}>
              Masuk / Daftar
            </button>
          )}
        </div>

        <button
          type="button"
          className="nav-mobile-toggle"
          aria-label={mobileOpen ? 'Tutup menu' : 'Buka menu'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((o) => !o)}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>

      {mobileOpen && (
        <div className="nav-mobile-panel">
          <button type="button" className="nav-link" onClick={() => go('consumer')}>Cari Barang</button>
          <button type="button" className="nav-link" onClick={() => go('about')}>Tentang</button>
          {user && <button type="button" className="nav-link" onClick={() => go('buyer')}>Dashboard</button>}
          {user && !hasSellerAccess && (
            <button type="button" className="nav-link nav-link-accent" onClick={() => go('seller-onboarding')}>
              Mulai Jadi Seller
            </button>
          )}
          {hasSellerAccess && (
            <div className="nav-mode-switch nav-mode-switch-mobile">
              <button type="button" className="nav-mode-btn is-active" onClick={() => go('consumer')}>
                Mode Penyewa
              </button>
              <button type="button" className="nav-mode-btn" onClick={() => go('seller')}>
                Mode Seller
              </button>
            </div>
          )}
          {!user && (
            <button className="nav-login nav-mobile-login" onClick={() => go('auth', { mode: 'login' })}>
              Masuk / Daftar
            </button>
          )}
          {user && (
            <button
              type="button"
              className="nav-link nav-link-danger"
              onClick={async () => { close(); await logout(); onNavigate('home'); }}
            >
              Keluar
            </button>
          )}
        </div>
      )}
    </nav>
  )
}
