/*
 * ============================================================================
 * STORAGE UPLOAD HELPER — JabSewa (Supabase Storage)
 * ============================================================================
 * Satu-satunya tempat yang menyentuh Supabase Storage (bucket images/proofs).
 * Semua path deterministik & namespaced — TIDAK ada nama file user di path
 * (mencegah collision & sanitasi nama file):
 *
 *   listing-images (PUBLIC bucket — foto katalog, sejajar listing_images_read):
 *     listings/{listing_id}/{uuid}.{ext}
 *     → akses: getPublicUrl (anon boleh membaca katalog, seperti katalog DB)
 *
 *   payment-proofs (PRIVATE bucket — bukti transfer, sejajar payments_select):
 *     proofs/{rental_id}/{uuid}.{ext}
 *     → akses: createSignedUrl TTL 15 menit (buyer/owner toko/admin via policy
 *       storage; lihat migration 20260928000000_storage_buckets_policies.sql)
 *
 * Ownership DITETAPKAN SERVER (storage policy membandingkan segmen id di path
 * dengan stores.owner_id / rental_transactions.buyer_id dari sesi) — client
 * tidak bisa menulis ke namespace milik user lain meski path diubah manual.
 *
 * Validasi client-side (UX saja, bukan security boundary):
 *   - tipe: image/jpeg | image/png | image/webp
 *   - ukuran maks: 3 MB
 * Tidak ada secret di modul ini; hanya anon key publik dari supabaseClient.
 * ============================================================================
 */

import { getClient, isSupabaseConfigured } from './supabaseClient'

export const LISTING_IMAGES_BUCKET = 'listing-images'
export const PAYMENT_PROOFS_BUCKET = 'payment-proofs'

export const IMAGE_MAX_BYTES = 3 * 1024 * 1024 // 3 MB
export const IMAGE_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
/** Batas foto per listing (frontend; server save_listing menampung array penuh). */
export const MAX_LISTING_IMAGES = 5

const SIGNED_URL_TTL_SECONDS = 900 // 15 menit — cukup untuk sesi verifikasi

