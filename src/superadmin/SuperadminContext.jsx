/* eslint-disable react-refresh/only-export-components */
/*
 * ============================================================================
 * SUPERADMIN (ADMIN) CONTEXT — JabSewa (ERD v2)
 * ============================================================================
 * Context KHUSUS area /sys-control-jab. File ini hanya boleh diimpor dari
 * folder src/superadmin — terlarang diimpor komponen user biasa.
 *
 * Tugas:
 *   - Menjalankan guard requireSuperAdmin() (verifikasi role `admin`
 *     SERVER-SIDE terhadap public.users) sekali saat guard pertama
 *     terpasang, lalu mengekspos status sesi admin ke subtree UI.
 *
 * ERD v2: jejak audit TIDAK ditulis dari frontend. Semua RPC admin
 * (decide_store_application, admin_set_store_status, dst.) menulis
 * audit_logs sendiri secara server-side via log_audit() SECDEF —
 * atomik dalam transaksi yang sama, tidak bisa dilewati/dipalsukan.
 * ============================================================================
 */

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  requireSuperAdmin,
  resetSuperadminCache,
} from '../lib/superadmin'

const SuperadminContext = createContext(null)

/**
 * @typedef {Object} SuperadminSession
 * @property {{ email: string, role: string } | null} superadmin
 * @property {boolean} checking       — guard sedang memverifikasi
 * @property {'pending'|'allowed'|'denied'} status
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
