/*
 * ============================================================================
 * USER DATA LAYER — wishlist & rental — JabSewa (SUPABASE, ERD v2)
 * ============================================================================
 * Supabase adalah SUMBER KEBENARAN. Semua tulisan lewat RPC (server-side
 * validation & pricing); pembacaan rental via direct SELECT (RLS-scoped).
 *
 * Kontrak Rental (bentuk untuk komponen):
 *   { id (uuid), created_at, start_date, end_date, total_days,
 *     status, cancel_reason, subtotal, deposit_total, total, late_fee_total,
 *     store_name, buyer_name, items: [{ listing_id, name, image, quantity, price, deposit, subtotal }] }
 * ============================================================================
 */

import { getClient, isSupabaseConfigured } from './supabaseClient'
import { translateServerError } from '../domain/constants'
import { countRentalDays } from '../domain/rentalMath'

function requireConfigured() {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase belum dikonfigurasi: isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di .env.local')
  }
}

/* ------------------------------- RENTALS --------------------------------- */

const RENTALS_SELECT = `
  id, store_id, status, start_date, end_date, subtotal, deposit_total, total,
  late_fee_total, actual_return_date, cancel_reason, created_at,
  stores(name),
  transaction_items(id, listing_id, quantity, price, deposit, subtotal,
    listings(name, listing_images(image_url, sort_order)))
`

