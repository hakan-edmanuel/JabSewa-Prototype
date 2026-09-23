import { useEffect, useMemo, useState } from 'react'
import '../../styles/hybrid-search.css'
import { useAuth } from '../../auth/AuthContext'
import { getWishlist, toggleWishlist as persistWishlist } from '../../lib/userData'
import { hybridSearch } from '../../lib/search'
import { formatPrice } from '../../lib/format'
import { CATEGORY_LABELS } from '../../lib/constants'

/*
 * ============================================================================
 * CONSUMER BROWSER — JabSewa (FITUR 1: integrasi UI pencarian hybrid)
 * ============================================================================
 * - Tab: Semua | Barang | Toko (setara type=all|items|stores).
 * - Tab "Semua": "Toko Terkait" di paling atas (maks 6, jika ada match),
 *   diikuti grid barang — sesuai spesifikasi payload hybridSearch().
 * - Sumber data: lib/search (hybridSearch — lokal dulu, nanti RPC Supabase).
 * - Wishlist kini PER-USER (kunci user.id), bukan global satu perangkat.
 * ============================================================================
 */

const TABS = [
  { key: 'all', label: 'Semua' },
  { key: 'items', label: 'Barang' },
  { key: 'stores', label: 'Toko' },
]

/** Kartu toko untuk section "Toko Terkait". */
function StoreCard({ store, onSelectStore }) {
  return (
    <article className="store-card">
      <div className="store-card-head">
        <span className="store-avatar" aria-hidden="true">
          {(store.store_name || '?').charAt(0).toUpperCase()}
        </span>
        <div className="store-card-title">
          <h3>{store.store_name}</h3>
          <p className="store-card-city">{store.city || 'Jabodetabek'}</p>
        </div>
        {store.is_verified && <span className="store-verified" title="Toko terverifikasi">✓ Terverifikasi</span>}
      </div>
      <div className="store-card-foot">
        <span className="store-rating">★ {Number(store.rating ?? 0).toFixed(1)}</span>
        <span className="store-count">{store.total_items} barang</span>
        <button
          type="button"
          className="store-visit-btn"
          onClick={() => onSelectStore?.(store)}
        >
          Lihat Toko
        </button>
      </div>
    </article>
  )
}

/** Kartu barang — setara kartu lama, sumber datanya sekarang ItemHit. */
function ItemCard({ item, wishlist, onToggleWishlist, onSelect }) {
  return (
    <article className="browser-item-card">
      <button
        className="item-badge-container item-select"
        onClick={() => onSelect(item)}
        aria-label={`Lihat ${item.title}`}
      >
        <img src={item.image_url} alt={item.title} className="browser-item-image" loading="lazy" />
        {item.available === false && <span className="unavailable-badge">Sedang disewa</span>}
      </button>
      <div className="browser-item-info">
        <div className="card-heading-row">
          <p className="listing-category">{CATEGORY_LABELS[item.category] || item.category}</p>
          <button
            className={`wishlist-button ${wishlist.includes(item.id) ? 'is-saved' : ''}`}
            onClick={() => onToggleWishlist(item.id)}
            aria-label="Simpan ke wishlist"
          >
            {wishlist.includes(item.id) ? '♥' : '♡'}
          </button>
        </div>
        <button className="item-title-button" onClick={() => onSelect(item)}>
          <h3 className="browser-item-name">{item.title}</h3>
        </button>
        <p className="browser-item-seller">
          {item.store_name} · {item.location}
        </p>
        <div className="browser-item-footer">
          <p className="browser-item-price">
            {formatPrice(item.price_per_day)}
            <small>/hari</small>
          </p>
          <button className="btn-add-cart" disabled={item.available === false} onClick={() => onSelect(item)}>
            {item.available === false ? 'Kosong' : 'Lihat Detail'}
          </button>
        </div>
      </div>
    </article>
  )
}

