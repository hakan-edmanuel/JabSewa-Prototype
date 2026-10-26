/*
 * ============================================================================
 * UNIT TESTS — HYBRID SEARCH (kode produksi, data layer di-mock)
 * ============================================================================
 * Menguji src/lib/search.js: skor kemiripan, filter kategori, tipe hasil,
 * batas limit, dan pagination. Sumber data (Supabase) di-mock supaya test
 * murni dan cepat — bukan menguji jaringan.
 * ============================================================================
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

const LISTINGS = [
  {
    id: 'l1',
    name: 'Kamera Sony A7 III',
    description: 'Full frame mirrorless',
    category: 'photography',
    category_name: 'Fotografi',
    price: 150000,
    deposit: 500000,
    image: 'kamera.jpg',
    location: 'Jakarta Utara',
    available: true,
    stock: 3,
    rental_unit: 'day',
    min_rental_duration: 2,
    store_id: 's1',
    seller: 'Toko Kamera Jaya',
  },
  {
    id: 'l2',
    name: 'Tenda Kapasitas 4 Orang',
    description: 'Tenda camping anti hujan',
    category: 'camping',
    category_name: 'Outdoor',
    price: 90000,
    deposit: 0,
    image: 'tenda.jpg',
    location: 'Bandung',
    available: false,
    stock: 0,
    rental_unit: 'week',
    min_rental_duration: null,
    store_id: 's1',
    seller: 'Toko Kamera Jaya',
  },
]

const STORES = [
  {
    id: 's1',
    store_name: 'Toko Kamera Jaya',
    description: 'Spesialis kamera',
    city: 'Jakarta Utara',
    is_verified: true,
  },
  {
    id: 's2',
    store_name: 'Tenda Supply',
    description: 'Peralatan outdoor',
    city: 'Bandung',
    is_verified: false,
  },
]

vi.mock('../data/listings', () => ({
  fetchListings: vi.fn(async () => LISTINGS),
  fetchStores: vi.fn(async () => STORES),
}))

const {
  hybridSearch,
  similarity,
  clearCatalogCache,
  SEARCH_PAGE_SIZE,
  SEARCH_MAX_LIMIT,
} = await import('./search')

beforeEach(() => {
  vi.clearAllMocks()
  // Katalog di-cache di level modul — tiap test mulai dari cache kosong agar
  // mock fetchListings/fetchStores yang baru benar-benar dipakai.
  clearCatalogCache()
})

describe('similarity — skor kemiripan teks 0..1', () => {
  it('teks identik = 1, tidak terkait mendekati 0', () => {
    expect(similarity('kamera', 'kamera')).toBe(1)
    expect(similarity('kamera', 'tenda')).toBeLessThan(0.35)
  })

  it('input kosong = 0', () => {
    expect(similarity('', 'kamera')).toBe(0)
    expect(similarity(null, 'kamera')).toBe(0)
  })

  it('toleran salah ketik ringan', () => {
    expect(similarity('kamra', 'kamera')).toBeGreaterThan(0.5)
  })
})

describe('hybridSearch — filter & bentuk hasil', () => {
  it('tanpa query mengembalikan semua barang + toko terkait', async () => {
    const res = await hybridSearch({})
    expect(res.items).toHaveLength(2)
    expect(res.stores).toHaveLength(2)
    expect(res.totals).toEqual({ stores: 2, items: 2 })
  })

  it('item hit membawa field yang dibutuhkan panel sewa (stock/unit/min duration)', async () => {
    const res = await hybridSearch({ query: 'kamera' })
    expect(res.items[0]).toMatchObject({
      id: 'l1',
      title: 'Kamera Sony A7 III',
      category_name: 'Fotografi',
      stock: 3,
      rental_unit: 'day',
      min_rental_duration: 2,
      store_id: 's1',
    })
  })

  it('filter kategori memakai slug dari tabel categories', async () => {
    const res = await hybridSearch({ category: 'camping' })
    expect(res.items.map((i) => i.id)).toEqual(['l2'])
  })

  it('type=items tidak mengembalikan toko, type=stores tidak mengembalikan barang', async () => {
    expect((await hybridSearch({ type: 'items' })).stores).toEqual([])
    expect((await hybridSearch({ type: 'stores' })).items).toEqual([])
  })

  it('query tanpa hasil → daftar kosong, totals nol', async () => {
    const res = await hybridSearch({ query: 'zzzzzz' })
    expect(res.items).toEqual([])
    expect(res.totals.items).toBe(0)
  })

  it('mencocokkan nama toko dan kota untuk tab toko', async () => {
    const res = await hybridSearch({ query: 'bandung', type: 'stores' })
    expect(res.stores.map((s) => s.id)).toContain('s2')
    expect(res.stores[0].rating).toBe(0) // belum ada agregat review
  })
})

describe('hybridSearch — limit & pagination', () => {
  it('default limit sesuai SEARCH_PAGE_SIZE', async () => {
    expect(SEARCH_PAGE_SIZE).toBeGreaterThan(0)
    const res = await hybridSearch({})
    expect(res.items.length).toBeLessThanOrEqual(SEARCH_PAGE_SIZE)
  })

  it('limit di atas batas dipotong ke SEARCH_MAX_LIMIT', async () => {
    const res = await hybridSearch({ limit: 9999 })
    expect(res.items.length).toBeLessThanOrEqual(SEARCH_MAX_LIMIT)
  })

  it('halaman kedua tidak mengulang item halaman pertama', async () => {
    const many = Array.from({ length: 4 }, (_, i) => ({
      ...LISTINGS[0],
      id: `l${i + 10}`,
      name: `Kamera ${i}`,
    }))
    const { fetchListings } = await import('../data/listings')
    fetchListings.mockResolvedValue(many)

    try {
      // Query harus cocok dengan semua item agar pagination yang diuji,
      // bukan penyaringan teks.
      const page1 = await hybridSearch({ query: 'kamera', limit: 2, page: 1 })
      const page2 = await hybridSearch({ query: 'kamera', limit: 2, page: 2 })
      const overlap = page1.items.filter((a) => page2.items.some((b) => b.id === a.id))
      expect(page1.items).toHaveLength(2)
      expect(page2.items).toHaveLength(2)
      expect(overlap).toEqual([])
    } finally {
      fetchListings.mockResolvedValue(LISTINGS)
    }
  })

  it('page tidak valid diperlakukan sebagai halaman 1', async () => {
    const res = await hybridSearch({ page: 0 })
    expect(res.items.length).toBeGreaterThan(0)
  })
})

describe('hybridSearch — cache katalog', () => {
  it('pencarian beruntun memakai satu kali fetch katalog', async () => {
    const { fetchListings, fetchStores } = await import('../data/listings')

    await hybridSearch({ query: 'kamera' })
    await hybridSearch({ query: 'tenda' })
    await hybridSearch({ query: 'tenda', type: 'stores' })

    expect(fetchListings).toHaveBeenCalledTimes(1)
    expect(fetchStores).toHaveBeenCalledTimes(1)
  })

  it('clearCatalogCache memaksa pengambilan ulang', async () => {
    const { fetchListings } = await import('../data/listings')

    await hybridSearch({})
    clearCatalogCache()
    await hybridSearch({})

    expect(fetchListings).toHaveBeenCalledTimes(2)
  })
})