/** Normalisasi baris rental + items ke bentuk kontrak frontend. */
function normalizeRental(row) {
  const items = (row.transaction_items || []).map((ti) => {
    const imgs = (ti.listings?.listing_images || [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
    return {
      id: ti.id,
      listing_id: ti.listing_id,
      name: ti.listings?.name || 'Barang dihapus',
      image:
        imgs[0]?.image_url || '',
      quantity: ti.quantity,
      price: ti.price,
      deposit: ti.deposit,
      subtotal: ti.subtotal,
    }
  })
  return {
    id: row.id,
    created_at: row.created_at,
    start_date: row.start_date,
    end_date: row.end_date,
    total_days: countRentalDays(row.start_date, row.end_date),
    status: row.status,
    cancel_reason: row.cancel_reason || null,
    actual_return_date: row.actual_return_date || null,
    subtotal: row.subtotal,
    deposit_total: row.deposit_total,
    total: row.total,
    late_fee_total: row.late_fee_total || 0,
    store_name: row.stores?.name || 'Toko JabSewa',
    buyer_name: null,
    items,
  }
}

/**
 * Transaksi rental yang TERLIHAT oleh sesi — scope dari RLS, bukan argumen:
 *   - penyewa : transaksi miliknya
 *   - seller  : transaksi masuk ke toko miliknya
 *   - admin   : semua baris
 * Satu fungsi untuk ketiga peran; sebelumnya ada empat fungsi query identik
 * dengan nama berbeda (getRentals / getRentalsByStore / getAllRentals /
 * getRentalsByStatuses) yang menyiratkan scoping yang tidak ada.
 *
 * @param {{ statuses?: string[] }} [options] filter opsional di sisi query
 */
export async function listRentals({ statuses = null } = {}) {
  requireConfigured()
  const filter = (statuses || []).filter(Boolean)
  if (statuses && !filter.length) return []

  let query = getClient()
    .from('rental_transactions')
    .select(RENTALS_SELECT)
    .order('created_at', { ascending: false })
  if (filter.length) query = query.in('status', filter)

  const { data, error } = await query
  if (error) throw error
  return (data || []).map(normalizeRental)
}

/**
 * Kutipan harga server-side (multi-item satu toko).
 * @param {{ startDate, endDate, items: [{listing_id, quantity}] }} params
 */
export async function quoteRental({ startDate, endDate, items }) {
  requireConfigured()
  const { data, error } = await getClient().rpc('quote_rental', {
    p_start: startDate,
    p_end: endDate,
    p_items: items,
  })
  if (error) throw error
  const row = data?.[0]
  if (!row) throw new Error('empty_items')
  return {
    ok: Boolean(row.ok),
    error: row.error || null,
    total_days: row.total_days == null ? null : Number(row.total_days),
    subtotal: row.subtotal == null ? null : Number(row.subtotal),
    deposit_total: row.deposit_total == null ? null : Number(row.deposit_total),
    total: row.total == null ? null : Number(row.total),
    items: row.items || [],
  }
}

/**
 * Kirim permintaan sewa (cart satu toko). Harga & validasi dari server.
 * @returns {Promise<{id, status, total}>}
 */
export async function addRental({ startDate, endDate, items }) {
  requireConfigured()
  const { data, error } = await getClient().rpc('create_rental', {
    p_start: startDate,
    p_end: endDate,
    p_items: items,
  })
  if (error) throw error
  const row = data?.[0]
  if (!row?.ok) throw new Error(row?.error || 'quote_failed')
  return {
    id: row.rental_id,
    status: row.status,
    total: Number(row.total ?? 0),
  }
}

/**
 * Batalkan rental (buyer: pending/payment_verify; owner: s.d. confirmed).
 */
export async function cancelRental(rentalId, reason = '') {
  requireConfigured()
  const { data, error } = await getClient().rpc('cancel_rental', {
    p_rental_id: rentalId,
    p_reason: reason,
  })
  if (error) throw error
  const row = data?.[0]
  if (!row?.ok) throw new Error(row?.error || 'illegal_transition')
  return { id: rentalId, status: row.status }
}

/**
 * Kirim bukti pembayaran untuk rental berstatus pending.
 * @param {{ method, proofUrl, externalReference? }} opts
 */
export async function submitPayment(rentalId, { method = 'bank_transfer', proofUrl, externalReference = null } = {}) {
  requireConfigured()
  const { data, error } = await getClient().rpc('submit_payment', {
    p_rental_id: rentalId,
    p_method: method,
    p_proof_url: proofUrl,
    p_external_reference: externalReference,
  })
  if (error) throw error
  const row = data?.[0]
  if (!row?.ok) throw new Error(row?.error || 'proof_required')
  return { paymentId: row.payment_id, status: row.status }
}

/**
 * Verifikasi (owner/admin) bukti pembayaran: setujui → confirmed; tolak → tx
 * kembali PENDING (bukan cancelled — CATATAN-K; payment jadi failed) agar buyer
 * dapat mengirim bukti ulang. Note wajib saat menolak (server: reason_required).
 */
export async function decidePayment(paymentId, approve, note = '') {
  requireConfigured()
  const { data, error } = await getClient().rpc('decide_payment', {
    p_payment_id: paymentId,
    p_approve: Boolean(approve),
    p_note: note,
  })
  if (error) throw error
  const row = data?.[0]
  if (!row?.ok) throw new Error(row?.error || 'forbidden')
  return { txStatus: row.tx_status }
}

/**
 * Pembayaran satu transaksi (RLS-scoped: buyer/owner/admin sesuai matrix).
 * Buyer memakai ini untuk melihat bukti yang DITOLAK (status 'failed') beserta
 * catatan verifikator — tx kembali pending, bukan cancelled.
 */
export async function getPaymentsForRental(rentalId) {
  requireConfigured()
  const { data, error } = await getClient()
    .from('payments')
    .select('id, amount, status, payment_method, payment_proof_url, external_reference, paid_at, created_at')
    .eq('transaction_id', rentalId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

/** Denda satu transaksi (UNIQUE per tx — maks satu baris; RLS-scoped). */
export async function getLateFeeForRental(rentalId) {
  requireConfigured()
  const { data, error } = await getClient()
    .from('late_fees')
    .select('id, days_late, daily_rate, total, status, created_at')
    .eq('transaction_id', rentalId)
    .maybeSingle()
  if (error) throw error
  return data || null
}

/**
 * Putuskan denda: 'paid' oleh owner/admin; 'waived' ADMIN-ONLY (server: forbidden).
 * waived menghapus denda dari late_fee_total (server: refresh_late_fee_total).
 */
export async function decideLateFee(lateFeeId, decision) {
  requireConfigured()
  const { data, error } = await getClient().rpc('decide_late_fee', {
    p_late_fee_id: lateFeeId,
    p_decision: decision, // 'paid' | 'waived'
  })
  if (error) throw error
  const row = data?.[0]
  if (!row?.ok) throw new Error(row?.error || 'forbidden')
  return true
}

/* ------------------------ OWNER ACTIONS (seller) ------------------------- */

/** confirmed → ongoing (serah terima). */
export async function startRental(rentalId) {
  requireConfigured()
  const { data, error } = await getClient().rpc('start_rental', { p_rental_id: rentalId })
  if (error) throw error
  const row = data?.[0]
  if (!row?.ok) throw new Error(row?.error || 'illegal_transition')
  return { status: row.status }
}

/** ongoing/overdue → completed + catat tanggal kembali aktual. */
export async function recordReturn(rentalId) {
  requireConfigured()
  const { data, error } = await getClient().rpc('record_return', { p_rental_id: rentalId })
  if (error) throw error
  const row = data?.[0]
  if (!row?.ok) throw new Error(row?.error || 'illegal_transition')
  return { status: row.status }
}

/** ongoing → overdue (belum dikembalikan lewat end_date). */
export async function markOverdue(rentalId) {
  requireConfigured()
  const { data, error } = await getClient().rpc('mark_overdue', { p_rental_id: rentalId })
  if (error) throw error
  const row = data?.[0]
  if (!row?.ok) throw new Error(row?.error || 'illegal_transition')
  return { status: row.status }
}

/** Catat denda keterlambatan (rate ditetapkan penilai; snapshot server). */
export async function applyLateFee(rentalId, dailyRate) {
  requireConfigured()
  const { data, error } = await getClient().rpc('apply_late_fee', {
    p_rental_id: rentalId,
    p_daily_rate: Number(dailyRate),
  })
  if (error) throw error
  const row = data?.[0]
  if (!row?.ok) throw new Error(row?.error || 'not_late')
  return { total: Number(row.total ?? 0) }
}

/* --------------------------- DISPUTE & REVIEW ---------------------------- */

/** Buka sengketa (buyer/owner) — rental ongoing/overdue/completed. */
export async function openDispute(rentalId, reason, description = '') {
  requireConfigured()
  const { data, error } = await getClient().rpc('open_dispute', {
    p_rental_id: rentalId,
    p_reason: reason,
    p_description: description,
  })
  if (error) throw error
  const row = data?.[0]
  if (!row?.ok) throw new Error(row?.error || 'forbidden')
  return { disputeId: row.dispute_id }
}

/** Sengketa aktif (open/investigating) yang terlihat oleh sesi — antrian admin. */
export async function getActiveDisputes() {
  requireConfigured()
  const { data, error } = await getClient()
    .from('disputes')
    .select(`
      id, transaction_id, status, reason, description, resolution, created_at,
      rental_transactions!inner(id, status, start_date, end_date, total, buyer_id, store_id,
        stores(name),
        users!rental_transactions_buyer_id_fkey(full_name, email))
    `)
    .in('status', ['open', 'investigating'])
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data || []).map((d) => ({
    id: d.id,
    transaction_id: d.transaction_id,
    status: d.status,
    reason: d.reason,
    description: d.description,
    resolution: d.resolution,
    created_at: d.created_at,
    rental: d.rental_transactions
      ? {
          id: d.rental_transactions.id,
          status: d.rental_transactions.status,
          start_date: d.rental_transactions.start_date,
          end_date: d.rental_transactions.end_date,
          total: d.rental_transactions.total,
          store_name: d.rental_transactions.stores?.name || '—',
          buyer_name: d.rental_transactions.users?.full_name || null,
          buyer_email: d.rental_transactions.users?.email || null,
        }
      : null,
  }))
}

/**
 * Review milik sesi (RLS-scoped: buyer melihat review-nya sendiri). Dipakai
 * Buyer Dashboard agar tombol "Beri ulasan" hilang pada transaksi yang sudah
 * direview (server menolak duplikat: already_reviewed).
 */
export async function getMyReviewedRentalIds() {
  requireConfigured()
  const { data, error } = await getClient()
    .from('reviews')
    .select('transaction_id')
  if (error) throw error
  return (data || []).map((r) => r.transaction_id)
}

/**
 * Selesaikan sengketa (ADMIN-ONLY di DB). outcome: 'resolved' | 'rejected';
 * resolution wajib (server: resolution_required). Bila tx masih `disputed`,
 * server mengembalikannya ke `completed` (CATATAN-O).
 */
export async function resolveDispute(disputeId, outcome, resolution) {
  requireConfigured()
  const { data, error } = await getClient().rpc('resolve_dispute', {
    p_dispute_id: disputeId,
    p_outcome: outcome,
    p_resolution: resolution,
  })
  if (error) throw error
  const row = data?.[0]
  if (!row?.ok) throw new Error(row?.error || 'forbidden')
  return true
}

/** Review transaksi selesai (buyer). */
export async function createReview(rentalId, rating, comment = '') {
  requireConfigured()
  const { data, error } = await getClient().rpc('create_review', {
    p_rental_id: rentalId,
    p_rating: Number(rating),
    p_comment: comment,
  })
  if (error) throw error
  const row = data?.[0]
  if (!row?.ok) throw new Error(row?.error || 'forbidden')
  return { reviewId: row.review_id }
}

/** Terjemahan pesan error server (re-export agar pemanggil lama tetap jalan). */
export { translateServerError as translateRentalError }
