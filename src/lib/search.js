/*
 * ============================================================================
 * HYBRID SEARCH DATA LAYER — JabSewa (MODE MOCK / OFFLINE)
 * ============================================================================
 * FITUR 1: Pencarian hybrid (barang + toko) dalam satu query — 100% lokal.
 *
 * Implementasi: filtering + scoring di atas array JavaScript dari
 * LocalStorage (src/lib/storage.js). Tidak ada jaringan, tidak ada RPC.
 *
 * Fungsi utama:
 *   hybridSearch({ query, category, type, page, limit })  — API publik
 *   hybridSearchLocal(keyword, category, type)            — sesuai spesifikasi
 *
 * Skor kecocokan teks (konsep sama dengan versi DB):
 *   exact > prefix > word-boundary > substring > fuzzy (Levenshtein + bigram)
 *
 * Bentuk hasil (kontrak, tidak berubah dari versi sebelumnya):
 *   SearchResult {
 *     query: string
 *     stores: StoreHit[]   // { id, store_name, rating, total_items, is_verified, ... }
 *     items:  ItemHit[]    // { id, title, price_per_day, rating, store_name, ... }
 *     totals: { stores: number, items: number }
 *   }
 * ============================================================================
 */

import { getItems, getStores } from './storage'

/* -------------------------------------------------------------------------- */
/* Bentuk data (dokumentasi kontrak via JSDoc)                                */
/* -------------------------------------------------------------------------- */

/**
 * @typedef {Object} StoreHit
 * @property {string|number} id
 * @property {string} store_name
 * @property {string=} username
 * @property {number} rating
 * @property {number} total_items
 * @property {boolean} is_verified
 * @property {string=} city
 * @property {number=} score
 */

/**
 * @typedef {Object} ItemHit
 * @property {string|number} id
 * @property {string} title
 * @property {string=} description
 * @property {string=} category
 * @property {number} price_per_day
 * @property {string=} image_url
 * @property {string=} location
 * @property {boolean=} available
 * @property {number} rating
 * @property {number=} successful_transactions
 * @property {string=} store_name
 * @property {number=} score
 */

/**
 * @typedef {Object} SearchResult
 * @property {string} query
 * @property {StoreHit[]} stores
 * @property {ItemHit[]} items
 * @property {{ stores: number, items: number }} totals
 */

/** @typedef {'all'|'items'|'stores'} SearchType */

export const SEARCH_PAGE_SIZE = 20
// Batas kartu toko di tab "Semua" — sama dengan versi RPC sebelumnya.
const STORE_CAP_ALL = 6

/* -------------------------------------------------------------------------- */
/* Util fuzzy                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Skor kemiripan 0..1 dua string: gabungan Levenshtein ratio & n-gram.
 * Cukup akurat untuk typo ringan ("kameera" → "kamera").
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function similarity(a, b) {
  const s = (a || '').toLowerCase().trim()
  const t = (b || '').toLowerCase().trim()
  if (!s || !t) return 0
  if (s === t) return 1

  // Levenshtein ratio
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

  // Bigram (Dice coefficient) — menangkap kemiripan kata panjang.
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

/** Query ter-escape untuk regex word-boundary. */
function escapeRegex(str) {
  return str.replace(/[[\]{}()*+?\\^$.|]/g, '\\$&')
}

/**
 * Skor kecocokan query terhadap satu teks — konsep sama dengan versi DB:
 * exact > prefix > word-boundary > substring > fuzzy.
 * @param {string} text
 * @param {string} query  — sudah lowercased
 * @returns {number}
 */
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

/* -------------------------------------------------------------------------- */
/* Pencarian lokal (satu-satunya mode — array filtering & scoring)            */
/* -------------------------------------------------------------------------- */

