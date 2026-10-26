import { useEffect, useMemo, useState } from 'react'
import '../../styles/hybrid-search.css'
import { useAuth } from '../auth/AuthContext'
import { getWishlist, toggleWishlist as persistWishlist } from '../../data/wishlist'
import { hybridSearch, SEARCH_PAGE_SIZE, SEARCH_MAX_LIMIT } from '../../domain/search'
import { formatPrice } from '../../domain/format'
import { RENTAL_UNIT_LABELS } from '../../domain/constants'

/*
 * ============================================================================
 * CONSUMER BROWSER — JabSewa (FITUR 1: integrasi UI pencarian hybrid)
 * ============================================================================
 * - Tab: Semua | Barang | Toko (setara type=all|items|stores).
 * - Tab "Semua": "Toko Terkait" di paling atas (maks 6, jika ada match),
 *   diikuti grid barang — sesuai spesifikasi payload hybridSearch().
 * - Sumber data: lib/search (hybridSearch — Supabase, RLS-scoped).
 * - Wishlist PER-USER, persist di server (rpc get_wishlist / toggle_wishlist);
 *   guest melihat hati lokal (tidak tersimpan) dan diminta masuk saat toggle.
 * ============================================================================
 */

const GUEST_WISHLIST_KEY = 'jabsewa:wishlist:guest'

/**
 * Wishlist tamu (belum login) — hanya penanda hati per perangkat, tidak
 * disinkronkan ke server dan tidak muncul di dashboard. Saat login, sumber
 * kebenaran berpindah ke server (rpc get_wishlist).
 */
function readGuestWishlist() {
  try {
    const raw = window.localStorage.getItem(GUEST_WISHLIST_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function writeGuestWishlist(ids) {
  try {
    window.localStorage.setItem(GUEST_WISHLIST_KEY, JSON.stringify(ids))
  } catch {
    // storage penuh / tidak tersedia — abaikan
  }
}

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
          <p className="listing-category">{item.category_name || item.category}</p>
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
            <small>/{RENTAL_UNIT_LABELS[item.rental_unit] || 'hari'}</small>
          </p>
          <button className="btn-add-cart" disabled={item.available === false} onClick={() => onSelect(item)}>
            {item.available === false ? 'Kosong' : 'Lihat Detail'}
          </button>
        </div>
      </div>
    </article>
  )
}

export default function ConsumerBrowser({ category, search, maxPrice, onSelect }) {
  const { user } = useAuth()
  const [tab, setTab] = useState('all')
  // Jumlah hasil per permintaan — dinaikkan lewat tombol "Muat lebih banyak".
  // `key` mengikat limit ke kombinasi filter aktif: begitu filter berubah,
  // limit otomatis kembali ke default TANPA setState di dalam effect.
  const queryKey = `${search}|${category}|${tab}`
  const [pageState, setPageState] = useState({ key: queryKey, limit: SEARCH_PAGE_SIZE })
  const limit = pageState.key === queryKey ? pageState.limit : SEARCH_PAGE_SIZE
  // Filter toko aktif (dari tombol "Lihat Toko") — null berarti semua toko.
  const [storeFilter, setStoreFilter] = useState(null)
  // Wishlist server-side (user login) atau lokal (guest) — dimuat async.
  const [wishlist, setWishlist] = useState([])
  const [wishBusyId, setWishBusyId] = useState(null)
  const [results, setResults] = useState({ stores: [], items: [], totals: { stores: 0, items: 0 } })
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Muat wishlist: login → rpc get_wishlist (server-scoped); guest → lokal.
  useEffect(() => {
    let active = true
    if (user?.id) {
      getWishlist()
        .then((ids) => {
          if (active) setWishlist(ids)
        })
        .catch(() => {
          if (active) setWishlist([])
        })
    } else {
      // microtask: hindari setState sinkron di body effect (aturan lint proyek)
      Promise.resolve().then(() => {
        if (active) setWishlist(readGuestWishlist())
      })
    }
    return () => {
      active = false
    }
  }, [user?.id])

  // Harga & kategori tetap difilter di sisi client (filter UI berada di
  // ConsumerFilters, di luar scope endpoint pencarian).
  const filteredItems = useMemo(
    () => (results.items || []).filter((item) => item.price_per_day <= maxPrice),
    [results.items, maxPrice],
  )

  // Sumber kebenaran hasil = hybridSearch(query, category, type=tab).
  // isLoading hanya untuk pemuatan awal; saat query berubah hasil lama
  // tetap tampil sampai hasil baru datang (menghindari flicker).
  useEffect(() => {
    let active = true
    hybridSearch({ query: search, category, type: tab, limit })
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
  }, [search, category, tab, limit])

  const toggleWishlist = (id) => {
    if (!user?.id) {
      // Guest: simpan lokal saja (tidak lintas perangkat), tanpa server.
      setWishlist((current) => {
        const next = current.includes(String(id))
          ? current.filter((x) => x !== String(id))
          : [...current, String(id)]
        writeGuestWishlist(next)
        return next
      })
      return
    }
    if (wishBusyId != null) return // cegah toggle ganda saat in-flight
    setWishBusyId(id)
    persistWishlist(id)
      .then((nextIds) => setWishlist(nextIds))
      .catch(() => {
        // Gagal toggle → muat ulang dari server agar state konsisten.
        getWishlist()
          .then(setWishlist)
          .catch(() => {})
      })
      .finally(() => setWishBusyId(null))
  }

  const handleSelect = (item) => {
    // Bentuk kembali item kontrak frontend (ProductDetail) dari ItemHit.
    // Semua field yang dipakai panel sewa WAJIB ikut — tanpa stock/rental_unit
    // detail menampilkan stok 1 dan harga per hari untuk listing mingguan.
    onSelect({
      id: item.id,
      name: item.title,
      category: item.category,
      category_name: item.category_name || null,
      price: item.price_per_day,
      image: item.image_url,
      seller: item.store_name,
      store_id: item.store_id,
      location: item.location,
      available: item.available !== false,
      deposit: item.deposit ?? 0,
      description: item.description || '',
      stock: item.stock ?? 1,
      rental_unit: item.rental_unit || 'day',
      min_rental_duration: item.min_rental_duration ?? null,
    })
  }

  /** Fokus ke toko: grid difilter ke barang milik toko tersebut. */
  const handleSelectStore = (store) => setStoreFilter((cur) => (cur?.id === store.id ? null : store))

  const items = storeFilter
    ? filteredItems.filter((item) => item.store_id === storeFilter.id)
    : filteredItems

  const relatedStores = tab === 'all' ? (results.stores || []).slice(0, 6) : []
  const totalItemHits = results.totals?.items ?? 0
  const hasMoreItems = tab !== 'stores' && totalItemHits > items.length
  const canLoadMore = hasMoreItems && limit < SEARCH_MAX_LIMIT

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

      {canLoadMore && (
        <div className="browser-load-more">
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              setPageState({
                key: queryKey,
                limit: Math.min(limit + SEARCH_PAGE_SIZE, SEARCH_MAX_LIMIT),
              })
            }
          >
            Muat lebih banyak ({totalItemHits - items.length} lagi)
          </button>
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
