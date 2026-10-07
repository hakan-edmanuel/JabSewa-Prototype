import logo from "../assets/logo-jabsewa.jpeg";

export default function Footer({ onNavigate }) {
  const go = (page) => (e) => {
    e.preventDefault();
    if (onNavigate) onNavigate(page);
  };

  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-top">
          <div className="footer-brand">
            <div className="footer-logo">
              <img src={logo} alt="JabSewa logo" className="footer-logo-img" />
              <span className="logo-text">JabSewa</span>
            </div>
            <p>Temukan barang dari pemilik dan penyedia lokal di Jabodetabek. </p>
          </div>

          <div className="footer-column">
            <h4>Navigasi</h4>
            <ul>
              <li>
                <a href="/about" onClick={go("about")}>
                  Tentang Kami
                </a>
              </li>
              <li>
                <a href="/consumer" onClick={go("consumer")}>
                  Jelajahi Barang
                </a>
              </li>
              <li>
                <a href="/seller" onClick={go("seller")}>
                  Sewakan Barang
                </a>
              </li>
            </ul>
          </div>

          <div className="footer-column">
            <h4>Bantuan</h4>
            <ul>
              <li>
                <span>Support: JabsewaOfficial@gmail.com</span>
              </li>
              <li>
                <span>Consumer Help: Jabsewa_com</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© 2026 JabSewa Indonesia</span>
          <div className="footer-bottom-links">
            <a href="/terms" onClick={go("terms")}>
              Syarat & Ketentuan
            </a>
            <span>·</span>
            <a href="/privacy" onClick={go("privacy")}>
              Kebijakan Privasi
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
