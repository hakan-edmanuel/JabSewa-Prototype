#!/usr/bin/env node
// ============================================================================
// CLEANUP FIXTURE TEST RENTAL — JabSewa
// ============================================================================
// Menghapus SELURUH data fixture berdasarkan scripts/.rental-fixture.json,
// dalam urutan aman FK:
//   1. listings fixture (delete_listing via RPC owner? tidak — user auth akan
//      dihapus; langsung SQL)
//   2. store seller (CASCADE → listing_images)
//   3. profil public.users (3) — audit_logs actor RESTRICT di-NULL-kan dulu?
//      audit_logs.actor_id RESTRICT → hapus audit_logs fixture dulu
//   4. auth.users (3) — CASCADE menghapus profil & wishlist
//
// HANYA data fixture (id dari state file). Data lain tidak disentuh.
// Pakai: node scripts/test-rental-cleanup.mjs
// ============================================================================

import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const env = {};
for (const file of [".env", ".env.local"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

const STATE_FILE = "scripts/.rental-fixture.json";
if (!existsSync(STATE_FILE)) {
  console.log(
    "Tidak ada file state fixture — tidak ada yang perlu dibersihkan.",
  );
  process.exit(0);
}
const state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
// Semua user fixture (utama + tambahan buyer2/seller2 dari test create_rental)
const ids = [
  ...Object.values(state.users || {}),
  ...Object.values(state.extra?.users || {}),
].map((u) => u.id);
const listingIds = [
  ...(state.listings || []).map((l) => l.id),
  ...(state.extra?.listing_l2a?.id ? [state.extra.listing_l2a.id] : []),
];
const storeIds = [state.store_id, state.extra?.store2?.id].filter(Boolean);

const c = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: /sslmode=disable/.test(env.DATABASE_URL)
    ? false
    : { rejectUnauthorized: false },
});
await c.connect();

