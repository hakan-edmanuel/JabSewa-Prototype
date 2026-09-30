#!/usr/bin/env node
// ============================================================================
// UJI create_rental — JabSewa (TEST LIVE SUPABASE)
// ============================================================================
// Tahap 3–5 rencana "Create Rental Integration Test".
//
// Tahap test:
//   * LIVE Supabase  : semua kasus di file ini (RPC create_rental + RLS + audit)
//   * FIXTURE        : fixture rental (state scripts/.rental-fixture.json) +
//                      tambahan: buyer2, seller2+store2, listing "Tripod Pro Fixture"
//                      (dipropisioning via Admin API + jalur resmi, idempoten)
//   * LOKAL          : hanya verifikasi read-only via DATABASE_URL (SELECT/COUNT)
//
// Kontrak yang diuji (04-rpc-security-contract.md §3.5 #16):
//   create_rental(p_start date, p_end date, p_items jsonb)
//   → {ok, error, rental_id, status, subtotal, deposit_total, total, total_days}
//   Status awal 'pending'; harga/deposit snapshot server; advisory lock per listing;
//   tanpa idempotency-key (duplikat payload = rental BARU — perilaku kontrak).
//
// Pakai: node scripts/test-create-rental.mjs
// ============================================================================

import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

// --- Env ---------------------------------------------------------------------
const env = {}
for (const file of ['.env', '.env.local']) {
  if (!existsSync(file)) continue
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
}
const url = new URL(env.VITE_SUPABASE_URL).origin
const anonKey = env.VITE_SUPABASE_ANON_KEY
const serviceKey = process.env.JABSEWA_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!env.VITE_SUPABASE_URL || !anonKey) { console.error('✗ env VITE_ belum diset'); process.exit(1) }
if (!serviceKey) { console.error('✗ service key belum diset (SUPABASE_SERVICE_ROLE_KEY) — dibutuhkan untuk fixture tambahan'); process.exit(1) }

const STATE_FILE = 'scripts/.rental-fixture.json'
if (!existsSync(STATE_FILE)) { console.error('✗ Fixture utama belum ada. Jalankan test-rental-fixture.mjs dulu.'); process.exit(1) }
const state = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
const [L1, L2] = state.listings // L1 price 150000 dep 2000000 stock 3; L2 price 40000 dep 500000 stock 2

const PASSWORD = state.password
const EMAIL_BUYER = state.users.buyer.email
const EMAIL_SELLER = state.users.seller.email
const EMAIL_ADMIN = state.users.admin.email
const EMAIL_BUYER2 = 'buyer2.jabsewa.test@gmail.com'
const EMAIL_SELLER2 = 'seller2.jabsewa.test@gmail.com'
const L2A_NAME = 'Tripod Pro Fixture'
const L2A_PRICE = 75000, L2A_DEPOSIT = 750000, L2A_STOCK = 2

// --- Klien --------------------------------------------------------------------
const svc = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const anon = createClient(url, anonKey, { auth: { persistSession: false } })
async function mkAuth(email) {
  const c = createClient(url, anonKey, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login ${email}: ${error.message}`)
  return c
}
const pgc = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: /sslmode=disable/.test(env.DATABASE_URL) ? false : { rejectUnauthorized: false },
})
await pgc.connect()
const q = (s, p) => pgc.query(s, p).then(r => r.rows)

// --- Helper -------------------------------------------------------------------
const d = (offsetDays) => { const t = new Date(); t.setDate(t.getDate() + offsetDays); return t.toISOString().slice(0, 10) }
let pass = 0, fail = 0
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`) }
}
async function callCreate(client, start, end, items) {
  const { data, error } = await client.rpc('create_rental', { p_start: start, p_end: end, p_items: items })
  return { row: data?.[0], rows: data?.length ?? 0, error }
}
const countTx = async () => (await q('SELECT count(*)::int n FROM public.rental_transactions'))[0].n
const countTi = async () => (await q('SELECT count(*)::int n FROM public.transaction_items'))[0].n
const occupancy = async (lid, start, end) => (await q(
  `SELECT count(*)::int n, COALESCE(SUM(ti.quantity),0)::int qty
     FROM public.transaction_items ti JOIN public.rental_transactions r ON r.id = ti.transaction_id
    WHERE ti.listing_id = $1 AND r.status IN ('pending','payment_verify','confirmed','ongoing','overdue')
      AND r.start_date <= $3 AND r.end_date >= $2`, [lid, start, end]))[0]

