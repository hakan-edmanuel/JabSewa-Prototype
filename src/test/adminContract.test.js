/*
 * ============================================================================
 * REGRESSION TESTS — ADMIN WORKFLOW CONTRACT (vitest, tanpa database)
 * ============================================================================
 * Melindungi kontrak admin hasil audit repo (Oktober 2026):
 *
 *  1. AUTHORIZATION SERVER-SIDE (Phase 5):
 *     setiap RPC admin wajib punya guard is_admin()/forbidden di dalam SQL —
 *     UI/route guard bukan security boundary. Diverifikasi statis dari
 *     definisi EFEKTIF (definisi terakhir per nama, karena migration
 *     forward-only CREATE OR REPLACE beruntun).
 *
 *  2. GRANTS (least privilege):
 *     EXECUTE hanya ke `authenticated` (anon dicabut) — tamu tidak bisa
 *     memanggil operasi admin langsung lewat PostgREST.
 *
 *  3. TIDAK ADA JALUR TULIS LANGSUNG:
 *     tidak ada GRANT INSERT/UPDATE/DELETE pada users/stores/listings/
 *     audit_logs — semua perubahan lewat RPC (audit server-side).
 *
 *  4. MIRROR UI (bukan boundary):
 *     adminUiAllowed() menolak consumer/seller/tanpa-status — hanya mirip
 *     is_admin() untuk UX; otorisasi asli tetap di DB.
 * ============================================================================
 */

import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { adminUiAllowed } from '../data/admin'

/* --------------------- Parser definisi fungsi efektif --------------------- */

const MIGRATIONS = [
  'supabase/migrations/20260926000000_baseline_erd_v2.sql',
  'supabase/migrations/20260926000002_rpcs_return_next_fix.sql',
  'supabase/migrations/20260927000000_rpcs_guard_stop_fix.sql',
  'supabase/migrations/20260927000001_rpcs_status_ambiguity_fix.sql',
  'supabase/migrations/20260928000000_storage_buckets_policies.sql',
].filter((p) => existsSync(p))

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

/** Definisi EFEKTIF = definisi terakhir per nama (migration berurutan). */
function effectiveFunctions() {
  const byName = new Map()
  for (const path of MIGRATIONS) {
    const sqlText = readFileSync(path, 'utf8')
    for (const fn of extractFunctions(sqlText)) byName.set(fn.name, fn)
  }
  return byName
}

/* ------------------------- 1. Server-side guard --------------------------- */

describe('RPC admin: guard otorisasi server-side (bukan UI-only)', () => {
  const fns = effectiveFunctions()

  const adminRpc = [
    'decide_store_application',
    'admin_set_store_status',
    'admin_set_listing_status',
    'admin_set_user_status',
    'admin_set_user_role',
    'resolve_dispute',
  ]

  it('migration yang dianalisis tersedia (repo utuh)', () => {
    expect(MIGRATIONS).toContain('supabase/migrations/20260926000000_baseline_erd_v2.sql')
  })

  it('semua RPC admin terdefinisi di migration', () => {
    for (const name of adminRpc) {
      expect(fns.get(name), name).toBeDefined()
    }
  })

  it('setiap RPC admin memeriksa is_admin() di dalam SQL (guard pertama: forbidden)', () => {
    for (const name of adminRpc) {
      const fn = fns.get(name)
      expect(fn, name).toBeDefined()
      // Guard eksplisit "IF NOT public.is_admin() ... 'forbidden'" ada di body.
      expect(/is_admin\(\)/.test(fn.text), `${name}: is_admin() dipanggil`).toBe(true)
      expect(/'forbidden'/.test(fn.text), `${name}: menolak dengan 'forbidden'`).toBe(true)
    }
  })

  it('decide_store_application menolak self-review dan ajuan non-pending (server-side)', () => {
    const fn = fns.get('decide_store_application')
    expect(fn.text).toContain("error := 'self_review_forbidden'")
    expect(fn.text).toContain("error := 'application_not_pending'")
    // Alasan penolakan wajib — divalidasi server, bukan hanya required di UI.
    expect(fn.text).toContain("error := 'rejection_reason_required'")
  })

  it('admin_set_user_status / admin_set_user_role menolak self-action (server-side)', () => {
    for (const name of ['admin_set_user_status', 'admin_set_user_role']) {
      expect(fns.get(name).text).toContain("error := 'self_action_forbidden'")
    }
  })

  it('decide_late_fee: waive ADMIN-ONLY (owner toko tidak bisa waive)', () => {
    const fn = fns.get('decide_late_fee')
    const waived = fn.text.slice(fn.text.indexOf("'waived'"), fn.text.indexOf("'paid'"))
    expect(waived).toContain('is_admin()')
    expect(waived).toContain("'forbidden'")
  })

  it('list_audit_logs & list_store_applications memfilter is_admin() (LANGUAGE sql)', () => {
    for (const name of ['list_audit_logs', 'list_store_applications']) {
      const fn = fns.get(name)
      expect(fn, name).toBeDefined()
      expect(/is_admin\(\)/.test(fn.text), `${name}: WHERE is_admin()`).toBe(true)
    }
  })
})

