/*
 * ============================================================================
 * ROUTES — JabSewa
 * ============================================================================
 * SATU tabel route untuk seluruh aplikasi: path ↔ halaman + aturan guard.
 * Sebelumnya pengetahuan tentang path tersebar di App.jsx (getPageFromPath +
 * navigate), SysControlApp.jsx (getSysPageFromPath), dan postLoginRouting.js
 * (regex subpath admin) — menambah satu route berarti mengubah tiga tempat.
 *
 * Area admin punya tabel sendiri (ADMIN_ROOT + subpath di postLoginRouting)
 * karena ia subtree terisolasi dengan guard terpisah.
 *
 * URL yang sudah dipakai TIDAK diubah (menghindari tautan/bookmark mati):
 *   /buyer     → dashboard pesanan penyewa (kode: consumer orders)
 *   /consumer  → halaman jelajah katalog
 * ============================================================================
 */

import { SYS_CONTROL_ROOT, SYS_CONTROL_PREFIX } from '../domain/postLoginRouting'

export const ADMIN_PAGE = 'sys-control'

/**
 * @typedef {Object} Route
 * @property {string} path
 * @property {string} page        kunci halaman internal
 * @property {'login'|'register'} [authMode]
 * @property {string} [guard]     intent yang dikirim ke AuthPage saat belum login
 * @property {boolean} [requiresAuth]
 * @property {boolean} [sellerOnly] hanya untuk pemilik toko aktif
 */
export const ROUTES = [
  { path: '/', page: 'home' },
  { path: '/consumer', page: 'consumer' },
  { path: '/buyer', page: 'buyer', guard: 'buyer', requiresAuth: true },
  { path: '/profile', page: 'profile', guard: 'profile', requiresAuth: true },
  { path: '/seller', page: 'seller', guard: 'seller', requiresAuth: true, sellerOnly: true },
  {
    path: '/seller/onboarding',
    page: 'seller-onboarding',
    guard: 'seller',
    requiresAuth: true,
  },
  { path: '/about', page: 'about' },
  { path: '/terms', page: 'terms' },
  { path: '/privacy', page: 'privacy' },
  { path: '/login', page: 'auth', authMode: 'login' },
  { path: '/register', page: 'auth', authMode: 'register' },
]

const BY_PATH = new Map(ROUTES.map((route) => [route.path, route]))
const BY_PAGE = new Map(ROUTES.map((route) => [route.page, route]))

/** Halaman yang wajib login + intent tujuan setelah login. */
const GUARD_TARGET = new Map(
  ROUTES.filter((route) => route.requiresAuth).map((route) => [route.page, route.guard]),
)

export const AUTH_PAGE = 'auth'
export const NOT_FOUND_PAGE = 'not-found'

/** Path → kunci halaman (`sys-control` untuk seluruh subtree admin). */
export function getPageFromPath(pathname) {
  if (pathname === SYS_CONTROL_ROOT || pathname.startsWith(SYS_CONTROL_PREFIX)) {
    return ADMIN_PAGE
  }
  return BY_PATH.get(pathname)?.page || NOT_FOUND_PAGE
}

/** Mode form auth berdasarkan path aktif (default: register). */
export function getAuthModeFromPath(pathname) {
  return BY_PATH.get(pathname)?.authMode || 'register'
}

/** Halaman tujuan bila route butuh login; null bila tidak. */
export function getGuardTarget(page) {
  return GUARD_TARGET.get(page) || null
}

/** Apakah halaman hanya untuk seller aktif. */
export function isSellerOnlyPage(page) {
  return Boolean(BY_PAGE.get(page)?.sellerOnly)
}

/** Kunci halaman → path. `auth` membutuhkan opts.mode. */
export function pathForPage(page, { mode = 'register' } = {}) {
  if (page === ADMIN_PAGE) return SYS_CONTROL_ROOT
  if (page === AUTH_PAGE) return mode === 'login' ? '/login' : '/register'
  const route = BY_PAGE.get(page)
  return route?.path || '/'
}

/**
 * Rencana satu navigasi: URL tujuan + dampaknya ke state App. Murni, supaya
 * aturan ini bisa diuji tanpa merender App atau menyentuh `window.history`.
 *
 * `itemId` hanya relevan untuk halaman katalog: `null` berarti "tampilkan
 * katalog", bukan "buka lagi detail barang yang terakhir dibuka".
 *
 * @param {string} nextPage
 * @param {{ mode?: string, itemId?: string, replace?: boolean }} [opts]
 * @returns {{ url: string, itemId: string | null | undefined, replace: boolean }}
 */
export function planNavigation(nextPage, opts = {}) {
  const { replace = false, ...target } = opts
  return {
    url: pathForPage(nextPage, target),
    itemId: nextPage === 'consumer' ? target.itemId ?? null : undefined,
    replace,
  }
}

/**
 * Tujuan setelah login/daftar berhasil — murni UX, bukan otorisasi.
 * Intent eksplisit pengguna selalu diutamakan; admin yang login tanpa intent
 * ditangani terpisah oleh resolvePostLoginTarget (postLoginRouting).
 *
 * @param {{ page?: string, itemId?: string } | null} intent
 * @param {{ isSeller?: boolean } | null} profile
 * @returns {{ page: string, itemId?: string }}
 */
export function resolveIntentDestination(intent, profile) {
  if (!intent?.page) return { page: 'home' }
  if (intent.page === 'seller') {
    return { page: profile?.isSeller ? 'seller' : 'seller-onboarding' }
  }
  if (intent.page === 'consumer') {
    return { page: 'consumer', itemId: intent.itemId }
  }
  if (intent.page === 'buyer' || intent.page === 'profile') {
    return { page: intent.page }
  }
  return { page: 'home' }
}
