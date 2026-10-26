/*
 * ============================================================================
 * UNIT TESTS — RENTAL DATE MATH
 * ============================================================================
 * Menguji src/lib/rentalMath.js yang dipakai normalizeRental (dashboard).
 * Kontrak server: total_days = (end - start) + 1, end_date INCLUSIVE.
 * ============================================================================
 */

import { describe, expect, it } from 'vitest'
import { countRentalDays } from './rentalMath'

describe('countRentalDays (end_date inklusif)', () => {
  it('sewa sehari (start = end) dihitung 1 hari', () => {
    expect(countRentalDays('2026-10-01', '2026-10-01')).toBe(1)
  })

  it('1–3 Oktober = 3 hari', () => {
    expect(countRentalDays('2026-10-01', '2026-10-03')).toBe(3)
  })

  it('tanggal berdampingan tidak menambah hari', () => {
    expect(countRentalDays('2026-10-01', '2026-10-02')).toBe(2)
  })

  it('rentang terbalik → 0', () => {
    expect(countRentalDays('2026-10-05', '2026-10-01')).toBe(0)
  })

  it('tanggal kosong / tidak valid → 0 (bukan NaN)', () => {
    expect(countRentalDays('', '2026-10-01')).toBe(0)
    expect(countRentalDays('2026-10-01', null)).toBe(0)
    expect(countRentalDays('bukan-tanggal', '2026-10-01')).toBe(0)
  })

  it('melintasi pergantian bulan & tahun', () => {
    expect(countRentalDays('2026-12-30', '2027-01-02')).toBe(4)
  })
})
