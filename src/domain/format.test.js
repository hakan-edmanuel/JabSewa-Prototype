/*
 * ============================================================================
 * UNIT TESTS — FORMAT TAMPILAN
 * ============================================================================
 * Regresi: `new Date('bukan-tanggal')` TIDAK melempar error, sehingga
 * try/catch lama tetap menghasilkan "Invalid Date" di UI.
 * ============================================================================
 */

import { describe, expect, it } from 'vitest'
import { formatPrice, formatDate, formatDateTime, initialOf } from './format'

describe('formatPrice', () => {
  it('memformat rupiah dengan pemisah ribuan', () => {
    expect(formatPrice(150000)).toBe('Rp 150.000')
    expect(formatPrice(0)).toBe('Rp 0')
  })

  it('nilai kosong dianggap 0', () => {
    expect(formatPrice(null)).toBe('Rp 0')
    expect(formatPrice(undefined)).toBe('Rp 0')
  })
})

describe('formatDate / formatDateTime', () => {
  it('memformat tanggal ISO', () => {
    expect(formatDate('2026-10-01')).toContain('2026')
    expect(formatDate('2026-10-01')).toContain('Okt')
  })

  it('tanggal kosong / invalid → "—" (bukan "Invalid Date")', () => {
    expect(formatDate('')).toBe('—')
    expect(formatDate(null)).toBe('—')
    expect(formatDate('bukan-tanggal')).toBe('—')
    expect(formatDateTime('bukan-tanggal')).toBe('—')
  })
})

describe('initialOf', () => {
  it('mengambil huruf pertama dalam huruf besar', () => {
    expect(initialOf('budi penyewa')).toBe('B')
    expect(initialOf('  ahmad')).toBe('A')
  })

  it('nama kosong → "?"', () => {
    expect(initialOf('')).toBe('?')
    expect(initialOf(null)).toBe('?')
  })
})
