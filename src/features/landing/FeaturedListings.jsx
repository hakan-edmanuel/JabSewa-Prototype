import { useEffect, useState } from 'react'
import { fetchListings } from '../../data/listings'
import { formatPrice } from '../../domain/format'
import { RENTAL_UNIT_LABELS } from '../../domain/constants'

/*
 * Barang terbaru dari Supabase (via lib/listings) —
 * tampilan ringkas: gambar, nama, harga, lokasi.
 */
export default function FeaturedListings({ onNavigate }) {
  const [items, setItems] = useState([])

  useEffect(() => {
    let active = true
    fetchListings()
      .then((data) => {
        if (active) setItems(data.slice(0, 6))
      })
      .catch(() => {
        // Gagal memuat katalog unggulan bukan alasan menampilkan error besar;
        // section cukup tidak dirender (ConsumerBrowser menampilkan error-nya).
        if (active) setItems([])
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
                <p className="listing-category">{item.category_name || item.category}</p>
                <h3 className="listing-title">{item.name}</h3>
                <p className="listing-location">{item.location}</p>

                <div className="listing-bottom">
                  <div className="price-row">
                    <strong className="listing-price">{formatPrice(item.price)}</strong>
                    <span className="listing-period">
                      / {RENTAL_UNIT_LABELS[item.rental_unit] || 'hari'}
                    </span>
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
