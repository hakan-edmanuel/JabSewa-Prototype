#!/usr/bin/env node
// ============================================================================
// FIXTURE TEST RENTAL — JabSewa (baseline ERD v2)
// ============================================================================
// Membuat fixture DETERMINISTIK untuk pengujian alur rental:
//   * 3 user auth ASLI (Supabase Auth — bukan user palsu):
//       admin  : admin.jabsewa.test@gmail.com   (di-promote via SQL, bootstrap resmi)
//       seller : seller.jabsewa.test@gmail.com  (store dibuat via RPC admin approve)
//       buyer  : buyer.jabsewa.test@gmail.com   (consumer biasa)
//   * Store seller berstatus 'active' (jalur resmi: submit application → admin approve)
//   * 2 listing aktif (jalur resmi: RPC save_listing oleh seller):
//       L1 "Kamera Sony A7III"  price 150000 deposit 2000000 stock 3 unit 'day'
//       L2 "Tripod Manfrotto"   price  40000 deposit  500000 stock 2 unit 'day'
//   * File state scripts/.rental-fixture.json (ids + penanda) untuk cleanup & test.
//   * Password fixture dari env JABSEWA_FIXTURE_PASSWORD — TIDAK ada di source code.
//
// Mekanisme autentikasi (2 mode):
//   MODE A — Admin API (default bila JABSEWA_SERVICE_ROLE_KEY tersedia):
//     user dibuat via GoTrue Admin API createUser({email_confirm: true}) —
//     identitas auth ASLI, terkonfirmasi, TANPA mengirim email (aman dari
//     rate limit SMTP & validasi mailbox). Sign-in tetap via anon key.
//   MODE B — signUp mandiri (fallback tanpa service key):
//     signUp publik; hanya bekerja bila konfirmasi email nonaktif.
//   Service role key HANYA untuk: (1) provisioning auth via Admin API,
//   (2) promote admin (SQL), (3) RPC admin decide_store_application.
//   Key dibaca dari env var JABSEWA_SERVICE_ROLE_KEY (atau .env), tidak disimpan repo.
//
// Pakai: JABSEWA_SERVICE_ROLE_KEY=<key> node scripts/test-rental-fixture.mjs
// ============================================================================

import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

// --- Env ---------------------------------------------------------------------
const env = {}
for (const file of ['.env', '.env.local']) {
  if (!existsSync(file)) continue
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/\s+#.*/, '').replace(/^["']|["']$/g, '').trim()
  }
}
const rawUrl = env.VITE_SUPABASE_URL
const anonKey = env.VITE_SUPABASE_ANON_KEY
const serviceKey = process.env.JABSEWA_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!rawUrl || !anonKey) {
  console.error('✗ VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY belum diset.')
  process.exit(1)
}
const url = new URL(rawUrl).origin

const USERS = {
  admin: { email: 'admin.jabsewa.test@gmail.com', full_name: 'Admin Fixture' },
  seller: { email: 'seller.jabsewa.test@gmail.com', full_name: 'Seller Fixture' },
  buyer: { email: 'buyer.jabsewa.test@gmail.com', full_name: 'Buyer Fixture' },
}
const STORE = { name: 'Toko Fixture Rental', description: 'Store uji alur rental', address: 'Jl. Test No. 1, Jakarta' }
const LISTINGS = [
  { name: 'Kamera Sony A7III', description: 'Body only, lengkap', price: 150000, deposit: 2000000, stock: 3, rental_unit: 'day' },
  { name: 'Tripod Manfrotto', description: 'Tripod video', price: 40000, deposit: 500000, stock: 2, rental_unit: 'day' },
]
const STATE_FILE = 'scripts/.rental-fixture.json'

function loadState() {
  if (!existsSync(STATE_FILE)) return null
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')) } catch { return null }
}

// --- 0. Bila fixture sudah ada → idempoten ------------------------------------
const existing = loadState()
if (existing?.complete) {
  console.log('Fixture sudah lengkap (idempoten). Hapus ' + STATE_FILE + ' bila ingin membuat ulang.')
  console.log('Detail state (id & kredensial) tidak dicetak — lihat langsung ' + STATE_FILE + ' (ter-ignore).')
  process.exit(0)
}

