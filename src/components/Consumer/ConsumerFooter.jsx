export default function ConsumerFooter() {
  return (
    <footer className="consumer-footer-structured">
      <div className="footer-structured-container">
        <div className="footer-structured-main">
          <div className="footer-structured-brand">
            <h3 className="footer-brand-name">JabSewa</h3>
            <p className="footer-brand-desc">Platform sewa barang terpercaya. Temukan kebutuhan Anda atau mulai sewakan barang Anda hari ini.</p>
          </div>

          <div className="footer-structured-links">
            <div className="footer-structured-col">
              <h4>Explore</h4>
              <ul>
                <li><a href="#kategori">Kategori</a></li>
                <li><a href="#cara-kerja">Cara Kerja</a></li>
              </ul>
            </div>

            <div className="footer-structured-col">
              <h4>Account</h4>
              <ul>
                <li><a href="#login">Login</a></li>
                <li><a href="#daftar-seller">Daftarkan Barang</a></li>
              </ul>
            </div>

            <div className="footer-structured-col">
              <h4>Support</h4>
              <ul>
                <li><a href="#bantuan">Bantuan</a></li>
                <li><a href="#contact">Contact</a></li>
                <li><a href="#faq">FAQ</a></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="footer-structured-bottom">
          <p className="footer-copyright">&copy; 2026 JabSewa. Hak Cipta Dilindungi.</p>
          <div className="footer-legal">
            <a href="#terms">Syarat & Ketentuan</a>
            <a href="#privacy">Privasi</a>
          </div>
        </div>
      </div>
    </footer>
  );
}