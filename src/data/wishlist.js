/*
 * ============================================================================
 * WISHLIST DATA LAYER — JabSewa (Supabase)
 * ============================================================================
 * Wishlist milik sesi login. Scope DITENTUKAN SERVER (RPC memakai auth.uid())
 * — tidak ada parameter userId dari client, karena parameter itu tidak pernah
 * dipakai dan menyiratkan otorisasi yang tidak ada.
 * ============================================================================
 */

import { getClient, isSupabaseConfigured } from './supabaseClient'

function requireConfigured() {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase belum dikonfigurasi: isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di .env.local',
    )
  }
}

/** Wishlist user login → array id listing (uuid string). */
export async function getWishlist() {
  requireConfigured()
  const { data, error } = await getClient().rpc('get_wishlist')
  if (error) throw error
  return (data || []).map((row) => row.listing_id)
}

/** Toggle satu listing di wishlist; mengembalikan daftar id terbaru. */
export async function toggleWishlist(listingId) {
  requireConfigured()
  const { data, error } = await getClient().rpc('toggle_wishlist', {
    p_listing_id: listingId,
  })
  if (error) throw error
  const row = data?.[0]
  if (!row?.ok) throw new Error(row?.error || 'forbidden')
  return getWishlist()
}
