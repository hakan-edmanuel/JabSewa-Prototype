import { describe, expect, it } from 'vitest'
import {
  isAdminOperator,
  resolvePostLoginTarget,
  recordSysControlVisit,
  getSysControlReturnPath,
  clearSysControlReturnPath,
  SYS_CONTROL_ROOT,
} from './postLoginRouting'

/*
 * ============================================================================
 * REGRESSION TESTS — ADMIN OPERATOR ENTRY (post-login routing)
 * ============================================================================
 * Kasus minimum task (Phase 8). Keputusan routing adalah UX-only — boundary
 * otorisasi tetap is_admin()/RLS/RPC/guard sys-control (dijaga test lain).
 * Profil di sini meniru bentuk fetchProfile(): { role, status, isSeller }.
 * ============================================================================
 */

const adminActive = { id: 'u-admin', role: 'admin', status: 'active', isSeller: false }
const adminInactive = { ...adminActive, status: 'inactive' }
const adminSuspended = { ...adminActive, status: 'suspended' }
const consumer = { id: 'u-2', role: 'consumer', status: 'active', isSeller: false }
const seller = { ...consumer, isSeller: true }

describe('isAdminOperator — mirror UX dari is_admin() (bukan boundary)', () => {
  it('admin + active → operator', () => {
    expect(isAdminOperator(adminActive)).toBe(true)
  })

  it('admin inactive/suspended → bukan operator (authorization fails)', () => {
    expect(isAdminOperator(adminInactive)).toBe(false)
    expect(isAdminOperator(adminSuspended)).toBe(false)
  })

  it('consumer/seller → bukan operator', () => {
    expect(isAdminOperator(consumer)).toBe(false)
    expect(isAdminOperator(seller)).toBe(false)
  })

  it('null/undefined/kosong → bukan operator (fail-closed)', () => {
    expect(isAdminOperator(null)).toBe(false)
    expect(isAdminOperator(undefined)).toBe(false)
    expect(isAdminOperator({})).toBe(false)
    expect(isAdminOperator({ role: 'admin' })).toBe(false)
    expect(isAdminOperator({ status: 'active' })).toBe(false)
  })
})

describe('resolvePostLoginTarget — kasus minimum (Phase 8 task)', () => {
  it('1. admin active, login biasa tanpa intent → /sys-control-jab', () => {
    expect(
      resolvePostLoginTarget({ profile: adminActive, intent: null, sysControlReturnPath: null }),
    ).toEqual({ kind: 'sys-control', path: SYS_CONTROL_ROOT })
  })

  it('2. admin active + deep-link /sys-control-jab/* tersimpan → target dipertahankan', () => {
    expect(
      resolvePostLoginTarget({
        profile: adminActive,
        intent: null,
        sysControlReturnPath: '/sys-control-jab/applications',
      }),
    ).toEqual({ kind: 'sys-control', path: '/sys-control-jab/applications' })
    expect(
      resolvePostLoginTarget({
        profile: adminActive,
        intent: null,
        sysControlReturnPath: '/sys-control-jab/audit',
      }),
    ).toEqual({ kind: 'sys-control', path: '/sys-control-jab/audit' })
  })

  it('3. consumer → existing destination', () => {
    expect(
      resolvePostLoginTarget({ profile: consumer, intent: null, sysControlReturnPath: null }),
    ).toEqual({ kind: 'existing' })
  })

  it('4. seller → existing destination', () => {
    expect(
      resolvePostLoginTarget({ profile: seller, intent: null, sysControlReturnPath: null }),
    ).toEqual({ kind: 'existing' })
    expect(
      resolvePostLoginTarget({
        profile: seller,
        intent: { page: 'seller' },
        sysControlReturnPath: null,
      }),
    ).toEqual({ kind: 'existing' })
  })

  it('5. admin inactive → existing (TIDAK mendapat akses admin)', () => {
    expect(
      resolvePostLoginTarget({ profile: adminInactive, intent: null, sysControlReturnPath: null }),
    ).toEqual({ kind: 'existing' })
  })

  it('6. admin suspended → existing (TIDAK mendapat akses admin)', () => {
    expect(
      resolvePostLoginTarget({ profile: adminSuspended, intent: null, sysControlReturnPath: null }),
    ).toEqual({ kind: 'existing' })
    // Return-to pun tidak boleh dipakai admin non-aktif.
    expect(
      resolvePostLoginTarget({
        profile: adminSuspended,
        intent: null,
        sysControlReturnPath: '/sys-control-jab/applications',
      }),
    ).toEqual({ kind: 'existing' })
  })

  it('7. logout → login kembali (profil dari login() baru) → workspace root', () => {
    // Skenario: sesi habis (user null), admin login lagi → hasil keputusan
    // identik dengan kasus 1; tidak ada state yang membawa role lama.
    expect(
      resolvePostLoginTarget({ profile: adminActive, intent: null, sysControlReturnPath: null }),
    ).toEqual({ kind: 'sys-control', path: SYS_CONTROL_ROOT })
  })

  it('8. murni dari argumen — tidak membaca window/localStorage (jalur refresh tidak pernah memanggil keputusan ini)', () => {
    const profile = Object.freeze({ ...adminActive })
    const intent = Object.freeze({ page: 'buyer' })
    const first = resolvePostLoginTarget({ profile, intent, sysControlReturnPath: null })
    const second = resolvePostLoginTarget({ profile, intent, sysControlReturnPath: null })
    expect(first).toEqual(second)
    expect(first).toEqual({ kind: 'existing' })
  })
})

