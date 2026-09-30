#!/usr/bin/env node
// ============================================================================
// UJI quote_rental — JabSewa (TEST LIVE SUPABASE)
// ============================================================================
// Menjalankan 8 kasus uji kontrak quote_rental terhadap project live, memakai
// fixture dari scripts/.rental-fixture.json (dibuat oleh test-rental-fixture.mjs).
//
// Tahap test:
//   * LIVE Supabase  : semua kasus di file ini (RPC quote_rental via REST/PostgREST)
//   * FIXTURE        : data store/listing yang dipakai (dibuat tahap fixture)
//   * LOKAL          : tidak ada — quote_rental murni server-side
//
// Pakai: node scripts/test-quote-rental.mjs
// ============================================================================

import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = {}
for (const file of ['.env', '.env.local']) {
  if (!existsSync(file)) continue
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
}
const url = new URL(env.VITE_SUPABASE_URL).origin

const STATE_FILE = 'scripts/.rental-fixture.json'
if (!existsSync(STATE_FILE)) {
  console.error('✗ Fixture belum ada. Jalankan: node scripts/test-rental-fixture.mjs')
  process.exit(1)
}
const state = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
const [L1, L2] = state.listings // L1 price 150000 dep 2000000 stock 3; L2 price 40000 dep 500000 stock 2

