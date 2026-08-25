export default function ConsumerFilters({ onCategoryChange, onPriceChange, currentCategory }) {
  const categories = [
    { id: 'gadget', name: 'Gadget', icon: '📱' },
    { id: 'furniture', name: 'Furniture', icon: '🛋️' },
    { id: 'event', name: 'Event & Party', icon: '🎉' },
    { id: 'vehicle', name: 'Kendaraan', icon: '🚗' },
    { id: 'sports', name: 'Olahraga', icon: '⚽' },
    { id: 'photography', name: 'Fotografi', icon: '📷' },
  ];

  const handlePriceChange = (e) => {
    onPriceChange({ 
      min: 0, 
      max: parseInt(e.target.value) 
    });
  };

  return (
    <div className="consumer-filters">
      <div className="filters-container">
        {/* Categories */}
        <div className="filter-section">
          <h3 className="filter-title">Kategori</h3>
          <div className="filter-options">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => onCategoryChange(currentCategory === cat.id ? null : cat.id)}
                className={`filter-option ${currentCategory === cat.id ? 'active' : ''}`}
              >
                <span className="option-icon">{cat.icon}</span>
                <span className="option-name">{cat.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Price Range */}
        <div className="filter-section">
          <h3 className="filter-title">Harga Maksimal Per Hari</h3>
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

        {/* Condition */}
        <div className="filter-section">
          <h3 className="filter-title">Kondisi Barang</h3>
          <div className="filter-checkboxes">
            <label className="checkbox-item">
              <input type="checkbox" defaultChecked />
              <span>Sangat Baik</span>
            </label>
            <label className="checkbox-item">
              <input type="checkbox" defaultChecked />
              <span>Baik</span>
            </label>
            <label className="checkbox-item">
              <input type="checkbox" defaultChecked />
              <span>Cukup</span>
            </label>
          </div>
        </div>

        {/* Rating */}
        <div className="filter-section">
          <h3 className="filter-title">Rating Penjual</h3>
          <div className="filter-checkboxes">
            <label className="checkbox-item">
              <input type="checkbox" defaultChecked />
              <span>⭐⭐⭐⭐⭐ (5.0)</span>
            </label>
            <label className="checkbox-item">
              <input type="checkbox" defaultChecked />
              <span>⭐⭐⭐⭐ (4.0+)</span>
            </label>
            <label className="checkbox-item">
              <input type="checkbox" defaultChecked />
              <span>⭐⭐⭐ (3.0+)</span>
            </label>
          </div>
        </div>

        {/* Sort */}
        <div className="filter-section">
          <h3 className="filter-title">Urutkan</h3>
          <select className="filter-select-full">
            <option>Terbaru</option>
            <option>Harga Terendah</option>
            <option>Harga Tertinggi</option>
            <option>Rating Tertinggi</option>
            <option>Paling Populer</option>
          </select>
        </div>

        {/* Reset Filters */}
        <button className="btn-reset-filters">🔄 Reset Filter</button>
      </div>
    </div>
  );
}
