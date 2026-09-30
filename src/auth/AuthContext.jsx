/* eslint-disable react-refresh/only-export-components */
/*
 * ============================================================================
 * AUTH CONTEXT — JabSewa (SUPABASE AUTH, ERD v2)
 * ============================================================================
 * Kontrak ke komponen:
 *   user            → { id, name, email, role ('consumer'|'admin'), status, isSeller }
 *   isAuthenticated → Boolean(user)
 *   hasSellerAccess → Boolean(user.isSeller) — cache server; otorisasi asli di DB
 *   storeApplication → ajuan toko terbaru (dari store_applications)
 *   isReady / register / login / logout
 *   submitStoreApplication(data) / startStoreApplication(data)
 *   switchRole(role) — DEV ONLY no-op
 * ============================================================================
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getClient, isSupabaseConfigured } from '../lib/supabaseClient'
import { ROLE_CONSUMER } from '../lib/roles'
import { translateServerError } from '../lib/constants'

/* -------------------------------------------------------------------------- */

function mapProfile(row) {
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    name: row.full_name || (row.email ? row.email.split('@')[0] : 'Penyewa'),
    role: row.role || ROLE_CONSUMER,
    status: row.status || 'active',
    isSeller: Boolean(row.is_seller),
  }
}

async function fetchProfile(userId) {
  const { data, error } = await getClient()
    .from('users')
    .select('id, email, full_name, role, status, is_seller')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return mapProfile(data)
}

/** Ajuan toko terbaru milik sesi (dari tabel store_applications). */
async function fetchLatestApplication() {
  const { data, error } = await getClient().rpc('get_my_applications')
  if (error) return null
  const row = (data || [])[0]
  if (!row) return null
  return {
    id: row.id,
    status: row.status,
    storeName: row.store_name,
    description: row.description,
    address: row.address,
    submittedAt: row.created_at,
    reviewedAt: row.reviewed_at,
    rejectionReason: row.rejection_reason,
  }
}

/* -------------------------------------------------------------------------- */

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [storeApplication, setStoreApplication] = useState(null)
  const [isReady, setIsReady] = useState(() => !isSupabaseConfigured)

  const refreshApplication = useCallback(async () => {
    const app = await fetchLatestApplication()
    setStoreApplication(app)
    return app
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return undefined
    }
    let active = true

    getClient()
      .auth.getSession()
      .then(async ({ data: { session } }) => {
        if (!active) return
        if (session?.user) {
          try {
            const profile = await fetchProfile(session.user.id)
            if (active) setUser(profile)
            await refreshApplication().catch(() => {})
          } catch {
            if (active) setUser(null)
          }
        }
        if (active) setIsReady(true)
      })

    const { data: sub } = getClient().auth.onAuthStateChange((_event, session) => {
      if (!active) return
      if (!session?.user) {
        setUser(null)
        setStoreApplication(null)
        return
      }
      fetchProfile(session.user.id)
        .then((profile) => {
          if (active) setUser(profile)
        })
        .catch(() => {
          if (active) setUser(null)
        })
      refreshApplication().catch(() => {})
    })

    return () => {
      active = false
      sub?.subscription?.unsubscribe?.()
    }
  }, [refreshApplication])

  const isAuthenticated = Boolean(user)
  const hasSellerAccess = Boolean(user?.isSeller)

  const login = useCallback(async ({ email, password }) => {
    const { data, error } = await getClient().auth.signInWithPassword({
      email: String(email || '').trim(),
      password: String(password || ''),
    })
    if (error) throw error
    const profile = await fetchProfile(data.user.id)
    setUser(profile)
    refreshApplication().catch(() => {})
    return profile
  }, [refreshApplication])

  const register = useCallback(async ({ name, email, password }) => {
    if (String(password || '').length < 6) {
      throw new Error('password should be at least 6 characters')
    }
    const { data, error } = await getClient().auth.signUp({
      email: String(email || '').trim(),
      password: String(password || ''),
      options: {
        data: { full_name: String(name || '').trim() || 'Penyewa' },
      },
    })
    if (error) throw error
    if (!data.user) throw new Error('register failed')
    // Trigger handle_new_user membuat baris public.users — tunggu singkat (best-effort).
    await new Promise((resolve) => setTimeout(resolve, 400))
    const profile = await fetchProfile(data.user.id).catch(() => null)
    setUser(profile)
    return profile
  }, [])

  const logout = useCallback(async () => {
    if (isSupabaseConfigured) {
      await getClient().auth.signOut()
    }
    setUser(null)
    setStoreApplication(null)
  }, [])

  /* --- Store application (tulis via RPC server-side) ---------------------- */
  const submitStoreApplication = useCallback(
    async ({ storeName, description, address }) => {
      const { data, error } = await getClient().rpc('submit_store_application', {
        p_store_name: String(storeName || '').trim(),
        p_description: String(description || '').trim(),
        p_address: String(address || '').trim(),
      })
      if (error) throw error
      const row = data?.[0]
      if (!row?.ok) throw new Error(translateServerError(row?.error || 'forbidden'))
      const app = await refreshApplication()
      return app
    },
    [refreshApplication],
  )

  const startStoreApplication = useCallback(
    (data = {}) => submitStoreApplication(data),
    [submitStoreApplication],
  )

  /* --- DEV ONLY ------------------------------------------------------------ */
  const switchRole = useCallback(
    (role) => {
      if (!import.meta.env.DEV) return false
      console.warn('[JabSewa] switchRole hanya dev — role server-side tidak diubah:', role)
      return false
    },
    [],
  )

  const value = useMemo(
    () => ({
      user,
      isAuthenticated,
      hasSellerAccess,
      storeApplication,
      // Alias kompatibilitas komponen yang masih membaca `sellerApplication`:
      sellerApplication: storeApplication
        ? {
            status: storeApplication.status,
            storeName: storeApplication.storeName,
            description: storeApplication.description,
            address: storeApplication.address,
            submittedAt: storeApplication.submittedAt,
            rejectionReason: storeApplication.rejectionReason,
          }
        : null,
      isReady,
      login,
      register,
      logout,
      submitStoreApplication,
      startStoreApplication,
      // Alias lama:
      startSellerApplication: startStoreApplication,
      submitSellerApplication: submitStoreApplication,
      refreshStoreApplication: refreshApplication,
      switchRole,
    }),
    [
      user,
      isAuthenticated,
      hasSellerAccess,
      storeApplication,
      isReady,
      login,
      register,
      logout,
      submitStoreApplication,
      startStoreApplication,
      refreshApplication,
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
