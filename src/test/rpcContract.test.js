/*
 * ============================================================================
 * REGRESSION TESTS — RPC RETURN-NEXT CONTRACT (vitest, tanpa database)
 * ============================================================================
 * Dua bug yang diregresikan oleh file ini:
 *
 * BUG 1 (0-baris): baseline (20260926000000_baseline_erd_v2.sql) menutup body
 *   fungsi plpgsql ber-RETURNS TABLE dengan `RETURN;` biasa. Pada PL/pgSQL
 *   `RETURN;` TIDAK mem-emit baris (docs PostgreSQL §41.6.1) → PostgREST
 *   mengembalikan 0 baris tanpa error. Diperbaiki oleh
 *   20260926000002_rpcs_return_next_fix.sql.
 *
 * BUG 2 (multi-baris / fall-through): fix tersebut mengganti `RETURN;` →
 *   `RETURN NEXT;` secara mekanis. RETURN NEXT mem-emit baris TETAPI TIDAK
 *   menghentikan eksekusi (docs PostgreSQL §41.6.1.2: "RETURN NEXT does not
 *   actually return from the function; it just appends a row") → guard error
 *   beruntun menghasilkan 3–4 baris dan ditutup baris sukses ok=true
 *   (pada create_rental: INSERT tetap jalan meski validasi gagal!).
 *   Diperbaiki oleh 20260927000000_rpcs_guard_stop_fix.sql dengan pola:
 *       guard:  ok := false; error := 'x'; RETURN NEXT; RETURN;
 *       sukses: … nilai diisi …; RETURN NEXT;   ← statement terakhir
 *   Kontrak (04-rpc-security-contract.md §4): PERSIS SATU baris per panggilan.
 *
 * Dua lapis regresi:
 *   1. STATIS — parse migrasi & assert invarian control-flow di atas.
 *   2. MIRROR — cermin semantik quote_rental (invalid_date_range,
 *      start_date_in_past, exactly-one-row, formula harga PRD §8).
 *
 * Verifikasi end-to-end terhadap project live tetap di
 * scripts/verify-supabase-connection.mjs (butuh kredensial).
 * ============================================================================
 */

import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'

/*
 * Mirror kecil yang sengaja self-contained (TIDAK diimpor dari
 * rentalLogic.test.js — mengimpor file test lain membuat vitest
 * menjalankan test file itu dua kali):
 *   total_days     = (end - start) + 1 (end INCLUSIVE, same-day = 1)
 *   unit_days      = { day: 1, week: 7, month: 30 }
 *   duration_units = ceil(total_days / unit_days)
 */
function calcTotalDays(startDate, endDate) {
  if (!startDate || !endDate) return 0
  const s = new Date(`${startDate}T00:00:00Z`)
  const e = new Date(`${endDate}T00:00:00Z`)
  const diff = Math.floor((e - s) / 86400000)
  return diff >= 0 ? diff + 1 : 0
}

const UNIT_DAYS = { day: 1, week: 7, month: 30 }

function calcDurationUnits(totalDays, rentalUnit) {
  return Math.ceil(totalDays / (UNIT_DAYS[rentalUnit] || 1))
}

/* --------------------- 1. Static SQL contract (parser) -------------------- */

const MIGRATIONS = [
  'supabase/migrations/20260926000000_baseline_erd_v2.sql',
  'supabase/migrations/20260926000002_rpcs_return_next_fix.sql',
  'supabase/migrations/20260927000000_rpcs_guard_stop_fix.sql',
].filter((p) => existsSync(p))

