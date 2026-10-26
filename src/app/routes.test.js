/*
 * ============================================================================
 * ROUTES — tes keputusan navigasi (murni, tanpa DOM)
 * ============================================================================
 * Regresi yang dijaga:
 *   1. Membuka katalog tanpa itemId harus MERESET item detail — dulu detail
 *      barang terakhir ikut terbuka lagi saat pengguna kembali ke katalog.
 *   2. Navigasi setelah login memakai `replace` supaya tombol back tidak
 *      mengembalikan pengguna ke form login yang sudah lewat.
 * ============================================================================
 */

import { describe, expect, it } from 'vitest'
import {
  ADMIN_PAGE,
  NOT_FOUND_PAGE,
  getGuardTarget,
  getPageFromPath,
  planNavigation,
  pathForPage,
  resolveIntentDestination,
} from './routes'

describe('planNavigation', () => {
  it('katalog tanpa itemId → itemId null (detail lama tidak dibuka lagi)', () => {
    expect(planNavigation('consumer')).toEqual({
      url: '/consumer',
      itemId: null,
      replace: false,
    })
  })

  it('katalog dengan itemId meneruskan id barang', () => {
    const plan = planNavigation('consumer', { itemId: 'listing-1' })
    expect(plan.itemId).toBe('listing-1')
    expect(plan.url).toBe('/consumer')
  })

  it('halaman non-katalog tidak menyentuh state item katalog', () => {
    expect(planNavigation('buyer').itemId).toBeUndefined()
  })

  it('replace diteruskan dan tidak bocor ke pathForPage', () => {
    const plan = planNavigation('auth', { mode: 'login', replace: true })
    expect(plan).toEqual({ url: '/login', itemId: undefined, replace: true })
  })
})

describe('route → halaman & guard', () => {
  it('subtree admin dipetakan ke satu halaman', () => {
    expect(getPageFromPath('/sys-control-jab')).toBe(ADMIN_PAGE)
    expect(getPageFromPath('/sys-control-jab/users')).toBe(ADMIN_PAGE)
  })

  it('path tidak dikenal → not-found; pathForPage selalu mengembalikan path valid', () => {
    expect(getPageFromPath('/tidak-ada')).toBe(NOT_FOUND_PAGE)
    expect(pathForPage('tidak-ada')).toBe('/')
  })

  it('halaman butuh login membawa intent tujuannya', () => {
    expect(getGuardTarget('buyer')).toBe('buyer')
    expect(getGuardTarget('seller')).toBe('seller')
    expect(getGuardTarget('consumer')).toBeNull()
  })

  it('intent seller diarahkan ke onboarding atau dashboard sesuai status toko', () => {
    expect(resolveIntentDestination({ page: 'seller' }, { isSeller: false }).page).toBe(
      'seller-onboarding',
    )
    expect(resolveIntentDestination({ page: 'seller' }, { isSeller: true }).page).toBe('seller')
  })
})
