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
          <button type="button" onClick={onGoToConsumer} className="nav-link">Explore</button>
          <a href="#kategori" className="nav-link">Categories</a>
          <a href="#cara-kerja" className="nav-link">How It Works</a>
          <button type="button" onClick={onGoToSeller} className="nav-link">Become a Seller</button>
        </div>

        <div className="nav-buttons">
          <button className="nav-login">Login / Masuk</button>
          <button className="primary-button" onClick={onGoToConsumer}>Explore Rentals</button>
        </div>
      </div>
    </nav>
  )
}

