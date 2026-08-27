export default function ConsumerFooter() {
  return (
    <footer className="consumer-footer">
      <div className="consumer-footer-container">
        <div className="footer-columns">
          <div className="footer-col">
            <h4>Tentang JabSewa</h4>
            <ul>
              <li><a href="#tentang">Tentang Kami</a></li>
              <li><a href="#blog">Blog</a></li>
              <li><a href="#karir">Karir</a></li>
              <li><a href="#press">Press</a></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Untuk Konsumen</h4>
            <ul>
              <li><a href="#cara-kerja">Cara Kerja</a></li>
              <li><a href="#kategori">Kategori Barang</a></li>
              <li><a href="#faq">FAQ</a></li>
              <li><a href="#contact">Hubungi Kami</a></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Kebijakan</h4>
            <ul>
              <li><a href="#terms">Syarat & Ketentuan</a></li>
              <li><a href="#privacy">Kebijakan Privasi</a></li>
              <li><a href="#security">Keamanan</a></li>
              <li><a href="#cookies">Pengaturan Cookie</a></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Ikuti Kami</h4>
            <div className="social-links-footer">
              <a href="#facebook" className="social-link">📘 Facebook</a>
              <a href="#twitter" className="social-link">🐦 Twitter</a>
              <a href="#instagram" className="social-link">📷 Instagram</a>
              <a href="#tiktok" className="social-link">🎵 TikTok</a>
            </div>
          </div>
        </div>

        <div className="footer-bottom-consumer">
          <div className="footer-payment">
            <p className="payment-label">Metode Pembayaran:</p>
            <div className="payment-methods-footer">
              <span>💳 Kartu Kredit</span>
              <span>🏦 Transfer Bank</span>
              <span>📱 E-Wallet</span>
              <span>💰 Cash on Delivery</span>
            </div>
          </div>

          <div className="footer-copyright-consumer">
            <p>&copy; 2026 JabSewa. Semua hak dilindungi.</p>
          </div>

          <div className="footer-contact-consumer">
            <p>📞 +62 (021) 1234-5678</p>
            <p>✉️ support@jabsewa.com</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