/* ---------------------------- 2. GRANTS ----------------------------------- */

describe('Grants admin: EXECUTE authenticated saja; tanpa jalur tulis langsung', () => {
  const baseline = readFileSync(
    'supabase/migrations/20260926000000_baseline_erd_v2.sql',
    'utf8',
  )

  it('EXECUTE RPC admin di-grant ke authenticated (bukan anon)', () => {
    for (const sig of [
      'decide_store_application(uuid, boolean, text)',
      'admin_set_store_status(uuid, store_status)',
      'admin_set_listing_status(uuid, listing_status)',
      'admin_set_user_status(uuid, user_status)',
      'admin_set_user_role(uuid, user_role)',
    ]) {
      expect(
        baseline.includes(`GRANT EXECUTE ON FUNCTION public.${sig} TO authenticated`),
        sig,
      ).toBe(true)
    }
  })

  it('TIDAK ada GRANT tulis (INSERT/UPDATE/DELETE) pada tabel otorisasi & audit', () => {
    // Semua perubahan wajib lewat RPC — frontend tidak pernah menulis langsung.
    const bad = baseline.match(
      /GRANT (INSERT|UPDATE|DELETE|ALL) ON public\.(users|stores|listings|audit_logs)\b/g,
    )
    expect(bad).toBeNull()
  })

  it('grants EXECUTE ke anon dicabut untuk seluruh RPC public (REVOKE dari PUBLIC, anon)', () => {
    expect(baseline).toContain('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon')
  })
})

/* ---------------------------- 3. RLS -------------------------------------- */

describe('RLS: data admin hanya terlihat oleh is_admin()', () => {
  const baseline = readFileSync(
    'supabase/migrations/20260926000000_baseline_erd_v2.sql',
    'utf8',
  )

  it('users_select_admin / applications_select_admin / audit_logs_select_admin memakai is_admin()', () => {
    for (const policy of [
      'CREATE POLICY users_select_admin ON public.users',
      'CREATE POLICY applications_select_admin ON public.store_applications',
      'CREATE POLICY audit_logs_select_admin ON public.audit_logs',
    ]) {
      const idx = baseline.indexOf(policy)
      expect(idx, policy).toBeGreaterThanOrEqual(0)
      const body = baseline.slice(idx, idx + 220)
      expect(body).toContain('public.is_admin()')
    }
  })

  it('rental_transactions: buyer / owner toko / admin (matrix §4) — policy SELECT saja', () => {
    const idx = baseline.indexOf('CREATE POLICY rentals_select ON public.rental_transactions')
    expect(idx).toBeGreaterThanOrEqual(0)
    const body = baseline.slice(idx, idx + 420)
    expect(body).toContain('buyer_id = auth.uid()')
    expect(body).toContain('public.is_admin()')
    expect(body).toContain('FOR SELECT')
  })

  it('audit_logs TIDAK punya policy tulis apa pun (tulis hanya via log_audit SECDEF)', () => {
    const idx = baseline.indexOf('CREATE POLICY audit_logs_select_admin ON public.audit_logs')
    const after = baseline.slice(idx, idx + 300)
    expect(after).not.toMatch(/CREATE POLICY audit_logs_\w+ ON public\.audit_logs\s+FOR (INSERT|UPDATE|DELETE)/)
  })
})

/* ------------------------- 4. Mirror UI (bukan boundary) ------------------- */

describe('adminUiAllowed — mirror UX dari is_admin() (BUKAN security boundary)', () => {
  it('role admin + active → UI diizinkan', () => {
    expect(adminUiAllowed({ role: 'admin', status: 'active' })).toBe(true)
  })

  it('consumer (buyer) → ditolak', () => {
    expect(adminUiAllowed({ role: 'consumer', status: 'active' })).toBe(false)
  })

  it('admin yang di-suspend → ditolak (selaras is_admin: status harus active)', () => {
    expect(adminUiAllowed({ role: 'admin', status: 'suspended' })).toBe(false)
    expect(adminUiAllowed({ role: 'admin', status: 'inactive' })).toBe(false)
  })

  it('seller (is_seller tanpa role admin) → ditolak: seller tidak mendapat capability admin', () => {
    expect(adminUiAllowed({ role: 'consumer', status: 'active', isSeller: true })).toBe(false)
  })

  it('null / tanpa role → ditolak (fail-closed)', () => {
    expect(adminUiAllowed(null)).toBe(false)
    expect(adminUiAllowed(undefined)).toBe(false)
    expect(adminUiAllowed({})).toBe(false)
    expect(adminUiAllowed({ status: 'active' })).toBe(false)
  })
})