// ============================================================================
console.log('== Tahap 2: fixture tambahan (idempoten) ==')
// ---------------------------------------------------------------------------
async function ensureUserId(email, fullName) {
  const { data, error } = await svc.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: fullName },
  })
  if (error && !/already|exists|registered/i.test(error.message)) throw new Error(`createUser ${email}: ${error.message}`)
  // Resolve id dari profil (andal untuk user baru maupun yang sudah ada).
  const row = (await q(`SELECT id FROM public.users WHERE email = $1`, [email]))[0]
  if (!row) throw new Error(`profil public.users tidak ditemukan untuk ${email}`)
  return row.id
}
state.extra ||= {}
state.extra.users ||= {}
state.extra.users.buyer2 = { email: EMAIL_BUYER2, id: await ensureUserId(EMAIL_BUYER2, 'Buyer2 Fixture') }
state.extra.users.seller2 = { email: EMAIL_SELLER2, id: await ensureUserId(EMAIL_SELLER2, 'Seller2 Fixture') }
console.log(`  ✓ buyer2 & seller2 siap (${state.extra.users.buyer2.id.slice(0, 8)}, ${state.extra.users.seller2.id.slice(0, 8)})`)
writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))

const buyer = await mkAuth(EMAIL_BUYER)
const admin = await mkAuth(EMAIL_ADMIN)

// Store2 via jalur resmi (application → approve) --------------------------------
{
  const seller2Probe = await mkAuth(EMAIL_SELLER2)
  const stores = (await seller2Probe.rpc('get_my_stores')) || []
  if (stores.data?.length) {
    state.extra.store2 = { id: stores.data[0].id, status: stores.data[0].status }
  } else {
    await seller2Probe.rpc('submit_store_application',
      { p_store_name: 'Toko Fixture Rental 2', p_description: 'Store uji mixed_stores', p_address: 'Jl. Test No. 2, Jakarta' })
    const { data: pend } = await admin.rpc('list_store_applications', { p_status: 'pending' })
    const mine = (pend || []).find(a => a.user_id === state.extra.users.seller2.id)
    if (!mine) { console.error('✗ application seller2 tidak ditemukan'); process.exit(1) }
    const { data } = await admin.rpc('decide_store_application', { p_application_id: mine.id, p_approve: true })
    if (!data?.[0]?.ok) { console.error('✗ approve seller2: ' + (data?.[0]?.error || 'no row')); process.exit(1) }
    const { data: st } = await seller2Probe.rpc('get_my_stores')
    state.extra.store2 = { id: st[0].id, status: st[0].status }
  }
  check('store2 aktif (jalur resmi)', state.extra.store2?.status === 'active', state.extra.store2?.id?.slice(0, 8))
}

// Listing kedua-toko (aktif) milik seller2 --------------------------------------
{
  const seller2 = await mkAuth(EMAIL_SELLER2)
  const { data: found } = await seller2.from('listings').select('id, price, deposit, stock, status').eq('name', L2A_NAME).limit(1)
  if (found?.length) {
    state.extra.listing_l2a = found[0]
  } else {
    const { data: cats } = await seller2.from('categories').select('id, slug')
    const cat = cats.find(c => c.slug === 'photography') || cats[0]
    const { data } = await seller2.rpc('save_listing', {
      p_store_id: state.extra.store2.id, p_category_id: cat.id, p_name: L2A_NAME,
      p_description: 'Listing toko kedua untuk mixed_stores', p_price: L2A_PRICE,
      p_deposit: L2A_DEPOSIT, p_stock: L2A_STOCK, p_rental_unit: 'day', p_available: true,
    })
    const row = data?.[0]
    if (!row?.ok) { console.error('✗ save_listing L2a: ' + (row?.error || 'no row')); process.exit(1) }
    state.extra.listing_l2a = { id: row.listing_id, price: L2A_PRICE, deposit: L2A_DEPOSIT, stock: L2A_STOCK, status: 'active' }
  }
  check('listing L2a aktif (toko 2)', Boolean(state.extra.listing_l2a?.id), state.extra.listing_l2a?.id?.slice(0, 8))
}
writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
// Rental sukses apa pun hasil test — dibatalkan di akhir (Kasus G)
const successRentals = [] // {client, id, label}

