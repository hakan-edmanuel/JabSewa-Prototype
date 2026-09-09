import { ITEMS } from '../data/catalog'

const formatPrice = (price) => `Rp${price.toLocaleString('id-ID')}`

const CATEGORY_LABELS = {
  photography: 'Fotografi & Video',
  gadget: 'Gadget',
  sports: 'Olahraga',
  event: 'Event',
}

/*
 * Barang terbaru dari katalog — satu sumber data (data/catalog.js),
 * tampilan ringkas: gambar, nama, harga, lokasi.
 */
export default function FeaturedListings({ onNavigate }) {
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
          {ITEMS.map((item) => (
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
