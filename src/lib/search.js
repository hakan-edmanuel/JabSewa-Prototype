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

import { fetchListings, fetchStores } from './listings'

export const SEARCH_PAGE_SIZE = 20
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

async function loadCatalog() {
  const [items, stores] = await Promise.all([fetchListings(), fetchStores()])
  return { items, stores }
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
    category: item.category || '',
    price_per_day: item.price ?? 0,
    deposit: item.deposit ?? 0,
    image_url: item.image || '',
    location: item.location || store?.city || '',
    available: item.available !== false,
    rental_unit: item.rental_unit || 'day',
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
  const safeLimit = Math.min(Math.max(1, Number(limit) || SEARCH_PAGE_SIZE), 50)

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

export const hybridSearchLocal = hybridSearch
