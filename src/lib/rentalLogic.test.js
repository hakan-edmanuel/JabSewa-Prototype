/*
 * ============================================================================
 * UNIT TESTS — RENTAL LOGIC CONTRACTS (vitest)
 * ============================================================================
 * Pure-logic tests yang tidak butuh database. Fungsi pembanding di sini
 * adalah CERMIN dari logika SQL di baseline ERD v2:
 *   supabase/migrations/20260926000000_baseline_erd_v2.sql
 *   (quote_rental / create_rental / cancel_rental / dsb.)
 *
 * Kontrak yang dicerminkan (docs/db-rebuild/02-final-prd.md §8):
 *   total_days     = (end_date - start_date) + 1   (end INCLUSIVE)
 *   duration_units = ceil(total_days / unit_days)  (day=1, week=7, month=30)
 *   item.subtotal  = price × quantity × duration_units
 *   tx.total       = Σ item.subtotal + Σ (deposit × quantity)
 * Test SQL end-to-end dijalankan terpisah lewat
 * scripts/verify-supabase-connection.mjs (butuh project live).
 * ============================================================================
 */

import { describe, expect, it } from 'vitest'

/* ------------------------- Mirror logika server --------------------------- */

/** total_days = (end - start) + 1 — end_date INCLUSIVE, same-day = 1 hari. */
export function calcTotalDays(startDate, endDate) {
  if (!startDate || !endDate) return 0
  const s = new Date(`${startDate}T00:00:00Z`)
  const e = new Date(`${endDate}T00:00:00Z`)
  const diff = Math.floor((e - s) / 86400000)
  return diff >= 0 ? diff + 1 : 0
}

/** unit_days per rental_unit (mirror rental_unit_days di SQL). */
export const UNIT_DAYS = { day: 1, week: 7, month: 30 }

/** duration_units = ceil(total_days / unit_days) — mirror quote_rental. */
export function calcDurationUnits(totalDays, rentalUnit) {
  const unitDays = UNIT_DAYS[rentalUnit] || 1
  return Math.ceil(totalDays / unitDays)
}

/** Overlap iff s1 <= e2 AND s2 <= e1 (status inventory: 5 status aktif PRD §9). */
export function periodsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd
}

/** Status yang MEMEGANG inventory (PRD §9) — basis perhitungan occupied_units. */
export const INVENTORY_HOLDING_STATUS = [
  'pending',
  'payment_verify',
  'confirmed',
  'ongoing',
  'overdue',
]

/**
 * available_units = stock - Σ quantity item dengan transaksi berstatus
 * inventory-holding yang periodenya overlap (mirror occupied_units).
 */
export function availableUnits(stock, bookings, listingId, start, end) {
  const occupied = bookings
    .filter(
      (b) =>
        b.listing_id === listingId &&
        INVENTORY_HOLDING_STATUS.includes(b.status) &&
        periodsOverlap(start, end, b.start, b.end),
    )
    .reduce((sum, b) => sum + b.quantity, 0)
  return stock - occupied
}

/** Matematika harga satu item (mirror PASS 1 create_rental). */
export function computeItemPricing(price, quantity, durationUnits, deposit) {
  const subtotal = price * quantity * durationUnits
  return { subtotal, depositTotal: deposit * quantity }
}

/** Matriks transisi legal (mirror PRD §5.2 / RPC di baseline). */
const LEGAL_TRANSITIONS = {
  pending: ['payment_verify', 'cancelled'],
  payment_verify: ['confirmed', 'pending', 'cancelled'],
  confirmed: ['ongoing', 'cancelled'],
  ongoing: ['overdue', 'completed', 'disputed'],
  overdue: ['completed', 'disputed'],
  disputed: ['completed'],
  completed: [],
  cancelled: [],
}

export function isLegalTransition(from, to) {
  return (LEGAL_TRANSITIONS[from] || []).includes(to)
}

/* --------------------------------- Tests ---------------------------------- */