/** UUID v4 — crypto.randomUUID (browser modern) dengan fallback deterministik. */
function randomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback saja (environment tanpa crypto.randomUUID) — tetap unik cukup.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`
}

/**
 * Ekstensi file DARI MIME type (bukan dari nama file user — nama user tidak
 * pernah dipakai di path). Tipe tidak dikenal → null (ditolak validasi).
 */
export function imageExtensionFromMime(mime) {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    default:
      return null
  }
}

/**
 * Validasi file gambar (client-side UX). Mengembalikan string pesan error
 * Indonesia, atau null bila valid.
 */
export function validateImageFile(file, maxBytes = IMAGE_MAX_BYTES, allowedTypes = IMAGE_ALLOWED_TYPES) {
  if (!file) return 'Pilih file gambar terlebih dahulu.'
  if (!allowedTypes.includes(file.type)) {
    return 'Format tidak didukung. Gunakan JPG, PNG, atau WebP.'
  }
  if (file.size > maxBytes) {
    return `Ukuran file maksimal ${Math.round(maxBytes / (1024 * 1024))} MB.`
  }
  return null
}

/** Path listing image: listings/{listing_id}/{uuid}.{ext} */
export function buildListingImagePath(listingId, file) {
  const ext = imageExtensionFromMime(file?.type)
  if (!ext) throw new Error('Format gambar tidak didukung. Gunakan JPG, PNG, atau WebP.')
  if (!/^[0-9a-fA-F-]{36}$/.test(String(listingId || ''))) {
    throw new Error('Simpan barang terlebih dahulu sebelum mengunggah foto.')
  }
  return `listings/${listingId}/${randomId()}.${ext}`
}

/** Path bukti pembayaran: proofs/{rental_id}/{uuid}.{ext} */
export function buildPaymentProofPath(rentalId, file) {
  const ext = imageExtensionFromMime(file?.type)
  if (!ext) throw new Error('Format gambar tidak didukung. Gunakan JPG, PNG, atau WebP.')
  if (!/^[0-9a-fA-F-]{36}$/.test(String(rentalId || ''))) {
    throw new Error('Transaksi tidak valid.')
  }
  return `proofs/${rentalId}/${randomId()}.${ext}`
}

/** URL eksternal (http/https) — bukan path storage (mis. bukti URL manual lama). */
export function isExternalUrl(value) {
  return /^https?:\/\//i.test(String(value || ''))
}

/** Pesan error Supabase Storage → bahasa Indonesia (client-facing). */
function translateStorageError(err) {
  const msg = String(err?.message || err || '')
  if (/row-level security/i.test(msg)) {
    return 'Upload ditolak: kamu tidak punya akses ke lokasi ini.'
  }
  if (/exceeded the maximum allowed size|Payload Too Large/i.test(msg)) {
    return 'Ukuran file melebihi batas server.'
  }
  if (/InvalidInput|invalid input|mime type/i.test(msg)) {
    return 'Format file tidak didukung.'
  }
  if (/Bucket not found/i.test(msg)) {
    return 'Storage belum disiapkan. Hubungi operator (setup bucket).'
  }
  if (/Duplicate/i.test(msg)) {
    return 'File sudah ada. Coba unggah ulang.'
  }
  return `Upload gagal: ${msg || 'kesalahan tidak diketahui'}`
}

function requireConfigured() {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase belum dikonfigurasi: isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di .env.local',
    )
  }
}

/**
 * Upload foto listing (public bucket). Harus dipanggil SETELAH listing tersimpan
 * (butuh listing_id dari RPC save_listing — namespace policy mengikat listing
 * ke toko milik sesi).
 * @returns {Promise<{path: string, publicUrl: string}>}
 */
export async function uploadListingImage(listingId, file) {
  requireConfigured()
  const invalid = validateImageFile(file)
  if (invalid) throw new Error(invalid)
  const path = buildListingImagePath(listingId, file)
  const { error } = await getClient()
    .storage.from(LISTING_IMAGES_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type })
  if (error) throw new Error(translateStorageError(error))
  const { data } = getClient().storage.from(LISTING_IMAGES_BUCKET).getPublicUrl(path)
  return { path, publicUrl: data?.publicUrl || '' }
}

/**
 * Upload bukti pembayaran (private bucket). Mengembalikan PATH storage —
 * disimpan ke payments.payment_proof_url via RPC submit_payment; akses baca
 * lewat signed URL (getPaymentProofUrl), bukan public URL.
 * @returns {Promise<{path: string}>}
 */
export async function uploadPaymentProof(rentalId, file) {
  requireConfigured()
  const invalid = validateImageFile(file)
  if (invalid) throw new Error(invalid)
  const path = buildPaymentProofPath(rentalId, file)
  const { error } = await getClient()
    .storage.from(PAYMENT_PROOFS_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type })
  if (error) throw new Error(translateStorageError(error))
  return { path }
}

/**
 * Signed URL untuk path bukti (TTL 15 menit) — hanya berhasil bila sesi punya
 * hak baca (buyer pemilik / owner toko / admin — storage policy). URL eksternal
 * (http/https, dari input manual lama) dikembalikan apa adanya.
 * Gagal (tanpa akses/path invalid) → null; pemanggil menampilkan fallback link.
 * @returns {Promise<string|null>}
 */
export async function getPaymentProofUrl(value, expiresIn = SIGNED_URL_TTL_SECONDS) {
  if (!value) return null
  if (isExternalUrl(value)) return value
  requireConfigured()
  try {
    const { data, error } = await getClient()
      .storage.from(PAYMENT_PROOFS_BUCKET)
      .createSignedUrl(value, expiresIn)
    if (error || !data?.signedUrl) return null
    return data.signedUrl
  } catch {
    return null
  }
}
