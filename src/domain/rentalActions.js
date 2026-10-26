/*
 * ============================================================================
 * RENTAL ACTION POLICY — JabSewa
 * ============================================================================
 * Satu-satunya tempat yang memutuskan "status ini boleh aksi apa".
 *
 * Sebelumnya aturan ini ditulis ulang di ConsumerOrdersPage, SellerOrders, AdminOrders,
 * dan SellerOnboarding dengan daftar status masing-masing — perbedaan kecil di
 * antaranya melahirkan bug (owner tidak bisa membatalkan transaksi
 * `payment_verify` walau server mengizinkan).
 *
 * Semua fungsi MURNI (tanpa I/O, tanpa React) sehingga bisa diuji langsung.
 * Ini MIRROR dari aturan server (RPC), BUKAN security boundary:
 *   - cancel_rental : buyer → pending/payment_verify;
 *                     owner/admin → pending/payment_verify/confirmed (alasan wajib)
 *   - submit_payment: buyer, status pending
 *   - start_rental  : owner/admin, confirmed → ongoing
 *   - mark_overdue  : owner/admin, ongoing → overdue
 *   - record_return  : owner/admin, ongoing|overdue → completed
 *   - apply_late_fee: owner/admin, overdue (atau completed yang telat kembali)
 *   - open_dispute  : ongoing/overdue/completed
 *   - create_review : completed, sekali per transaksi
 * Otorisasi sesungguhnya tetap divalidasi database (RLS + RPC).
 * ============================================================================
 */

import { TRANSACTION_STATUS as STATUS } from './constants'

/** Buyer boleh membatalkan sebelum bukti diverifikasi. */
const BUYER_CANCELLABLE = [STATUS.PENDING, STATUS.PAYMENT_VERIFY]

/** Owner/admin boleh membatalkan sampai serah terima (alasan wajib). */
const OWNER_CANCELLABLE = [
  STATUS.PENDING,
  STATUS.PAYMENT_VERIFY,
  STATUS.CONFIRMED,
]

/** Sengketa hanya untuk transaksi yang sudah berjalan/selesai. */
const DISPUTABLE = [STATUS.ONGOING, STATUS.OVERDUE, STATUS.COMPLETED]

/**
 * Aksi yang tersedia untuk PENYEWA pada satu rental.
 * @param {{ id?: string, status?: string } | null} rental
 * @param {{ reviewedIds?: string[] }} options
 */
export function getBuyerActions(rental, { reviewedIds = [] } = {}) {
  const status = rental?.status
  const reviewed = Boolean(rental?.id) && reviewedIds.includes(rental.id)
  return {
    canCancel: BUYER_CANCELLABLE.includes(status),
    canPay: status === STATUS.PENDING,
    canDispute: DISPUTABLE.includes(status),
    canReview: status === STATUS.COMPLETED && !reviewed,
    showLateFee: status === STATUS.OVERDUE && Number(rental?.late_fee_total) > 0,
  }
}

/**
 * Aksi yang tersedia untuk PEMILIK TOKO (seller) pada satu pesanan.
 * `hasPendingPayment` = masih ada baris payments berstatus pending;
 * `lateFeeStatus` = status baris late_fees (null bila belum dimuat/dinilai).
 * @param {object | null} order
 * @param {{ hasPendingPayment?: boolean, lateFeeStatus?: string | null }} options
 */
export function getSellerActions(
  order,
  { hasPendingPayment = false, lateFeeStatus = null } = {},
) {
  const status = order?.status
  const lateFeeUnpaid =
    Number(order?.late_fee_total) > 0 && lateFeeStatus !== 'paid'
  return {
    canVerifyPayment: status === STATUS.PAYMENT_VERIFY && hasPendingPayment,
    canCancel: OWNER_CANCELLABLE.includes(status),
    canStart: status === STATUS.CONFIRMED,
    canMarkOverdue: status === STATUS.ONGOING,
    canRecordReturn: status === STATUS.ONGOING || status === STATUS.OVERDUE,
    canSetLateFee: status === STATUS.OVERDUE,
    canSettleLateFee: status === STATUS.OVERDUE && lateFeeUnpaid,
  }
}

/**
 * Label + status aktif tombol "sewa" di detail barang.
 * Tamu tetap bisa menekan tombol untuk diarahkan masuk — tombol TIDAK boleh
 * disabled hanya karena belum login (bug lama: tamu terjebak di halaman detail).
 *
 * @param {{ submitting?: boolean, hasResult?: boolean, available?: boolean,
 *           isAuthenticated?: boolean }} input
 * @returns {{ label: string, disabled: boolean }}
 */
export function resolveRentButton({ submitting, hasResult, available = true, isAuthenticated }) {
  if (submitting) return { label: 'Mengirim…', disabled: true }
  if (hasResult) return { label: 'Permintaan terkirim', disabled: true }
  if (!available) return { label: 'Sedang tidak tersedia', disabled: true }
  if (!isAuthenticated) return { label: 'Masuk untuk sewa', disabled: false }

  return {
    label: 'Sewa sekarang',
    // Penentu akhir (tanggal + kutipan server) tetap di komponen; lihat canRent.
    disabled: false,
  }
}
