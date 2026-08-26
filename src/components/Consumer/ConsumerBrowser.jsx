import { useMemo, useState } from 'react'

const ITEMS = [
  { id: 1, name: 'Sony Alpha A7 III', category: 'photography', price: 150000, rating: 4.9, reviews: 128, image: '📷', seller: 'Adit Studio', location: 'Jakarta Utara', available: true, deposit: 500000, description: 'Kamera full-frame untuk foto, video, dan kebutuhan event.' },
  { id: 2, name: 'PlayStation 5', category: 'gadget', price: 100000, rating: 4.8, reviews: 203, image: '🎮', seller: 'GameNest', location: 'Jakarta Utara', available: true, deposit: 750000, description: 'Konsol lengkap dengan dua controller dan koleksi game pilihan.' },
  { id: 3, name: 'Camping Tent 4 Orang', category: 'sports', price: 75000, rating: 4.7, reviews: 92, image: '⛺', seller: 'TrailBase', location: 'Jakarta Selatan', available: true, deposit: 300000, description: 'Tenda waterproof yang nyaman untuk camping akhir pekan.' },
  { id: 4, name: 'DJI Mini Drone', category: 'photography', price: 220000, rating: 4.9, reviews: 74, image: '🚁', seller: 'Skyframe', location: 'Depok', available: false, deposit: 1000000, description: 'Drone ringan dengan video 4K dan baterai cadangan.' },
  { id: 5, name: 'Mountain Bike', category: 'sports', price: 90000, rating: 4.6, reviews: 58, image: '🚲', seller: 'Pedal Jakarta', location: 'Jakarta Pusat', available: true, deposit: 400000, description: 'Sepeda gunung untuk jalur kota dan trail ringan.' },
  { id: 6, name: 'Projector Epson', category: 'event', price: 180000, rating: 4.8, reviews: 81, image: '📽️', seller: 'EventHub', location: 'Tangerang', available: true, deposit: 600000, description: 'Projector terang untuk presentasi dan acara.' },
]

const formatPrice = (price) => `Rp ${price.toLocaleString('id-ID')}`

const SORT_COMPARATORS = {
  'price-low': (a, b) => a.price - b.price,
  'rating': (a, b) => b.rating - a.rating,
  'recommended': (a, b) => b.rating * b.reviews - a.rating * a.reviews,
}

export default function ConsumerBrowser({ category, search, priceRange, onSelect }) {
  const [sort, setSort] = useState('recommended')
  const [wishlist, setWishlist] = useState([])
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    const result = ITEMS.filter((item) => (!category || item.category === category) && (!query || `${item.name} ${item.seller} ${item.category}`.toLowerCase().includes(query)) && item.price <= priceRange.max)
    const comparator = SORT_COMPARATORS[sort] || SORT_COMPARATORS.recommended
    return result.sort(comparator)
  }, [category, priceRange.max, search, sort])
  const toggleWishlist = (id) => setWishlist((saved) => saved.includes(id) ? saved.filter((itemId) => itemId !== id) : [...saved, id])

  return (
    <section className="consumer-browser" id="explore">
      <div className="browser-header">
        <div>
          <p className="section-kicker">Jelajahi marketplace</p>
          <h2>Barang untuk kebutuhanmu</h2>
          <p className="results-count">
            Ditemukan <strong>{filteredItems.length}</strong> pilihan di sekitar Anda
          </p>
        </div>
        <label className="browser-sort">
          Urutkan
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="recommended">Rekomendasi</option>
            <option value="price-low">Harga Terendah</option>
            <option value="rating">Rating Tertinggi</option>
          </select>
        </label>
      </div>

      <div className="items-browser-grid">
        {filteredItems.map((item) => (
          <article key={item.id} className="browser-item-card">
            <button
              className="item-badge-container item-select"
              onClick={() => onSelect(item)}
              aria-label={`Lihat ${item.name}`}
            >
              <div className="browser-item-image">{item.image}</div>
              {!item.available && (
                <span className="unavailable-badge">Sedang disewa</span>
              )}
            </button>
            <div className="browser-item-info">
              <div className="card-heading-row">
                <p className="listing-category">{item.category}</p>
                <button
                  className={`wishlist-button ${wishlist.includes(item.id) ? 'is-saved' : ''}`}
                  onClick={() => toggleWishlist(item.id)}
                  aria-label="Simpan ke wishlist"
                >
                  {wishlist.includes(item.id) ? '❤️' : '♡'}
                </button>
              </div>
              <button
                className="item-title-button"
                onClick={() => onSelect(item)}
              >
                <h3 className="browser-item-name">{item.name}</h3>
              </button>
              <p className="browser-item-seller">
                {item.seller} <span className="verified-badge-small">✓</span>
              </p>
              <div className="browser-item-rating">
                <span className="rating-value">★ {item.rating}</span>
                <span className="rating-reviews">({item.reviews}) · {item.location}</span>
              </div>
              <div className="browser-item-footer">
                <div>
                  <p className="price-label">Mulai dari</p>
                  <p className="browser-item-price">
                    {formatPrice(item.price)}
                    <small>/hari</small>
                  </p>
                </div>
                <div className="browser-item-buttons">
                  <button
                    className="btn-add-cart"
                    disabled={!item.available}
                    onClick={() => onSelect(item)}
                  >
                    {item.available ? 'Lihat' : 'Kosong'}
                  </button>
                  <button
                    className="btn-icon-cart"
                    disabled={!item.available}
                    onClick={(e) => {
                      e.stopPropagation();
                      alert('Ditambahkan ke keranjang!');
                    }}
                    title="Masukkan Keranjang"
                  >
                    🛒
                  </button>
                </div>
              </div>
            </div>
          </article>
        ))}
        {!filteredItems.length && (
          <div className="no-results">
            <p className="no-results-text">Belum ada barang yang sesuai</p>
            <p className="no-results-suggestion">Ubah kata kunci atau filter Anda.</p>
          </div>
        )}
      </div>
    </section>
  )
}