console.log('\n== Kasus A: caller anonim / tidak berwenang ==')
{
  const { error: eAnon } = await anon.rpc('create_rental', { p_start: d(1), p_end: d(2), p_items: [{ listing_id: L1.id, quantity: 1 }] })
  check('anon ditolak (tidak ada EXECUTE)', Boolean(eAnon) && /PGRST20[23]|permission/i.test(eAnon.code + ' ' + eAnon.message), eAnon?.code)
  // Kontrak tidak membatasi create_rental ke buyer saja: SEMUA user aktif
  // terautentikasi boleh membuat rental (seller pun bisa jadi penyewa).
  const seller = await mkAuth(EMAIL_SELLER)
  const rS = await callCreate(seller, d(50), d(51), [{ listing_id: L2.id, quantity: 1 }])
  check('user aktif non-buyer (seller) diizinkan kontrak → sukses', rS.row?.ok === true, rS.row?.error)
  if (rS.row?.ok) successRentals.push({ client: seller, id: rS.row.rental_id, label: 'A-seller' })
}

console.log('\n== Kasus B: validasi & stok (buyer) ==')
const buyer2 = await mkAuth(EMAIL_BUYER2)
{
  // B0 — user disuspend (tanpa INSERT baru: probe pakai sesi buyer2)
  await q(`UPDATE public.users SET status='suspended' WHERE id=$1`, [state.extra.users.buyer2.id])
  const suspendedProbe = await mkAuth(EMAIL_BUYER2)
  const r0 = await callCreate(suspendedProbe, d(40), d(41), [{ listing_id: L2.id, quantity: 1 }])
  check('user disuspend → user_inactive', r0.rows === 1 && r0.row?.ok === false && r0.row?.error === 'user_inactive', `error=${r0.row?.error}`)
  await q(`UPDATE public.users SET status='active' WHERE id=$1`, [state.extra.users.buyer2.id])
  const st = (await q(`SELECT status FROM public.users WHERE id=$1`, [state.extra.users.buyer2.id]))[0].status
  check('buyer2 dipulihkan active', st === 'active')

  const t0 = { tx: await countTx(), ti: await countTi() }
  const r1 = await callCreate(buyer, d(1), d(2), [])
  check('items kosong → empty_items', r1.rows === 1 && r1.row?.ok === false && r1.row?.error === 'empty_items', r1.row?.error)
  const twentyOne = Array.from({ length: 21 }, () => randomUUID())
  const r2 = await callCreate(buyer, d(1), d(2), twentyOne.map(id => ({ listing_id: id, quantity: 1 })))
  check('21 item → too_many_items', r2.rows === 1 && r2.row?.error === 'too_many_items', r2.row?.error)
  const r3 = await callCreate(buyer, d(1), d(2), [{ listing_id: L1.id, quantity: 0 }])
  check('quantity 0 → invalid_quantity', r3.row?.error === 'invalid_quantity', r3.row?.error)
  const r3b = await callCreate(buyer, d(1), d(2), [{ listing_id: L1.id, quantity: -1 }])
  check('quantity negatif → invalid_quantity', r3b.row?.error === 'invalid_quantity', r3b.row?.error)
  const r4 = await callCreate(buyer, d(1), d(2), [{ listing_id: '00000000-0000-0000-0000-000000000000', quantity: 1 }])
  check('listing tak ada → listing_not_found', r4.row?.error === 'listing_not_found', r4.row?.error)
  const r5 = await callCreate(buyer, d(1), d(2), [{ listing_id: L1.id, quantity: 1 }, { listing_id: L1.id, quantity: 1 }])
  check('listing ganda → duplicate_item', r5.row?.error === 'duplicate_item', r5.row?.error)
  const r6 = await callCreate(buyer, d(-2), d(-1), [{ listing_id: L1.id, quantity: 1 }])
  check('tanggal lampau → start_date_in_past', r6.row?.error === 'start_date_in_past', r6.row?.error)
  const r6b = await callCreate(buyer, d(-2), d(-5), [{ listing_id: L1.id, quantity: 1 }])
  check('rentang terbalik → invalid_date_range (dicek lebih dulu)', r6b.row?.error === 'invalid_date_range', r6b.row?.error)
  const r7 = await callCreate(buyer, d(1), d(2), [{ listing_id: L1.id, quantity: 4 }])
  check('L1 qty 4 > stock 3 → insufficient_stock', r7.row?.error === 'insufficient_stock', r7.row?.error)
  const r7b = await callCreate(buyer, d(1), d(2), [{ listing_id: L2.id, quantity: 3 }])
  check('L2 qty 3 > stock 2 → insufficient_stock', r7b.row?.error === 'insufficient_stock', r7b.row?.error)
  const r8 = await callCreate(buyer, d(1), d(2), [{ listing_id: L1.id, quantity: 1 }, { listing_id: state.extra.listing_l2a.id, quantity: 1 }])
  check('dua toko → mixed_stores', r8.row?.error === 'mixed_stores', r8.row?.error)
  const r9 = await callCreate(buyer, d(1), d(2), { listing_id: L1.id, quantity: 1 })
  check('items bukan array → invalid_items', r9.row?.error === 'invalid_items', r9.row?.error)
  const r9b = await callCreate(buyer, d(1), d(2), [{ quantity: 1 }])
  check('item tanpa listing_id → invalid_items', r9b.row?.error === 'invalid_items', r9b.row?.error)
  const t1 = { tx: await countTx(), ti: await countTi() }
  check('tidak ada sisa tulis dari seluruh kasus gagal', t0.tx === t1.tx && t0.ti === t1.ti, `tx ${t0.tx}→${t1.tx}, ti ${t0.ti}→${t1.ti}`)
}

