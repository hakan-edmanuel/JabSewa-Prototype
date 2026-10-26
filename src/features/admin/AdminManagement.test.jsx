// @vitest-environment jsdom
/*
 * Halaman manajemen tersembunyi (Toko / Pengguna / Listing) setelah disamakan
 * dengan komponen admin bersama: error jujur (bukan pesan mentah), angka
 * pending "—" saat gagal, label status terbaca, dan satu RPC per klik ganda.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('../../data/admin', () => ({
  listStores: vi.fn(),
  setStoreStatus: vi.fn(),
  listUsers: vi.fn(),
  setUserStatus: vi.fn(),
  setUserRole: vi.fn(),
  adminListListings: vi.fn(),
  setListingStatus: vi.fn(),
}))

import {
  listStores,
  setStoreStatus,
  listUsers,
  setUserRole,
  adminListListings,
} from '../../data/admin'
import AdminStores from './pages/AdminStores'
import AdminUsers from './pages/AdminUsers'

const STORE = {
  id: 'store-1',
  name: 'Toko Kamera Jaya',
  description: 'Spesialis kamera.',
  address: 'Bandung',
  status: 'active',
  createdAt: '2026-09-01T00:00:00Z',
  owner: { id: 'u-1', name: 'Budi', email: 'budi@example.com' },
}

const USER = {
  id: 'u-2',
  email: 'citra@example.com',
  full_name: 'Citra',
  role: 'consumer',
  status: 'active',
  is_seller: false,
  created_at: '2026-09-02T00:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  listStores.mockResolvedValue([])
  listUsers.mockResolvedValue([])
  adminListListings.mockResolvedValue([])
})

afterEach(cleanup)

describe('AdminStores', () => {
  it('kegagalan muat: pesan jujur, tanpa error mentah, angka pending "—"', async () => {
    listStores.mockRejectedValue(new Error('permission denied for table stores'))

    const { container } = render(<AdminStores />)

    expect(
      await screen.findByText('Gagal memuat daftar toko. Periksa koneksi, lalu coba lagi.'),
    ).toBeTruthy()
    expect(screen.queryByText(/permission denied/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeTruthy()
    expect(container.querySelector('.sys-pending-num').textContent).toBe('—')
    expect(container.querySelector('.sys-filter-count').textContent).toBe('—')
  })

  it('perubahan status memakai label terbaca dan satu RPC', async () => {
    listStores.mockResolvedValue([STORE])
    setStoreStatus.mockResolvedValue(true)

    render(<AdminStores />)
    expect(await screen.findByText('Toko Kamera Jaya')).toBeTruthy()

    fireEvent.click(screen.getByText('Toko Kamera Jaya'))
    fireEvent.click(screen.getByRole('button', { name: 'Suspend toko' }))

    const confirm = screen.getByRole('button', { name: 'Ya, suspend toko' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)

    await waitFor(() => expect(setStoreStatus).toHaveBeenCalledTimes(1))
    expect(setStoreStatus).toHaveBeenCalledWith('store-1', 'suspended')
    expect(await screen.findByText('Status toko diubah ke Suspended.')).toBeTruthy()
  })
})

describe('AdminUsers', () => {
  it('klik ganda pada konfirmasi role hanya mengirim satu RPC dan memakai label role', async () => {
    listUsers.mockResolvedValue([USER])
    setUserRole.mockResolvedValue(true)

    render(<AdminUsers />)
    expect(await screen.findByText('Citra')).toBeTruthy()

    fireEvent.click(screen.getByText('Citra'))
    fireEvent.click(screen.getByRole('button', { name: 'Jadikan admin' }))

    const confirm = screen.getByRole('button', { name: 'Ya, jadikan admin' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)

    await waitFor(() => expect(setUserRole).toHaveBeenCalledTimes(1))
    expect(setUserRole).toHaveBeenCalledWith('u-2', 'admin')
    expect(await screen.findByText('Role diubah menjadi Admin.')).toBeTruthy()
  })
})
