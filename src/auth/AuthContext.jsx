/* eslint-disable react-refresh/only-export-components */
/*
 * ============================================================================
 * AUTH CONTEXT — JabSewa (MODE MOCK / OFFLINE)
 * ============================================================================
 * Autentikasi 100% lokal: akun & sesi disimpan di LocalStorage.
 *
 * Sumber akun  : src/lib/storage.js (koleksi `users`, ter-seed otomatis:
 *                1 SUPERADMIN + TENANT + STORE_OWNER).
 * Sesi aktif   : kunci `jabsewa_current_user` — bertahan antar refresh.
 *
 * Kontrak ke komponen (TIDAK berubah dari versi sebelumnya):
 *   user            → { id, name, email, role, sellerApplication, sellerProfile }
 *   isAuthenticated → Boolean(user)
 *   hasSellerAccess → Boolean(user.sellerProfile)
 *   sellerApplication
 *   isReady         → selalu true sesaat setelah mount (sesi lokal instan)
 *   register({ name, email, password })
 *   login({ email, password })
 *   logout()
 *   startSellerApplication(data) / submitSellerApplication(data)
 *   switchRole(role) — DEV ONLY: ganti akun aktif sesuai role (bypass demo)
 *
 * Review ajuan seller oleh superadmin TIDAK di sini — seluruh logika
 * keputusan ada di lib/superadmin.js (area /sys-control-jab), satu sumber.
 * ============================================================================
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import {
  getUsers,
  saveUser,
  getCurrentUser,
  setCurrentUser as persistSession,
  clearCurrentUser,
} from '../lib/storage'
import { ROLE_TENANT } from '../lib/roles'

/* -------------------------------------------------------------------------- */
/* Bentuk user kontrak frontend                                               */
/* -------------------------------------------------------------------------- */

/** Ambil user "lengkap" (termasuk overlay ajuan) dari koleksi users. */
function hydrateUser(stored) {
  if (!stored?.id && !stored?.email) return null
  const fresh = getUsers().find(
    (u) => (stored.id && u.id === stored.id) || (stored.email && u.email === stored.email),
  )
  return fresh || stored
}

/* -------------------------------------------------------------------------- */

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // Sesi dibaca sinkron dari LocalStorage saat provider pertama dirender —
  // tidak perlu effect (pembacaan localStorage cepat & tanpa efek samping).
  const [user, setUser] = useState(() => hydrateUser(getCurrentUser()))
  const isReady = true

  /* --- Pastikan user selalu sinkron dengan koleksi users ------------------ */
  const syncUser = useCallback((next) => {
    setUser(next ? hydrateUser(next) : null)
  }, [])

  /* --- Derived flags ------------------------------------------------------ */
  const isAuthenticated = Boolean(user)
  const hasSellerAccess = Boolean(user?.sellerProfile)
  const sellerApplication = user?.sellerApplication || null

  /* --- Login / register / logout (mock, verifikasi terhadap users lokal) -- */
  const login = useCallback(
    async ({ email, password }) => {
      const found = getUsers().find(
        (u) => u.email?.toLowerCase() === String(email || '').trim().toLowerCase(),
      )
      if (!found) throw new Error('invalid login credentials')
      if (found.password && found.password !== password) throw new Error('invalid login credentials')
      if (found.status && found.status !== 'active') throw new Error('akun tidak aktif')

      persistSession({ id: found.id, email: found.email })
      syncUser(found)
      return found
    },
    [syncUser],
  )

  const register = useCallback(
    async ({ name, email, password }) => {
      const cleanEmail = String(email || '').trim().toLowerCase()
      if (getUsers().some((u) => u.email?.toLowerCase() === cleanEmail)) {
        throw new Error('user already registered')
      }
      if (String(password || '').length < 6) throw new Error('password should be at least 6 characters')

      const created = saveUser({
        id: `u-${Date.now()}`,
        name: (name || '').trim() || 'Penyewa',
        email: cleanEmail,
        password,
        role: ROLE_TENANT,
        status: 'active',
        sellerApplication: null,
        sellerProfile: null,
      })
      persistSession({ id: created.id, email: created.email })
      syncUser(created)
      return created
    },
    [syncUser],
  )

  const logout = useCallback(async () => {
    clearCurrentUser()
    setUser(null)
  }, [])

  /* --- Seller application (disimpan langsung ke user di koleksi) ---------- */
  const mutateCurrentUser = useCallback(
    (mutate) => {
      setUser((current) => {
        if (!current) return current
        const next = mutate(current)
        saveUser(next)
        persistSession({ id: next.id, email: next.email })
        return next
      })
    },
    [],
  )

  const startSellerApplication = useCallback(
    async (data = {}) => {
      mutateCurrentUser((current) =>
        current.sellerApplication ? current : { ...current, sellerApplication: { status: 'draft', ...data } },
      )
    },
    [mutateCurrentUser],
  )

  const submitSellerApplication = useCallback(
    async ({ storeName, description, contact, city, address }) => {
      mutateCurrentUser((current) => ({
        ...current,
        sellerApplication: {
          status: 'under_review',
          storeName: String(storeName || '').trim(),
          description: String(description || '').trim(),
          contact: String(contact || '').trim(),
          city,
          address: String(address || '').trim(),
          submittedAt: new Date().toISOString(),
        },
      }))
    },
    [mutateCurrentUser],
  )

  /* --- DEV ONLY: switcher role cepat (TENANT <-> SUPERADMIN <-> OWNER) ---- */
  const switchRole = useCallback(
    (role) => {
      const target = getUsers().find((u) => u.role === role)
      if (!target) return false
      persistSession({ id: target.id, email: target.email })
      syncUser(target)
      return true
    },
    [syncUser],
  )

  const value = useMemo(
    () => ({
      user,
      isAuthenticated,
      hasSellerAccess,
      sellerApplication,
      isReady,
      login,
      register,
      logout,
      startSellerApplication,
      submitSellerApplication,
      switchRole,
    }),
    [
      user,
      isAuthenticated,
      hasSellerAccess,
      sellerApplication,
      isReady,
      login,
      register,
      logout,
      startSellerApplication,
      submitSellerApplication,
      switchRole,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth harus dipakai di dalam <AuthProvider>')
  return ctx
}
