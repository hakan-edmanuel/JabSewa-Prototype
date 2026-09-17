import { useAuth } from '../../auth/AuthContext'
import UserMenu from '../UserMenu'
import logo from '../../assets/logo-jabsewa.jpeg'

/*
 * Navbar seller center. Menampilkan mode aktif (Seller), tombol pindah
 * ke mode Penyewa, nama toko, dan menu profil (keluar).
 */
export default function SellerNavbar({ onNavigate, currentPage = 'seller' }) {
  const { user } = useAuth()

  return (
    <nav className="seller-navbar">
      <div className="seller-navbar-container">
        <button className="seller-logo seller-logo-button" onClick={() => onNavigate('home')} aria-label="Kembali ke halaman utama">
          <img src={logo} alt="JabSewa Seller" className="seller-logo-img" />
          <div className="seller-logo-text">
            <span className="seller-brand">JabSewa</span>
            <span className="seller-badge">Seller</span>
          </div>
        </button>

        <div className="seller-navbar-actions">
          <div className="nav-mode-switch" role="group" aria-label="Ganti mode">
            <button
              type="button"
              className={`nav-mode-btn ${currentPage === 'consumer' ? 'is-active' : ''}`}
              onClick={() => onNavigate('consumer')}
            >
              Mode Penyewa
            </button>
            <button
              type="button"
              className={`nav-mode-btn ${currentPage === 'seller' ? 'is-active' : ''}`}
              onClick={() => onNavigate('seller')}
            >
              Mode Seller
            </button>
          </div>
          <span className="seller-store-name">{user?.sellerProfile?.storeName || user?.name}</span>
          <UserMenu onLogout={() => onNavigate('home')} onNavigate={onNavigate} />
        </div>
      </div>
    </nav>
  )
}