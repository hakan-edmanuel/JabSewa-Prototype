import { useState } from 'react'

/*
 * Hero marketplace: input pencarian + tag populer. onChange diteruskan ke
 * ConsumerPage (query live); tombol Cari hanya memicu ulang query yang sama
 * agar submit keyboard/enter dan klik terasa konsisten.
 */
export default function ConsumerHero({ onSearch }) {
  const [query, setQuery] = useState('')

  const handleSearch = () => {
    onSearch(query)
    document.getElementById('explore')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section className="consumer-hero">
      <div className="consumer-hero-content">
        <h1 className="consumer-hero-title">
          Cari barang untuk disewa
        </h1>

        <form
          className="consumer-search-container"
          onSubmit={(event) => {
            event.preventDefault()
            handleSearch()
          }}
        >
          <input
            type="text"
            className="consumer-search-input"
            placeholder="Cari barang, kategori, atau penjual..."
            aria-label="Cari barang"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              onSearch(e.target.value)
            }}
          />
          <button type="submit" className="consumer-search-btn">
            Cari
          </button>
        </form>

        <div className="consumer-suggestions">
          <span className="suggestion-label">Populer:</span>
          <button type="button" className="suggestion-tag" onClick={() => { setQuery('kamera'); onSearch('kamera') }}>Kamera</button>
          <button type="button" className="suggestion-tag" onClick={() => { setQuery('ps5'); onSearch('ps5') }}>PS5</button>
          <button type="button" className="suggestion-tag" onClick={() => { setQuery('tenda'); onSearch('tenda') }}>Tenda</button>
          <button type="button" className="suggestion-tag" onClick={() => { setQuery('projector'); onSearch('projector') }}>Proyektor</button>
        </div>
      </div>
    </section>
  )
}
