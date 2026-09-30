/*
 * ============================================================================
 * SUPABASE CLIENT — JabSewa
 * ============================================================================
 * Satu-satunya tempat yang membuat instance Supabase. Semua modul data
 * (listings, userData, search) mengimpor dari sini.
 *
 * Konfigurasi (Vite env, prefix VITE_):
 *   VITE_SUPABASE_URL      — project URL, cth: https://xxxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY — anon / publishable key (PUBLIK-safe, bukan secret)
 *
 * JANGAN pernah menaruh service_role key atau password DB di env frontend —
 * service-role hanya untuk tooling server-side tepercaya (aturan scope).
 *
 * Jika env tidak lengkap → isSupabaseConfigured = false dan getClient()
 * melempar error yang jelas; pemanggil memutuskan fallback demo atau pesan
 * error UI. Tidak ada default hard-coded.
 * ============================================================================
 */

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Normalisasi URL project: bila user menempel URL lengkap REST
 * (…/rest/v1/) atau trailing slash, pakai ORIGIN-nya saja. supabase-js
 * menambahkan /rest/v1, /auth/v1, dst. sendiri — path ganda memicu
 * error PGRST125 "Invalid path specified in request URL".
 */
function normalizeProjectUrl(raw) {
  if (!raw) return ''
  try {
    return new URL(raw).origin
  } catch {
    return String(raw).replace(/\/+$/, '')
  }
}

export const SUPABASE_URL = normalizeProjectUrl(url)
export const SUPABASE_ANON_KEY = anonKey || ''

/** true bila URL + anon key tersedia — app berjalan mode Supabase penuh. */
export const isSupabaseConfigured = Boolean(url && anonKey)

let client = null

/** Client singleton (dibuat lazy supaya import tidak melempar saat env kosong). */
export function getClient() {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase belum dikonfigurasi: isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di .env.local')
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'jabsewa:auth:v1',
      },
    })
  }
  return client
}
