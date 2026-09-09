export default function ConsumerFilters({ onCategoryChange, onPriceChange, currentCategory }) {
  // Harus sinkron dengan nilai `category` di data/catalog.js.
  const categories = [
    { id: 'photography', name: 'Fotografi' },
    { id: 'gadget', name: 'Gadget' },
    { id: 'sports', name: 'Olahraga' },
    { id: 'event', name: 'Event' },
  ]

  const handlePriceChange = (e) => {
    onPriceChange({
      min: 0,
      max: parseInt(e.target.value),
    })
  }

  return (
    <div className="consumer-filters">
      <div className="filters-container">
        <div className="filter-section">
          <h3 className="filter-title">Kategori</h3>
          <div className="filter-options">
            {categories.map((cat) => (
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
              max="500000"
              step="50000"
              defaultValue="500000"
              onChange={handlePriceChange}
              className="price-slider"
            />
            <div className="price-display">
              <span className="price-min">Rp 0</span>
              <span className="price-max">Rp 500.000</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
