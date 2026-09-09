/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react'

/*
 * ============================================================================
 * AUTH CONTEXT — JabSewa
 * ============================================================================
 * Ini adalah autentikasi SEMENTARA untuk pengembangan front-end.
 * Semua data disimpan di localStorage dan TIDAK aman — JANGAN dipakai
 * sebagai autentikasi sungguhan di production.
 *
 * Saat backend tersedia, ganti implementasi fungsi di bawah dengan panggilan
 * API sungguhan tanpa mengubah konsumennya (komponen hanya memakai useAuth):
 *
 *   register({ name, email, password })
 *     → POST /api/auth/register → { token, user }
 *   login({ email, password })
 *     → POST /api/auth/login    → { token, user }
 *   logout()
 *     → POST /api/auth/logout   (invalidasi token)
 *   completeSellerOnboarding({ storeName, location })
 *     → POST /api/seller/onboarding  (aktifkan role seller pada akun)
 *
 * State `user` sebaiknya diisi dari sesi yang diverifikasi server
 * (token/JWT yang disimpan di httpOnly cookie, atau refresh token flow).
 *
 * Bentuk `user` yang diharapkan konsumen:
 *   {
 *     name: string,
 *     email: string,
 *     seller: null | { onboarded: true, storeName: string, location: string }
 *   }
 * ============================================================================
 */

const STORAGE_KEY = 'jabsewa:auth:v1'

function loadStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(loadStoredUser)

  useEffect(() => {
    try {
      if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // storage penuh / tidak tersedia — abaikan, sesi hanya bertahan di memori
    }
  }, [user])

  // MOCK: tanpa backend, akun apa pun diterima. Nama pengguna diambil dari
  // input registrasi; untuk login diambil dari bagian depan email.
  const register = async ({ name, email }) => {
    // TODO(backend): ganti dengan POST /api/auth/register
    const nextUser = {
      name: name.trim(),
      email: email.trim(),
      seller: null,
    }
    setUser(nextUser)
    return nextUser
  }

  const login = async ({ email }) => {
    // TODO(backend): ganti dengan POST /api/auth/login + validasi kredensial
    const cleanEmail = email.trim()
    const fallbackName = cleanEmail.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    const nextUser = {
      name: fallbackName || 'Penyewa',
      email: cleanEmail,
      seller: null,
    }
    setUser(nextUser)
    return nextUser
  }

  const logout = async () => {
    // TODO(backend): ganti dengan POST /api/auth/logout
    setUser(null)
  }

  // Aktifkan role seller pada akun yang sudah ada (bukan akun terpisah).
  const completeSellerOnboarding = async ({ storeName, location }) => {
    // TODO(backend): ganti dengan POST /api/seller/onboarding
    setUser((current) =>
      current
        ? { ...current, seller: { onboarded: true, storeName: storeName.trim(), location } }
        : current,
    )
  }

  const value = {
    user,
    isAuthenticated: Boolean(user),
    hasSellerAccess: Boolean(user?.seller?.onboarded),
    register,
    login,
    logout,
    completeSellerOnboarding,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth harus dipakai di dalam <AuthProvider>')
  return ctx
}