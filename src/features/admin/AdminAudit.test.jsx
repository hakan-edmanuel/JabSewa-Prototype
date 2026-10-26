// @vitest-environment jsdom
/*
 * Audit log: label terbaca, filter kategori, error ≠ kosong, dan catatan
 * bahwa daftar hanya memuat aksi terbaru.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('../../data/admin', () => ({
  listAuditLogs: vi.fn(),
}))

import { listAuditLogs } from '../../data/admin'
import AdminAudit from './pages/AdminAudit'

const ROWS = [
  {
    id: 'a-1',
    action: 'application_approve',
    actor_email: 'ops@jabsewa.test',
    target_type: 'store_application',
    target_id: '11111111-2222-3333-4444-555555555555',
    metadata: { reason: 'berkas lengkap' },
    created_at: '2026-10-10T02:00:00Z',
  },
  {
    id: 'a-2',
    action: 'user_suspend',
    actor_email: 'ops@jabsewa.test',
    target_type: 'user',
    target_id: '99999999-8888-7777-6666-555555555555',
    metadata: { to: 'suspended' },
    created_at: '2026-10-09T02:00:00Z',
  },
]

beforeEach(() => {
  listAuditLogs.mockReset()
})

afterEach(cleanup)

describe('AdminAudit', () => {
  it('kegagalan query tampil sebagai error, bukan "belum ada aksi"', async () => {
    listAuditLogs.mockRejectedValue(new Error('network'))

    render(<AdminAudit />)

    expect(await screen.findByText(/Gagal memuat audit log/)).toBeTruthy()
    expect(screen.queryByText('Belum ada aksi tercatat pada audit log.')).toBeNull()
    expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeTruthy()
  })

  it('daftar kosong punya keadaan kosong sendiri', async () => {
    listAuditLogs.mockResolvedValue([])

    render(<AdminAudit />)

    expect(await screen.findByText('Belum ada aksi tercatat pada audit log.')).toBeTruthy()
    expect(screen.queryByText(/Gagal memuat audit log/)).toBeNull()
  })

  it('menampilkan label aksi/entitas yang terbaca beserta aktor', async () => {
    listAuditLogs.mockResolvedValue(ROWS)

    render(<AdminAudit />)

    expect(await screen.findByText('Ajuan toko disetujui')).toBeTruthy()
    expect(screen.getByText('Akun disuspend')).toBeTruthy()
    expect(screen.getAllByText('ops@jabsewa.test')).toHaveLength(2)
    expect(screen.getByText('Ajuan toko')).toBeTruthy()
    expect(screen.getByText('reason: berkas lengkap')).toBeTruthy()
  })

  it('filter kategori menyaring baris yang dimuat', async () => {
    listAuditLogs.mockResolvedValue(ROWS)

    render(<AdminAudit />)
    expect(await screen.findByText('Ajuan toko disetujui')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Akun/ }))

    expect(screen.queryByText('Ajuan toko disetujui')).toBeNull()
    expect(screen.getByText('Akun disuspend')).toBeTruthy()
  })

  it('menyatakan batas 100 aksi terbaru tanpa menyiratkan riwayat lengkap', async () => {
    listAuditLogs.mockResolvedValue(ROWS)

    render(<AdminAudit />)

    expect(await screen.findByText(/100 aksi terbaru/)).toBeTruthy()
    expect(screen.getByText(/belum tentu/)).toBeTruthy()
  })
})
