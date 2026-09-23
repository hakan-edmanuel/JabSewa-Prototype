/* eslint-disable react-refresh/only-export-components */
/*
 * ============================================================================
 * SUPERADMIN CONTEXT — JabSewa (FITUR 2)
 * ============================================================================
 * Context KHUSUS area /sys-control-jab. File ini hanya boleh diimpor dari
 * folder src/superadmin — terlarang diimpor komponen user/tenant biasa.
 *
 * Tugas:
 *   - Menjalankan guard requireSuperAdmin() sekali saat guard pertama
 *     terpasang, lalu mengekspos status sesi superadmin ke subtree UI.
 *   - Menyediakan helper logAction() yang selalu membubuhkan identitas
 *     admin (dari guard) ke admin_audit_logs.
 *
 * Terpisah penuh dari AuthContext (context user/tenant) — tidak berbagi
 * state, tidak berbagi provider, tidak ada percabangan role di UI user.
 * ============================================================================
 */

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  requireSuperAdmin,
  resetSuperadminCache,
  logAdminAction,
  ROLE_SUPERADMIN,
} from '../lib/superadmin'

const SuperadminContext = createContext(null)

/**
 * @typedef {Object} SuperadminSession
 * @property {{ email: string, role: string } | null} superadmin
 * @property {boolean} checking       — guard sedang memverifikasi
 * @property {'pending'|'allowed'|'denied'} status
 * @property {(action: string, opts?: { targetType?: string, targetId?: string|number, payload?: Object }) => Promise<boolean>} logAction
 */

export function SuperadminProvider({ children }) {
  /** @type {[SuperadminSession['superadmin'], Function]} */
  const [superadmin, setSuperadmin] = useState(null)
  const [checking, setChecking] = useState(true)

  // Guard dijalankan sekali saat area sys-control dipasang. Kegagalan apa
  // pun (sesi habis, role salah, DB error) berarti 'denied' — default-deny.
  useEffect(() => {
    let active = true
    requireSuperAdmin().then((result) => {
      if (!active) return
      if (result.allowed && result.reason === 'ok') {
        setSuperadmin(result.superadmin)
        // Audit: keberhasilan masuk area sys-control dicatat.
        logAdminAction('login_sys_control', { targetType: 'session', targetId: result.superadmin?.email || '' })
      } else {
        setSuperadmin(null)
      }
      setChecking(false)
    })
    return () => {
      active = false
      resetSuperadminCache()
    }
  }, [])

  const value = useMemo(
    () => ({
      superadmin,
      checking,
      status: checking ? 'pending' : superadmin ? 'allowed' : 'denied',
      logAction: logAdminAction,
    }),
    [superadmin, checking],
  )

  return <SuperadminContext.Provider value={value}>{children}</SuperadminContext.Provider>
}

/**
 * Hook khusus subtree /sys-control-jab. Melempar error bila dipakai
 * di luar SuperadminProvider — mencegah pemakaian tak sengaja di UI user.
 * @returns {SuperadminSession}
 */
export function useSuperadmin() {
  const ctx = useContext(SuperadminContext)
  if (!ctx) {
    throw new Error('useSuperadmin hanya boleh dipakai di dalam <SuperadminProvider> (area /sys-control-jab)')
  }
  return ctx
}

export { ROLE_SUPERADMIN }
