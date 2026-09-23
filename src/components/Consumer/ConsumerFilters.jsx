import { useState } from 'react'
import { CATEGORIES } from '../../lib/constants'

const MAX_PRICE = 500000

export default function ConsumerFilters({ onCategoryChange, onPriceChange, currentCategory }) {
  const [maxPrice, setMaxPrice] = useState(MAX_PRICE)

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
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => onCategoryChange(currentCategory === cat.id ? null : cat.id)}
                className={`filter-option ${currentCategory === cat.id ? 'active' : ''}`}
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
