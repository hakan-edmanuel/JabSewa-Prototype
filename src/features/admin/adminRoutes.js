/*
 * ============================================================================
 * ADMIN ROUTES — pemetaan path ↔ halaman area /sys-control-jab
 * ============================================================================
 * Fungsi murni (tanpa DOM, tanpa React) supaya aturan routing admin bisa
 * diuji tanpa merender seluruh subtree. Daftar subpath tetap berasal dari
 * SATU sumber di domain/postLoginRouting (SYS_CONTROL_SUBPATHS).
 *
 * Path asing di dalam area admin TIDAK jatuh ke dashboard — getAdminPageFromPath
 * mengembalikan null dan AdminApp merender NotFoundPage. Menampilkan dashboard
 * untuk URL salah ketik menyembunyikan kesalahan operator.
 * ============================================================================
 */

import { SYS_CONTROL_ROOT, SYS_CONTROL_SUBPATHS } from '../../domain/postLoginRouting'

/** Halaman yang benar-benar ada: dashboard (root) + subpath terdaftar. */
export const ADMIN_PAGE_IDS = ['dashboard', ...SYS_CONTROL_SUBPATHS]

/** Id halaman → path publik (dashboard = root area). */
export function adminPath(pageId) {
  return pageId === 'dashboard' ? SYS_CONTROL_ROOT : `${SYS_CONTROL_ROOT}/${pageId}`
}

/** Buang satu trailing slash; root tetap tanpa slash. */
function normalize(pathname) {
  if (typeof pathname !== 'string') return ''
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
}

/**
 * Path → id halaman, atau null bila path tidak dikenal.
 * @param {string} pathname
 * @returns {string | null}
 */
export function getAdminPageFromPath(pathname) {
  const path = normalize(pathname)
  return ADMIN_PAGE_IDS.find((id) => adminPath(id) === path) || null
}
