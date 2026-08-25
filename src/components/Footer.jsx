import logo from '../assets/logo-jabsewa.jpeg'

export default function Footer({ onNavigate }) {
  return (
    <footer className="footer" id="tentang">
      <div className="footer-inner">
        <div className="footer-top">
          <div className="footer-brand">
            <div className="logo">
              <img src={logo} alt="JabSewa logo" className="logo-image" />
              <span className="logo-text">JabSewa</span>
            </div>
            <p>
              Modern rental ecosystem built for everyday flexibility and smarter ownership.
            </p>
            {/* Social Media Links - Placeholder for user to fill */}
            <div className="socials">
              <a href="#" aria-label="Instagram">IG</a>
              <a href="#" aria-label="Facebook">FB</a>
              <a href="#" aria-label="X">X</a>
              <a href="#" aria-label="TikTok">TT</a>
            </div>
          </div>

          <div className="footer-column">
            <h4>About</h4>
            <ul>
              <li>
                <a 
                  href="/about" 
                  onClick={(e) => {
                    e.preventDefault();
                    if (onNavigate) onNavigate('about');
                  }}
                >
                  About Us
                </a>
              </li>
              <li><a href="#">Explore</a></li>
              <li><a href="#">Categories</a></li>
              <li><a href="#">How It Works</a></li>
            </ul>
          </div>

          <div className="footer-column">
            <h4>Company</h4>
            <ul>
              <li><a href="#">Become a Seller</a></li>
              <li><a href="#">Help</a></li>
              <li><a href="#">Support</a></li>
              <li><a href="#">Privacy</a></li>
            </ul>
          </div>

          <div className="footer-column footer-contact">
            <h4>Contact</h4>
            {/* Contact Info - Placeholder for user to fill */}
            <ul>
              <li><a href="mailto:hello@jabsewa.id">Email: [Isi Email Nanti]</a></li>
              <li><a href="tel:+622112345678">Telp: [Isi Nomor Nanti]</a></li>
              <li><a href="#">Alamat: [Isi Alamat Nanti]</a></li>
              <li><a href="#">Jam Operasional: [Isi Jam Nanti]</a></li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© 2026 JabSewa.id</span>
          <span>All rights reserved.</span>
        </div>
      </div>
    </footer>
  )
}