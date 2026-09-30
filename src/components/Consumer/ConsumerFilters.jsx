import { useEffect, useState } from 'react'
import { fetchCategories } from '../../lib/listings'

const MAX_PRICE = 500000

/*
 * Filter marketplace — ERD v2.
 * Kategori dari tabel `categories` (Supabase, RLS publik). Bila katalog
 * belum terisi (seed dev belum dijalankan), tampil pesan kosong — tanpa
 * fallback data palsu. CATEGORIES di constants.js hanya fallback label.
 */
export default function ConsumerFilters({ onCategoryChange, onPriceChange, currentCategory }) {
  const [maxPrice, setMaxPrice] = useState(MAX_PRICE)
  const [categories, setCategories] = useState([])

  useEffect(() => {
    let active = true
    fetchCategories()
      .then((cats) => {
        if (active) setCategories(cats || [])
      })
      .catch(() => {
        if (active) setCategories([])
      })
    return () => {
      active = false
    }
  }, [])

  const handlePriceChange = (e) => {
    const value = parseInt(e.target.value, 10)
    setMaxPrice(value)
    onPriceChange({ min: 0, max: value })
  }

  return (
    <div className="consumer-filters">
      <div className="filters-container">
        <div className="filter-section">
          <h3 className="filter-title">Kategori</h3>
          <div className="filter-options">
            {categories.length === 0 && (
              <p className="option-name" style={{ opacity: 0.6 }}>
                Kategori belum tersedia.
              </p>
            )}
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => onCategoryChange(currentCategory === cat.slug ? null : cat.slug)}
                className={`filter-option ${currentCategory === cat.slug ? 'active' : ''}`}
              >
                <span className="option-name">{cat.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="filter-section">
          <h3 className="filter-title">Harga maksimal per hari</h3>
          <div className="price-filter">
            <input
              type="range"
              min="0"
              max={MAX_PRICE}
              step="50000"
              value={maxPrice}
              onChange={handlePriceChange}
              className="price-slider"
            />
            <div className="price-display">
              <span className="price-min">Rp 0</span>
              <span className="price-max">Rp {maxPrice.toLocaleString('id-ID')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