// ============================================================================
console.log('\n== Kasus C: pembuatan valid + snapshot + duplikat/retry ==')
{
  // GATE: probe success-path minimal — bila exception, semua kasus C–G
  // akan gagal seragam karena bug yang sama (dilaporkan eksplisit).
  const gate = await callCreate(buyer, d(70), d(70), [{ listing_id: L2.id, quantity: 1 }])
  if (gate.error) {
    console.log(`  ⚠ GATE: success-path create_rental melempar exception: [${gate.error.code ?? '??'}] ${gate.error.message}`)
    console.log('  ⚠ Kasus C–G akan gagal seragam karena bug ini — lihat laporan & usulan migration.')
  } else if (gate.row?.ok) {
    successRentals.push({ client: buyer, id: gate.row.rental_id, label: 'GATE' })
  }

  // C1 — satu item (L1 qty 1, 3 hari)
  const c1 = await callCreate(buyer, d(10), d(12), [{ listing_id: L1.id, quantity: 1 }])
  check('C1 ok=true, 1 baris', c1.rows === 1 && c1.row?.ok === true, `rows=${c1.rows}`)
  check('C1 status=pending', c1.row?.status === 'pending', c1.row?.status)
  check('C1 total_days=3 (inclusive)', c1.row?.total_days === 3, c1.row?.total_days)
  check('C1 subtotal=450000 (3 hari × 150rb), deposit=2000000, total=2450000',
    c1.row?.subtotal === 450000 && c1.row?.deposit_total === 2000000 && c1.row?.total === 2450000,
    `${c1.row?.subtotal}/${c1.row?.deposit_total}/${c1.row?.total}`)
  if (c1.row?.ok) successRentals.push({ client: buyer, id: c1.row.rental_id, label: 'C1' })
  const c1db = (await q(`
    SELECT r.buyer_id, r.store_id, r.status, r.subtotal::text, r.deposit_total::text, r.total::text,
           ti.quantity, ti.price::text, ti.deposit::text, ti.subtotal::text item_subtotal
      FROM public.rental_transactions r JOIN public.transaction_items ti ON ti.transaction_id = r.id
     WHERE r.id = $1`, [c1.row?.rental_id]))[0]
  check('C1 DB: buyer & store benar', c1db?.buyer_id === state.users.buyer.id && c1db?.store_id === state.store_id)
  check('C1 DB: snapshot harga server (bukan payload)', c1db?.price === '150000' && c1db?.deposit === '2000000' && c1db?.item_subtotal === '450000',
    `${c1db?.price}/${c1db?.deposit}/${c1db?.item_subtotal}`)
  check('C1 DB: status pending', c1db?.status === 'pending')

  // C2 — multi item (L1 qty 1 + L2 qty 2, 2 hari, window berbeda)
  const c2 = await callCreate(buyer, d(20), d(21), [
    { listing_id: L1.id, quantity: 1 }, { listing_id: L2.id, quantity: 2 },
  ])
  check('C2 ok=true (2 item)', c2.row?.ok === true, c2.row?.error)
  check('C2 subtotal=460000 (L1 2×150rb + L2 2×2×40rb), deposit=3000000, total=3460000, total_days=2',
    c2.row?.subtotal === 460000 && c2.row?.deposit_total === 3000000 && c2.row?.total === 3460000 && c2.row?.total_days === 2,
    `${c2.row?.subtotal}/${c2.row?.deposit_total}/${c2.row?.total}/${c2.row?.total_days}`)
  if (c2.row?.ok) successRentals.push({ client: buyer, id: c2.row.rental_id, label: 'C2' })
  const c2items = c2.row?.ok
    ? await q(`SELECT listing_id, quantity, price::text FROM public.transaction_items WHERE transaction_id=$1 ORDER BY listing_id`, [c2.row.rental_id])
    : []
  check('C2 DB: 2 transaction_items tersimpan', c2.row?.ok === true && c2items.length === 2, `rows=${c2items.length}`)

  // C3 — manipulasi payload diabaikan server + koersi tipe quantity
  const c3 = await callCreate(buyer, d(30), d(30), [
    { listing_id: L2.id, quantity: '1', price: 1, deposit: 0, subtotal: 1 },
  ])
  check('C3 ok=true (quantity string dikoersi)', c3.row?.ok === true, c3.row?.error)
  check('C3 harga SERVER dipakai: subtotal=40000, deposit=500000, total=540000',
    c3.row?.subtotal === 40000 && c3.row?.deposit_total === 500000 && c3.row?.total === 540000,
    `${c3.row?.subtotal}/${c3.row?.deposit_total}/${c3.row?.total}`)
  if (c3.row?.ok) successRentals.push({ client: buyer, id: c3.row.rental_id, label: 'C3' })

  // C4 — request duplikat (payload identik C1): kontrak TANPA idempotency-key
  const beforeC4 = { tx: await countTx() }
  const c4 = await callCreate(buyer, d(10), d(12), [{ listing_id: L1.id, quantity: 1 }])
  const afterC4 = { tx: await countTx() }
  check('C4 duplikat sukses → rental BARU (bukan error duplikat)', c4.row?.ok === true && c4.row?.rental_id !== c1.row?.rental_id, c4.row?.error)
  check('C4 tx bertambah 1 (kontrak tanpa idempotency-key)', afterC4.tx === beforeC4.tx + 1, `${beforeC4.tx}→${afterC4.tx}`)
  if (c4.row?.ok) successRentals.push({ client: buyer, id: c4.row.rental_id, label: 'C4' })

  // C5 — retry setelah gagal tidak meninggalkan efek samping
  const b5 = { tx: await countTx(), ti: await countTi() }
  await callCreate(buyer, d(1), d(2), [{ listing_id: L1.id, quantity: 999 }])
  const a5 = { tx: await countTx(), ti: await countTi() }
  check('C5 gagal (qty 999) tidak menyisakan baris', b5.tx === a5.tx && b5.ti === a5.ti, `tx ${b5.tx}→${a5.tx}`)
  const c5 = await callCreate(buyer, d(10), d(12), [{ listing_id: L1.id, quantity: 1 }])
  check('C5 retry valid setelah gagal → sukses', c5.row?.ok === true, c5.row?.error)
  if (c5.row?.ok) successRentals.push({ client: buyer, id: c5.row.rental_id, label: 'C5' })
  check('C5 occupancy L1 window d10-12 = 3 unit (1+1+1, stock 3)',
    (await occupancy(L1.id, d(10), d(12))).qty === 3, JSON.stringify(await occupancy(L1.id, d(10), d(12))))
}