/** Skor item = text match (judul > deskripsi > tag > kategori) + rating + popularitas. */
function toItemHit(item, store, query) {
  const nameScore = textMatchScore(item.title, query)
  const descScore = textMatchScore(item.description || '', query) * 0.3
  const tagScore = (item.tags || []).reduce((max, tag) => Math.max(max, textMatchScore(tag, query)), 0) * 0.7
  const catScore = textMatchScore(item.category || '', query) * 0.5
  const rating = typeof item.rating === 'number' ? item.rating : 0
  const transactions = Number(item.total_transactions ?? 0)
  const score =
    Math.max(nameScore, descScore + tagScore + catScore) +
    (rating / 5) * 20 +
    Math.min(transactions, 100) / 100 * 20
  return {
    id: item.id,
    title: item.title,
    description: item.description || '',
    category: item.category || '',
    price_per_day: item.price_per_day ?? 0,
    deposit: item.deposit ?? 0,
    image_url: item.image_url || '',
    location: item.location || store?.city || '',
    available: item.available !== false,
    rating,
    successful_transactions: transactions,
    store_id: item.store_id ?? null,
    store_name: store?.name || 'Mitra JabSewa',
    score: Math.round(score * 100) / 100,
  }
}

/**
 * Pencarian hybrid lokal — FILTERING & SCORING atas array items + stores.
 * @param {string} keyword   — kata kunci pencarian ('' berarti semua)
 * @param {string|null} category — filter kategori (id katalog) atau null
 * @param {SearchType} type  — 'all' | 'items' | 'stores'
 * @param {number} [page]
 * @param {number} [limit]
 * @returns {SearchResult}
 */
export function hybridSearchLocal(keyword, category = null, type = 'all', page = 1, limit = SEARCH_PAGE_SIZE) {
  const q = (keyword || '').trim().toLowerCase()
  const safeType = ['all', 'items', 'stores'].includes(type) ? type : 'all'
  const safePage = Math.max(1, Number(page) || 1)
  const safeLimit = Math.min(Math.max(1, Number(limit) || SEARCH_PAGE_SIZE), 50)

  const stores = getStores()
  const storesById = new Map(stores.map((s) => [s.id, s]))

  /** @type {ItemHit[]} */
  const items = (getItems() || [])
    .filter((item) => !category || item.category === category)
    .map((item) => toItemHit(item, storesById.get(item.store_id), q))
    .filter((hit) => {
      if (!q) return true
      const hay = `${hit.title} ${hit.description} ${hit.category} ${hit.store_name}`.toLowerCase()
      return hay.includes(q) || similarity(hay, q) > 0.3 || (hit.score || 0) >= 25
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0))

  // Toko dinilai dari nama + deskripsi + kota, dan diperkaya jumlah barangnya.
  /** @type {StoreHit[]} */
  const allStores = stores
    .map((store) => {
      const storeItems = items.filter((it) => it.store_id === store.id)
      const nameScore = textMatchScore(store.name, q)
      const descScore = textMatchScore(store.description || '', q) * 0.4
      const cityScore = textMatchScore(store.city || '', q) * 0.5
      const score =
        Math.max(nameScore, descScore + cityScore) +
        (Number(store.rating) || 0) / 5 * 20 +
        (storeItems.length ? 10 : 0)
      return {
        id: store.id,
        store_name: store.name,
        username: store.owner_name || '',
        rating: Number(store.rating) || 0,
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
    query: keyword || '',
    stores: wantStores
      ? safeType === 'stores'
        ? allStores.slice(offset, offset + safeLimit)
        : allStores.slice(0, STORE_CAP_ALL)
      : [],
    items: wantItems ? items.slice(offset, offset + safeLimit) : [],
    totals: { stores: allStores.length, items: items.length },
  }
}

/* -------------------------------------------------------------------------- */
/* API publik                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Pencarian hybrid utama — kontrak sama dengan versi Supabase/RPC sebelumnya.
 * Setara GET /api/search?q=&category=&type=&page=&limit= (kini lokal penuh).
 * @param {Object} opts
 * @param {string} [opts.query]
 * @param {string|null} [opts.category]
 * @param {SearchType} [opts.type]
 * @param {number} [opts.page]
 * @param {number} [opts.limit]
 * @returns {Promise<SearchResult>}
 */
export async function hybridSearch({
  query = '',
  category = null,
  type = 'all',
  page = 1,
  limit = SEARCH_PAGE_SIZE,
}) {
  return hybridSearchLocal(query, category, type, page, limit)
}
