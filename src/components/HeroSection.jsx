import { useState } from 'react'

export default function HeroSection({ onNavigate }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCity, setSelectedCity] = useState('Semua Lokasi')

  const handleSearch = (e) => {
    e.preventDefault()
    onNavigate('consumer')
  }

  const popularTags = ['Sony A7 III', 'PlayStation 5', 'Tenda Camping', 'DJI Drone', 'Projector']

  return (
    <section className="hero-section">
      <div className="hero-inner">
        <div className="hero-copy">
<<<<<<< HEAD
          <div className="hero-badge">
            <span className="hero-badge-dot"></span>
            JabSewa · Sewa & Rental
=======
          <div className="hero-kicker">
            Platform rental barang Jabodetabek
>>>>>>> 040c3d1ad3f390882feab2bf6f02ecc084aa43e8
          </div>

          <h1>
            Barang untuk nyoba atau event.
            <span className="hero-title-accent">Sewa aja.</span>
          </h1>

          <form className="hero-search-container" onSubmit={handleSearch}>
            <div className="hero-search-field hero-search-main">
              <span className="hero-search-icon">🔍</span>
              <input
                type="text"
                placeholder="Cari kamera, tenda, PS5..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="hero-search-input"
              />
            </div>

            <div className="hero-search-field hero-search-city">
              <span className="hero-search-icon">📍</span>
              <select
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                className="hero-search-select"
              >
                <option>Semua Lokasi</option>
                <option>Jakarta Selatan</option>
                <option>Jakarta Pusat</option>
                <option>Jakarta Utara</option>
                <option>Bandung</option>
                <option>Bogor</option>
                <option>Depok</option>
                <option>Tangerang</option>
              </select>
            </div>

            <button type="submit" className="primary-button hero-search-submit">
              Cari
            </button>
          </form>

          <div className="hero-quick-tags">
            <span className="quick-tag-label">Populer:</span>
            {popularTags.map((tag) => (
              <button
                key={tag}
                type="button"
                className="quick-tag-pill"
                onClick={() => onNavigate('consumer')}
              >
                {tag}
              </button>
            ))}
          </div>

          <div className="hero-trust-bar">
            <div className="trust-stat">
              <strong>1.200+</strong>
              <span>barang terdaftar</span>
            </div>
            <div className="trust-divider"></div>
            <div className="trust-stat">
              <strong>Rp25rb</strong>
              <span>sewa mulai per hari</span>
            </div>
            <div className="trust-divider"></div>
            <div className="trust-stat">
              <strong>100%</strong>
              <span>deposit dikembalikan</span>
            </div>
          </div>
        </div>

        <div className="hero-showcase">
          <div className="showcase-card">
            <div className="showcase-header">
              <span className="accent-pill">Spotlight</span>
              <span className="showcase-location">Jakarta Selatan</span>
            </div>

            <div className="showcase-image-wrap">
              <img
                src="https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1000&q=80"
                alt="Sony Alpha A7 III Kit"
                className="showcase-image"
              />
              <span className="showcase-item-tag">Ready Sewa</span>
            </div>

            <div className="showcase-body">
              <div className="showcase-meta">
                <span className="showcase-category">Fotografi &amp; Video</span>
                <span className="showcase-rating">★ 4.9</span>
              </div>

              <h3 className="showcase-title">Sony Alpha A7 III Kit</h3>
              <p className="showcase-snippet">Lensa 28-70mm · 2x baterai · SD 64GB</p>

              <div className="showcase-seller">
                <div className="seller-avatar-mini">A</div>
                <div className="seller-info-mini">
                  <strong>Adit Studio</strong>
                  <span>Terverifikasi ✓ Respon &lt; 15 mnt</span>
                </div>
              </div>

              <div className="showcase-footer">
                <div className="showcase-price-box">
                  <div className="price-amount-wrap">
                    <strong className="price-amount">Rp150.000</strong>
                    <span className="price-unit">/ hari</span>
                  </div>
                </div>

                <button
                  type="button"
                  className="primary-button showcase-rent-btn"
                  onClick={() => onNavigate('consumer')}
                >
                  Sewa
                </button>
              </div>
            </div>

            <div className="showcase-security-note">
              <span>🛡 Deposit dikembalikan penuh setelah barang dicek</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}