/** Pecah SQL menjadi blok `CREATE OR REPLACE FUNCTION public.<name> ... $$;`. */
function extractFunctions(sqlText) {
  const lines = sqlText.split(/\r?\n/)
  const out = []
  let cur = null
  for (const line of lines) {
    const m = line.match(/^CREATE OR REPLACE FUNCTION (public\.[a-z_]+)\(/)
    if (m) {
      cur = { name: m[1].replace(/^public\./, ''), text: line }
      continue
    }
    if (cur) {
      cur.text += '\n' + line
      if (/\$\$;\s*$/.test(line)) {
        out.push(cur)
        cur = null
      }
    }
  }
  return out
}

const isPlpgsql = (fn) => /LANGUAGE\s+plpgsql\b/.test(fn.text)
const isReturnsTable = (fn) => /RETURNS\s+TABLE\s*\(/.test(fn.text)
const bareReturnCount = (fn) => (fn.text.match(/\bRETURN\s*;/g) || []).length
const returnNextCount = (fn) => (fn.text.match(/\bRETURN\s+NEXT\s*;/g) || []).length

/**
 * Invarian kontrak "PERSIS SATU baris per panggilan" (post 20260927000000):
 *   a. minimal satu emit sukses (RETURN NEXT),
 *   b. setiap guard error = 'RETURN NEXT; RETURN;' (emit lalu berhenti),
 *   c. tidak ada emit yang diikuti statement lain (fall-through) — emit terakhir
 *      hanya boleh diakhiri END. Catatan: fungsi ber-cabang eksklusif
 *      (toggle_wishlist, decide_payment) sah tanpa emit final — semua cabangnya
 *      berupa guard emit+stop.
 */
const controlFlowViolations = (fn) => {
  const violations = []
  const norm = fn.text.replace(/\s+/g, ' ')
  const emitCount = (norm.match(/RETURN NEXT;/g) || []).length
  const guardPairs = (norm.match(/RETURN NEXT; RETURN;/g) || []).length
  const returnSemicolons = (norm.match(/RETURN;/g) || []).length
  if (emitCount === 0) violations.push('tidak ada emit (RETURN NEXT)')
  if (returnSemicolons !== guardPairs) {
    violations.push(`RETURN;=${returnSemicolons} ≠ guard=${guardPairs} (ada RETURN; tanpa emit)`)
  }
  const parts = norm.split('RETURN NEXT;')
  for (let i = 1; i < parts.length; i += 1) {
    const isGuard = parts[i].startsWith(' RETURN;')
    const isFinal = i === parts.length - 1 && parts[i].startsWith(' END $$;')
    if (!isGuard && !isFinal) {
      violations.push(`emit #${i} diikuti '${parts[i].slice(0, 24).trim()}' (fall-through)`)
    }
  }
  return violations
}

// Fungsi terakhir yang didefinisikan per nama = definisi efektif di database
// (baseline dulu, lalu migrasi fix meng-CREATE OR REPLACE ulang).
function effectiveDefinitions() {
  const byName = new Map()
  for (const path of MIGRATIONS) {
    const sqlText = readFileSync(path, 'utf8')
    for (const fn of extractFunctions(sqlText)) byName.set(fn.name, fn)
  }
  return byName
}

describe('RPC SQL contract: plpgsql RETURNS TABLE harus mem-emit baris (RETURN NEXT)', () => {
  const fns = effectiveDefinitions()

  it('baseline ada di repo untuk dianalisis', () => {
    expect(MIGRATIONS).toContain('supabase/migrations/20260926000000_baseline_erd_v2.sql')
  })

  it('setidaknya 25 RPC plpgsql RETURNS TABLE terdefinisi (cakupan parser)', () => {
    const tableFns = [...fns.values()].filter((f) => isPlpgsql(f) && isReturnsTable(f))
    expect(tableFns.length).toBeGreaterThanOrEqual(25)
  })

  it('TIDAK ADA plpgsql RETURNS TABLE dengan guard fall-through: setiap fungsi PERSIS SATU emit, guard selalu emit+RETURN;', () => {
    // BUG 2 (multi-baris): RETURN NEXT tidak menghentikan eksekusi — guard
    // beruntun menghasilkan banyak baris dan ditutup ok=true. Invarian yang
    // benar: persis satu emit sukses (statement terakhir), dan setiap guard
    // error berbentuk 'RETURN NEXT; RETURN;' (emit lalu stop).
    const offenders = [...fns.values()]
      .filter((f) => isPlpgsql(f) && isReturnsTable(f))
      .flatMap((f) => controlFlowViolations(f).map((v) => `${f.name}: ${v}`))
    expect(offenders).toEqual([])
  })

  it('quote_rental — 11 jalur keluar: 10 guard (emit+RETURN;) + 1 emit sukses terakhir', () => {
    const q = fns.get('quote_rental')
    expect(q).toBeDefined()
    expect(isPlpgsql(q)).toBe(true)
    // 11 jalur keluar = 10 jalur gagal (invalid_date_range, start_date_in_past,
    // empty_items, invalid_items, invalid_quantity, listing_not_found,
    // listing_unavailable, store_inactive, min_duration, insufficient_stock)
    // + 1 jalur sukses.
    expect(returnNextCount(q)).toBe(11)
    expect(bareReturnCount(q)).toBe(10) // semua guard, masing-masing emit+stop
    expect(controlFlowViolations(q)).toEqual([])
    expect(q.text).toContain("error := 'invalid_date_range'")
    expect(q.text).toContain("error := 'start_date_in_past'")
    // Urutan validasi tetap: rentang dulu, lampau kemudian.
    expect(q.text.indexOf("error := 'invalid_date_range'"))
      .toBeLessThan(q.text.indexOf("error := 'start_date_in_past'"))
  })

  it('RPC LANGUAGE sql (get_wishlist, get_my_stores, list_audit_logs) tidak tersentuh regresi', () => {
    for (const name of ['get_wishlist', 'get_my_stores', 'list_audit_logs']) {
      const fn = fns.get(name)
      expect(fn, name).toBeDefined()
      expect(isPlpgsql(fn)).toBe(false) // LANGUAGE sql — SELECT mem-emit baris native
    }
  })
})

/* --------------- 2. Mirror semantik quote_rental (perilaku) --------------- */

/**
 * Mirror jalur validasi quote_rental (urutan pengecekan = urutan baseline):
 *   invalid_date_range → start_date_in_past → empty_items → …
 * Mengembalikan { ok: false, error } atau { ok: true, …hasil }.
 */
export function mirrorQuoteRental({ startDate, endDate, items }, today = '2026-09-27') {
  if (!startDate || !endDate || endDate < startDate) {
    return { ok: false, error: 'invalid_date_range' }
  }
  if (startDate < today) {
    return { ok: false, error: 'start_date_in_past' }
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'empty_items' }
  }
  const totalDays = calcTotalDays(startDate, endDate)
  return { ok: true, total_days: totalDays }
}

describe('mirror quote_rental: kontrak respons PERSIS SATU baris', () => {
  it('rentang terbalik → satu baris {ok:false, error:"invalid_date_range"}', () => {
    const row = mirrorQuoteRental({ startDate: '2027-01-12', endDate: '2027-01-10', items: [] })
    expect(row).toEqual({ ok: false, error: 'invalid_date_range' })
  })

  it('start = end → BUKAN invalid_date_range (same-day legal, 1 hari)', () => {
    const row = mirrorQuoteRental({ startDate: '2027-01-10', endDate: '2027-01-10', items: [] })
    expect(row.error).not.toBe('invalid_date_range')
  })

  it('tanggal lampau → {ok:false, error:"start_date_in_past"} (dicek SETELAH rentang)', () => {
    // Rentangnya valid (10–12), tapi di masa lalu → start_date_in_past.
    const row = mirrorQuoteRental({ startDate: '2020-01-10', endDate: '2020-01-12', items: [] })
    expect(row).toEqual({ ok: false, error: 'start_date_in_past' })
    // Rentang terbalik + lampau → invalid_date_range menang (urutan cek).
    const inverted = mirrorQuoteRental({ startDate: '2020-01-12', endDate: '2020-01-10', items: [] })
    expect(inverted.error).toBe('invalid_date_range')
  })

  it('tanggal NULL diperlakukan sebagai invalid_date_range', () => {
    expect(mirrorQuoteRental({ startDate: null, endDate: '2027-01-10', items: [] }).error).toBe(
      'invalid_date_range',
    )
    expect(mirrorQuoteRental({ startDate: '2027-01-10', endDate: undefined, items: [] }).error).toBe(
      'invalid_date_range',
    )
  })

  it('items kosong pada rentang valid → empty_items (bukan date error)', () => {
    const row = mirrorQuoteRental({ startDate: '2027-01-10', endDate: '2027-01-12', items: [] })
    expect(row).toEqual({ ok: false, error: 'empty_items' })
  })

  it('jalur sukses menghitung total_days inclusive & duration_units per unit', () => {
    // 3 hari kalender (end inclusive) pada unit day = 3 unit.
    expect(mirrorQuoteRental({ startDate: '2027-01-10', endDate: '2027-01-12', items: [{}] })).toEqual({
      ok: true,
      total_days: 3,
    })
    const days = calcTotalDays('2027-01-10', '2027-01-10') // same-day = 1
    expect(days).toBe(1)
    expect(calcDurationUnits(days, 'week')).toBe(1) // min billing 1 unit
    expect(UNIT_DAYS).toEqual({ day: 1, week: 7, month: 30 })
  })

  it('harga: subtotal = price × qty × units; total += deposit × qty (PRD §8)', () => {
    // 150.000/day × 2 unit × 3 hari + deposit 500.000 × 2
    const price = 150000
    const qty = 2
    const units = calcDurationUnits(3, 'day')
    const subtotal = price * qty * units
    const depositTotal = 500000 * qty
    expect(subtotal).toBe(900000)
    expect(subtotal + depositTotal).toBe(1900000)
  })
})
