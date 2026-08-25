export default function HeroSection({ onNavigate }) {
  return (
    <section className="hero-section reveal-on-scroll">
      <div className="hero-inner">
        <div className="hero-copy">
          <h1>
            Barang yang kamu butuhkan,
            <span className="hero-highlight">tanpa harus membeli.</span>
          </h1>

          <p>
            JabSewa membantu kamu meminjam barang yang dibutuhkan—dari kebutuhan harian sampai
            kebutuhan event—dengan proses yang sederhana, aman, dan cepat.
          </p>

          <div className="hero-actions">
            <button className="primary-button" onClick={() => onNavigate('consumer')}>Explore Rentals</button>
            <button className="secondary-button" onClick={() => onNavigate('seller')}>Mulai jadi seller</button>
          </div>

          <div className="hero-metrics">
            <div className="metric">
              <strong>5.6k+</strong>
              <span>items ready</span>
            </div>
            <div className="metric">
              <strong>2.4k</strong>
              <span>active sellers</span>
            </div>
            <div className="metric">
              <strong>4.9/5</strong>
              <span>trust score</span>
            </div>
          </div>
        </div>

        <div className="hero-visual" aria-label="JabSewa rental ecosystem overview">
          <div className="hero-pattern-panel" aria-hidden="true" />

          <div className="hero-floating hero-floating-top">
            <div className="hero-floating-icon">★</div>
            <div>
              <strong>4.9 Rating</strong>
              <span>Seller verified</span>
            </div>
          </div>

          <div className="hero-floating hero-floating-bottom">
            <div className="hero-floating-icon">📍</div>
            <div>
              <strong>Jakarta Selatan</strong>
              <span>Pickup available</span>
            </div>
          </div>

          <div className="hero-visual-card">
            <div className="hero-panel-header">
              <span className="brand-mini">JabSewa</span>
              <span className="status-pill">Verified</span>
            </div>

            <div className="hero-search-box">
              <span>What do you need to rent?</span>
              <button onClick={() => onNavigate('consumer')}>Search</button>
            </div>

            <div className="hero-chip-row">
              <span>Electronics</span>
              <span>Camera</span>
              <span>Outdoor</span>
            </div>

            <div className="hero-mini-grid">
              <div className="mini-stat-card accent">
                <small>Booking</small>
                <strong>24h</strong>
              </div>
              <div className="mini-stat-card">
                <small>Trusted</small>
                <strong>4.9</strong>
              </div>
              <div className="mini-stat-card dark">
                <small>Area</small>
                <strong>Jakarta</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}