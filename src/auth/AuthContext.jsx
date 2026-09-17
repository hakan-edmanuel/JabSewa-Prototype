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
 *   submitSellerApplication(data)
 *     → POST /api/seller/applications  (buat ajuan seller, status under_review)
 *   decideSellerApplication({ approve, reason })
 *     → (MOCK) keputusan reviewer; nantinya datang dari backend/webhook
 *   listSellerApplications()
 *     → (MOCK admin) semua ajuan seller dari akun lokal
 *   decideAdmin(email, { approve, reason })
 *     → (MOCK admin) tulis keputusan ke akun pemilik ajuan
 *
 * Model data konsep (frontend-only, mock):
 *   user.sellerApplication → SELLER_APPLICATION (proses jadi seller)
 *   user.sellerProfile     → SELLER_PROFILE (identitas seller SETELAH disetujui)
 *
 * Bentuk `user` yang diharapkan konsumen:
 *   {
 *     name: string,
 *     email: string,
 *     sellerApplication: null | {
 *       status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected',
 *       storeName, description, contact, city, address,
 *       submittedAt, reviewedAt, rejectionReason
 *     },
 *     sellerProfile: null | { storeName, description, contact, city, address }
 *   }
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
// Registri akun lokal (mock admin): semua akun yang pernah dibuat di device
// ini. Dipakai Admin Applications untuk meninjau ajuan seller lintas akun.
const ACCOUNTS_KEY = 'jabsewa:accounts:v1'

function loadStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    // Migrasi satu kali dari model lama (seller.onboarded boolean) ke model
    // baru: ajuan approved + sellerProfile terpisah.
    if (parsed?.seller?.onboarded && !parsed.sellerProfile) {
      return {
        ...parsed,
        sellerApplication: {
          status: 'approved',
          storeName: parsed.seller.storeName,
          city: parsed.seller.location,
        },
        sellerProfile: {
          storeName: parsed.seller.storeName,
          city: parsed.seller.location,
        },
      }
    }
    return parsed
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

  // Simpan setiap akun ke registri lokal (mock multi-akun sisi admin).
  useEffect(() => {
    if (!user?.email) return
    try {
      const raw = localStorage.getItem(ACCOUNTS_KEY)
      const accounts = raw ? JSON.parse(raw) : []
      const existing = Array.isArray(accounts) ? accounts : []
      const next = existing.some((a) => a.email === user.email)
        ? existing.map((a) => (a.email === user.email ? { ...a, ...user } : a))
        : [...existing, { ...user }]
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(next))
    } catch {
      // storage penuh / tidak tersedia — abaikan
    }
  }, [user])

  // MOCK: tanpa backend, akun apa pun diterima. Nama pengguna diambil dari
  // input registrasi; untuk login diambil dari bagian depan email.
  const register = async ({ name, email }) => {
    // TODO(backend): ganti dengan POST /api/auth/register
    const nextUser = {
      name: name.trim(),
      email: email.trim(),
      sellerApplication: null,
      sellerProfile: null,
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
      sellerApplication: null,
      sellerProfile: null,
    }
    setUser(nextUser)
    return nextUser
  }

  const logout = async () => {
    // TODO(backend): ganti dengan POST /api/auth/logout
    setUser(null)
  }

  // =====================================================================
  // SELLER APPLICATION — ajuan jadi seller (BUKAN pengganti role).
  // User biasa tidak mendapat kemampuan seller otomatis; sellerProfile
  // hanya tercipta setelah ajuan disetujui.
  // =====================================================================

  const startSellerApplication = async (data = {}) => {
    // TODO(backend): ganti dengan POST /api/seller/applications/draft
    setUser((current) =>
      current && !current.sellerApplication
        ? { ...current, sellerApplication: { status: 'draft', ...data } }
        : current,
    )
  }

  const submitSellerApplication = async ({ storeName, description, contact, city, address }) => {
    // TODO(backend): ganti dengan POST /api/seller/applications
    setUser((current) =>
      current
        ? {
            ...current,
            sellerApplication: {
              status: 'under_review', // 'submitted' bersifat sesaat lalu masuk review
              storeName: storeName.trim(),
              description: description.trim(),
              contact: contact.trim(),
              city,
              address: address.trim(),
              submittedAt: new Date().toISOString(),
            },
          }
        : current,
    )
  }

  // MOCK keputusan reviewer (dari akun yang sedang login) — di produksi ini datang dari backend.
  const decideSellerApplication = async ({ approve, reason = '' }) => {
    setUser((current) => {
      if (!current?.sellerApplication) return current
      const app = current.sellerApplication
      if (approve) {
        return {
          ...current,
          sellerApplication: { ...app, status: 'approved', reviewedAt: new Date().toISOString() },
          sellerProfile: {
            storeName: app.storeName,
            description: app.description || '',
            contact: app.contact || '',
            city: app.city || '',
            address: app.address || '',
          },
        }
      }
      return {
        ...current,
        sellerApplication: {
          ...app,
          status: 'rejected',
          reviewedAt: new Date().toISOString(),
          rejectionReason: reason,
        },
      }
    })
  }

  // =====================================================================
  // ADMIN — daftar SEMUA ajuan seller dari akun lokal (mock multi-akun,
  // bukan backend). decideAdmin menulis keputusan pada akun pemilik ajuan
  // di registri + sesi aktif, memakai bentuk data yang sama dengan
  // decideSellerApplication supaya konsumen (screen applicant) tidak berubah.
  // =====================================================================
  const listSellerApplications = () => {
    try {
      const raw = localStorage.getItem(ACCOUNTS_KEY)
      const accounts = raw ? JSON.parse(raw) : []
      if (!Array.isArray(accounts)) return []
      return accounts
        .filter((a) => a?.sellerApplication && a.sellerApplication.status !== 'draft')
        .map((a) => ({
          id: a.email,
          applicant: { name: a.name, email: a.email },
          sellerApplication: a.sellerApplication,
        }))
        .sort(
          (a, b) =>
            (b.sellerApplication.submittedAt || '').localeCompare(a.sellerApplication.submittedAt || ''),
        )
    } catch {
      return []
    }
  }

  const decideAdmin = async (email, { approve, reason = '' }) => {
    const reviewedAt = new Date().toISOString()
    const apply = (acc) => {
      if (!acc?.sellerApplication) return acc
      const app = acc.sellerApplication
      if (approve) {
        return {
          ...acc,
          sellerApplication: { ...app, status: 'approved', reviewedAt },
          sellerProfile: {
            storeName: app.storeName,
            description: app.description || '',
            contact: app.contact || '',
            city: app.city || '',
            address: app.address || '',
          },
        }
      }
      return {
        ...acc,
        sellerApplication: {
          ...app,
          status: 'rejected',
          reviewedAt,
          rejectionReason: reason,
        },
      }
    }

    try {
      const raw = localStorage.getItem(ACCOUNTS_KEY)
      const accounts = raw ? JSON.parse(raw) : []
      if (Array.isArray(accounts)) {
        const next = accounts.map((a) => (a.email === email ? apply(a) : a))
        localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(next))
      }
    } catch {
      // storage penuh / tidak tersedia — abaikan
    }

    // Jika akun yang dikeputusi sedang login, cerminkan ke sesi aktif juga.
    setUser((current) => (current?.email === email ? apply(current) : current))
  }

  const value = {
    user,
    isAuthenticated: Boolean(user),
    // Akses seller HANYA dari sellerProfile hasil ajuan yang disetujui.
    hasSellerAccess: Boolean(user?.sellerProfile),
    sellerApplication: user?.sellerApplication || null,
    register,
    login,
    logout,
    startSellerApplication,
    submitSellerApplication,
    decideSellerApplication,
    listSellerApplications,
    decideAdmin,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth harus dipakai di dalam <AuthProvider>')
  return ctx
}