export default function ConsumerBrowser({ category, search, priceRange, onSelect }) {
  const { user } = useAuth()
  const [tab, setTab] = useState('all')
  // Filter toko aktif (dari tombol "Lihat Toko") — null berarti semua toko.
  const [storeFilter, setStoreFilter] = useState(null)
  // Wishlist dibaca saat render per user; toggle menulis lalu memicu re-render
  // via counter (pola baca-sinkron, tanpa setState di dalam effect).
  const [wishTick, setWishTick] = useState(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- wishTick memicu pembacaan ulang setelah toggle
  const wishlist = useMemo(() => getWishlist(user?.id), [user?.id, wishTick])
  const [results, setResults] = useState({ stores: [], items: [], totals: { stores: 0, items: 0 } })
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Harga & kategori tetap difilter di sisi client (filter UI berada di
  // ConsumerFilters, di luar scope endpoint pencarian).
  const filteredItems = useMemo(
    () => (results.items || []).filter((item) => item.price_per_day <= priceRange.max),
    [results.items, priceRange.max],
  )

  // Sumber kebenaran hasil = hybridSearch(query, category, type=tab).
  // isLoading hanya untuk pemuatan awal; saat query berubah hasil lama
  // tetap tampil sampai hasil baru datang (menghindari flicker).
  useEffect(() => {
    let active = true
    hybridSearch({ query: search, category, type: tab })
      .then((res) => {
        if (active) {
          setResults(res)
          setLoadError('')
          setIsLoading(false)
        }
      })
      .catch((err) => {
        console.error(err)
        if (active) {
          setLoadError('Gagal memuat hasil pencarian. Coba muat ulang halaman.')
          setIsLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [search, category, tab])

  const toggleWishlist = (id) => {
    persistWishlist(user?.id, id)
    setWishTick((tick) => tick + 1)
  }

  const handleSelect = (item) => {
    // Bentuk kembali item kontrak frontend (ProductDetail) dari ItemHit.
    onSelect({
      id: item.id,
      name: item.title,
      category: item.category,
      price: item.price_per_day,
      image: item.image_url,
      seller: item.store_name,
      store_id: item.store_id,
      location: item.location,
      available: item.available !== false,
      deposit: item.deposit ?? 0,
      description: item.description || '',
    })
  }

  /** Fokus ke toko: grid difilter ke barang milik toko tersebut. */
  const handleSelectStore = (store) => setStoreFilter((cur) => (cur?.id === store.id ? null : store))

  const items = storeFilter
    ? filteredItems.filter((item) => item.store_name === storeFilter.store_name)
    : filteredItems

  const relatedStores = tab === 'all' ? (results.stores || []).slice(0, 6) : []

  return (
    <section className="consumer-browser" id="explore">
      <div className="browser-header">
        <p className="results-count">
          Ditemukan <strong>{items.length}</strong> barang
          {relatedStores.length > 0 && <> · <strong>{relatedStores.length}</strong> toko terkait</>}
        </p>
        <nav className="search-tabs" role="tablist" aria-label="Jenis hasil pencarian">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`search-tab ${tab === t.key ? 'is-active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* --- Indikator filter toko aktif --- */}
      {storeFilter && (
        <div className="store-filter-chip">
          Menampilkan barang dari <strong>{storeFilter.store_name}</strong>
          <button type="button" onClick={() => setStoreFilter(null)} aria-label="Hapus filter toko">
            ✕
          </button>
        </div>
      )}

      {/* --- Section Toko Terkait (hanya tab "Semua") --- */}
      {relatedStores.length > 0 && (
        <div className="related-stores">
          <h2 className="related-stores-title">Toko Terkait</h2>
          <div className="related-stores-grid">
            {relatedStores.map((store) => (
              <StoreCard key={store.id} store={store} onSelectStore={handleSelectStore} />
            ))}
          </div>
        </div>
      )}

      {/* --- Grid barang (tab Semua & Barang) --- */}
      {tab !== 'stores' && (
        <div className="items-browser-grid">
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              wishlist={wishlist}
              onToggleWishlist={toggleWishlist}
              onSelect={handleSelect}
            />
          ))}
          {isLoading && (
            <div className="no-results">
              <p className="no-results-text">Memuat hasil pencarian…</p>
            </div>
          )}
          {loadError && (
            <div className="no-results">
              <p className="no-results-text">{loadError}</p>
            </div>
          )}
          {!isLoading && !loadError && !items.length && (
            <div className="no-results">
              <p className="no-results-text">Belum ada barang yang sesuai</p>
              <p className="no-results-suggestion">Ubah kata kunci atau filter kamu.</p>
            </div>
          )}
        </div>
      )}

      {/* --- Daftar toko (tab Toko) --- */}
      {tab === 'stores' && (
        <div className="related-stores-grid stores-tab-grid">
          {(results.stores || []).map((store) => (
            <StoreCard key={store.id} store={store} onSelectStore={handleSelectStore} />
          ))}
          {!isLoading && !loadError && !(results.stores || []).length && (
            <div className="no-results">
              <p className="no-results-text">Belum ada toko yang sesuai</p>
              <p className="no-results-suggestion">Coba kata kunci lain, misalnya nama toko atau kota.</p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
