/*
 * ============================================================================
 * ROLE CONSTANTS — JabSewa (ERD v2)
 * ============================================================================
 * D1: enum role di DB hanya `consumer` | `admin` (user_role).
 * "Seller" BUKAN role — status turunan dari kepemilikan store aktif
 * (users.is_seller adalah cache yang di-maintain server; otorisasi sesungguhnya
 * selalu divalidasi di database via stores.owner_id).
 * ============================================================================
 */

export const ROLE_CONSUMER = 'consumer'
export const ROLE_ADMIN = 'admin'

export const ALL_ROLES = [ROLE_CONSUMER, ROLE_ADMIN]