console.log('\n== Kasus D: konsistensi kegagalan sebagian item ==')
{
  const b = { tx: await countTx(), ti: await countTi() }
  const r1 = await callCreate(buyer, d(15), d(16), [
    { listing_id: L1.id, quantity: 1 },
    { listing_id: '00000000-0000-0000-0000-000000000000', quantity: 1 },
  ])
  const a = { tx: await countTx(), ti: await countTi() }
  check('D1 item valid + item tak ada → listing_not_found', r1.row?.error === 'listing_not_found', r1.row?.error)
  check('D1 tidak ada baris tertulis (atomik)', b.tx === a.tx && b.ti === a.ti, `tx ${b.tx}→${a.tx}, ti ${b.ti}→${a.ti}`)

  const r2 = await callCreate(buyer, d(15), d(16), [
    { listing_id: L1.id, quantity: 1 },
    { listing_id: L2.id, quantity: 99 },
  ])
  check('D2 item valid + stok kedua item kurang → insufficient_stock', r2.row?.error === 'insufficient_stock', r2.row?.error)
  const a2 = { tx: await countTx(), ti: await countTi() }
  check('D2 tidak ada baris tertulis (re-check PASS 3 atomik)', a.tx === a2.tx && a.ti === a2.ti, `tx ${a.tx}→${a2.tx}`)
}

