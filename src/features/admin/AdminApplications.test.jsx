// @vitest-environment jsdom
/*
 * Halaman Ajuan Seller: keadaan muat/error/kosong, keputusan hanya untuk
 * ajuan pending, dan kegagalan RPC tidak menutup form (alasan tidak hilang).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('../../data/admin', () => ({
  listSellerApplications: vi.fn(),
  decideAdmin: vi.fn(),
}))

import { listSellerApplications, decideAdmin } from '../../data/admin'
import AdminApplications from './pages/AdminApplications'

function makeApplication(overrides = {}) {
  return {
    id: 'app-1',
    applicant: { name: 'Sari Dewi', email: 'sari@example.com' },
    storeApplication: {
      status: 'pending',
      storeName: 'Sewa Kamera Sari',
      description: 'Kamera dan lensa.',
      address: 'Bandung',
      submittedAt: '2026-10-01T02:00:00Z',
      reviewedAt: null,
      rejectionReason: null,
      ...overrides,
    },
  }
}

function openRow(name) {
  const row = screen
    .getAllByRole('button')
    .find((button) => button.className.includes('sys-row') && button.textContent.includes(name))
  expect(row, `baris ${name}`).toBeTruthy()
  fireEvent.click(row)
}

beforeEach(() => {
  listSellerApplications.mockReset()
  decideAdmin.mockReset()
})

afterEach(cleanup)

describe('AdminApplications', () => {
  it('menampilkan keadaan kosong yang berbeda dari error', async () => {
    listSellerApplications.mockResolvedValue([])
    render(<AdminApplications />)

    expect(await screen.findByText('Belum ada ajuan seller.')).toBeTruthy()
    expect(screen.queryByText(/Gagal memuat ajuan seller/)).toBeNull()
  })

  it('kegagalan muat menampilkan error + coba lagi, lalu daftar muncul', async () => {
    listSellerApplications
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue([makeApplication()])

    render(<AdminApplications />)

    expect(await screen.findByText(/Gagal memuat ajuan seller/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }))

    expect(await screen.findByText('Sari Dewi')).toBeTruthy()
  })

  it('ajuan yang sudah diputus tidak menawarkan aksi keputusan', async () => {
    listSellerApplications.mockResolvedValue([
      makeApplication({ status: 'approved', reviewedAt: '2026-10-05T02:00:00Z' }),
    ])
    render(<AdminApplications />)

    expect(await screen.findByText('Sari Dewi')).toBeTruthy()
    openRow('Sari Dewi')

    expect(await screen.findByText(/Ajuan ini sudah diputus/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Setujui ajuan' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Tolak ajuan' })).toBeNull()
  })

  it('persetujuan memanggil RPC lalu menampilkan sukses dan memuat ulang', async () => {
    listSellerApplications
      .mockResolvedValueOnce([makeApplication()])
      .mockResolvedValue([makeApplication({ status: 'approved' })])
    decideAdmin.mockResolvedValue(true)

    render(<AdminApplications />)
    expect(await screen.findByText('Sari Dewi')).toBeTruthy()
    openRow('Sari Dewi')

    fireEvent.click(screen.getByRole('button', { name: 'Setujui ajuan' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ya, setujui' }))

    await waitFor(() =>
      expect(decideAdmin).toHaveBeenCalledWith('app-1', { approve: true, reason: '' }),
    )
    expect(await screen.findByText('Ajuan Sewa Kamera Sari disetujui.')).toBeTruthy()
    expect(listSellerApplications).toHaveBeenCalledTimes(2)
  })

  it('klik ganda pada konfirmasi hanya mengirim satu RPC', async () => {
    listSellerApplications.mockResolvedValue([makeApplication()])
    decideAdmin.mockResolvedValue(true)

    render(<AdminApplications />)
    expect(await screen.findByText('Sari Dewi')).toBeTruthy()
    openRow('Sari Dewi')

    fireEvent.click(screen.getByRole('button', { name: 'Setujui ajuan' }))
    const confirm = screen.getByRole('button', { name: 'Ya, setujui' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)

    await waitFor(() => expect(decideAdmin).toHaveBeenCalledTimes(1))
  })

  it('kegagalan keputusan diterjemahkan dan form konfirmasi tetap terbuka', async () => {
    listSellerApplications.mockResolvedValue([makeApplication()])
    decideAdmin.mockRejectedValue(new Error('self_review_forbidden'))

    render(<AdminApplications />)
    expect(await screen.findByText('Sari Dewi')).toBeTruthy()
    openRow('Sari Dewi')

    fireEvent.click(screen.getByRole('button', { name: 'Setujui ajuan' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ya, setujui' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Kamu tidak dapat memutus ajuanmu sendiri.')
    expect(screen.getByRole('button', { name: 'Ya, setujui' })).toBeTruthy()
  })

  it('penolakan mewajibkan alasan dan mengirimkannya ke RPC', async () => {
    listSellerApplications
      .mockResolvedValueOnce([makeApplication()])
      .mockResolvedValue([
        makeApplication({
          status: 'rejected',
          rejectionReason: 'Deskripsi terlalu singkat.',
        }),
      ])
    decideAdmin.mockResolvedValue(true)

    render(<AdminApplications />)
    expect(await screen.findByText('Sari Dewi')).toBeTruthy()
    openRow('Sari Dewi')

    fireEvent.click(screen.getByRole('button', { name: 'Tolak ajuan' }))

    const confirm = screen.getByRole('button', { name: 'Tolak ajuan' })
    expect(confirm.disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('Alasan penolakan'), {
      target: { value: 'Deskripsi terlalu singkat.' },
    })
    expect(confirm.disabled).toBe(false)

    fireEvent.click(confirm)

    await waitFor(() =>
      expect(decideAdmin).toHaveBeenCalledWith('app-1', {
        approve: false,
        reason: 'Deskripsi terlalu singkat.',
      }),
    )
    expect(await screen.findByText('Ajuan Sewa Kamera Sari ditolak.')).toBeTruthy()
  })
})
