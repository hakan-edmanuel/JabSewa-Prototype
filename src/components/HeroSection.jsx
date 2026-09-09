import { useState } from 'react'

/*
 * Hero landing — menjawab dua hal: apa itu JabSewa, dan apa yang bisa
 * dilakukan user. Satu titik fokus visual (barang nyata dari katalog),
 * tanpa statistik palsu, tanpa elemen dekoratif.
 */
export default function HeroSection({ onNavigate, onSellerIntent }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCity, setSelectedCity] = useState('Semua Lokasi')

  const handleSearch = (e) => {
    e.preventDefault()
    onNavigate('consumer')
  }

  const popularTags = ['Kamera', 'PS5', 'Tenda', 'Proyektor']

  return (
    <section className="hero-section">
      <div className="hero-inner">
        <div className="hero-copy">
          <h1>
            Sewa barang untuk nyoba atau event,
            <span className="hero-title-accent">tanpa harus beli.</span>
          </h1>

          <p className="hero-subtitle">
            Kamera, konsol, tenda, sampai alat event — disewakan orang di
            sekitar kamu. Ambil yang kamu butuhkan, kembalikan kalau selesai.
          </p>

          <form className="hero-search-container" onSubmit={handleSearch}>
            <div className="hero-search-field hero-search-main">
              <input
                type="text"
                placeholder="Cari kamera, tenda, PS5..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="hero-search-input"
                aria-label="Cari barang"
              />
            </div>

            <div className="hero-search-field hero-search-city">
              <select
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                className="hero-search-select"
                aria-label="Lokasi"
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

          <button type="button" className="hero-seller-link" onClick={onSellerIntent}>
            Punya barang nganggur? Sewakan di sini →
          </button>
        </div>

        <div className="hero-showcase">
          <figure className="hero-visual">
            <img
              src="https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80"
              alt="Kamera mirrorless yang tersedia untuk disewa di JabSewa"
              className="hero-visual-img"
            />
            <figcaption className="hero-visual-caption">
              <div className="hero-visual-info">
                <strong>Sony Alpha A7 III</strong>
                <span>Jakarta Utara · Sony Alpha A7 III</span>
              </div>
              <div className="hero-visual-price">
                <strong>Rp150.000</strong>
                <span>/ hari</span>
              </div>
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  )
}