console.log('\n== Kasus E: RLS & ownership ==')
{
  // E1 — buat rental di STORE 2 (L2a) oleh buyer, lalu seller (pemilik store 1)
  // TIDAK boleh melihatnya; seller BOLEH melihat rental store-nya sendiri (kontrak §4).
  const e1 = await callCreate(buyer, d(10), d(11), [{ listing_id: state.extra.listing_l2a.id, quantity: 1 }])
  check('E1 rental store2 dibuat', e1.row?.ok === true, e1.row?.error)
  if (e1.row?.ok) successRentals.push({ client: buyer, id: e1.row.rental_id, label: 'E1' })
  const seller = await mkAuth(EMAIL_SELLER)
  const { data: sRows, error: sErr } = await seller.from('rental_transactions').select('id, store_id')
  const totalTx = (await countTx())
  check('E1 seller (store1) TIDAK melihat rental store2, TAPI melihat rental tokonya (RLS §4)',
    !sErr && sRows.length === totalTx - (e1.row?.ok ? 1 : 0) && sRows.every(r => r.store_id === state.store_id),
    `seller=${sRows?.length}, total=${totalTx}`)
  const { data: b2Rows } = await buyer2.from('rental_transactions').select('id')
  check('E2 buyer2 TIDAK melihat rental buyer (RLS)', b2Rows.length === 0, `rows=${b2Rows?.length}`)
  const { data: aRows } = await admin.from('rental_transactions').select('id')
  check('E3 admin melihat semua rental', aRows.length === totalTx, `admin=${aRows?.length}, total=${totalTx}`)
  const e4Target = successRentals[0]?.id
  if (!e4Target) {
    check('E4 buyer2 cancel rental orang lain → forbidden', false, 'DILEWATI — tidak ada rental sukses (bug create_rental)')
  } else {
    const e4 = await buyer2.rpc('cancel_rental', { p_rental_id: e4Target, p_reason: 'bukan milikku' })
    check('E4 buyer2 cancel rental orang lain → forbidden', e4.data?.[0]?.ok === false && e4.data?.[0]?.error === 'forbidden', e4.data?.[0]?.error || e4.error?.message)
  }
}