// Password fixture TIDAK di-hardcode di source code (keamanan repo). Sumbernya
// (urutan): (1) env var JABSEWA_FIXTURE_PASSWORD dari shell, atau (2) variabel
// yang sama di .env / .env.local (keduanya ter-ignore Git). Password lalu
// disimpan SEKALI ke state file scripts/.rental-fixture.json (ter-ignore) agar
// script test downstream (test-create-rental, test-rental-lifecycle,
// test-frontend-rental-e2e, dst.) bisa sign-in tanpa hardcode.
// (Pemeriksaan setelah jalur idempoten: fixture yang sudah lengkap tidak butuh password.)
const PASSWORD = process.env.JABSEWA_FIXTURE_PASSWORD || env.JABSEWA_FIXTURE_PASSWORD || ''
if (!PASSWORD) {
  console.error('✗ JABSEWA_FIXTURE_PASSWORD belum diset (dan tidak ada di .env/.env.local).')
  console.error('  Isi variabel itu di shell lokal atau .env.local — JANGAN pernah di-commit;')
  console.error('  state fixture scripts/.rental-fixture.json sudah ter-ignore.')
  process.exit(1)
}

// --- 1. Provisioning 3 user auth -----------------------------------------------
console.log('== 1. Provisioning 3 user auth ==')

const anon = createClient(url, anonKey, { auth: { persistSession: false } })
const state = { created_at: new Date().toISOString(), project: url, users: {}, password: PASSWORD, complete: false } // password hanya di state file (ter-ignore)

if (serviceKey) {
  // MODE A — Admin API: createUser(email_confirm: true) tanpa kirim email.
  const adminAuth = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  for (const key of ['admin', 'seller', 'buyer']) {
    const { email, full_name } = USERS[key]
    const { data: created, error } = await adminAuth.auth.admin.createUser({
      email, password: PASSWORD, email_confirm: true,
      user_metadata: { full_name },
    })
    if (error && !/already|exists|registered/i.test(error.message)) {
      console.error(`✗ createUser ${key}: ${error.message}`); process.exit(1)
    }
    if (created?.user) console.log(`  ✓ ${key} dibuat via Admin API: ${created.user.id}`)
    else console.log(`  • ${key} sudah ada (idempoten)`)
  }
}

// Verifikasi sign-in semua user via anon key (identitas auth nyata, MODE A & B).
for (const key of ['admin', 'seller', 'buyer']) {
  const { email, full_name } = USERS[key]
  if (!serviceKey) {
    // MODE B — signUp mandiri (butuh konfirmasi email nonaktif di project).
    const { data, error } = await anon.auth.signUp({ email, password: PASSWORD, options: { data: { full_name } } })
    if (error && !/already registered|already exists|User already/i.test(error.message)) {
      console.error(`✗ signUp ${key}: ${error.message}`); process.exit(1)
    }
    if (data?.user && !data.session) {
      console.error(`✗ ${key}: signUp tidak mengembalikan sesi (email confirmation aktif?). Gunakan MODE A (JABSEWA_SERVICE_ROLE_KEY) atau aktifkan auto-confirm.`)
      process.exit(1)
    }
  }
  const { data: s, error: e2 } = await anon.auth.signInWithPassword({ email, password: PASSWORD })
  if (e2) { console.error(`✗ ${key}: login gagal — ${e2.message}`); process.exit(1) }
  state.users[key] = { id: s.user.id, email }
  console.log(`  ✓ ${key}: ${s.user.id}`)
}

// --- 2. Promote admin via koneksi psql (bootstrap resmi §3 env-setup) ----------
console.log('== 2. Promote admin (SQL bootstrap) ==')
if (env.DATABASE_URL) {
  const c = new pg.Client({
    connectionString: env.DATABASE_URL,
    ssl: /sslmode=disable/.test(env.DATABASE_URL) ? false : { rejectUnauthorized: false },
  })
  await c.connect()
  await c.query(`UPDATE public.users SET role='admin' WHERE id=$1 AND email=$2`,
    [state.users.admin.id, USERS.admin.email])
  const { rows } = await c.query(`SELECT role FROM public.users WHERE id=$1`, [state.users.admin.id])
  await c.end()
  console.log(`  role admin sekarang: ${rows[0]?.role}`)
  if (rows[0]?.role !== 'admin') { console.error('✗ promote admin gagal'); process.exit(1) }
} else {
  console.error('✗ DATABASE_URL kosong — jalankan manual di SQL Editor:')
  console.error(`  UPDATE public.users SET role='admin' WHERE email='${USERS.admin.email}';`)
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
  process.exit(1)
}

