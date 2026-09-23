import { useEffect, useState } from 'react'
import { fetchListings } from '../lib/listings'
import { formatPrice } from '../lib/format'
import { CATEGORY_LABELS } from '../lib/constants'

/*
 * Barang terbaru dari LocalStorage store (via lib/listings) —
 * tampilan ringkas: gambar, nama, harga, lokasi.
 */
export default function FeaturedListings({ onNavigate }) {
  const [items, setItems] = useState([])

  useEffect(() => {
    let active = true
    fetchListings().then((data) => {
      if (active) setItems(data.slice(0, 6))
    })
    return () => {
      active = false
    }
  }, [])

  if (!items.length) return null

  return (
    <section className="featured-section" id="jelajahi">
      <div className="container">
        <div className="section-heading split-heading">
          <div>
            <p className="eyebrow eyebrow-dark">TERBARU</p>
            <h2>Barang siap sewa</h2>
          </div>
          <button type="button" className="featured-explore-link" onClick={() => onNavigate('consumer')}>
            Lihat semua barang →
          </button>
        </div>

        <div className="listing-grid">
          {items.map((item) => (
            <article key={item.id} className="listing-card">
              <button
                type="button"
                className="listing-image-wrap"
                onClick={() => onNavigate('consumer', { itemId: item.id })}
                aria-label={`Lihat ${item.name}`}
              >
                <img src={item.image} alt={item.name} className="listing-image" loading="lazy" />
                {!item.available && <span className="listing-status-tag">Sedang disewa</span>}
              </button>

              <div className="listing-body">
                <p className="listing-category">{CATEGORY_LABELS[item.category] || item.category}</p>
                <h3 className="listing-title">{item.name}</h3>
                <p className="listing-location">{item.location}</p>

                <div className="listing-bottom">
                  <div className="price-row">
                    <strong className="listing-price">{formatPrice(item.price)}</strong>
                    <span className="listing-period">/ hari</span>
                  </div>
                  <button
                    type="button"
                    className="secondary-button listing-action-btn"
                    onClick={() => onNavigate('consumer', { itemId: item.id })}
                  >
                    Detail
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