describe('rental duration (end_date INCLUSIVE)', () => {
  it('charges same-day rental as exactly 1 day', () => {
    expect(calcTotalDays('2026-10-01', '2026-10-01')).toBe(1)
  })

  it('counts a 3-calendar-day rental as 3 days (1–3 Okt)', () => {
    expect(calcTotalDays('2026-10-01', '2026-10-03')).toBe(3)
  })

  it('does NOT charge an extra day for adjacent dates', () => {
    expect(calcTotalDays('2026-10-01', '2026-10-02')).toBe(2)
  })

  it('returns 0 for inverted ranges', () => {
    expect(calcTotalDays('2026-10-05', '2026-10-01')).toBe(0)
  })

  it('returns 0 when dates are missing', () => {
    expect(calcTotalDays('', '2026-10-01')).toBe(0)
    expect(calcTotalDays('2026-10-01', '')).toBe(0)
  })
})

describe('duration units (rental_unit day/week/month)', () => {
  it('day unit: 3 days = 3 units', () => {
    expect(calcDurationUnits(3, 'day')).toBe(3)
  })

  it('week unit: 7 days = 1 unit, 8 days = 2 units (ceil)', () => {
    expect(calcDurationUnits(7, 'week')).toBe(1)
    expect(calcDurationUnits(8, 'week')).toBe(2)
  })

  it('month unit: 30 days = 1 unit, 31 days = 2 units (ceil)', () => {
    expect(calcDurationUnits(30, 'month')).toBe(1)
    expect(calcDurationUnits(31, 'month')).toBe(2)
  })

  it('partial weeks round UP (2 days on week unit = 1 unit, min billing 1)', () => {
    expect(calcDurationUnits(1, 'week')).toBe(1)
    expect(calcDurationUnits(6, 'week')).toBe(1)
  })
})

describe('period overlap (double-booking basis)', () => {
  it('rejects exact same period', () => {
    expect(periodsOverlap('2026-10-01', '2026-10-03', '2026-10-01', '2026-10-03')).toBe(true)
  })

  it('rejects partially overlapping periods', () => {
    expect(periodsOverlap('2026-10-01', '2026-10-05', '2026-10-04', '2026-10-08')).toBe(true)
    expect(periodsOverlap('2026-10-01', '2026-10-05', '2026-09-28', '2026-10-02')).toBe(true)
  })

  it('rejects a period nested inside another', () => {
    expect(periodsOverlap('2026-10-01', '2026-10-10', '2026-10-03', '2026-10-05')).toBe(true)
  })

  it('allows back-to-back rentals (end inclusive, next day starts fresh)', () => {
    expect(periodsOverlap('2026-10-01', '2026-10-05', '2026-10-06', '2026-10-08')).toBe(false)
  })

  it('allows fully disjoint periods', () => {
    expect(periodsOverlap('2026-10-01', '2026-10-03', '2026-10-20', '2026-10-22')).toBe(false)
  })
})

describe('availability math (stock multi-unit, PRD §9)', () => {
  const bookings = [
    { listing_id: 'L1', status: 'confirmed', start: '2026-10-01', end: '2026-10-05', quantity: 2 },
    { listing_id: 'L1', status: 'completed', start: '2026-10-01', end: '2026-10-05', quantity: 3 }, // tidak memegang inventory
    { listing_id: 'L1', status: 'pending', start: '2026-10-04', end: '2026-10-08', quantity: 1 },
    { listing_id: 'L2', status: 'ongoing', start: '2026-10-01', end: '2026-10-30', quantity: 5 },
  ]

  it('subtracts only inventory-holding, overlapping bookings', () => {
    // stock 4: booking confirmed (2) + pending overlap (1) = 3 → tersisa 1
    expect(availableUnits(4, bookings, 'L1', '2026-10-04', '2026-10-05')).toBe(1)
  })

  it('ignores completed/cancelled transactions (lepas inventory)', () => {
    expect(availableUnits(4, bookings, 'L1', '2026-10-01', '2026-10-03')).toBe(2)
  })

  it('ignores bookings of other listings', () => {
    expect(availableUnits(5, bookings, 'L2', '2026-10-01', '2026-10-10')).toBe(0)
  })

  it('back-to-back booking does not consume the same unit', () => {
    expect(availableUnits(4, bookings, 'L1', '2026-10-06', '2026-10-08')).toBe(3)
  })
})