describe('return-to cache — memori modul (bukan storage, bukan authority)', () => {
  it('record → peek → consume terlihat oleh keputusan routing, lalu bersih', () => {
    clearSysControlReturnPath()
    expect(getSysControlReturnPath()).toBeNull()

    recordSysControlVisit('/sys-control-jab/applications')
    expect(getSysControlReturnPath()).toBe('/sys-control-jab/applications')
    expect(
      resolvePostLoginTarget({ profile: adminActive, intent: null, sysControlReturnPath: getSysControlReturnPath() }),
    ).toEqual({ kind: 'sys-control', path: '/sys-control-jab/applications' })

    clearSysControlReturnPath()
    expect(getSysControlReturnPath()).toBeNull()
  })

  it('record mengabaikan path di luar area sys-control', () => {
    clearSysControlReturnPath()
    recordSysControlVisit('/buyer')
    recordSysControlVisit('/etc/passwd')
    expect(getSysControlReturnPath()).toBeNull()
  })
})

describe('resolvePostLoginTarget — precedence & validasi', () => {
  it('intent eksplisit menang atas workspace (deep-link consumer/seller tidak rusak)', () => {
    for (const intent of [
      { page: 'seller' },
      { page: 'buyer' },
      { page: 'profile' },
      { page: 'consumer', itemId: 'item-1' },
    ]) {
      expect(
        resolvePostLoginTarget({ profile: adminActive, intent, sysControlReturnPath: null }),
      ).toEqual({ kind: 'existing' })
    }
  })

  it('returnPath tidak valid/asing → fallback root (tidak bisa jadi vektor navigasi)', () => {
    for (const bad of [
      '/buyer',
      '/',
      '/sys-control-jabxyz',
      '/sys-control-jab/../../etc',
      '/sys-control-jab/unknown',
      'javascript:alert(1)',
      '',
    ]) {
      expect(
        resolvePostLoginTarget({ profile: adminActive, intent: null, sysControlReturnPath: bad }),
      ).toEqual({ kind: 'sys-control', path: SYS_CONTROL_ROOT })
    }
  })

  it('profil null (registrasi CASE B gagal fetchProfile) → existing fail-closed', () => {
    expect(
      resolvePostLoginTarget({ profile: null, intent: null, sysControlReturnPath: null }),
    ).toEqual({ kind: 'existing' })
  })
})
