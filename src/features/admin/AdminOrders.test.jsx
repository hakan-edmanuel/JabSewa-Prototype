// @vitest-environment jsdom
/*
 * Sengketa & transaksi admin: keadaan kosong/error terpisah, konteks sengketa
 * terbaca, dan kegagalan RPC tidak menutup form keputusan.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('../../data/admin', () => ({
  adminListRentals: vi.fn(),
  adminListActiveDisputes: vi.fn(),
  adminDecidePayment: vi.fn(),
  adminResolveDispute: vi.fn(),
  adminDecideLateFee: vi.fn(),
}))

vi.mock('../../data/rentals', () => ({
  getPaymentsForRental: vi.fn(),
  getLateFeeForRental: vi.fn(),
}))

vi.mock('../../data/uploads', () => ({
  getPaymentProofUrl: vi.fn(() => Promise.resolve('https://signed.test/proof')),
}))

import {
  adminListRentals,
  adminListActiveDisputes,
  adminDecidePayment,
  adminResolveDispute,
} from '../../data/admin'
import { getPaymentsForRental, getLateFeeForRental } from '../../data/rentals'
import AdminOrders from './pages/AdminOrders'

const DISPUTE = {
  id: 'd-1',
  status: 'open',
  reason: 'Barang rusak saat diterima',
  description: 'Lensa lecet dan tutup body retak.',
  opened_by: 'u-buyer',
  created_at: '2026-10-10T03:00:00Z',
  rental: {
    id: 'r-1',
    status: 'disputed',
    start_date: '2026-10-01',
    end_date: '2026-10-03',
    total: 450000,
    buyer_id: 'u-buyer',
    buyer_name: 'Budi',
    buyer_email: 'budi@example.com',
    store_name: 'Toko Kamera',
  },
}

const ORDER = {
  id: 'r-1',
  status: 'payment_verify',
  start_date: '2026-10-01',
  end_date: '2026-10-03',
  total: 450000,
  late_fee_total: 0,
  store_name: 'Toko Kamera',
  cancel_reason: null,
  created_at: '2026-10-01T01:00:00Z',
  items: [{ name: 'Kamera Sony' }],
}

const PROOF = {
  id: 'p-1',
  amount: 450000,
  status: 'pending',
  payment_method: 'bank_transfer',
  payment_proof_url: 'proofs/r-1/bukti.png',
  external_reference: null,
  created_at: '2026-10-01T02:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  adminListRentals.mockResolvedValue([])
  adminListActiveDisputes.mockResolvedValue([])
  getPaymentsForRental.mockResolvedValue([])
  getLateFeeForRental.mockResolvedValue(null)
})

afterEach(cleanup)

describe('AdminOrders — keadaan data', () => {
  it('menampilkan keadaan kosong untuk sengketa dan transaksi', async () => {
    render(<AdminOrders />)

    expect(await screen.findByText('Tidak ada sengketa aktif.')).toBeTruthy()
    expect(await screen.findByText('Tidak ada transaksi pada filter ini.')).toBeTruthy()
  })

  it('kegagalan query tampil sebagai error, bukan daftar kosong', async () => {
    adminListRentals.mockRejectedValue(new Error('network'))
    adminListActiveDisputes.mockRejectedValue(new Error('network'))

    render(<AdminOrders />)

    expect(await screen.findByText(/Gagal memuat sengketa/)).toBeTruthy()
    expect(await screen.findByText(/Gagal memuat transaksi/)).toBeTruthy()
    expect(screen.queryByText('Tidak ada sengketa aktif.')).toBeNull()
  })

  it('menampilkan konteks sengketa: alasan, status, dan pelapor', async () => {
    adminListActiveDisputes.mockResolvedValue([DISPUTE])

    render(<AdminOrders />)

    expect(await screen.findByText('Barang rusak saat diterima')).toBeTruthy()
    expect(screen.getByText('Baru dibuka')).toBeTruthy()
    expect(screen.getByText(/Penyewa · budi@example.com/)).toBeTruthy()
    expect(screen.getByText('Lensa lecet dan tutup body retak.')).toBeTruthy()
  })
})

describe('AdminOrders — resolusi sengketa', () => {
  it('sukses memanggil RPC, memberi notifikasi, dan menutup form', async () => {
    adminListActiveDisputes.mockResolvedValue([DISPUTE])
    adminResolveDispute.mockResolvedValue(true)

    render(<AdminOrders />)
    expect(await screen.findByText('Barang rusak saat diterima')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Proses sengketa' }))
    fireEvent.change(screen.getByLabelText('Resolusi (wajib)'), {
      target: { value: 'Lensa diganti pemilik toko.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Kirim keputusan' }))

    await waitFor(() =>
      expect(adminResolveDispute).toHaveBeenCalledWith(
        'd-1',
        'resolved',
        'Lensa diganti pemilik toko.',
      ),
    )
    expect(await screen.findByText('Sengketa diputus dan tercatat di audit log.')).toBeTruthy()
    await waitFor(() => expect(screen.queryByLabelText('Resolusi (wajib)')).toBeNull())
  })

  it('gagal: error diterjemahkan dan isian resolusi tidak hilang', async () => {
    adminListActiveDisputes.mockResolvedValue([DISPUTE])
    adminResolveDispute.mockRejectedValue(new Error('resolution_required'))

    render(<AdminOrders />)
    expect(await screen.findByText('Barang rusak saat diterima')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Proses sengketa' }))
    fireEvent.change(screen.getByLabelText('Resolusi (wajib)'), {
      target: { value: 'Keputusan sementara' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Kirim keputusan' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Resolusi wajib diisi.')
    expect(screen.getByLabelText('Resolusi (wajib)').value).toBe('Keputusan sementara')
  })
})

describe('AdminOrders — verifikasi pembayaran', () => {
  it('gagal menolak bukti: alasan tetap terisi dan form tetap terbuka', async () => {
    adminListRentals.mockResolvedValue([ORDER])
    getPaymentsForRental.mockResolvedValue([PROOF])
    adminDecidePayment.mockRejectedValue(new Error('forbidden'))

    render(<AdminOrders />)

    expect(await screen.findByText('Kamera Sony')).toBeTruthy()
    expect(await screen.findByText(/Transfer Bank/)).toBeTruthy()

    fireEvent.click(await screen.findByRole('button', { name: 'Tolak' }))
    fireEvent.change(screen.getByLabelText(/Alasan penolakan/), {
      target: { value: 'Bukti buram.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Kirim penolakan' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Kamu tidak punya izin untuk aksi ini.')
    expect(screen.getByLabelText(/Alasan penolakan/).value).toBe('Bukti buram.')
  })
})
