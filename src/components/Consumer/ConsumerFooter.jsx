import logo from '../../assets/logo-jabsewa.jpeg';

export default function ConsumerFooter({ onNavigate }) {
  const go = (page) => (e) => {
    e.preventDefault();
    if (onNavigate) onNavigate(page);
  };

  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-top">
          <div className="footer-brand">
            <div className="logo footer-logo">
              <img src={logo} alt="JabSewa logo" className="logo-image" />
              <span className="logo-text">JabSewa</span>
            </div>
            <p>Barang untuk nyoba atau event. Sewa aja.</p>
            <div className="socials">
              <a href="#" aria-label="Instagram">IG</a>
              <a href="#" aria-label="Facebook">FB</a>
              <a href="#" aria-label="X">X</a>
              <a href="#" aria-label="TikTok">TT</a>
            </div>
          </div>

          <div className="footer-column">
            <h4>Jelajahi</h4>
            <ul>
              <li><a href="#explore">Semua Barang</a></li>
              <li><a href="#kategori">Kategori</a></li>
              <li><a href="#" onClick={go('about')}>Tentang Kami</a></li>
            </ul>
          </div>

          <div className="footer-column">
            <h4>Seller</h4>
            <ul>
              <li><a href="#" onClick={go('seller')}>Buka Rental</a></li>
              <li><a href="#">Panduan Deposit</a></li>
            </ul>
          </div>

          <div className="footer-column footer-contact">
            <h4>Bantuan</h4>
            <ul>
              <li><span>support@jabsewa.id</span></li>
              <li><span>WA: +62 812-3456-7890</span></li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© 2026 JabSewa Indonesia</span>
          <div className="footer-bottom-links">
            <a href="#terms">Syarat & Ketentuan</a>
            <span>·</span>
            <a href="#privacy">Kebijakan Privasi</a>
          </div>
        </div>
      </div>
    </footer>
  );
}