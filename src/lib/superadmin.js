/*
 * ============================================================================
 * ADMIN SERVICE — JabSewa (SUPABASE, ERD v2)
 * ============================================================================
 * Lapisan logika admin — DIPAKAI HANYA oleh area /sys-control-jab.
 * Guard: verifikasi role `admin` (D1) terhadap DB server-side.
 * Semua keputusan (ajuan toko, status, role) lewat RPC — server-side check.
 * ============================================================================
 */

import { getClient, isSupabaseConfigured } from './supabaseClient'
import { ROLE_ADMIN } from './roles'
import {
  getActiveDisputes,
  getAllRentals,
  decidePayment,
  resolveDispute,
  decideLateFee,
} from './userData'

export { ROLE_ADMIN }

/* ------------------------------- GUARD ----------------------------------- */

/**
 * Verifikasi sesi aktif dan pastikan role-nya admin — dicocokkan ke
 * public.users SERVER-SIDE. Fail-closed.
 * @returns {Promise<{allowed: boolean, reason: string, superadmin: {email, role}|null}>}
 */
export async function requireSuperAdmin() {
  try {
    if (!isSupabaseConfigured) {
      return { allowed: false, reason: 'unauthenticated', superadmin: null }
    }
    const { data: { session } } = await getClient().auth.getSession()
    if (!session?.user) {
      return { allowed: false, reason: 'unauthenticated', superadmin: null }
    }

    const { data: profile, error } = await getClient()
      .from('users')
      .select('id, email, role, status')
      .eq('id', session.user.id)
      .maybeSingle()
    if (error || !profile) {
      return { allowed: false, reason: 'forbidden', superadmin: null }
    }
    if (profile.role !== ROLE_ADMIN || profile.status !== 'active') {
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

export function resetSuperadminCache() {}

export async function superadminLogout() {
  if (isSupabaseConfigured) {
    await getClient().auth.signOut()
  }
}

/* ------------------------------- AUDIT ----------------------------------- */

/** Baca jejak audit (halaman SysAudit) — RPC list_audit_logs (admin-only di DB). */
export async function listAuditLogs(limit = 100) {
  if (!isSupabaseConfigured) return []
  const { data, error } = await getClient().rpc('list_audit_logs', {
    p_limit: limit,
    p_offset: 0,
  })
  if (error) throw error
  return (data || []).map((row) => ({
    id: row.id,
    action: row.action,
    actor_email: row.actor_email,
    target_type: row.entity_type,
    target_id: row.entity_id,
    metadata: row.metadata, // jsonb — diringkas SysAudit menjadi "key: value"
    created_at: row.created_at,
  }))
}

/* --------------------------- STORE APPLICATIONS -------------------------- */

/**
 * Daftar ajuan toko untuk direview admin. Kontrak UI: { id, applicant: {name,email},
 * storeApplication: { storeName, description, address, status, submittedAt, ... } }.
 */
export async function listSellerApplications() {
  if (!isSupabaseConfigured) return []
  const { data, error } = await getClient().rpc('list_store_applications')
  if (error) throw error
  return (data || []).map((row) => ({
    id: row.id,
    applicant: { name: row.applicant_name, email: row.applicant_email },
    storeApplication: {
      status: row.status,
      storeName: row.store_name,
      description: row.description,
      address: row.address,
      submittedAt: row.created_at,
      reviewedAt: row.reviewed_at,
      rejectionReason: row.rejection_reason,
    },
    // Alias lama agar komponen yang belum diubah tetap render:
    sellerApplication: {
      status: row.status,
      storeName: row.store_name,
      description: row.description,
      address: row.address,
      city: (row.address || '').split(',')[0] || '',
      contact: row.applicant_email,
      submittedAt: row.created_at,
      reviewedAt: row.reviewed_at,
      rejectionReason: row.rejection_reason,
    },
  }))
}

/** Keputusan admin atas ajuan toko (RPC decide_store_application). */
export async function decideAdmin(applicationId, { approve, reason = '' } = {}) {
  if (!isSupabaseConfigured) return false
  const { data, error } = await getClient().rpc('decide_store_application', {
    p_application_id: applicationId,
    p_approve: Boolean(approve),
    p_reason: approve ? null : String(reason || '').trim(),
  })
  if (error) throw error
  const row = data?.[0]
  if (!row?.ok) throw new Error(row?.error || 'decide_failed')
  return true
}

/** Statistik ringkas ajuan untuk kartu dashboard. */
export function summarizeApplications(applications) {
  const base = { total: applications.length, underReview: 0, approved: 0, rejected: 0 }
  applications.forEach((a) => {
    const s = a.storeApplication?.status ?? a.sellerApplication?.status
    if (s === 'pending') base.underReview += 1
    if (s === 'approved') base.approved += 1
    if (s === 'rejected') base.rejected += 1
  })
  return base
}

/* ------------------------- RENTAL (D5 / DISPUTE) ------------------------- */
/*
 * Sumber data: direct SELECT rental_transactions/disputes (RLS admin melihat
 * semua baris) + RPC decide_payment / resolve_dispute / decide_late_fee.
 * Semua aksi tercatat audit_logs oleh RPC server-side — frontend tidak
 * menulis audit.
 */

/** Semua rental (RLS admin: semua baris) untuk antrian verifikasi & monitoring. */
export function adminListRentals() {
  return getAllRentals()
}

/** Sengketa aktif (open/investigating) — antrian resolusi admin. */
export function adminListActiveDisputes() {
  return getActiveDisputes()
}

/** Verifikasi bukti pembayaran (D5: owner ATAU admin). Alasan wajib saat menolak. */
export function adminDecidePayment(paymentId, approve, note = '') {
  return decidePayment(paymentId, approve, note)
}

/** Putuskan sengketa (admin-only di DB). outcome: 'resolved' | 'rejected'. */
export async function adminResolveDispute(disputeId, outcome, resolution) {
  return resolveDispute(disputeId, outcome, resolution)
}

/** Waive denda (admin-only) / tandai dibayar. decision: 'paid' | 'waived'. */
export function adminDecideLateFee(lateFeeId, decision) {
  return decideLateFee(lateFeeId, decision)
}
