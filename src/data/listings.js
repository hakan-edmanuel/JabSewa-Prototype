/*
 * ============================================================================
 * LISTINGS DATA LAYER — JabSewa (SUPABASE, ERD v2)
 * ============================================================================
 * Supabase adalah SUMBER KEBENARAN katalog. Kontrak bentuk item frontend:
 *
 *   id          → id            (uuid string — D3)
 *   name        → name
 *   description → description
 *   category_id → category (uuid dari tabel categories)
 *   price       → price (bigint IDR per rental_unit — D2)
 *   deposit     → deposit
 *   image       → gambar listing_images sort_order terkecil (fallback '')
 *   images      → seluruh URL gambar (urut sort_order)
 *   rental_unit → rental_unit ('day'|'week'|'month')
 *   min_rental_duration → durasi minimum (unit rental_unit)
 *   stock       → stock
 *   seller      → stores.name
 *   store_id    → store_id (uuid)
 *   location    → stores.address (ringkas)
 *   available   → status === 'active' && stock > 0 (display-only)
 *
 * TANPA fallback LocalStorage: bila env Supabase tidak diset, fungsi melempar
 * error konfigurasi yang jelas (aturan master prompt §11). Mode demo (bila
 * dibutuhkan) harus entry point eksplisit terpisah — bukan fallback diam-diam.
 * ============================================================================
 */

import { getClient, isSupabaseConfigured } from "./supabaseClient";

function requireConfigured() {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase belum dikonfigurasi: isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di .env.local",
    );
  }
}

/** Bentuk kontrak frontend dari baris DB (listing + join stores). */
function mapListing(row) {
  const images = (row.listing_images || [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((img) => img.image_url)
    .filter(Boolean);
  return {
    id: row.id,
    name: row.name,
    // `category` = slug kategori (untuk filter), `category_name` = label tampilan.
    category: row.categories?.slug || null,
    category_name: row.categories?.name || null,
    category_id: row.category_id,
    price: row.price ?? 0,
    deposit: row.deposit ?? 0,
    image: images[0] || "",
    images,
    rental_unit: row.rental_unit || "day",
    min_rental_duration: row.min_rental_duration ?? null,
    stock: row.stock ?? 0,
    seller: row.stores?.name || "Toko JabSewa",
    store_id: row.store_id ?? null,
    location: row.stores?.address || "",
    // Display-only: ketersediaan periode aktual dihitung server saat quote/booking.
    available: row.status === "active" && (row.stock ?? 0) > 0,
    description: row.description || "",
  };
}

const LISTING_SELECT = `
  id, store_id, category_id, name, description, price, deposit, stock,
  rental_unit, min_rental_duration, status, created_at,
  stores(name, address, status),
  categories(slug, name),
  listing_images(image_url, sort_order)
`;

/* ------------------------------- Katalog --------------------------------- */

/** Katalog aktif (listing aktif di toko aktif — RLS menegakkan). */
export async function fetchListings() {
  requireConfigured();
  const { data, error } = await getClient()
    .from("listings")
    .select(LISTING_SELECT)
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapListing);
}

/** Satu listing berdasarkan id (uuid string). */
export async function fetchListingById(id) {
  requireConfigured();
  const { data, error } = await getClient()
    .from("listings")
    .select(LISTING_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapListing(data) : null;
}

/** Kategori dari tabel categories (id + name; label map untuk UI). */
export async function fetchCategories() {
  requireConfigured();
  const { data, error } = await getClient()
    .from("categories")
    .select("id, name, slug")
    .order("name");
  if (error) throw error;
  return data || [];
}

/** Toko aktif untuk pencarian & kartu toko. */
export async function fetchStores() {
  requireConfigured();
  const { data, error } = await getClient()
    .from("stores")
    .select("id, name, description, address, logo_url, status")
    .eq("status", "active")
    .order("name");
  if (error) throw error;
  return (data || []).map((s) => ({
    id: s.id,
    store_name: s.name,
    description: s.description || "",
    city: (s.address || "").split(",")[0] || "",
    is_verified: false, // kolom verifikasi tidak ada di ERD v2
  }));
}

/* ----------------------------- Seller read ------------------------------- */

/**
 * Katalog listing milik toko milik seller login — direct SELECT, RLS-scoped:
 * policy listings_read hanya mengekspos listing milik pemilik (via stores
 * owner_id = auth.uid()) — identitas dari sesi, bukan parameter client.
 * Tidak ada argumen storeId: parameter itu dulu diterima lalu diabaikan.
 */
export async function listMyListings() {
  requireConfigured();
  const { data, error } = await getClient()
    .from("listings")
    .select(LISTING_SELECT)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapListing);
}

/* ------------------------------ Seller CRUD ------------------------------ */

/**
 * Simpan (tambah/edit) listing pada toko milik seller login.
 * Semua nilai divalidasi server (RPC save_listing) — frontend tidak dipercaya.
 * images: array URL string (urut) — replace penuh bila disertakan.
 */
export async function saveListing(listing) {
  requireConfigured();
  const { data, error } = await getClient().rpc("save_listing", {
    p_listing_id: listing.id ?? null,
    p_store_id: listing.store_id ?? null,
    p_category_id: listing.category_id ?? listing.category ?? null,
    p_name: listing.name,
    p_description: listing.description || "",
    p_price: Number(listing.price ?? 0),
    p_deposit: Number(listing.deposit ?? 0),
    p_stock: Number(listing.stock ?? 1),
    p_rental_unit: listing.rental_unit || "day",
    p_min_rental_duration: listing.min_rental_duration ?? null,
    p_available: listing.available !== false,
    p_image_urls: Array.isArray(listing.images) ? listing.images : null,
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row?.ok) throw new Error(row?.error || "save_failed");
  return row.listing_id;
}

export async function updateListingAvailability(listingId, available) {
  requireConfigured();
  const { data, error } = await getClient().rpc("set_listing_availability", {
    p_listing_id: listingId,
    p_available: Boolean(available),
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row?.ok) throw new Error(row?.error || "update_failed");
  return true;
}

export async function removeListing(listingId) {
  requireConfigured();
  const { data, error } = await getClient().rpc("delete_listing", {
    p_listing_id: listingId,
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row?.ok) throw new Error(row?.error || "delete_failed");
  return true;
}
