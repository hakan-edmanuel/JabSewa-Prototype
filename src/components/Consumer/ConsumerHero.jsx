export default function ConsumerHero({ onSearch }) {
  return (
    <section className="consumer-hero">
      <div className="consumer-hero-content">
        <h1 className="consumer-hero-title">
          Cari barang untuk disewa
        </h1>

        <div className="consumer-search-container">
          <input
            type="text"
            className="consumer-search-input"
            placeholder="Cari barang, kategori, atau penjual..."
            aria-label="Cari barang"
            onChange={(e) => onSearch(e.target.value)}
          />
          <button type="button" className="consumer-search-btn">
            Cari
          </button>
        </div>

        <div className="consumer-suggestions">
          <span className="suggestion-label">Populer:</span>
          <button type="button" className="suggestion-tag" onClick={() => onSearch('kamera')}>Kamera</button>
          <button type="button" className="suggestion-tag" onClick={() => onSearch('ps5')}>PS5</button>
          <button type="button" className="suggestion-tag" onClick={() => onSearch('tenda')}>Tenda</button>
          <button type="button" className="suggestion-tag" onClick={() => onSearch('projector')}>Proyektor</button>
        </div>
      </div>
    </section>
  )
}
