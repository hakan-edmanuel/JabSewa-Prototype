/*
 * ============================================================================
 * ROLE CONSTANTS — JabSewa
 * ============================================================================
 * Satu-satunya definisi role di seluruh app. Aman diimpor dari mana saja
 * (auth, lib, superadmin, komponen user) karena hanya berisi konstanta.
 * ============================================================================
 */

export const ROLE_TENANT = 'TENANT'
export const ROLE_STORE_OWNER = 'STORE_OWNER'
export const ROLE_SUPERADMIN = 'SUPERADMIN'

export const ALL_ROLES = [ROLE_TENANT, ROLE_STORE_OWNER, ROLE_SUPERADMIN]
