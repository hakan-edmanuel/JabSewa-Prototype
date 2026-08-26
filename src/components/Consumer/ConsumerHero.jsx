export default function ConsumerHero({ onSearch }) {
  const handleSearch = (e) => {
    onSearch(e.target.value);
  };

  return (
    <section className="consumer-hero">
      <div className="consumer-hero-content">
        <h1 className="consumer-hero-title">
          Sewa Barang Berkualitas, <br />
          <span className="hero-highlight">Lebih Hemat & Praktis.</span>
        </h1>

        <p className="consumer-hero-subtitle">
          Dari perlengkapan kamera untuk project akhir pekan hingga tenda untuk camping, temukan semuanya di JabSewa.
        </p>

        <div className="consumer-search-container">
          <span className="consumer-search-icon">🔍</span>
          <input
            type="text"
            className="consumer-search-input"
            placeholder="Cari barang, kategori, atau penjual..."
            onChange={handleSearch}
          />
          <button className="consumer-search-btn">
            Cari
          </button>
        </div>

        <div className="consumer-suggestions">
          <span className="suggestion-label">Pencarian populer:</span>
          <span className="suggestion-tag">Kamera & Lensa</span>
          <span className="suggestion-tag">Peralatan Camping</span>
          <span className="suggestion-tag">Konsol Game</span>
        </div>
      </div>
    </section>
  );
}