// --- 3. Submit store application (seller) ---------------------------------------
console.log('== 3. Seller: submit_store_application ==')
const sellerClient = createClient(url, anonKey, { auth: { persistSession: false } })
{
  const { data, error } = await sellerClient.auth.signInWithPassword({
    email: USERS.seller.email, password: PASSWORD,
  })
  if (error) { console.error('✗ login seller: ' + error.message); process.exit(1) }
}
{
  const { data, error } = await sellerClient.rpc('submit_store_application',
    { p_store_name: STORE.name, p_description: STORE.description, p_address: STORE.address })
  const row = data?.[0]
  if (error) { console.error('✗ submit_store_application: ' + error.message); process.exit(1) }
  if (row?.ok === false && row?.error === 'already_seller') {
    console.log('  seller sudah punya store (idempoten) — lanjut.')
  } else if (row?.ok === false && row?.error === 'application_pending') {
    console.log('  ajuan sudah pending (idempoten) — lanjut.')
  } else if (!row?.ok) {
    console.error('✗ submit_store_application error=' + (row?.error || JSON.stringify(row))); process.exit(1)
  } else {
    console.log(`  application: ${row.application_id}`)
  }
}

// --- 4. Admin approve application → store active --------------------------------
console.log('== 4. Admin: decide_store_application (approve) ==')
const adminClient = createClient(url, anonKey, { auth: { persistSession: false } })
{
  const { error } = await adminClient.auth.signInWithPassword({
    email: USERS.admin.email, password: PASSWORD,
  })
  if (error) { console.error('✗ login admin: ' + error.message); process.exit(1) }
}
{
  const { data: apps, error } = await adminClient.rpc('get_my_applications')
  if (error) { console.error('✗ get_my_applications (dari admin — bukan miliknya): ' + error.message) }
  // admin bukan pemilik ajuan → pakai list_store_applications (admin-only)
  const { data: all, error: e2 } = await adminClient.rpc('list_store_applications', { p_status: 'pending' })
  if (e2) { console.error('✗ list_store_applications: ' + e2.message); process.exit(1) }
  const mine = (all || []).find((a) => a.user_id === state.users.seller.id)
  if (!mine) {
    // sudah approved sebelumnya (idempoten) → ambil store seller
    const { data: stores, error: e3 } = await adminClient.rpc('list_store_applications', { p_status: 'approved' })
    if (e3) { console.error('✗ list approved: ' + e3.message); process.exit(1) }
    const approved = (stores || []).find((a) => a.user_id === state.users.seller.id)
    if (!approved) { console.error('✗ store seller tidak ditemukan'); process.exit(1) }
    state.store_id = approved.store_id ?? null
  } else {
    const { data, error: e4 } = await adminClient.rpc('decide_store_application',
      { p_application_id: mine.id, p_approve: true })
    const row = data?.[0]
    if (e4 || !row?.ok) { console.error('✗ decide_store_application: ' + (e4?.message || row?.error)); process.exit(1) }
    console.log(`  approved → store dibuat`)
  }
}

// --- 5. Ambil store_id seller (get_my_stores via seller) --------------------------
{
  const { data, error } = await sellerClient.rpc('get_my_stores')
  if (error) { console.error('✗ get_my_stores: ' + error.message); process.exit(1) }
  const store = (data || [])[0]
  if (!store) { console.error('✗ seller belum punya store'); process.exit(1) }
  state.store_id = store.id
  console.log(`  store: ${store.id} (status=${store.status})`)
  if (store.status !== 'active') { console.error('✗ store belum active'); process.exit(1) }
}

// --- 6. Kategori + save_listing x2 (oleh seller) ----------------------------------
console.log('== 6. Seller: save_listing x2 ==')
{
  const { data: cats, error } = await sellerClient.from('categories').select('id, slug')
  if (error) { console.error('✗ kategori: ' + error.message); process.exit(1) }
  state.listings = []
  for (const L of LISTINGS) {
    const cat = cats.find((c) => c.slug === 'photography') || cats[0]
    const { data, error } = await sellerClient.rpc('save_listing', {
      p_store_id: state.store_id, p_category_id: cat.id, p_name: L.name,
      p_description: L.description, p_price: L.price, p_deposit: L.deposit,
      p_stock: L.stock, p_rental_unit: L.rental_unit, p_available: true,
    })
    const row = data?.[0]
    if (error || !row?.ok) { console.error(`✗ save_listing ${L.name}: ${error?.message || row?.error}`); process.exit(1) }
    state.listings.push({ id: row.listing_id, name: L.name, price: L.price, deposit: L.deposit, stock: L.stock, rental_unit: L.rental_unit })
    console.log(`  ✓ listing: ${L.name} → ${row.listing_id}`)
  }
}

state.complete = true
writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
console.log('\n✓ Fixture lengkap. State disimpan ke ' + STATE_FILE)
console.log('  (file ini berisi id + password test — TER-IGNORE, tidak di-commit)')