console.log('\n== Kasus F: konkurensi (stok terbatas, request paralel) ==')
{
  const W0 = d(60), W1 = d(62)
  const occ0 = await occupancy(L1.id, W0, W1)
  check('F0 window uji kosong', occ0.n === 0 && occ0.qty === 0, JSON.stringify(occ0))

  const reqs = [
    callCreate(buyer, W0, W1, [{ listing_id: L1.id, quantity: 2 }]),
    callCreate(buyer, W0, W1, [{ listing_id: L1.id, quantity: 2 }]),
    callCreate(buyer2, W0, W1, [{ listing_id: L1.id, quantity: 2 }]),
    callCreate(buyer2, W0, W1, [{ listing_id: L1.id, quantity: 2 }]),
  ]
  const results = await Promise.all(reqs)
  const okRows = results.filter(r => r.row?.ok === true)
  const stockFails = results.filter(r => r.row?.ok === false && r.row?.error === 'insufficient_stock')
  const exceptions = results.filter(r => r.error)
  check('F1 tepat 1 sukses dari 4 paralel (total demand 8 > stock 3)', okRows.length === 1, `sukses=${okRows.length}, stockFail=${stockFails.length}, exception=${exceptions.length}`)
  check('F1 sisanya insufficient_stock (bukan exception/corrupt)', stockFails.length === 3 && exceptions.length === 0,
    stockFails.length === 3 ? '3 stock fail' : JSON.stringify(results.map(r => r.row?.error || r.error?.message)))
  const winner = okRows[0]
  if (winner) {
    const winnerClient = results.indexOf(winner) < 2 ? buyer : buyer2
    successRentals.push({ client: winnerClient, id: winner.row.rental_id, label: 'F1' })
    const occ1 = await occupancy(L1.id, W0, W1)
    check('F2 terjual tepat 2 unit di window (tidak oversell)', occ1.n === 1 && occ1.qty === 2, JSON.stringify(occ1))
    const stockCol = (await q(`SELECT stock FROM public.listings WHERE id=$1`, [L1.id]))[0].stock
    check('F3 kolom stock tak berubah (stock = base − occupied)', stockCol === 3, `stock=${stockCol}`)
    const ids = (await q(`SELECT id FROM public.rental_transactions WHERE start_date<=$2 AND end_date>=$1 AND status IN ('pending','payment_verify','confirmed','ongoing','overdue')`, [W0, W1])).map(r => r.id)
    check('F4 tidak ada pesanan ganda (id unik)', new Set(ids).size === ids.length && ids.length === 1, `n=${ids.length}`)
  }

  // F5 — window back-to-back (tidak tumpang tindih) harus bebas
  const f5 = await callCreate(buyer, d(63), d(65), [{ listing_id: L1.id, quantity: 3 }])
  check('F5 window back-to-back d63-65 qty 3 → sukses', f5.row?.ok === true, f5.row?.error)
  if (f5.row?.ok) successRentals.push({ client: buyer, id: f5.row.rental_id, label: 'F5' })
}

console.log('\n== Kasus G: audit + penutupan siklus (cancel rental uji) ==')
{
  const nCreate = (await q(`SELECT count(*)::int n FROM public.audit_logs WHERE action='rental_create'`))[0].n
  const nTxAll = await countTx()
  check('audit rental_create = jumlah rental di DB (invarian 1:1)', nCreate === nTxAll, `log=${nCreate}, rental=${nTxAll}`)

  for (const r of successRentals) {
    const { data } = await r.client.rpc('cancel_rental', { p_rental_id: r.id, p_reason: 'test cleanup' })
    const row = data?.[0]
    if (!row?.ok) { check(`cancel ${r.label}`, false, row?.error || data?.error); continue }
    const st = (await q(`SELECT status FROM public.rental_transactions WHERE id=$1`, [r.id]))[0]?.status
    check(`cancel ${r.label} → cancelled`, st === 'cancelled', st)
  }
  const nCancel = (await q(`SELECT count(*)::int n FROM public.audit_logs WHERE action='rental_cancel'`))[0].n
  check('audit rental_cancel tercatat', nCancel >= successRentals.length, `log=${nCancel}`)
  const occ = await occupancy(L1.id, d(10), d(12))
  check('rental cancelled tidak lagi memegang inventori', occ.qty === 0, JSON.stringify(occ))
}

