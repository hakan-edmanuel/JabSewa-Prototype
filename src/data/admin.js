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
import { ROLE_ADMIN } from '../domain/roles'
import {
  getActiveDisputes,
  listRentals,
  decidePayment,
  resolveDispute,
  decideLateFee,
} from './rentals'

export { ROLE_ADMIN }

/* ------------------------------- GUARD ----------------------------------- */

/**
 * Verifikasi sesi aktif dan pastikan role-nya admin — dicocokkan ke
 * public.users SERVER-SIDE. Fail-closed.
 * @returns {Promise<{allowed: boolean, reason: string, admin: {email, role}|null}>}
 */
export async function requireAdmin() {
  try {
    if (!isSupabaseConfigured) {
      return { allowed: false, reason: 'unauthenticated', admin: null }
    }
    const { data: { session } } = await getClient().auth.getSession()
    if (!session?.user) {
      return { allowed: false, reason: 'unauthenticated', admin: null }
    }

    const { data: profile, error } = await getClient()
      .from('users')
      .select('id, email, role, status')
      .eq('id', session.user.id)
      .maybeSingle()
    if (error || !profile) {
      return { allowed: false, reason: 'forbidden', admin: null }
    }
    if (profile.role !== ROLE_ADMIN || profile.status !== 'active') {
      return { allowed: false, reason: 'forbidden', admin: null }
    }

    return {
      allowed: true,
      reason: 'ok',
      admin: { email: profile.email, role: profile.role },
    }
  } catch (err) {
    console.warn('[JabSewa][Admin] Guard error:', err?.message)
    return { allowed: false, reason: 'error', admin: null }
  }
}

/**
 * Mirror UI dari aturan server (bukan security boundary): area sys-control
 * hanya boleh dibuka bila profil dari DB (bukan localStorage) adalah role
 * `admin` dengan status `active` — sama dengan is_admin() di Postgres.
 * Boundary sesungguhnya: RLS + guard is_admin() di dalam setiap RPC.
 */
export function adminUiAllowed(user) {
  return Boolean(user && user.role === ROLE_ADMIN && user.status === 'active')
}

export async function adminLogout() {
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

/* ------------------------- RENTAL (D5 / DISPUTE) ------------------------- */
/*
 * Sumber data: direct SELECT rental_transactions/disputes (RLS admin melihat
 * semua baris) + RPC decide_payment / resolve_dispute / decide_late_fee.
 * Semua aksi tercatat audit_logs oleh RPC server-side — frontend tidak
 * menulis audit.
 */

/** Semua rental (RLS admin: semua baris) untuk antrian verifikasi & monitoring. */
export function adminListRentals() {
  return listRentals()
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

/* ------------------------------ USERS (D1) ------------------------------- */
/*
 * users: SELECT langsung — RLS users_select_admin hanya membuka baris untuk
 * public.is_admin() (role admin + status active). Identitas dari sesi JWT;
 * frontend tidak mengirim filter identitas. Perubahan role/status HANYA via
 * RPC admin_set_user_status / admin_set_user_role (SECDEF, is_admin guard,
 * audit server-side; self-action diblokir server).
 */

/** Daftar user (RLS admin: semua baris) — moderasi akun. */
export async function listUsers(limit = 200) {
  if (!isSupabaseConfigured) return []
  const { data, error } = await getClient()
    .from('users')
    .select('id, email, full_name, role, status, is_seller, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

/** Suspensi/aktivasi akun (RPC admin_set_user_status — server-side audit). */
export async function setUserStatus(userId, status) {
  if (!isSupabaseConfigured) return false
  const { data, error } = await getClient().rpc('admin_set_user_status', {
    p_user_id: userId,
    p_status: status,
  })
  if (error) throw error
  const row = data?.[0]
  if (!row?.ok) throw new Error(row?.error || 'forbidden')
  return true
}

/** Ubah role consumer↔admin (RPC admin_set_user_role — server-side audit). */
export async function setUserRole(userId, role) {
  if (!isSupabaseConfigured) return false
  const { data, error } = await getClient().rpc('admin_set_user_role', {
    p_user_id: userId,
    p_role: role,
  })
  if (error) throw error
  const row = data?.[0]
  if (!row?.ok) throw new Error(row?.error || 'forbidden')
  return true
}

/* ------------------------------- STORES ---------------------------------- */
/*
 * stores: SELECT langsung — policy stores_read membuka semua baris untuk
 * is_admin(). Status toko diubah HANYA via admin_set_store_status (SECDEF;
 * sinkron is_seller + audit server-side).
 */

/** Semua toko + owner (RLS admin) — moderasi toko. */
export async function listStores(limit = 200) {
  if (!isSupabaseConfigured) return []
  const { data, error } = await getClient()
    .from('stores')
    .select(`
      id, name, description, address, status, created_at,
      users!stores_owner_id_fkey(id, email, full_name)
    `)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data || []).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    address: s.address,
    status: s.status,
    createdAt: s.created_at,
    owner: {
      id: s.users?.id || null,
      name: s.users?.full_name || null,
      email: s.users?.email || null,
    },
  }))
}

/** Ubah status toko (RPC admin_set_store_status — server-side audit). */
export async function setStoreStatus(storeId, status) {
  if (!isSupabaseConfigured) return false
  const { data, error } = await getClient().rpc('admin_set_store_status', {
    p_store_id: storeId,
    p_status: status,
  })
  if (error) throw error
  const row = data?.[0]
  if (!row?.ok) throw new Error(row?.error || 'forbidden')
  return true
}

/* ------------------------------ LISTINGS --------------------------------- */
/*
 * listings: SELECT langsung — policy listings_read membuka semua baris untuk
 * is_admin(). Moderasi status HANYA via admin_set_listing_status (SECDEF,
 * is_admin guard, audit server-side; seller tidak punya RPC status 'suspended'
 * — set_my_store_status/set_listing_availability milik owner sendiri).
 */

const ADMIN_LISTING_SELECT = `
  id, store_id, name, description, price, deposit, stock, rental_unit, status, created_at,
  stores(id, name, status),
  categories(name, slug)
`

/** Semua listing lintas toko (RLS admin) — moderasi katalog. */
export async function adminListListings(limit = 200) {
  if (!isSupabaseConfigured) return []
  const { data, error } = await getClient()
    .from('listings')
    .select(ADMIN_LISTING_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data || []).map((l) => ({
    id: l.id,
    name: l.name,
    description: l.description,
    price: l.price,
    deposit: l.deposit,
    stock: l.stock,
    rentalUnit: l.rental_unit,
    status: l.status,
    createdAt: l.created_at,
    store: {
      id: l.stores?.id || null,
      name: l.stores?.name || '—',
      status: l.stores?.status || null,
    },
    categoryName: l.categories?.name || null,
  }))
}

/** Ubah status listing (RPC admin_set_listing_status — server-side audit). */
export async function setListingStatus(listingId, status) {
  if (!isSupabaseConfigured) return false
  const { data, error } = await getClient().rpc('admin_set_listing_status', {
    p_listing_id: listingId,
    p_status: status,
  })
  if (error) throw error
  const row = data?.[0]
  if (!row?.ok) throw new Error(row?.error || 'forbidden')
  return true
}