// --- Klien: anon + buyer terautentikasi --------------------------------------
const anon = createClient(url, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const buyer = createClient(url, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
{
  const { error } = await buyer.auth.signInWithPassword({
    email: 'buyer.jabsewa.test@gmail.com', password: state.password,
  })
  if (error) { console.error('✗ login buyer: ' + error.message); process.exit(1) }
}

// --- Helper tanggal (future date deterministik) -------------------------------
const d = (offsetDays) => {
  const t = new Date()
  t.setDate(t.getDate() + offsetDays)
  return t.toISOString().slice(0, 10)
}

let pass = 0, fail = 0
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`) }
}
async function quote(client, start, end, items) {
  const { data, error } = await client.rpc('quote_rental', { p_start: start, p_end: end, p_items: items })
  return { row: data?.[0], rows: data?.length ?? 0, error }
}

// ════════════════════════════════════════════════════════════════════════════
console.log('== Kasus 1: rentang tanggal valid (buyer terautentikasi) ==')
{
  const { row, rows, error } = await quote(buyer, d(1), d(3), [{ listing_id: L1.id, quantity: 2 }])
  // 3 hari (inclusive) × 2 unit × 150000 = 900000; deposit 2 × 2000000 = 4000000
  check('ok=true, persis 1 baris', rows === 1 && row?.ok === true, `rows=${rows}`)
  check('total_days=3', row?.total_days === 3, `got=${row?.total_days}`)
  check('subtotal=900000', row?.subtotal === 900000, `got=${row?.subtotal}`)
  check('deposit_total=4000000', row?.deposit_total === 4000000, `got=${row?.deposit_total}`)
  check('total=4900000', row?.total === 4900000, `got=${row?.total}`)
  check('items[] berisi duration_units=3', row?.items?.[0]?.duration_units === 3, `got=${row?.items?.[0]?.duration_units}`)
}

console.log('== Kasus 2: rentang terbalik → invalid_date_range ==')
{
  const { row, rows, error } = await quote(buyer, d(3), d(1), [{ listing_id: L1.id, quantity: 1 }])
  check('tanpa exception PostgREST', !error, error?.message)
  check('ok=false, error=invalid_date_range', rows === 1 && row?.ok === false && row?.error === 'invalid_date_range', `rows=${rows}, error=${row?.error}`)
}

console.log('== Kasus 3: tanggal lampau → start_date_in_past ==')
{
  const { row, rows, error } = await quote(buyer, d(-2), d(-1), [{ listing_id: L1.id, quantity: 1 }])
  check('tanpa exception PostgREST', !error, error?.message)
  check('ok=false, error=start_date_in_past', rows === 1 && row?.ok === false && row?.error === 'start_date_in_past', `rows=${rows}, error=${row?.error}`)
}

console.log('== Kasus 4: listing tidak ditemukan → listing_not_found ==')
{
  const { row, rows, error } = await quote(buyer, d(1), d(2),
    [{ listing_id: '00000000-0000-0000-0000-000000000000', quantity: 1 }])
  check('tanpa exception PostgREST', !error, error?.message)
  check('ok=false, error=listing_not_found', rows === 1 && row?.ok === false && row?.error === 'listing_not_found', `rows=${rows}, error=${row?.error}`)
}

console.log('== Kasus 5: listing tidak aktif → listing_unavailable ==')
{
  // Buat listing nonaktif sementara via seller? Kontrak: save_listing p_available=false.
  // Untuk tidak mengubah fixture utama, pakai listing BARU nonaktif lalu dihapus di akhir.
  const seller = createClient(url, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  await seller.auth.signInWithPassword({ email: 'seller.jabsewa.test@gmail.com', password: state.password })
  const { data: cats } = await seller.from('categories').select('id').limit(1)
  const { data: cr } = await seller.rpc('save_listing', {
    p_store_id: state.store_id, p_category_id: cats[0].id,
    p_name: 'TMP Nonaktif QuoteTest', p_description: '', p_price: 10000,
    p_stock: 1, p_rental_unit: 'day', p_available: false,
  })
  const tmpId = cr?.[0]?.listing_id
  if (!tmpId) { check('persiapan listing nonaktif', false, cr?.[0]?.error || 'gagal'); }
  else {
    const { row, rows, error } = await quote(buyer, d(1), d(2), [{ listing_id: tmpId, quantity: 1 }])
    check('tanpa exception PostgREST', !error, error?.message)
    check('ok=false, error=listing_unavailable', rows === 1 && row?.ok === false && row?.error === 'listing_unavailable', `rows=${rows}, error=${row?.error}`)
    // rapikan: nonaktifkan permanen & hapus via SQL oleh cleanup (tandai di state)
    const pgx = await import('node:fs').then(() => null).catch(() => null)
    // hapus langsung via koneksi psql (listing tanpa transaksi aman dihapus)
    const { default: pg } = await import('pg')
    const c = new pg.Client({
      connectionString: env.DATABASE_URL,
      ssl: /sslmode=disable/.test(env.DATABASE_URL) ? false : { rejectUnauthorized: false },
    })
    await c.connect()
    await c.query(`DELETE FROM public.listings WHERE id=$1 AND name='TMP Nonaktif QuoteTest'`, [tmpId])
    await c.end()
    console.log('  (listing TMP dihapus kembali)')
  }
}

console.log('== Kasus 6: stok tidak tersedia → insufficient_stock ==')
{
  // stock L1 = 3 → minta 4
  const { row, rows, error } = await quote(buyer, d(1), d(2), [{ listing_id: L1.id, quantity: 4 }])
  check('tanpa exception PostgREST', !error, error?.message)
  check('ok=false, error=insufficient_stock', rows === 1 && row?.ok === false && row?.error === 'insufficient_stock', `rows=${rows}, error=${row?.error}`)
}

console.log('== Kasus 7: perhitungan durasi & harga (multi item, end inclusive) ==')
{
  // L1 3 hari x 1 unit: 3x150000=450000; L2 3 hari x 2 unit: 3x40000x2=240000
  const { row, rows, error } = await quote(buyer, d(5), d(7), [
    { listing_id: L1.id, quantity: 1 },
    { listing_id: L2.id, quantity: 2 },
  ])
  const subtotal = row?.items?.reduce((a, i) => a + (i.subtotal || 0), 0)
  check('ok=true, persis 1 baris', rows === 1 && row?.ok === true, `rows=${rows}`)
  check('total_days=3 (inclusive)', row?.total_days === 3, `got=${row?.total_days}`)
  check('subtotal item L1=450000', row?.items?.[0]?.subtotal === 450000, `got=${row?.items?.[0]?.subtotal}`)
  check('subtotal item L2=240000', row?.items?.[1]?.subtotal === 240000, `got=${row?.items?.[1]?.subtotal}`)
  check('subtotal agregat=690000', row?.subtotal === 690000, `got=${row?.subtotal}`)
  check('deposit_total=3000000 (2jt+2×500rb)', row?.deposit_total === 3000000, `got=${row?.deposit_total}`)
  check('total=3690000', row?.total === 3690000, `got=${row?.total}`)
  check('subtotal agregat = jumlah item', subtotal === row?.subtotal)
}

console.log('== Kasus 8: kontrak response {ok, error, ...} ==')
{
  const { row, error } = await quote(anon, d(1), d(2), [{ listing_id: L2.id, quantity: 1 }])
  check('anon boleh quote (EXECUTE)', !error, error?.message)
  check('bentuk kontrak: ok boolean, error null, kolom lengkap',
    typeof row?.ok === 'boolean' && 'error' in row && row?.error === null
    && 'total_days' in row && 'subtotal' in row && 'deposit_total' in row
    && 'total' in row && Array.isArray(row?.items),
    `keys=${Object.keys(row || {}).join(',')}`)
}

// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${pass} PASS, ${fail} FAIL`)
process.exit(fail === 0 ? 0 : 1)
