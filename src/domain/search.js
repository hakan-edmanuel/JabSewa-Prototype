/*
 * ============================================================================
 * HYBRID SEARCH DATA LAYER — JabSewa (SUPABASE, ERD v2)
 * ============================================================================
 * Skor pencarian tetap di client; SUMBER DATA katalog dari lib/listings
 * (Supabase, RLS-scoped). Kontrak hasil tidak berubah:
 *   SearchResult { query, stores: StoreHit[], items: ItemHit[], totals }
 * Perubahan v2: harga item = price (bigint), id = uuid string.
 * ============================================================================
 */

import { fetchListings, fetchStores } from '../data/listings'

export const SEARCH_PAGE_SIZE = 20
/** Batas atas satu permintaan (tombol "Muat lebih banyak" menaikkan limit). */
export const SEARCH_MAX_LIMIT = 100
const STORE_CAP_ALL = 6

/** Skor kemiripan 0..1: Levenshtein ratio + bigram Dice. */
export function similarity(a, b) {
  const s = (a || '').toLowerCase().trim()
  const t = (b || '').toLowerCase().trim()
  if (!s || !t) return 0
  if (s === t) return 1

  const m = s.length
  const n = t.length
  let prev = new Array(n + 1)
  let curr = new Array(n + 1)
  for (let j = 0; j <= n; j += 1) prev[j] = j
  for (let i = 1; i <= m; i += 1) {
    curr[0] = i
    for (let j = 1; j <= n; j += 1) {
      const cost = s.charCodeAt(i - 1) === t.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    const tmp = prev
    prev = curr
    curr = tmp
  }
  const lev = 1 - prev[n] / Math.max(m, n)

  const bigrams = (str) => {
    const set = new Set()
    for (let i = 0; i < str.length - 1; i += 1) set.add(str.slice(i, i + 2))
    return set
  }
  const bs = bigrams(s)
  const bt = bigrams(t)
  let shared = 0
  bs.forEach((bg) => {
    if (bt.has(bg)) shared += 1
  })
  const dice = bt.size ? (2 * shared) / (bs.size + bt.size) : 0

  return Math.max(0, Math.min(1, lev * 0.6 + dice * 0.4))
}

function escapeRegex(str) {
  return str.replace(/[[\]{}()*+?\\^$.|]/g, '\\$&')
}

/** Skor teks: exact > prefix > word-boundary > substring > fuzzy. */
function textMatchScore(text, query) {
  if (!query) return 0
  const t = (text || '').toLowerCase()
  if (!t) return 0
  let score = 0
  if (t === query) score += 100
  else if (t.startsWith(query)) score += 80
  try {
    if (query && new RegExp(`\\b${escapeRegex(query)}\\b`, 'i').test(t)) score += 65
  } catch {
    // regex gagal (karakter aneh) — lewati komponen word-boundary
  }
  if (t.includes(query)) score += 45
  score += similarity(t, query) * 50
  return score
}

/*
 * Cache katalog singkat. Pencarian menyaring di sisi klien, jadi katalog yang
 * sama dipakai ulang untuk setiap query/tab/halaman berikutnya — tanpa cache,
 * satu sesi menjelajah bisa menembak Supabase puluhan kali. TTL sengaja pendek
 * agar perubahan katalog seller tetap terlihat cepat.
 */
const CATALOG_TTL_MS = 20_000
let catalogCache = { at: 0, data: null, pending: null }

/** Buang cache katalog (dipakai setelah aksi yang mengubah listing). */
export function clearCatalogCache() {
  catalogCache = { at: 0, data: null, pending: null }
}

async function loadCatalog() {
  if (catalogCache.data && Date.now() - catalogCache.at < CATALOG_TTL_MS) {
    return catalogCache.data
  }
  // Permintaan yang sedang berjalan dipakai bersama — bukan diduplikasi.
  if (catalogCache.pending) return catalogCache.pending

  const pending = Promise.all([fetchListings(), fetchStores()])
    .then(([items, stores]) => {
      const data = { items, stores }
      catalogCache = { at: Date.now(), data, pending: null }
      return data
    })
    .catch((err) => {
      catalogCache = { at: 0, data: null, pending: null }
      throw err
    })

  catalogCache = { ...catalogCache, pending }
  return pending
}

function toItemHit(item, storesById, query) {
  const store = storesById.get(item.store_id)
  const nameScore = textMatchScore(item.name, query)
  const descScore = textMatchScore(item.description || '', query) * 0.3
  const catScore = textMatchScore(item.category || '', query) * 0.5
  const score = Math.max(nameScore, descScore + catScore)
  return {
    id: item.id,
    title: item.name,
    description: item.description || '',
    // slug kategori + label dari tabel categories (label tanpa hardcode).
    category: item.category || '',
    category_name: item.category_name || null,
    price_per_day: item.price ?? 0,
    deposit: item.deposit ?? 0,
    image_url: item.image || '',
    location: item.location || store?.city || '',
    available: item.available !== false,
    stock: item.stock ?? 0,
    rental_unit: item.rental_unit || 'day',
    min_rental_duration: item.min_rental_duration ?? null,
    store_id: item.store_id ?? null,
    store_name: item.seller || 'Toko JabSewa',
    score: Math.round(score * 100) / 100,
  }
}

/**
 * Pencarian hybrid — sumber data Supabase (RLS-scoped), scoring di client.
 */
export async function hybridSearch({
  query = '',
  category = null,
  type = 'all',
  page = 1,
  limit = SEARCH_PAGE_SIZE,
}) {
  const q = (query || '').trim().toLowerCase()
  const safeType = ['all', 'items', 'stores'].includes(type) ? type : 'all'
  const safePage = Math.max(1, Number(page) || 1)
  const safeLimit = Math.min(
    Math.max(1, Number(limit) || SEARCH_PAGE_SIZE),
    SEARCH_MAX_LIMIT,
  )

  const { items, stores } = await loadCatalog()
  const storesById = new Map(stores.map((s) => [s.id, s]))

  /** @type {ItemHit[]} */
  const hits = items
    .filter((item) => !category || item.category === category)
    .map((item) => toItemHit(item, storesById, q))
    .filter((hit) => {
      if (!q) return true
      const hay = `${hit.title} ${hit.description} ${hit.category} ${hit.store_name}`.toLowerCase()
      return hay.includes(q) || similarity(hay, q) > 0.3 || (hit.score || 0) >= 25
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0))

  /** @type {StoreHit[]} */
  const storeHits = stores
    .map((store) => {
      const storeItems = hits.filter((it) => it.store_id === store.id)
      const nameScore = textMatchScore(store.store_name, q)
      const descScore = textMatchScore(store.description || '', q) * 0.4
      const cityScore = textMatchScore(store.city || '', q) * 0.5
      const score = Math.max(nameScore, descScore + cityScore) + (storeItems.length ? 10 : 0)
      return {
        id: store.id,
        store_name: store.store_name,
        rating: 0, // kolom rating tidak ada di ERD v2 — agregat review menyusul
        total_items: storeItems.length,
        is_verified: Boolean(store.is_verified),
        city: store.city || '',
        score: Math.round(score * 100) / 100,
      }
    })
    .filter((hit) => !q || (hit.score || 0) > 0)
    .sort((a, b) => (b.score || 0) - (a.score || 0))

  const wantStores = safeType === 'all' || safeType === 'stores'
  const wantItems = safeType === 'all' || safeType === 'items'

  const offset = (safePage - 1) * safeLimit
  return {
    query: query || '',
    stores: wantStores
      ? safeType === 'stores'
        ? storeHits.slice(offset, offset + safeLimit)
        : storeHits.slice(0, STORE_CAP_ALL)
      : [],
    items: wantItems ? hits.slice(offset, offset + safeLimit) : [],
    totals: { stores: storeHits.length, items: hits.length },
  }
}
