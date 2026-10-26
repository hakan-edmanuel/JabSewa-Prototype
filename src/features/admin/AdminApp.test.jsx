// @vitest-environment jsdom
/*
 * Routing area admin: path asing harus menampilkan NotFoundPage yang sama
 * dengan 404 publik — bukan diam-diam merender dashboard. Guard admin
 * di-mock 'allowed' supaya yang diuji benar-benar routing, bukan otorisasi.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('../../data/admin', () => ({
  requireAdmin: vi.fn(() =>
    Promise.resolve({
      allowed: true,
      reason: 'ok',
      admin: { email: 'ops@jabsewa.test', role: 'admin' },
    }),
  ),
  adminLogout: vi.fn(),
  listSellerApplications: vi.fn(() => Promise.resolve([])),
  adminListRentals: vi.fn(() => Promise.resolve([])),
  adminListActiveDisputes: vi.fn(() => Promise.resolve([])),
  listAuditLogs: vi.fn(() => Promise.resolve([])),
}))

import AdminApp from './AdminApp'

function setPath(path) {
  window.history.pushState({}, '', path)
}

afterEach(() => {
  cleanup()
  setPath('/')
})

describe('routing /sys-control-jab', () => {
  it('subpath tak dikenal menampilkan 404, bukan dashboard', async () => {
    setPath('/sys-control-jab/tidak-ada')
    render(<AdminApp onExit={() => {}} />)

    expect(await screen.findByText('Halaman tidak ditemukan.')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Dashboard', level: 1 })).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Menu admin' })).toBeNull()
  })

  it('subpath terdaftar merender halamannya', async () => {
    setPath('/sys-control-jab/applications')
    render(<AdminApp onExit={() => {}} />)

    expect(await screen.findByRole('heading', { name: 'Ajuan Seller', level: 1 })).toBeTruthy()
  })

  it('root area admin merender dashboard dengan menu aktif', async () => {
    setPath('/sys-control-jab')
    render(<AdminApp onExit={() => {}} />)

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeTruthy()
    const active = screen
      .getAllByRole('button')
      .find((button) => button.getAttribute('aria-current') === 'page')
    expect(active?.textContent).toContain('Dashboard')
  })
})
