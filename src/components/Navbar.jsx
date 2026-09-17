import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import UserMenu from './UserMenu'
import logo from '../assets/logo-jabsewa.jpeg'

/*
 * Navbar utama, sadar status login dan role:
 *   guest      → Beranda · Cari Barang · Sewakan Barang · Masuk · Daftar
 *   penyewa    → Beranda · Cari Barang · Dashboard · Mulai Jadi Seller · profil
 *   seller     → Beranda · Cari Barang · Dashboard · Mode Penyewa/Seller · profil
 * `simple` dipakai halaman non-landing (about, cart, buyer) — tanpa link Beranda.
 */
export default function Navbar({ onNavigate, onSellerIntent, currentPage = 'home', simple = false }) {
  const { user, hasSellerAccess, sellerApplication, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Lifecycle: belum ada ajuan → "Mulai Jadi Seller"; ajuan berjalan → status.
  const hasPendingApplication =
    Boolean(sellerApplication) && !hasSellerAccess

  const close = () => setMobileOpen(false)
  const go = (page, opts) => { close(); onNavigate(page, opts) }

  // Jika onSellerIntent tidak diberikan (navbar simple di About/Cart),
  // fallback ke route /seller — route guard di App tetap mengarahkan
  // guest ke login dan non-seller ke onboarding.
  const handleSellerIntent = () => {
    close()
    if (onSellerIntent) onSellerIntent()
    else onNavigate('seller')
  }

  const homeLink = simple ? null : (
    <button
      type="button"
      className={`nav-link ${currentPage === 'home' ? 'is-active' : ''}`}
      onClick={() => go('home')}
    >
      Beranda
    </button>
  )

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <button className="logo-button" onClick={() => go('home')} aria-label="JabSewa home">
          <img src={logo} alt="JabSewa logo" className="logo-image" />
          <span className="logo-text">JabSewa</span>
        </button>

        <div className="nav-links">
          {homeLink}
          <button
            type="button"
            className={`nav-link ${currentPage === 'consumer' ? 'is-active' : ''}`}
            onClick={() => go('consumer')}
          >
            Cari Barang
          </button>
          {user && (
            <button
              type="button"
              className={`nav-link ${currentPage === 'buyer' ? 'is-active' : ''}`}
              onClick={() => go('buyer')}
            >
              Dashboard
            </button>
          )}
          {user && (
            <button
              type="button"
              className={`nav-link ${currentPage === 'admin' ? 'is-active' : ''}`}
              onClick={() => go('admin')}
            >
              Admin
            </button>
          )}
          {!user && (
            <button type="button" className="nav-link" onClick={handleSellerIntent}>
              Sewakan Barang
            </button>
          )}
        </div>

        <div className="nav-buttons">
          {!user && (
            <>
              <button className="nav-login" onClick={() => go('auth', { mode: 'login' })}>
                Masuk
              </button>
              <button className="nav-register" onClick={() => go('auth', { mode: 'register' })}>
                Daftar
              </button>
            </>
          )}
          {user && !hasSellerAccess && (
            <button type="button" className="nav-seller-cta" onClick={handleSellerIntent}>
              {hasPendingApplication ? 'Status Ajuan Seller' : 'Mulai Jadi Seller'}
            </button>
          )}
          {hasSellerAccess && (
            <div className="nav-mode-switch" role="group" aria-label="Ganti mode">
              <button
                type="button"
                className={`nav-mode-btn ${currentPage === 'consumer' ? 'is-active' : ''}`}
                onClick={() => go('consumer')}
              >
                Mode Penyewa
              </button>
              <button
                type="button"
                className={`nav-mode-btn ${currentPage === 'seller' ? 'is-active' : ''}`}
                onClick={() => go('seller')}
              >
                Mode Seller
              </button>
            </div>
          )}
          {user && <UserMenu onLogout={() => go('home')} onNavigate={onNavigate} />}
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
          {homeLink}
          <button
            type="button"
            className={`nav-link ${currentPage === 'consumer' ? 'is-active' : ''}`}
            onClick={() => go('consumer')}
          >
            Cari Barang
          </button>
          {user && (
            <button
              type="button"
              className={`nav-link ${currentPage === 'buyer' ? 'is-active' : ''}`}
              onClick={() => go('buyer')}
            >
              Dashboard
            </button>
          )}
          {user && (
            <button
              type="button"
              className={`nav-link ${currentPage === 'admin' ? 'is-active' : ''}`}
              onClick={() => go('admin')}
            >
              Admin
            </button>
          )}
          {!user && (
            <button type="button" className="nav-link" onClick={handleSellerIntent}>
              Sewakan Barang
            </button>
          )}
          {user && !hasSellerAccess && (
            <button type="button" className="nav-link nav-link-accent" onClick={handleSellerIntent}>
              {hasPendingApplication ? 'Status Ajuan Seller' : 'Mulai Jadi Seller'}
            </button>
          )}
          {hasSellerAccess && (
            <div className="nav-mode-switch nav-mode-switch-mobile">
              <button
                type="button"
                className={`nav-mode-btn ${currentPage === 'consumer' ? 'is-active' : ''}`}
                onClick={() => go('consumer')}
              >
                Mode Penyewa
              </button>
              <button
                type="button"
                className={`nav-mode-btn ${currentPage === 'seller' ? 'is-active' : ''}`}
                onClick={() => go('seller')}
              >
                Mode Seller
              </button>
            </div>
          )}
          {!user && (
            <div className="nav-mobile-auth">
              <button className="nav-login nav-mobile-login" onClick={() => go('auth', { mode: 'login' })}>
                Masuk
              </button>
              <button className="nav-register nav-mobile-register" onClick={() => go('auth', { mode: 'register' })}>
                Daftar
              </button>
            </div>
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
