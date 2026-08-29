import logo from '../../assets/logo-jabsewa.jpeg';

export default function SellerNavbar({ onNavigate }) {
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
          <button className="seller-marketplace-link" onClick={() => onNavigate('consumer')}>
            Lihat marketplace
          </button>
          <div className="seller-notifications">
            <button className="notification-btn" title="Notifikasi">
              🔔
              <span className="notification-badge">3</span>
            </button>
          </div>

          <div className="seller-profile">
            <button className="profile-btn" title="Profile">👤</button>
            <div className="profile-dropdown-menu">
              <div className="dropdown-header">
                <span className="dropdown-name">Toko Adit</span>
                <span className="dropdown-email">adit@example.com</span>
              </div>
              <div className="dropdown-divider"></div>
              <a href="#profile" className="dropdown-item">Profil Toko</a>
              <a href="#settings" className="dropdown-item">Pengaturan</a>
              <div className="dropdown-divider"></div>
              <a href="#logout" className="dropdown-item text-danger">Log Out</a>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}