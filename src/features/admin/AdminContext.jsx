/* eslint-disable react-refresh/only-export-components */
/*
 * ============================================================================
 * ADMIN CONTEXT — JabSewa
 * ============================================================================
 * Context KHUSUS area /sys-control-jab. Hanya boleh diimpor dari
 * features/admin — terlarang diimpor komponen user biasa.
 *
 * Tugas: menjalankan guard requireAdmin() (verifikasi role `admin`
 * SERVER-SIDE terhadap public.users) sekali saat area dipasang, lalu
 * mengekspos status sesi admin ke subtree UI.
 *
 * Role DB hanya `consumer | admin` — istilah "superadmin" lama dihapus.
 * Jejak audit TIDAK ditulis dari frontend: setiap RPC admin menulis
 * audit_logs sendiri via log_audit() SECDEF (atomik, tidak bisa dipalsukan).
 * ============================================================================
 */

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { requireAdmin } from '../../data/admin'

const AdminContext = createContext(null)

/**
 * @typedef {Object} AdminSession
 * @property {{ email: string, role: string } | null} admin
 * @property {boolean} checking       — guard sedang memverifikasi
 * @property {'pending'|'allowed'|'denied'} status
 */

export function AdminProvider({ children }) {
  /** @type {[AdminSession['admin'], Function]} */
  const [admin, setAdmin] = useState(null)
  const [checking, setChecking] = useState(true)

  // Guard dijalankan sekali saat area dipasang. Kegagalan apa pun (sesi
  // habis, role salah, DB error) berarti 'denied' — default-deny.
  useEffect(() => {
    let active = true
    requireAdmin().then((result) => {
      if (!active) return
      setAdmin(result.allowed && result.reason === 'ok' ? result.admin : null)
      setChecking(false)
    })
    return () => {
      active = false
    }
  }, [])

  const value = useMemo(
    () => ({
      admin,
      checking,
      status: checking ? 'pending' : admin ? 'allowed' : 'denied',
    }),
    [admin, checking],
  )

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
}

/**
 * Hook khusus subtree /sys-control-jab. Melempar error bila dipakai di luar
 * AdminProvider — mencegah pemakaian tak sengaja di UI user.
 * @returns {AdminSession}
 */
export function useAdmin() {
  const ctx = useContext(AdminContext)
  if (!ctx) {
    throw new Error('useAdmin hanya boleh dipakai di dalam <AdminProvider> (area /sys-control-jab)')
  }
  return ctx
}
