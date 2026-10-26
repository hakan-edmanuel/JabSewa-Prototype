/*
 * ============================================================================
 * REGRESSION TESTS — STORAGE UPLOAD HELPER (vitest, tanpa jaringan)
 * ============================================================================
 * Menguji kontrak murni src/lib/uploads.js (fungsi tanpa side-effect):
 *   - validasi tipe/ukuran gambar (client-side UX, bukan security boundary),
 *   - pembentukan path namespaced yang DIPATUHAKAN storage policy
 *     (migration 20260928000000_storage_buckets_policies.sql):
 *       listing-images : listings/{listing_id}/{uuid}.{ext}
 *       payment-proofs : proofs/{rental_id}/{uuid}.{ext}
 *   - deteksi URL eksternal (kompatibilitas input manual lama),
 *   - resolusi ekstensi dari MIME (nama file user TIDAK dipakai di path).
 *
 * Yang TIDAK bisa diuji unit (butuh project live): RLS/policy storage, signed
 * URL TTL, dan penolakan upload lintas-namespace — lihat report manual test.
 * ============================================================================
 */

import { describe, expect, it } from 'vitest'
import {
  buildListingImagePath,
  buildPaymentProofPath,
  imageExtensionFromMime,
  isExternalUrl,
  validateImageFile,
  IMAGE_MAX_BYTES,
  LISTING_IMAGES_BUCKET,
  PAYMENT_PROOFS_BUCKET,
} from './uploads'

const LISTING_ID = '11111111-1111-4111-8111-111111111111'
const RENTAL_ID = '22222222-2222-4222-8222-222222222222'

describe('validateImageFile (client-side UX)', () => {
  it('menerima jpg/png/webp dalam batas ukuran', () => {
    expect(validateImageFile({ type: 'image/jpeg', size: 1024 })).toBeNull()
    expect(validateImageFile({ type: 'image/png', size: IMAGE_MAX_BYTES })).toBeNull()
    expect(validateImageFile({ type: 'image/webp', size: 1 })).toBeNull()
  })

  it('menolak tipe di luar allowlist (termasuk gif & pdf)', () => {
    expect(validateImageFile({ type: 'image/gif', size: 10 })).toMatch(/Format tidak didukung/)
    expect(validateImageFile({ type: 'application/pdf', size: 10 })).toMatch(/Format tidak didukung/)
  })

  it('menolak file melebihi batas ukuran', () => {
    expect(validateImageFile({ type: 'image/jpeg', size: IMAGE_MAX_BYTES + 1 })).toMatch(
      /maksimal/,
    )
  })

  it('menolak file kosong', () => {
    expect(validateImageFile(null)).toMatch(/Pilih file/)
  })
})

describe('path namespaced (kontrak storage policy)', () => {
  it('listing: listings/{listing_id}/{uuid}.ext — 3 segmen, id di segmen 2, nama user tidak dipakai', () => {
    const path = buildListingImagePath(LISTING_ID, { type: 'image/jpeg' })
    const seg = path.split('/')
    expect(seg).toHaveLength(3)
    expect(seg[0]).toBe('listings')
    expect(seg[1]).toBe(LISTING_ID)
    expect(seg[2]).toMatch(/^[0-9a-f-]{36}\.jpg$/)
    expect(path).not.toContain('nama-file-user')
  })

  it('proof: proofs/{rental_id}/{uuid}.ext — bucket private, buyer di-resolve policy', () => {
    const path = buildPaymentProofPath(RENTAL_ID, { type: 'image/png' })
    const seg = path.split('/')
    expect(seg).toHaveLength(3)
    expect(seg[0]).toBe('proofs')
    expect(seg[1]).toBe(RENTAL_ID)
    expect(seg[2]).toMatch(/\.png$/)
  })

  it('menolak listing_id/rental_id yang bukan uuid (namespace harus valid untuk policy)', () => {
    expect(() => buildListingImagePath('abc', { type: 'image/jpeg' })).toThrow(/Simpan barang/)
    expect(() => buildListingImagePath('', { type: 'image/jpeg' })).toThrow(/Simpan barang/)
    expect(() => buildPaymentProofPath('../escape', { type: 'image/jpeg' })).toThrow(
      /Transaksi tidak valid/,
    )
  })

  it('menolak tipe file tanpa ekstensi yang dikenal', () => {
    expect(() => buildListingImagePath(LISTING_ID, { type: 'image/gif' })).toThrow(
      /Format gambar tidak didukung/,
    )
  })

  it('path unik untuk pemanggilan berulang (hindari collision — upsert false)', () => {
    const a = buildPaymentProofPath(RENTAL_ID, { type: 'image/jpeg' })
    const b = buildPaymentProofPath(RENTAL_ID, { type: 'image/jpeg' })
    expect(a).not.toBe(b)
  })

  it('konstanta bucket sesuai migration', () => {
    expect(LISTING_IMAGES_BUCKET).toBe('listing-images')
    expect(PAYMENT_PROOFS_BUCKET).toBe('payment-proofs')
  })
})

describe('isExternalUrl (kompatibilitas URL manual lama)', () => {
  it('http/https → true; path storage → false', () => {
    expect(isExternalUrl('https://contoh.id/bukti.png')).toBe(true)
    expect(isExternalUrl('http://contoh.id/bukti.png')).toBe(true)
    expect(isExternalUrl('proofs/' + RENTAL_ID + '/abc.jpg')).toBe(false)
    expect(isExternalUrl('')).toBe(false)
    expect(isExternalUrl(null)).toBe(false)
  })
})

describe('imageExtensionFromMime (dari MIME, bukan nama file user)', () => {
  it('memetakan jpeg/png/webp; lainnya null', () => {
    expect(imageExtensionFromMime('image/jpeg')).toBe('jpg')
    expect(imageExtensionFromMime('image/png')).toBe('png')
    expect(imageExtensionFromMime('image/webp')).toBe('webp')
    expect(imageExtensionFromMime('image/gif')).toBeNull()
    expect(imageExtensionFromMime(undefined)).toBeNull()
  })
})
