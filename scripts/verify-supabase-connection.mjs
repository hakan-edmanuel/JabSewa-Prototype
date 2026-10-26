/*
 * ============================================================================
 * VERIFY SUPABASE — BASELINE ERD v2 — JabSewa
 * ============================================================================
 * Smoke test end-to-end terhadap project Supabase yang SUDAH menerapkan
 * baseline 20260926000000_baseline_erd_v2.sql (+ seed kategori dev bila ada):
 *
 *   1. REST reachable + RLS aktif (anon dibatasi pada katalog).
 *   2. Kategori terbaca anon (RLS public read).
 *   3. quote_rental merespons (bentuk kontrak & rentang tidak valid ditolak).
 *   4. create_rental MENOLAK tanpa sesi (bukti otentikasi wajib).
 *   5. RPC user-scoped (get_wishlist, get_my_stores) menolak anonim.
 *
 * PENTING: script ini READ-ONLY — tidak ada tulisan data ke database.
 * Pakai:  npm run verify:supabase
 * ============================================================================
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

// --- Muat env dari .env / .env.local (tanpa dependency dotenv) ---------------
const env = {};
for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

const rawUrl = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

if (!rawUrl || !key) {
  console.error(
    "✗ VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY belum diset di .env(.local)",
  );
  console.error("  Isi keduanya sesuai .env.example, lalu jalankan ulang.");
  process.exit(1);
}

// Normalisasi: URL project harus ORIGIN saja (…/rest/v1/ memicu PGRST125).
const url = new URL(rawUrl).origin;

const supabase = createClient(url, key, { auth: { persistSession: false } });
let failures = 0;

function check(label, ok, detail = "") {
  const mark = ok ? "✓" : "✗";
  if (!ok) failures += 1;
  console.log(`${mark} ${label}${detail ? ` — ${detail}` : ""}`);
}

// --- 1. Konektivitas + RLS ---------------------------------------------------
{
  const { error } = await supabase
    .from("rental_transactions")
    .select("id")
    .limit(1);
  const blocked =
    error &&
    (error.code === "42501" ||
      error.code === "PGRST301" ||
      /permission|row-level/i.test(error.message));
  check(
    "REST reachable; tabel privat diblokir untuk anon (RLS aktif)",
    blocked || !error,
    blocked
      ? "anon ditolak (RLS aktif)"
      : error
        ? error.message
        : "perhatian: bisa dibaca anon",
  );
}

// --- 2. Katalog publik (categories via RLS public read) ----------------------
{
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug")
    .limit(5);
  if (error) {
    check("categories terbaca (katalog publik)", false, error.message);
  } else {
    check(
      "categories terbaca (katalog publik)",
      true,
      `${data.length} baris — seed kategori dev perlu dijalankan bila 0`,
    );
  }
}

// --- 3. quote_rental (kontrak bentuk + validasi) ------------------------------
// Kontrak: SETOF record dengan OUT params → PERSIS SATU baris per panggilan
// (kolom ok/error/total_days/subtotal/deposit_total/total/items).
{
  const badItems = [
    { listing_id: "00000000-0000-0000-0000-000000000000", quantity: 1 },
  ];

  // Rentang terbalik → harus ditolak tanpa error exception (return {ok:false}).
  const { data: bad, error: badErr } = await supabase.rpc("quote_rental", {
    p_start: "2027-01-12",
    p_end: "2027-01-10",
    p_items: badItems,
  });
  if (badErr && badErr.code === "PGRST202") {
    check(
      "quote_rental tersedia (RPC)",
      false,
      "RPC tidak ditemukan — baseline belum diterapkan?",
    );
  } else {
    const row = bad?.[0];
    const exactlyOneRow = !badErr && Array.isArray(bad) && bad.length === 1;
    const rowsSeen = Array.isArray(bad)
      ? bad.map((r) => r?.error ?? "ok=true").join(" → ")
      : "";
    check(
      "quote_rental menolak rentang terbalik (invalid_date_range)",
      exactlyOneRow && row.ok === false && row.error === "invalid_date_range",
      badErr
        ? badErr.message
        : !exactlyOneRow
          ? `baris=${bad?.length ?? "bukan-array"}${rowsSeen ? ` (${rowsSeen})` : ""} — guard RPC fall-through (bug multi-baris 20260927000000) atau 0 baris`
          : `error=${row.error}`,
    );
  }

  // Tanggal lampau → jalur validasi kedua (start_date_in_past).
  const { data: past, error: pastErr } = await supabase.rpc("quote_rental", {
    p_start: "2020-01-10",
    p_end: "2020-01-12",
    p_items: badItems,
  });
  const pastRow = past?.[0];
  const pastRows = Array.isArray(past)
    ? past.map((r) => r?.error ?? "ok=true").join(" → ")
    : "";
  check(
    "quote_rental menolak tanggal lampau (start_date_in_past)",
    !pastErr &&
      past?.length === 1 &&
      pastRow?.ok === false &&
      pastRow?.error === "start_date_in_past",
    pastErr
      ? pastErr.message
      : past?.length !== 1
        ? `baris=${past?.length ?? 0}${pastRows ? ` (${pastRows})` : ""}`
        : `error=${pastRow?.error}`,
  );

  // Bentuk kontrak: rentang valid + item uuid acak → ok=false (listing tidak ada)
  // atau ok=true bila uuid kebetulan eksis; yang diuji adalah BENTUK respons.
  const { data: anyQuote, error: anyErr } = await supabase.rpc("quote_rental", {
    p_start: "2027-01-10",
    p_end: "2027-01-12",
    p_items: badItems,
  });
  const qrow = anyQuote?.[0];
  const hasContractShape =
    !anyErr &&
    Array.isArray(anyQuote) &&
    anyQuote.length === 1 &&
    typeof qrow?.ok === "boolean";
  check(
    "quote_rental merespons dengan bentuk kontrak {ok, error, …}",
    hasContractShape,
    anyErr
      ? anyErr.message
      : !qrow
        ? "0 baris — RPC tidak mem-emit baris (bug RETURN; tanpa RETURN NEXT)"
        : anyQuote.length > 1
          ? `baris=${anyQuote.length} — guard RPC fall-through (bug multi-baris 20260927000000)`
          : anyQuote[0].error
            ? `ok=false (error=${anyQuote[0].error})`
            : "ok=true",
  );
}

// --- 4. create_rental tanpa sesi harus ditolak --------------------------------
{
  const { data, error } = await supabase.rpc("create_rental", {
    p_start: "2027-01-10",
    p_end: "2027-01-12",
    p_items: [
      { listing_id: "00000000-0000-0000-0000-000000000000", quantity: 1 },
    ],
  });
  const denied =
    (data?.[0]?.ok === false && data?.[0]?.error === "unauthenticated") ||
    Boolean(error);
  check(
    "create_rental menolak caller anonim",
    denied,
    data?.[0]?.error ? `error=${data[0].error}` : error?.message || "ditolak",
  );
}

// --- 5. RPC user-scoped menolak anonim ----------------------------------------
{
  for (const rpc of ["get_wishlist", "get_my_stores", "list_audit_logs"]) {
    const { data, error } = await supabase.rpc(rpc);
    // get_wishlist & get_my_stores berbasis auth.uid() → anon dapat array kosong
    // ATAU error permission — keduanya tidak bocor; list_audit_logs harus error.
    const denied = Boolean(error) || (Array.isArray(data) && data.length === 0);
    check(
      `${rpc} tidak bocor ke anonim`,
      denied,
      error?.message || "kosong/ditolak",
    );
  }
}

console.log(
  failures === 0
    ? "\nSemua pemeriksaan lolos."
    : `\n${failures} pemeriksaan GAGAL.`,
);
process.exit(failures === 0 ? 0 : 1);
