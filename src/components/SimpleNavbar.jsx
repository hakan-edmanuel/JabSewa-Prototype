import logo from '../assets/logo-jabsewa.jpeg';

export default function SimpleNavbar({ onNavigate }) {
  return (
    <nav className="navbar">
      <div className="navbar-container">
        <button className="logo logo-button" onClick={() => onNavigate('home')} aria-label="JabSewa home">
          <img src={logo} alt="JabSewa logo" className="logo-image" />
          <span className="logo-text">JabSewa</span>
        </button>

        <div className="nav-links" aria-label="Navigation">
          <button type="button" onClick={() => onNavigate('consumer')} className="nav-link">Jelajahi Rental</button>
          <button type="button" onClick={() => onNavigate('seller')} className="nav-link">Buka Rental</button>
        </div>

        <div className="nav-buttons">
          <button className="nav-login" onClick={() => onNavigate('register')}>Masuk / Daftar</button>
        </div>
      </div>
    </nav>
  );
}