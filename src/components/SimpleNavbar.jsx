import logo from '../assets/logo-jabsewa.jpeg';

export default function SimpleNavbar({ onNavigate }) {
  return (
    <nav className="navbar" style={{ background: 'rgba(255, 255, 255, 0.95)' }}>
      <div className="navbar-container" style={{ justifyContent: 'center' }}>
        <button className="logo logo-button" onClick={() => onNavigate('home')} aria-label="JabSewa home" style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
          <img src={logo} alt="JabSewa logo" className="logo-image" />
          <span className="logo-text">JabSewa</span>
        </button>
      </div>
    </nav>
  );
}