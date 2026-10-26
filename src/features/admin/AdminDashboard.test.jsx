// @vitest-environment jsdom
/*
 * Dashboard: sumber yang gagal menampilkan "—" (bukan 0), keadaan kosong
 * jujur, dan tiap metrik menuju modul penanganannya.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('../../data/admin', () => ({
  listSellerApplications: vi.fn(),
  adminListRentals: vi.fn(),
  adminListActiveDisputes: vi.fn(),
}))

import {
  listSellerApplications,
  adminListRentals,
  adminListActiveDisputes,
} from '../../data/admin'
import AdminDashboard from './pages/AdminDashboard'

beforeEach(() => {
  vi.clearAllMocks()
  listSellerApplications.mockResolvedValue([])
  adminListRentals.mockResolvedValue([])
  adminListActiveDisputes.mockResolvedValue([])
})

afterEach(cleanup)

describe('AdminDashboard', () => {
  it('sumber gagal menampilkan "—", sumber lain tetap angka asli', async () => {
    adminListRentals.mockRejectedValue(new Error('network'))

    render(<AdminDashboard onNavigate={() => {}} />)

    expect(await screen.findByRole('alert')).toBeTruthy()

    const failedCard = screen.getByText('Bukti bayar menunggu verifikasi').closest('button')
    expect(failedCard.textContent).toContain('—')
    expect(failedCard.textContent).not.toContain('0')

    const okCard = screen.getByText('Ajuan seller menunggu review').closest('button')
    expect(okCard.textContent).toContain('0')
  })

  it('antrian kosong dinyatakan jujur saat semua sumber berhasil', async () => {
    render(<AdminDashboard onNavigate={() => {}} />)

    expect(
      await screen.findByText(
        'Semua antrian kosong: tidak ada ajuan, verifikasi pembayaran, atau sengketa yang menunggu.',
      ),
    ).toBeTruthy()
  })

  it('kartu metrik menavigasi ke modul terkait', async () => {
    const onNavigate = vi.fn()
    render(<AdminDashboard onNavigate={onNavigate} />)

    const card = await screen.findByText('Sengketa aktif')
    fireEvent.click(card.closest('button'))

    expect(onNavigate).toHaveBeenCalledWith('orders')
  })
})
