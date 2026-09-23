/*
 * ============================================================================
 * LISTINGS DATA LAYER — JabSewa (MODE MOCK / OFFLINE)
 * ============================================================================
 * Sumber data barang dari LocalStorage (src/lib/storage.js) — tanpa Supabase.
 *
 * Mapping bentuk store → bentuk item "kontrak" frontend (dipakai wishlist,
 * pesanan sewa, ProductDetail, dan Seller — jangan diubah):
 *   id          → id
 *   title       → name
 *   description → description
 *   category    → category
 *   price_per_day → price
 *   deposit     → deposit
 *   image_url   → image
 *   location    → location
 *   available   → available
 *   stores.name → seller (join lewat store_id)
 *
 * Semua fungsi async agar pemanggil (komponen) tidak perlu berubah.
 * Ganti isi modul ini dengan query Supabase nanti — kontrak tetap.
 * ============================================================================
 */

import { deleteItem, getItems, getStores, upsertItem } from "./storage";

function mapItem(item, storesById) {
  const store = storesById.get(item.store_id);
  return {
    id: item.id,
    name: item.title,
    category: item.category,
    price: item.price_per_day ?? 0,
    image: item.image_url || "",
    seller: store?.name || item.seller_name || "Mitra JabSewa",
    store_id: item.store_id ?? null,
    location: item.location || store?.city || "",
    available: item.available !== false,
    deposit: item.deposit ?? 0,
    description: item.description || "",
    rating: typeof item.rating === "number" ? item.rating : 0,
    total_transactions: item.total_transactions ?? 0,
  };
}

function mapAll(items) {
  const stores = getStores();
  const storesById = new Map(stores.map((s) => [s.id, s]));
  return items.map((item) => mapItem(item, storesById));
}

/**
 * Ambil semua listing dari LocalStorage (join nama toko via store_id).
 * Selalu berhasil — tidak ada jaringan, tidak ada fallback lain.
 */
export async function fetchListings() {
  return mapAll(getItems());
}

/**
 * Ambil satu listing berdasarkan id (bentuk kontrak sama dengan fetchListings).
 */
export async function fetchListingById(id) {
  const listings = await fetchListings();
  return listings.find((item) => String(item.id) === String(id)) || null;
}

/**
 * Listing milik SATU toko (seller side) — sebelumnya seller melihat
 * barang demo semua orang. Difilter lewat store_id.
 */
export async function fetchListingsByStore(storeId) {
  if (!storeId) return [];
  return mapAll(getItems().filter((item) => item.store_id === storeId));
}

/** Persist a listing through the temporary data layer. */
export function saveListing(listing) {
  return upsertItem({
    id: listing.id,
    store_id: listing.store_id,
    title: listing.name,
    description: listing.description || "",
    category: listing.category || "",
    price_per_day: Number(listing.price_per_day || 0),
    deposit: Number(listing.deposit || 0),
    image_url: listing.image_url || "",
    location: listing.location || "",
    available: listing.available !== false,
    rating: listing.rating ?? 0,
    total_transactions: listing.total_transactions ?? 0,
  });
}

export function updateListingAvailability(listingId, available) {
  return upsertItem({ id: listingId, available: Boolean(available) });
}

export function removeListing(listingId) {
  deleteItem(listingId);
}
