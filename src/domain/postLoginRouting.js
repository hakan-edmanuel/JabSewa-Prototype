/*
 * ============================================================================
 * POST-LOGIN ROUTING — JabSewa (Admin Operator Entry)
 * ============================================================================
 * Keputusan TUJUAN NAVIGASI setelah login — murni UX, BUKAN security
 * boundary. Otorisasi tetap sepenuhnya di server:
 *   - is_admin() (role='admin' AND status='active') di RLS + setiap RPC admin
 *   - AdminProvider/AdminGuard di area /sys-control-jab
 * Frontend tidak pernah MENETAPKAN role — hanya MEMBACA profil hasil
 * fetchProfile() (public.users via sesi authenticated) untuk memilih route.
 * Role tidak pernah diterima dari signup form, query parameter, atau
 * localStorage sebagai authority.
 *
 * Precedence (task Phase 4):
 *   1. Intent eksplisit user (authIntent/guardTarget: seller/buyer/profile/
 *      consumer) → existing behavior (deep-link tidak dirusak).
 *   2. Admin aktif TANPA intent → /sys-control-jab (root), atau ke path
 *      /sys-control-jab/* yang terakhir dibuka tanpa sesi (return-to).
 *   3. Selain itu (consumer, seller, admin inactive/suspended) → existing.
 *
 * Aturan isolasi: modul ini tidak mengimpor apa pun dari features/admin dan
 * tidak menyentuh storage — state return-to hanya memori modul (App).
 * ============================================================================
 */

import { ROLE_ADMIN } from './roles'

export const SYS_CONTROL_ROOT = '/sys-control-jab'
/** Prefix dengan trailing slash — dipakai untuk mendeteksi seluruh subtree. */
export const SYS_CONTROL_PREFIX = `${SYS_CONTROL_ROOT}/`

/**
 * Subpath internal area admin. Satu-satunya daftar: AdminApp menurunkan tabel
 * page ↔ path dari sini, dan regex return-to di bawah memvalidasinya.
 */
export const SYS_CONTROL_SUBPATHS = [
  'applications',
  'orders',
  'stores',
  'listings',
  'users',
  'audit',
]

const SYS_CONTROL_PATH_RE = new RegExp(
  `^${SYS_CONTROL_ROOT}(\\/(${SYS_CONTROL_SUBPATHS.join('|')}))?\\/?$`,
)

/**
 * Mirror UX dari is_admin() server (BUKAN security boundary): operator =
 * role 'admin' (D1, enum user_role) dengan status 'active' (enum user_status).
 * Bila frontend bilang admin tapi backend bilang bukan → backend menang:
 * guard/RLS/RPC tetap menolak.
 */
export function isAdminOperator(profile) {
  return Boolean(
    profile && profile.role === ROLE_ADMIN && profile.status === 'active',
  )
}

/**
 * Hitung target setelah authenticated. Fungsi murni — tanpa efek samping.
 *
 * @param {{
 *   profile?: { role?: string, status?: string } | null,
 *   intent?: { page?: string, itemId?: string } | null,
 *   sysControlReturnPath?: string | null,
 * }} params
 * @returns {{ kind: 'existing' } | { kind: 'sys-control', path: string }}
 *   kind 'existing' → lanjutkan handleAuthenticated existing tanpa perubahan.
 */
export function resolvePostLoginTarget({ profile, intent, sysControlReturnPath } = {}) {
  if (!isAdminOperator(profile)) return { kind: 'existing' }

  // Intent eksplisit selalu menang — jangan merusak deep-link/CTA existing.
  if (intent?.page && intent.page !== 'sys-control') return { kind: 'existing' }

  // Return-to deep-link admin (direkam saat area dibuka tanpa sesi).
  // Validasi format ketat — nilai asing jatuh ke root workspace.
  if (sysControlReturnPath && SYS_CONTROL_PATH_RE.test(sysControlReturnPath)) {
    return { kind: 'sys-control', path: sysControlReturnPath }
  }

  return { kind: 'sys-control', path: SYS_CONTROL_ROOT }
}

/* ---------------- Return-to cache (memori modul, BUKAN storage) ---------- */
/*
 * Path /sys-control-jab/* yang terakhir dibuka TANPA sesi. Direkam dari
 * useEffect di App (bukan saat render), dibaca saat event login, dan HANYA
 * dipakai bila keputusan routing mengonfirmasi operator aktif. Bukan
 * authority — guard server (AdminProvider/Guard + RLS + RPC) tetap
 * menentukan apa yang benar-benar boleh dibuka.
 */
let sysControlReturnPath = null

/** Rekam kunjungan area sys-control tanpa sesi (dipanggil dari useEffect). */
export function recordSysControlVisit(pathname) {
  if (
    typeof pathname === 'string' &&
    (pathname === SYS_CONTROL_ROOT || pathname.startsWith(SYS_CONTROL_PREFIX))
  ) {
    sysControlReturnPath = pathname
  }
}

/** Baca return-to tanpa menghapus (dipanggil saat event login). */
export function getSysControlReturnPath() {
  return sysControlReturnPath
}

/** Hapus return-to (setelah dipakai / saat keluar dari area). */
export function clearSysControlReturnPath() {
  sysControlReturnPath = null
}