await c.query("BEGIN");
try {
  // 0-pre. reviews / disputes / late_fees fixture (RESTRICT/CASCADE ke rental)
  if (ids.length || storeIds.length) {
    const rf = await c.query(
      `DELETE FROM public.reviews WHERE transaction_id IN
         (SELECT id FROM public.rental_transactions
           WHERE buyer_id = ANY($1::uuid[]) OR store_id = ANY($2::uuid[]))`,
      [ids, storeIds],
    );
    console.log(`reviews dihapus: ${rf.rowCount}`);
    const rd = await c.query(
      `DELETE FROM public.disputes WHERE transaction_id IN
         (SELECT id FROM public.rental_transactions
           WHERE buyer_id = ANY($1::uuid[]) OR store_id = ANY($2::uuid[]))`,
      [ids, storeIds],
    );
    console.log(`disputes dihapus: ${rd.rowCount}`);
    const rlf = await c.query(
      `DELETE FROM public.late_fees WHERE transaction_id IN
         (SELECT id FROM public.rental_transactions
           WHERE buyer_id = ANY($1::uuid[]) OR store_id = ANY($2::uuid[]))`,
      [ids, storeIds],
    );
    console.log(`late_fees dihapus: ${rlf.rowCount}`);
  }

  // 0a. payments milik transaksi fixture (RESTRICT dari rental_transactions)
  if (ids.length || storeIds.length) {
    const r = await c.query(
      `DELETE FROM public.payments WHERE transaction_id IN
         (SELECT id FROM public.rental_transactions
           WHERE buyer_id = ANY($1::uuid[]) OR store_id = ANY($2::uuid[]))`,
      [ids, storeIds],
    );
    console.log(`payments dihapus: ${r.rowCount}`);
  }

  // 0b. rental_transactions fixture (transaction_items CASCADE)
  if (ids.length || storeIds.length) {
    const r = await c.query(
      `DELETE FROM public.rental_transactions
        WHERE buyer_id = ANY($1::uuid[]) OR store_id = ANY($2::uuid[])`,
      [ids, storeIds],
    );
    console.log(`rental_transactions dihapus: ${r.rowCount}`);
  }

  // 0. wishlists fixture (CASCADE dari users sebenarnya, tapi eksplisit lebih jelas)
  if (ids.length) {
    const r = await c.query(
      `DELETE FROM public.wishlists WHERE user_id = ANY($1::uuid[])`,
      [ids],
    );
    console.log(`wishlists dihapus: ${r.rowCount}`);
  }

  // 1. listing fixture + gambar (CASCADE)
  for (const lid of listingIds) {
    const r = await c.query(`DELETE FROM public.listings WHERE id=$1`, [lid]);
    console.log(`listing ${lid.slice(0, 8)}… dihapus: ${r.rowCount}`);
  }

  // 2. store seller (utama + store2)
  for (const sid of storeIds) {
    const r = await c.query(`DELETE FROM public.stores WHERE id=$1`, [sid]);
    console.log(`store ${sid.slice(0, 8)}… dihapus: ${r.rowCount}`);
  }

  // 3. audit_logs (actor RESTRICT) + store_applications
  if (ids.length) {
    const r1 = await c.query(
      `DELETE FROM public.audit_logs WHERE actor_id = ANY($1::uuid[])`,
      [ids],
    );
    console.log(`audit_logs dihapus: ${r1.rowCount}`);
    const r2 = await c.query(
      `DELETE FROM public.store_applications WHERE user_id = ANY($1::uuid[])`,
      [ids],
    );
    console.log(`store_applications dihapus: ${r2.rowCount}`);
  }

  // 4. profil public.users (RESTRICT dari rental jika ada → transaksi harus 0)
  if (ids.length) {
    const r = await c.query(
      `DELETE FROM public.users WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    console.log(`profil users dihapus: ${r.rowCount}`);
  }

  await c.query("COMMIT");
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  console.error("✗ cleanup gagal, rollback: " + e.message);
  await c.end();
  process.exit(1);
}
await c.end();

// 5. auth.users via service role (perlu key; CASCADE ke public.users)
const serviceKey =
  process.env.JABSEWA_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "";
const url = new URL(env.VITE_SUPABASE_URL).origin;
if (!serviceKey && !env.DATABASE_URL) {
  console.log(
    "\n⚠ Data bisnis sudah bersih. auth.users TIDAK dihapus (butuh service role key atau DATABASE_URL).",
  );
  console.log(
    "  Jalankan: JABSEWA_SERVICE_ROLE_KEY=<key> node scripts/test-rental-cleanup.mjs",
  );
  console.log("  atau hapus manual di Dashboard: Authentication → Users.");
  process.exit(0);
}
if (!serviceKey) {
  // Fallback: hapus auth.users via koneksi Postgres langsung (DATABASE_URL).
  // FK users.id → auth.users CASCADE, jadi profil public.users ikut terhapus.
  const c2 = new pg.Client({
    connectionString: env.DATABASE_URL,
    ssl: /sslmode=disable/.test(env.DATABASE_URL)
      ? false
      : { rejectUnauthorized: false },
  });
  await c2.connect();
  for (const id of ids) {
    const r = await c2.query(`DELETE FROM auth.users WHERE id = $1`, [id]);
    console.log(
      `auth user ${id.slice(0, 8)}… : ${r.rowCount ? "dihapus (via SQL)" : "tidak ditemukan"}`,
    );
  }
  await c2.end();
  unlinkSync(STATE_FILE);
  console.log("\n✓ Cleanup selesai (via DATABASE_URL). File state dihapus.");
  process.exit(0);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
for (const id of ids) {
  const { error } = await admin.auth.admin.deleteUser(id);
  console.log(
    `auth user ${id.slice(0, 8)}… : ${error ? "GAGAL — " + error.message : "dihapus"}`,
  );
}

unlinkSync(STATE_FILE);
console.log("\n✓ Cleanup selesai. File state dihapus.");
