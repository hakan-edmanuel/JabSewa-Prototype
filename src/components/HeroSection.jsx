import { useState } from 'react'

export default function HeroSection({ onNavigate }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCity, setSelectedCity] = useState('Semua Lokasi')

  const handleSearch = (e) => {
    e.preventDefault()
    onNavigate('consumer')
  }

  const popularTags = [
    '📷 Sony A7 III',
    '🎮 PlayStation 5',
    '⛺ Tenda Camping',
    '🚁 DJI Drone',
    '📽️ Projector Epson',
  ]

  return (
    <section className="hero-section">
      <div className="hero-inner">
        <div className="hero-copy">
          <div className="hero-badge">
            <span className="hero-badge-dot"></span>
            JabSewa · Sewa & Rental
          </div>

          <h1>
            Sewa barang yang kamu butuhkan,
            <span className="hero-title-accent">langsung dari pemilik terdekat.</span>
          </h1>

          <p className="hero-subtitle">
            Hemat biaya tanpa harus membeli barang yang cuma dipakai sesekali.
            Dari perlengkapan kamera, outdoor, konsol game, hingga peralatan event dengan jaminan deposit aman.
          </p>

          <form className="hero-search-container" onSubmit={handleSearch}>
            <div className="hero-search-field hero-search-main">
              <span className="hero-search-icon">🔍</span>
              <input
                type="text"
                placeholder="Cari kamera, tenda, drone, PS5..."
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
                <option>Jakarta Barat</option>
                <option>Bandung</option>
                <option>Bogor</option>
                <option>Depok</option>
                <option>Tangerang</option>
              </select>
            </div>

            <button type="submit" className="primary-button hero-search-submit">
              Cari Rental
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
              <strong>5.600+</strong>
              <span>Barang Tersedia</span>
            </div>
            <div className="trust-divider"></div>
            <div className="trust-stat">
              <strong>2.400+</strong>
              <span>Pemilik Terverifikasi</span>
            </div>
            <div className="trust-divider"></div>
            <div className="trust-stat">
              <strong>⭐ 4.9/5</strong>
              <span>Skor Kepuasan</span>
            </div>
          </div>
        </div>

        <div className="hero-showcase">
          <div className="showcase-card">
            <div className="showcase-header">
              <div className="showcase-live-badge">
                <span className="live-dot"></span>
                Spotlight Hari Ini
              </div>
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
                <span className="showcase-category">Fotografi & Video</span>
                <span className="showcase-rating">★ 4.9 (128 ulasan)</span>
              </div>

              <h3 className="showcase-title">Sony Alpha A7 III Full-Frame Kit</h3>
              <p className="showcase-snippet">Termasuk Lensa 28-70mm, 2x Baterai Ori, Memory Card 64GB.</p>

              <div className="showcase-seller">
                <div className="seller-avatar-mini">A</div>
                <div className="seller-info-mini">
                  <strong>Adit Studio</strong>
                  <span>Pemilik Terverifikasi ✓ · Respon &lt; 15 menit</span>
                </div>
              </div>

              <div className="showcase-footer">
                <div className="showcase-price-box">
                  <span className="price-label-mini">Harga Sewa</span>
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
                  Sewa Sekarang
                </button>
              </div>
            </div>

            <div className="showcase-security-note">
              <span>🛡️ Jaminan deposit kembali aman</span>
              <span>•</span>
              <span>KTP Terverifikasi</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}