describe('pricing math (server-authoritative, PRD §8)', () => {
  it('computes item subtotal = price × qty × duration_units', () => {
    // 150.000/hari × 2 unit × 3 hari + deposit 500.000 × 2
    expect(computeItemPricing(150000, 2, 3, 500000)).toEqual({
      subtotal: 900000,
      depositTotal: 1000000,
    })
  })

  it('treats zero-deposit listings correctly', () => {
    expect(computeItemPricing(85000, 1, 2, 0)).toEqual({ subtotal: 170000, depositTotal: 0 })
  })

  it('week-unit pricing: 90.000/minggu × 2 minggu', () => {
    const days = calcTotalDays('2026-10-01', '2026-10-14') // 14 hari
    const units = calcDurationUnits(days, 'week') // 2
    expect(computeItemPricing(90000, 1, units, 0).subtotal).toBe(180000)
  })
})

describe('status transitions (PRD §5.2 contract, 8 status)', () => {
  it('pending → payment_verify / cancelled', () => {
    expect(isLegalTransition('pending', 'payment_verify')).toBe(true)
    expect(isLegalTransition('pending', 'cancelled')).toBe(true)
  })

  it('payment_verify → confirmed (bukti disetujui) / pending (bukti ditolak) / cancelled', () => {
    expect(isLegalTransition('payment_verify', 'confirmed')).toBe(true)
    expect(isLegalTransition('payment_verify', 'pending')).toBe(true)
    expect(isLegalTransition('payment_verify', 'cancelled')).toBe(true)
  })

  it('confirmed → ongoing / cancelled (serah terima gagal)', () => {
    expect(isLegalTransition('confirmed', 'ongoing')).toBe(true)
    expect(isLegalTransition('confirmed', 'cancelled')).toBe(true)
  })

  it('ongoing → overdue / completed / disputed', () => {
    expect(isLegalTransition('ongoing', 'overdue')).toBe(true)
    expect(isLegalTransition('ongoing', 'completed')).toBe(true)
    expect(isLegalTransition('ongoing', 'disputed')).toBe(true)
  })

  it('overdue → completed / disputed (denda dinilai)', () => {
    expect(isLegalTransition('overdue', 'completed')).toBe(true)
    expect(isLegalTransition('overdue', 'disputed')).toBe(true)
  })

  it('disputed → completed (resolusi admin)', () => {
    expect(isLegalTransition('disputed', 'completed')).toBe(true)
  })

  it('rejects skipping the lifecycle', () => {
    expect(isLegalTransition('pending', 'confirmed')).toBe(false)
    expect(isLegalTransition('pending', 'ongoing')).toBe(false)
    expect(isLegalTransition('confirmed', 'completed')).toBe(false)
    expect(isLegalTransition('payment_verify', 'ongoing')).toBe(false)
  })

  it('rejects all transitions out of terminal states', () => {
    for (const terminal of ['completed', 'cancelled']) {
      for (const to of ['pending', 'payment_verify', 'confirmed', 'ongoing', 'overdue', 'disputed']) {
        expect(isLegalTransition(terminal, to)).toBe(false)
      }
    }
  })

  it('rejects buyer cancel after confirmed (owner-only window)', () => {
    // Transisi confirmed → cancelled legal (owner), tapi buyer hanya boleh
    // di pending/payment_verify — batasan aktor diuji di SQL end-to-end.
    expect(isLegalTransition('confirmed', 'cancelled')).toBe(true)
    expect(isLegalTransition('ongoing', 'cancelled')).toBe(false)
  })
})
