/*
 * ============================================================================
 * SUPERADMIN SERVICE — JabSewa (MODE MOCK / OFFLINE)
 * ============================================================================
 * Lapisan logika superadmin — DIPAKAI HANYA oleh area /sys-control-jab.
 * Melarang impor file ini dari komponen user/tenant biasa (lihat App.jsx).
 *
 * Isi:
 *   1. requireSuperAdmin()  — guard sesi berbasis `jabsewa_current_user`
 *   2. logAdminAction()     — catat aksi ke koleksi `audit_logs` (LocalStorage)
 *   3. Data operasional     — daftar ajuan seller + keputusan (mock lokal)
 *
 * CATATAN KEAMANAN (MODE MOCK):
 *   Role dibaca dari sesi lokal `jabsewa_current_user` yang dicocokkan ke
 *   koleksi `users` — cukup untuk demo/testing frontend-only. TIDAK aman
 *   untuk produksi (user bisa memanipulasi LocalStorage); produksi butuh
 *   verifikasi role server-side (mis. kembali ke Supabase + RLS).
 *
 * Default-deny: sesi tidak ada, role salah, atau user tidak aktif → DITOLAK.
 * ============================================================================
 */

import { ROLE_SUPERADMIN, ROLE_STORE_OWNER } from './roles'
import {
  getStores,
  getUsers,
  getAuditLogs,
  getCurrentUser,
  clearCurrentUser,
  saveUser,
  upsertStore,
  logAudit,
} from './storage'

export { ROLE_SUPERADMIN }

/* -------------------------------------------------------------------------- */
/* 1. GUARD — requireSuperAdmin                                               */
/* -------------------------------------------------------------------------- */

/**
 * @typedef {Object} GuardResult
 * @property {boolean} allowed
 * @property {'ok'|'unauthenticated'|'forbidden'|'error'} reason
 * @property {{ email: string, role: string } | null} superadmin
 */

/**
 * Verifikasi sesi aktif (LocalStorage `jabsewa_current_user`) dan pastikan
 * rolenya SUPERADMIN dengan status aktif — dicocokkan ke koleksi `users`.
 * Fail-closed: kondisi apa pun yang meragukan → akses DITOLAK.
 *
 * @returns {Promise<GuardResult>}
 */
export async function requireSuperAdmin() {
  try {
    const session = getCurrentUser()
    if (!session?.id && !session?.email) {
      return { allowed: false, reason: 'unauthenticated', superadmin: null }
    }

    const profile = getUsers().find(
      (u) => (session.id && u.id === session.id) || (session.email && u.email === session.email),
    )

    // Fail-closed: user tidak ditemukan / role salah / tidak aktif = DITOLAK.
    if (!profile || profile.role !== ROLE_SUPERADMIN || profile.status !== 'active') {
      return { allowed: false, reason: 'forbidden', superadmin: null }
    }

    return {
      allowed: true,
      reason: 'ok',
      superadmin: { email: profile.email, role: profile.role },
    }
  } catch (err) {
    console.warn('[JabSewa][SysControl] Guard error:', err?.message)
    return { allowed: false, reason: 'error', superadmin: null }
  }
}

/** Reset cache guard (no-op di mode lokal — disimpan demi kompatibilitas). */
export function resetSuperadminCache() {
  // Sesuai namanya; di mode mock tidak ada cache yang perlu dibuang.
}

/** Keluar dari sesi superadmin (dan sesi user mana pun). */
export function superadminLogout() {
  clearCurrentUser()
}

/* -------------------------------------------------------------------------- */
/* 2. AUDIT LOG — koleksi `audit_logs` (LocalStorage)                          */
/* -------------------------------------------------------------------------- */

/**
 * Kode aksi baku untuk audit_logs.action — hindari string liar.
 * @type {Record<string, string>}
 */
export const AUDIT_ACTIONS = {
  VIEW_APPLICATIONS: 'view_seller_applications',
  APPROVE_STORE_APPLICATION: 'approve_store_application',
  REJECT_STORE_APPLICATION: 'reject_store_application',
  LOGIN_SYS_CONTROL: 'login_sys_control',
  LOGOUT_SYS_CONTROL: 'logout_sys_control',
}

/**
 * Catat aksi superadmin ke jejak audit lokal (koleksi audit_logs).
 * Gagal menulis TIDAK menggagalkan aksi utama (best-effort).
 *
 * @param {string} action — gunakan kode dari AUDIT_ACTIONS
 * @param {Object} [opts]
 * @param {string} [opts.targetType] — cth: 'store_application', 'user'
 * @param {string|number} [opts.targetId]
 * @param {Object} [opts.payload] — detail tambahan (alasan, snapshot, dst.)
 * @returns {Promise<boolean>} true bila tersimpan
 */
