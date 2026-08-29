const listings = [
  {
    id: 1,
    name: 'Sony Alpha A7 III Full-Frame Kit',
    category: 'Fotografi & Video',
    location: 'Jakarta Selatan',
    price: 'Rp150.000',
    period: '/ hari',
    rating: 4.9,
    reviews: 128,
    seller: 'Adit Studio',
    deposit: 'Rp500.000',
    specs: 'Lensa 28-70mm · 2x Baterai · 64GB Card',
    image:
      'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1000&q=80',
    tag: 'Ready Hari Ini',
  },
  {
    id: 2,
    name: 'PlayStation 5 Disc Edition + 2 Stick',
    category: 'Gaming & Konsol',
    location: 'Bandung',
    price: 'Rp120.000',
    period: '/ hari',
    rating: 4.8,
    reviews: 203,
    seller: 'GameNest Store',
    deposit: 'Rp750.000',
    specs: '2 DualSense Controller + 5 Game Populer',
    image:
      'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?auto=format&fit=crop&w=1000&q=80',
    tag: 'Populer',
  },
  {
    id: 3,
    name: 'Tenda Camping 4 Orang Waterproof',
    category: 'Outdoor & Camping',
    location: 'Bogor',
    price: 'Rp85.000',
    period: '/ hari',
    rating: 4.9,
    reviews: 92,
    seller: 'TrailBase Outdoor',
    deposit: 'Rp300.000',
    specs: 'Double Layer · Frame Alloy · Pasak Lengkap',
    image:
      'https://images.unsplash.com/photo-1522163182402-834f871fd851?auto=format&fit=crop&w=1000&q=80',
    tag: 'Siap Pickup',
  },
  {
    id: 4,
    name: 'Projector Epson EB-X500 3600 Lumens',
    category: 'Audio & Visual',
    location: 'Surabaya',
    price: 'Rp180.000',
    period: '/ hari',
    rating: 4.7,
    reviews: 81,
    seller: 'EventHub Rental',
    deposit: 'Rp600.000',
    specs: 'HDMI Cable · Remote · Tas Projector Termasuk',
    image:
      'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1000&q=80',
    tag: 'Alat Event',
  },
  {
    id: 5,
    name: 'DJI Mini 3 Pro Drone Combo',
    category: 'Fotografi & Video',
    location: 'Depok',
    price: 'Rp220.000',
    period: '/ hari',
    rating: 4.9,
    reviews: 74,
    seller: 'Skyframe Studio',
    deposit: 'Rp1.000.000',
    specs: 'Video 4K HDR · 3x Baterai Plus · Tas Fly More',
    image:
      'https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=1000&q=80',
    tag: 'Best Seller',
  },
  {
    id: 6,
    name: 'Sepeda Gunung Polygon Xtrada 6',
    category: 'Olahraga & Mobilitas',
    location: 'Jakarta Pusat',
    price: 'Rp90.000',
    period: '/ hari',
    rating: 4.8,
    reviews: 58,
    seller: 'Pedal Jakarta',
    deposit: 'Rp400.000',
    specs: 'Size M · Shimano Deore 1x11 · Helm Termasuk',
    image:
      'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=1000&q=80',
    tag: 'Akhir Pekan',
  },
]

export default function FeaturedListings() {
  return (
    <section className="featured-section" id="jelajahi">
      <div className="container">
        <div className="featured-header-wrap">
          <div className="section-heading split-heading">
            <div>
              <p className="eyebrow eyebrow-dark">REKOMENDASI SEWA TERPOPULER</p>
              <h2>Pilihan rental favorit komunitas JabSewa minggu ini</h2>
            </div>
            <a href="#kategori" className="featured-explore-link">
              Lihat 5.600+ barang lainnya →
            </a>
          </div>
        </div>

        <div className="listing-grid">
          {listings.map((item) => (
            <article key={item.id} className="listing-card">
              <div className="listing-image-wrap">
                <img src={item.image} alt={item.name} className="listing-image" />
                <span className="listing-status-tag">{item.tag}</span>
                <span className="listing-category-badge">{item.category}</span>
              </div>

              <div className="listing-body">
                <div className="listing-meta-row">
                  <span className="listing-location">📍 {item.location}</span>
                  <span className="listing-rating">★ {item.rating} ({item.reviews})</span>
                </div>

                <h3 className="listing-title">{item.name}</h3>
                <p className="listing-specs">{item.specs}</p>

                <div className="listing-seller-row">
                  <span className="seller-name">Pemilik: <strong>{item.seller}</strong></span>
                  <span className="deposit-tag">Dep: {item.deposit}</span>
                </div>

                <div className="listing-bottom">
                  <div className="listing-price-box">
                    <span className="price-title">Biaya Sewa</span>
                    <div className="price-row">
                      <strong className="listing-price">{item.price}</strong>
                      <span className="listing-period">{item.period}</span>
                    </div>
                  </div>
                  <button type="button" className="primary-button listing-action-btn">
                    Sewa Sekarang
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}