import { useMemo, useState } from 'react'
import { getWishlist, toggleWishlist as persistWishlist } from '../../lib/userData'
import { ITEMS } from '../../data/catalog'

const formatPrice = (price) => `Rp ${price.toLocaleString('id-ID')}`

const CATEGORY_LABELS = {
  photography: 'Fotografi',
  gadget: 'Gadget',
  sports: 'Olahraga',
  event: 'Event',
}

const SORT_COMPARATORS = {
  'price-low': (a, b) => a.price - b.price,
  'price-high': (a, b) => b.price - a.price,
  'name': (a, b) => a.name.localeCompare(b.name),
  'recommended': (a, b) => Number(b.available) - Number(a.available) || a.price - b.price,
}

export default function ConsumerBrowser({ category, search, priceRange, onSelect }) {
  const [sort, setSort] = useState('recommended')
  const [wishlist, setWishlist] = useState(getWishlist)
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    const result = ITEMS.filter(
      (item) =>
        (!category || item.category === category) &&
        (!query || `${item.name} ${item.seller} ${item.category}`.toLowerCase().includes(query)) &&
        item.price <= priceRange.max,
    )
    const comparator = SORT_COMPARATORS[sort] || SORT_COMPARATORS.recommended
    return result.sort(comparator)
  }, [category, priceRange.max, search, sort])
  const toggleWishlist = (id) => setWishlist(persistWishlist(id))

  return (
    <section className="consumer-browser" id="explore">
      <div className="browser-header">
        <p className="results-count">
          Ditemukan <strong>{filteredItems.length}</strong> pilihan
        </p>
        <label className="browser-sort">
          Urutkan
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="recommended">Rekomendasi</option>
            <option value="price-low">Harga Terendah</option>
            <option value="price-high">Harga Tertinggi</option>
            <option value="name">Nama A–Z</option>
          </select>
        </label>
      </div>

      <div className="items-browser-grid">
        {filteredItems.map((item) => (
          <article key={item.id} className={`browser-item-card ${item.available ? '' : 'is-unavailable'}`}>
            <button
              className="item-badge-container item-select"
              onClick={() => onSelect(item)}
              aria-label={`Lihat ${item.name}`}
            >
              <img src={item.image} alt={item.name} className="browser-item-image" loading="lazy" />
              {!item.available && <span className="unavailable-badge">Sedang disewa</span>}
            </button>
            <div className="browser-item-info">
              <div className="card-heading-row">
                <p className="listing-category">{CATEGORY_LABELS[item.category] || item.category}</p>
                <button
                  className={`wishlist-button ${wishlist.includes(item.id) ? 'is-saved' : ''}`}
                  onClick={() => toggleWishlist(item.id)}
                  aria-label="Simpan ke wishlist"
                >
                  {wishlist.includes(item.id) ? '♥' : '♡'}
                </button>
              </div>
              <button className="item-title-button" onClick={() => onSelect(item)}>
                <h3 className="browser-item-name">{item.name}</h3>
              </button>
              <p className="browser-item-seller">
                {item.seller} · {item.location}
              </p>
              <div className="browser-item-footer">
                <p className="browser-item-price">
                  {formatPrice(item.price)}
                  <small>/hari</small>
                </p>
                <button
                  className="btn-add-cart"
                  disabled={!item.available}
                  onClick={() => onSelect(item)}
                >
                  {item.available ? 'Lihat Detail' : 'Kosong'}
                </button>
              </div>
            </div>
          </article>
        ))}
        {!filteredItems.length && (
          <div className="no-results">
            <p className="no-results-text">Belum ada barang yang sesuai</p>
            <p className="no-results-suggestion">Ubah kata kunci atau filter kamu.</p>
          </div>
        )}
      </div>
    </section>
  )
}