export async function logAdminAction(action, { targetType = '', targetId = '', payload = {} } = {}) {
  try {
    const session = getCurrentUser()
    logAudit({
      action,
      targetType,
      targetId,
      actorEmail: session?.email || 'unknown',
      payload,
    })
    return true
  } catch (err) {
    console.warn('[JabSewa][SysControl] Audit log error:', err?.message)
    return false
  }
}

/**
 * Baca jejak audit terbaru (untuk halaman SysAudit).
 * @param {number} [limit]
 */
export async function listAuditLogs(limit = 100) {
  return getAuditLogs(limit)
}

/* -------------------------------------------------------------------------- */
/* 3. DATA OPERASIONAL — ajuan seller (mock lokal, kontrak tidak berubah)      */
/* -------------------------------------------------------------------------- */

/**
 * Daftar ajuan seller untuk direview superadmin.
 * Kontrak hasil sama dengan versi sebelumnya (id, applicant, sellerApplication).
 * @returns {Promise<ApplicationSummary[]>}
 */
export async function listSellerApplications() {
  return getUsers()
    .filter((a) => a?.sellerApplication && a.sellerApplication.status !== 'draft')
    .map((a) => ({
      id: a.email,
      applicant: { name: a.name, email: a.email },
      sellerApplication: a.sellerApplication,
    }))
    .sort((a, b) => (b.sellerApplication.submittedAt || '').localeCompare(a.sellerApplication.submittedAt || ''))
}

/**
 * Simpan keputusan superadmin atas sebuah ajuan seller (mock lokal).
 * Ajuan disetujui → user menjadi STORE_OWNER + toko dibuat/diaktifkan.
 * @param {string} email — id ajuan (email applicant)
 * @param {{ approve: boolean, reason?: string }} opts
 * @returns {Promise<boolean>} true bila ajuan ditemukan dan diproses
 */
export async function decideAdmin(email, { approve, reason = '' }) {
  const users = getUsers()
  const target = users.find((a) => a?.email === email && a.sellerApplication)
  if (!target) return false

  const reviewedAt = new Date().toISOString()
  const app = target.sellerApplication
  let decided
  if (approve) {
    decided = {
      ...target,
      role: target.role === ROLE_SUPERADMIN ? target.role : ROLE_STORE_OWNER,
      sellerApplication: { ...app, status: 'approved', reviewedAt },
      sellerProfile: {
        storeName: app.storeName,
        description: app.description || '',
        contact: app.contact || '',
        city: app.city || '',
        address: app.address || '',
      },
    }
  } else {
    decided = {
      ...target,
      sellerApplication: { ...app, status: 'rejected', reviewedAt, rejectionReason: reason },
    }
  }

  saveUser(decided)

  // Ajuan disetujui → buat/perbarui toko di koleksi stores.
  if (approve && decided.sellerProfile) {
    const stores = getStores()
    const existing = stores.find(
      (s) => s.owner_id === decided.id || s.name === decided.sellerProfile.storeName,
    )
    upsertStore({
      id: existing?.id,
      name: decided.sellerProfile.storeName,
      owner_id: decided.id,
      owner_name: decided.name,
      city: decided.sellerProfile.city || '',
      address: decided.sellerProfile.address || '',
      description: decided.sellerProfile.description || '',
      rating: existing?.rating ?? 0,
      total_transactions: existing?.total_transactions ?? 0,
      is_verified: existing?.is_verified ?? false,
      status: 'active',
    })
  }

  logAudit({
    action: approve ? AUDIT_ACTIONS.APPROVE_STORE_APPLICATION : AUDIT_ACTIONS.REJECT_STORE_APPLICATION,
    targetType: 'store_application',
    targetId: email,
    actorEmail: getCurrentUser()?.email || 'unknown',
    payload: { storeName: app.storeName, decision: approve ? 'approved' : 'rejected', reason: approve ? '' : reason },
  })
  return true
}

/**
 * @typedef {Object} ApplicationSummary
 * @property {string} id
 * @property {{ name: string, email: string }} applicant
 * @property {{ status: string, storeName?: string, submittedAt?: string }} sellerApplication
 */

/**
 * Statistik ringkas ajuan untuk kartu dashboard superadmin.
 * @param {ApplicationSummary[]} applications
 * @returns {{ total: number, underReview: number, approved: number, rejected: number }}
 */
export function summarizeApplications(applications) {
  const base = { total: applications.length, underReview: 0, approved: 0, rejected: 0 }
  applications.forEach((a) => {
    const s = a.sellerApplication?.status
    if (s === 'under_review') base.underReview += 1
    if (s === 'approved') base.approved += 1
    if (s === 'rejected') base.rejected += 1
  })
  return base
}

/* -------------------------------------------------------------------------- */
/* 4. STATISTIK PLATFORM — untuk SysDashboard (dari koleksi lokal)             */
/* -------------------------------------------------------------------------- */