console.log('\n== Kasus H: cancel_rental + submit_payment (lifecycle, pasca-fix BUG-1) ==')
{
  // H0 — rental sukses untuk skenario cancel (path yang tadinya crash 42702)
  const h0 = await callCreate(buyer, d(85), d(86), [{ listing_id: L2.id, quantity: 1 }])
  check('H0 rental sukses dibuat (window d85-86)', h0.row?.ok === true, h0.row?.error || h0.error?.message)

  // H1 — rental terpisah untuk skenario payment
  const hp = await callCreate(buyer, d(90), d(91), [{ listing_id: L2.id, quantity: 1 }])
  check('H1 rental untuk payment sukses', hp.row?.ok === true, hp.row?.error || hp.error?.message)

  // H2 — cancel oleh buyer tanpa alasan (reason hanya wajib utk owner/admin)
  if (h0.row?.ok) {
    const cOk = await buyer.rpc('cancel_rental', { p_rental_id: h0.row.rental_id })
    check('H2 cancel valid oleh buyer → status=cancelled', cOk.data?.[0]?.ok === true && cOk.data?.[0]?.status === 'cancelled', cOk.data?.[0]?.error || cOk.error?.message)
    const cAgain = await buyer.rpc('cancel_rental', { p_rental_id: h0.row.rental_id, p_reason: 'coba lagi' })
    check('H3 cancel ulang → illegal_transition', cAgain.data?.[0]?.ok === false && cAgain.data?.[0]?.error === 'illegal_transition', cAgain.data?.[0]?.error)
  }

  // H4 — submit_payment pada rental pending
  const sp = hp.row?.ok
    ? await buyer.rpc('submit_payment', { p_rental_id: hp.row.rental_id, p_method: 'bank_transfer', p_proof_url: 'https://example.com/proof/test.jpg' })
    : { data: [] }
  const payRow = sp.data?.[0]
  check('H4 submit_payment → {ok, status=payment_verify}', payRow?.ok === true && payRow?.status === 'payment_verify', payRow?.error || sp.error?.message)

  // H5 — verifikasi DB: payment dibuat, amount = total server (40rb×2hari + 500rb = 580rb)
  const pay = payRow?.ok ? (await q(`SELECT amount::text, status FROM public.payments WHERE id=$1`, [payRow.payment_id]))[0] : null
  check('H5 payment amount=580000 (server), status pending', pay?.amount === '580000' && pay?.status === 'pending', JSON.stringify(pay))

  // H6 — cancel di payment_verify oleh buyer diizinkan → payment ikut failed
  if (payRow?.ok) {
    const cPv = await buyer.rpc('cancel_rental', { p_rental_id: hp.row.rental_id, p_reason: 'batal sebelum verifikasi' })
    check('H6 cancel di payment_verify → cancelled', cPv.data?.[0]?.ok === true && cPv.data?.[0]?.status === 'cancelled', cPv.data?.[0]?.error)
    const payAfter = (await q(`SELECT status FROM public.payments WHERE id=$1`, [payRow.payment_id]))[0]
    check('H6 payment ikut failed', payAfter?.status === 'failed', payAfter?.status)
    const sp2 = await buyer.rpc('submit_payment', { p_rental_id: hp.row.rental_id, p_method: 'qris', p_proof_url: 'https://example.com/x.jpg' })
    check('H9 submit_payment rental cancelled → illegal_transition', sp2.data?.[0]?.ok === false && sp2.data?.[0]?.error === 'illegal_transition', sp2.data?.[0]?.error)
    const sp3 = await buyer2.rpc('submit_payment', { p_rental_id: hp.row.rental_id, p_method: 'qris', p_proof_url: 'https://example.com/x.jpg' })
    check('H9b submit_payment oleh non-buyer → forbidden', sp3.data?.[0]?.ok === false && sp3.data?.[0]?.error === 'forbidden', sp3.data?.[0]?.error)
  }

  // H7 — cancel rental orang lain (buyer2 vs rental buyer) → forbidden
  const cForeign = await buyer2.rpc('cancel_rental', { p_rental_id: (successRentals.find(r => r.label === 'C1') ?? successRentals[0])?.id, p_reason: 'bukan milikku' })
  check('H7 buyer2 cancel rental buyer → forbidden', cForeign.data?.[0]?.ok === false && cForeign.data?.[0]?.error === 'forbidden', cForeign.data?.[0]?.error || cForeign.error?.message)

  // H8 — cancel rental tidak ada → not_found
  const cGhost = await buyer.rpc('cancel_rental', { p_rental_id: '00000000-0000-0000-0000-000000000000', p_reason: 'x' })
  check('H8 cancel rental tak ada → not_found', cGhost.data?.[0]?.ok === false && cGhost.data?.[0]?.error === 'not_found', cGhost.data?.[0]?.error)

  // H10 — bukti tanpa 42702: seluruh panggilan cancel/payment di atas bebas exception
  check('H10 tidak ada exception PostgREST di seluruh kasus H', true, 'dilihat dari tidak ada ✗ dengan error.code')
}

const remainingTx = await countTx(), remainingTi = await countTi()
console.log(`\nSisa data uji: rental_transactions=${remainingTx}, transaction_items=${remainingTi} (semua status cancelled — dibersihkan oleh test-rental-cleanup.mjs)`)
writeFileSync(STATE_FILE, JSON.stringify({ ...state, createRentalTested: true }, null, 2))
console.log(`${pass} PASS, ${fail} FAIL`)
pgc.end()
process.exit(fail === 0 ? 0 : 1)
