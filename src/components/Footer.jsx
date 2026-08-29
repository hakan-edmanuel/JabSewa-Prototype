import logo from '../assets/logo-jabsewa.jpeg'

export default function Footer({ onNavigate }) {
  return (
    <footer className="footer" id="tentang">
      <div className="footer-inner">
        <div className="footer-top">
          <div className="footer-brand">
            <div className="logo footer-logo">
              <img src={logo} alt="JabSewa logo" className="logo-image" />
              <span className="logo-text">JabSewa</span>
            </div>
            <p>
              Platform marketplace rental barang harian dan mingguan terpercaya. Membantu masyarakat berhemat dan menghasilkan pendapatan tambahan.
            </p>
            <div className="socials">
              <a href="#" aria-label="Instagram">IG</a>
              <a href="#" aria-label="Facebook">FB</a>
              <a href="#" aria-label="X">X</a>
              <a href="#" aria-label="TikTok">TT</a>
            </div>
          </div>

          <div className="footer-column">
            <h4>Navigasi</h4>
            <ul>
              <li>
                <a
                  href="/about"
                  onClick={(e) => {
                    e.preventDefault();
                    if (onNavigate) onNavigate('about');
                  }}
                >
                  Tentang Kami
                </a>
              </li>
              <li>
                <a
                  href="/consumer"
                  onClick={(e) => {
                    e.preventDefault();
                    if (onNavigate) onNavigate('consumer');
                  }}
                >
                  Jelajahi Semua Barang
                </a>
              </li>
              <li><a href="#kategori">Kategori Rental</a></li>
              <li><a href="#cara-kerja">Cara Kerja</a></li>
            </ul>
          </div>

          <div className="footer-column">
            <h4>Untuk Pemilik (Seller)</h4>
            <ul>
              <li>
                <a
                  href="/seller"
                  onClick={(e) => {
                    e.preventDefault();
                    if (onNavigate) onNavigate('seller');
                  }}
                >
                  Daftar Jadi Seller
                </a>
              </li>
              <li><a href="#cara-kerja">Panduan Deposit Aman</a></li>
              <li><a href="#faq">Aturan & Kebijakan Sewa</a></li>
              <li><a href="#support">Pusat Bantuan</a></li>
            </ul>
          </div>

          <div className="footer-column footer-contact">
            <h4>Hubungi Kami</h4>
            <ul>
              <li><span>Email: support@jabsewa.id</span></li>
              <li><span>WhatsApp: +62 812-3456-7890</span></li>
              <li><span>Lokasi: Jakarta Selatan, DKI Jakarta</span></li>
              <li><span>Senin – Minggu (08.00 – 21.00 WIB)</span></li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© 2026 JabSewa Indonesia · Seluruh hak cipta dilindungi.</span>
          <div className="footer-bottom-links">
            <a href="#terms">Syarat & Ketentuan</a>
            <span>•</span>
            <a href="#privacy">Kebijakan Privasi</a>
          </div>
        </div>
      </div>
    </footer>
  )
}