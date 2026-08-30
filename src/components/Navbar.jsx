import logo from '../assets/logo-jabsewa.jpeg'

export default function Navbar({ onNavigate, onGoToConsumer, onGoToSeller }) {
  return (
    <nav className="navbar">
      <div className="navbar-container">
        <button className="logo logo-button" onClick={() => onNavigate('home')} aria-label="JabSewa home">
          <img src={logo} alt="JabSewa logo" className="logo-image" />
          <span className="logo-text">JabSewa</span>
        </button>

        <div className="nav-links" aria-label="Main navigation">
          <button type="button" onClick={onGoToConsumer} className="nav-link">Jelajahi Rental</button>
          <a href="#kategori" className="nav-link">Kategori</a>
          <a href="#cara-kerja" className="nav-link">Cara Kerja</a>
          <a href="#about" className="nav-link">Tentang</a>
          <button type="button" onClick={onGoToSeller} className="nav-link">Buka Rental</button>
        </div>

        <div className="nav-buttons">
          <button className="nav-login" onClick={() => onNavigate('register')}>Masuk / Daftar</button>
        </div>
      </div>
    </nav>
  )
}