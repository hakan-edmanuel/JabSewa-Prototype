/*
 * ============================================================================
 * UNIT TESTS — RENTAL ACTION POLICY (kode produksi, bukan salinan)
 * ============================================================================
 * Menguji src/lib/rentalActions.js — modul yang dipakai BuyerPage & SellerOrders.
 * Aturan di sini adalah cermin dari RPC server:
 *   buyer  → cancel: pending/payment_verify
 *   owner  → cancel: pending/payment_verify/confirmed
 * ============================================================================
 */

import { describe, expect, it } from 'vitest'
import {
  getBuyerActions,
  getSellerActions,
  resolveRentButton,
} from './rentalActions'
import { TRANSACTION_STATUS as S } from './constants'

const rental = (status, extra = {}) => ({ id: 'rental-1', status, ...extra })

describe('getBuyerActions — aksi penyewa per status', () => {
  it('pending: boleh bayar, boleh batal, belum boleh review/sengketa', () => {
    expect(getBuyerActions(rental(S.PENDING))).toMatchObject({
      canPay: true,
      canCancel: true,
      canDispute: false,
      canReview: false,
    })
  })

  it('payment_verify: masih boleh batal, tidak boleh kirim bukti lagi', () => {
    expect(getBuyerActions(rental(S.PAYMENT_VERIFY))).toMatchObject({
      canPay: false,
      canCancel: true,
    })
  })

  it('confirmed/ongoing: penyewa tidak boleh membatalkan lagi', () => {
    expect(getBuyerActions(rental(S.CONFIRMED)).canCancel).toBe(false)
    expect(getBuyerActions(rental(S.ONGOING)).canCancel).toBe(false)
  })

  it('sengketa terbuka untuk ongoing/overdue/completed saja', () => {
    expect(getBuyerActions(rental(S.ONGOING)).canDispute).toBe(true)
    expect(getBuyerActions(rental(S.OVERDUE)).canDispute).toBe(true)
    expect(getBuyerActions(rental(S.COMPLETED)).canDispute).toBe(true)
    expect(getBuyerActions(rental(S.PENDING)).canDispute).toBe(false)
    expect(getBuyerActions(rental(S.CANCELLED)).canDispute).toBe(false)
  })

  it('review hanya untuk completed dan hanya sekali', () => {
    expect(getBuyerActions(rental(S.COMPLETED)).canReview).toBe(true)
    expect(
      getBuyerActions(rental(S.COMPLETED), { reviewedIds: ['rental-1'] }).canReview,
    ).toBe(false)
  })

  it('denda ditampilkan hanya saat overdue dan nominalnya positif', () => {
    expect(getBuyerActions(rental(S.OVERDUE, { late_fee_total: 50000 })).showLateFee).toBe(true)
    expect(getBuyerActions(rental(S.OVERDUE, { late_fee_total: 0 })).showLateFee).toBe(false)
  })

  it('data kosong tidak melempar error dan semua aksi false', () => {
    expect(getBuyerActions(null)).toEqual({
      canCancel: false,
      canPay: false,
      canDispute: false,
      canReview: false,
      showLateFee: false,
    })
  })
})

describe('getSellerActions — aksi pemilik toko per status', () => {
  it('pending: boleh batal (alasan wajib di server), belum ada aksi lain', () => {
    expect(getSellerActions(rental(S.PENDING))).toMatchObject({
      canCancel: true,
      canStart: false,
      canVerifyPayment: false,
    })
  })

  it('REGRESI: payment_verify tetap bisa dibatalkan seller', () => {
    // Bug lama: tombol batal hanya dirender untuk status pending, padahal
    // daftarnya mencakup payment_verify — seller kehilangan aksi yang sah.
    expect(getSellerActions(rental(S.PAYMENT_VERIFY)).canCancel).toBe(true)
  })

  it('confirmed: boleh batal (sampai serah terima) dan boleh mulai sewa', () => {
    expect(getSellerActions(rental(S.CONFIRMED))).toMatchObject({
      canCancel: true,
      canStart: true,
      canRecordReturn: false,
    })
  })

  it('verifikasi bukti hanya bila ada payment pending', () => {
    expect(
      getSellerActions(rental(S.PAYMENT_VERIFY), { hasPendingPayment: true }).canVerifyPayment,
    ).toBe(true)
    expect(
      getSellerActions(rental(S.PAYMENT_VERIFY), { hasPendingPayment: false }).canVerifyPayment,
    ).toBe(false)
  })

  it('ongoing: boleh selesaikan atau tandai terlambat', () => {
    expect(getSellerActions(rental(S.ONGOING))).toMatchObject({
      canRecordReturn: true,
      canMarkOverdue: true,
      canSetLateFee: false,
    })
  })

  it('overdue: boleh selesaikan + nilai denda, tidak bisa tandai terlambat lagi', () => {
    expect(
      getSellerActions(rental(S.OVERDUE, { late_fee_total: 50000 }), { lateFeeStatus: 'unpaid' }),
    ).toMatchObject({
      canRecordReturn: true,
      canMarkOverdue: false,
      canSetLateFee: true,
      canSettleLateFee: true,
    })
  })

  it('overdue tanpa denda tercatat: nilai denda ditawarkan, tandai dibayar tidak', () => {
    expect(
      getSellerActions(rental(S.OVERDUE, { late_fee_total: 0 }), { lateFeeStatus: null }),
    ).toMatchObject({ canSetLateFee: true, canSettleLateFee: false })
  })

  it('denda yang sudah dibayar tidak menawarkan aksi bayar lagi', () => {
    expect(
      getSellerActions(rental(S.OVERDUE, { late_fee_total: 50000 }), {
        lateFeeStatus: 'paid',
      }).canSettleLateFee,
    ).toBe(false)
  })

  it('status terminal tidak menawarkan aksi', () => {
    for (const status of [S.COMPLETED, S.CANCELLED, S.DISPUTED]) {
      expect(getSellerActions(rental(status))).toMatchObject({
        canCancel: false,
        canStart: false,
        canRecordReturn: false,
        canSetLateFee: false,
      })
    }
  })
})

describe('resolveRentButton — label & status tombol sewa', () => {
  it('tamu TETAP bisa menekan tombol untuk diarahkan masuk', () => {
    // Bug lama: tombol disabled karena canRent mensyaratkan user login.
    expect(resolveRentButton({ isAuthenticated: false, available: true })).toEqual({
      label: 'Masuk untuk sewa',
      disabled: false,
    })
  })

  it('user login melihat aksi sewa', () => {
    expect(resolveRentButton({ isAuthenticated: true, available: true })).toEqual({
      label: 'Sewa sekarang',
      disabled: false,
    })
  })

  it('barang tidak tersedia tidak bisa disewa siapa pun', () => {
    expect(resolveRentButton({ isAuthenticated: true, available: false }).disabled).toBe(true)
    expect(resolveRentButton({ isAuthenticated: false, available: false }).disabled).toBe(true)
  })

  it('selama mengirim / sudah terkirim tombol terkunci', () => {
    expect(resolveRentButton({ isAuthenticated: true, submitting: true })).toMatchObject({
      label: 'Mengirim…',
      disabled: true,
    })
    expect(resolveRentButton({ isAuthenticated: true, hasResult: true })).toMatchObject({
      label: 'Permintaan terkirim',
      disabled: true,
    })
  })
})
