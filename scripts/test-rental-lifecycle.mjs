#!/usr/bin/env node
// ============================================================================
// UJI E2E RENTAL LIFECYCLE — JabSewa (TEST LIVE SUPABASE)
// ============================================================================
// Cakupan: submit_payment, decide_payment, start_rental, record_return,
//          apply_late_fee, decide_late_fee, mark_overdue, open_dispute,
//          resolve_dispute, create_review (+ create_rental/cancel_rental
//          sebagai prasyarat lifecycle).
//
// Tahap test:
//   * LIVE Supabase : semua skenario (happy path, negative, akses, idempoten)
//   * FIXTURE       : buyer3 (Admin API, aktif) + 2 listing baru
//                     (LN "GoPro Hero Fixture" store1, LO "Drone Mini Fixture"
//                     store2) + 1 simulasi waktu via SQL tercatat
//                     (end_date rental LF digeser ke kemarin — state.e2e)
//   * LOKAL         : verifikasi read-only via DATABASE_URL
//
// TIDAK ADA pembayaran riil — hanya baris payments berstatus enum.
// Prasyarat: scripts/.rental-fixture.json lengkap (fixture utama + extra).
// Pakai: node scripts/test-rental-lifecycle.mjs
// ============================================================================

import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

// --- Env ----------------------------------------------------------------------
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
if (!serviceKey) { console.error('✗ service key dibutuhkan (provisioning buyer3)'); process.exit(1) }

const STATE_FILE = 'scripts/.rental-fixture.json'
const state = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
const [L1, L2] = state.listings
const L2A = state.extra?.listing_l2a
const PASSWORD = state.password

const EMAIL_BUYER = state.users.buyer.email
const EMAIL_BUYER3 = 'buyer3.jabsewa.test@gmail.com'
const EMAIL_SELLER = state.users.seller.email
const EMAIL_SELLER2 = state.extra?.users?.seller2?.email || 'seller2.jabsewa.test@gmail.com'
const EMAIL_ADMIN = state.users.admin.email
const OWNER1 = state.users.seller.id
const OWNER2 = state.extra?.users?.seller2?.id
const LN_NAME = 'GoPro Hero Fixture'   // store1 — happy path & alur late
const LO_NAME = 'Drone Mini Fixture'   // store2 — alur dispute (butuh store berbeda utk test akses antar-owner)

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

// --- Helper --------------------------------------------------------------------
const d = (o) => { const t = new Date(); t.setDate(t.getDate() + o); return t.toISOString().slice(0, 10) }
let pass = 0, fail = 0
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`) }
}
async function callCreate(client, start, end, items) {
  const { data, error } = await client.rpc('create_rental', { p_start: start, p_end: end, p_items: items })
  return { row: data?.[0], rows: data?.length ?? 0, error }
}
const errOf = (r) => r?.data?.[0]?.error ?? r?.error?.message ?? '(tidak ada error)'
const okOf = (r) => r?.data?.[0]?.ok === true
const occupancy = async (lid, start, end) => (await q(
  `SELECT count(*)::int n, COALESCE(SUM(ti.quantity),0)::int qty
     FROM public.transaction_items ti JOIN public.rental_transactions r ON r.id = ti.transaction_id
    WHERE ti.listing_id = $1 AND r.status IN ('pending','payment_verify','confirmed','ongoing','overdue')
      AND r.start_date <= $3 AND r.end_date >= $2`, [lid, start, end]))[0]
async function mkListing(client, storeId, name, price, deposit, stock) {
  const { data: found } = await client.from('listings').select('id, price, deposit, stock, status').eq('name', name).limit(1)
  if (found?.length) return found[0]
  const { data: cats } = await client.from('categories').select('id, slug')
  const cat = cats.find(c => c.slug === 'photography') || cats[0]
  const { data } = await client.rpc('save_listing', {
    p_store_id: storeId, p_category_id: cat.id, p_name: name, p_description: 'Listing E2E lifecycle',
    p_price: price, p_deposit: deposit, p_stock: stock, p_rental_unit: 'day', p_available: true,
  })
  const row = data?.[0]
  if (!row?.ok) throw new Error(`save_listing ${name}: ${row?.error}`)
  return { id: row.listing_id, price, deposit, stock, status: 'active' }
}
const createdRentals = [] // {id, label} — rental yang dibuat run ini
let hpRentId = null  // rental happy-path (B) — dipakai skenario E
let dRentId = null   // rental skenario D — ditutup di D8

// --- Pemulihan run sebelumnya (mis. crash): tutup rental aktif via RPC ----------
// Sumber id DARI DB (rental aktif pada listing E2E), bukan state — karena state
// bisa tidak tersimpan bila run sebelumnya crash di tengah.
async function recoverLeftovers() {
  const active = await q(
    `SELECT DISTINCT r.id, r.status::text, r.store_id
       FROM public.rental_transactions r
       JOIN public.transaction_items ti ON ti.transaction_id = r.id
      WHERE ti.listing_id = ANY($1::uuid[])
        AND r.status IN ('pending','payment_verify','confirmed','ongoing','overdue','disputed')`,
    [[LN.id, LO.id]])
  if (!active.length) return
  console.log('== Pemulihan: menutup rental aktif sisa run sebelumnya (via RPC) ==')
  for (const row of active) {
    const owner = row.store_id === state.store_id ? seller : seller2
    let done = false
    if (['pending', 'payment_verify', 'confirmed'].includes(row.status)) {
      done = (await owner.rpc('cancel_rental', { p_rental_id: row.id, p_reason: 'pemulihan run sebelumnya' })).data?.[0]?.ok === true
    }
    if (!done && ['ongoing', 'overdue'].includes(row.status)) {
      done = (await owner.rpc('record_return', { p_rental_id: row.id })).data?.[0]?.ok === true
    }
    if (!done && row.status === 'disputed') {
      const dis = (await q(`SELECT id FROM public.disputes WHERE transaction_id=$1 AND status IN ('open','investigating')`, [row.id]))[0]
      if (dis) done = (await admin.rpc('resolve_dispute', { p_dispute_id: dis.id, p_outcome: 'resolved', p_resolution: 'pemulihan run' })).data?.[0]?.ok === true
    }
    console.log(`  ${done ? '✓' : '⚠'} ${row.id.slice(0, 8)} (${row.status})${done ? '' : ' — belum tertutup'}`)
  }
}

// ============================================================================
console.log('== Tahap 0: fixture E2E (idempoten) ==')
// --- buyer3 --------------------------------------------------------------------
const { error: eB3 } = await svc.auth.admin.createUser({
  email: EMAIL_BUYER3, password: PASSWORD, email_confirm: true, user_metadata: { full_name: 'Buyer3 Fixture' },
})
if (eB3 && !/already|exists|registered/i.test(eB3.message)) { console.error('✗ createUser buyer3: ' + eB3.message); process.exit(1) }
const buyer3Id = (await q(`SELECT id FROM public.users WHERE email=$1`, [EMAIL_BUYER3]))[0]?.id
if (!buyer3Id) { console.error('✗ profil buyer3 tidak ditemukan'); process.exit(1) }
const buyer3 = await mkAuth(EMAIL_BUYER3)
const buyer = await mkAuth(EMAIL_BUYER)
const seller = await mkAuth(EMAIL_SELLER)
const seller2 = await mkAuth(EMAIL_SELLER2)
const admin = await mkAuth(EMAIL_ADMIN)
check('buyer3 aktif & login', Boolean(buyer3Id), buyer3Id.slice(0, 8))

// Baseline count (run bisa berulang — assertion akhir memakai delta)
const baseRev = (await q(`SELECT count(*)::int n FROM public.reviews`))[0].n
const baseDis = (await q(`SELECT count(*)::int n FROM public.disputes`))[0].n
const baseFee = (await q(`SELECT count(*)::int n FROM public.late_fees`))[0].n
console.log(`  (baseline) reviews=${baseRev}, disputes=${baseDis}, late_fees=${baseFee}`)

// --- listing LN (store1) & LO (store2) -----------------------------------------
const LN = await mkListing(seller, state.store_id, LN_NAME, 120000, 800000, 1)
const LO = await mkListing(seller2, state.extra.store2.id, LO_NAME, 200000, 1500000, 1)
check('listing LN & LO siap (stok 1 masing-masing)', Boolean(LN.id && LO.id), `${LN.id.slice(0, 8)} / ${LO.id.slice(0, 8)}`)

state.e2e ||= {}
state.e2e.users ||= {}
state.e2e.users.buyer3 = { email: EMAIL_BUYER3, id: buyer3Id }
state.e2e.listings = { LN, LO }
state.e2e.rental_ids ||= []
state.e2e.sql_mutations ||= []
writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))

await recoverLeftovers()

// ============================================================================
console.log('\n== Skenario A: guard transisi awal ==')
{
  const a0 = await callCreate(buyer3, d(40), d(41), [{ listing_id: LN.id, quantity: 1 }])
  check('A0 rental guard dibuat (pending)', a0.row?.ok === true, a0.row?.error)
  createdRentals.push({ id: a0.row.rental_id, label: 'A0' })
  const a1 = await seller.rpc('mark_overdue', { p_rental_id: a0.row.rental_id })
  check('A1 mark_overdue di pending → illegal_transition', a1.data?.[0]?.ok === false && a1.data?.[0]?.error === 'illegal_transition', errOf(a1))
  const a2 = await buyer3.rpc('open_dispute', { p_rental_id: a0.row.rental_id, p_reason: 'tes' })
  check('A2 open_dispute di pending → illegal_transition', a2.data?.[0]?.ok === false && a2.data?.[0]?.error === 'illegal_transition', errOf(a2))
  const a3 = await buyer3.rpc('cancel_rental', { p_rental_id: a0.row.rental_id, p_reason: 'tutup guard' })
  check('A3 cancel guard → cancelled', a3.data?.[0]?.ok === true, errOf(a3))
}

// ============================================================================
console.log('\n== Skenario B: happy path on-time (pending→paid→confirmed→ongoing→completed→review) ==')
{
  const b1 = await callCreate(buyer3, d(5), d(6), [{ listing_id: LN.id, quantity: 1 }])
  check('B1 create_rental → pending', b1.row?.ok === true && b1.row?.status === 'pending', b1.row?.error)
  createdRentals.push({ id: b1.row.rental_id, label: 'B-HP' })
  hpRentId = b1.row.rental_id

  const b2 = await buyer3.rpc('submit_payment', { p_rental_id: b1.row.rental_id, p_method: 'bank_transfer', p_proof_url: 'https://example.com/proof/hp.jpg' })
  check('B2 submit_payment → payment_verify', b2.data?.[0]?.ok === true && b2.data?.[0]?.status === 'payment_verify', errOf(b2))
  const payHp = b2.data?.[0]?.payment_id
  const payRow = (await q(`SELECT amount::text, status FROM public.payments WHERE id=$1`, [payHp]))[0]
  check('B2 DB: amount=1040000 (server: 2 hari × 120rb + dep 800rb), pending', payRow?.amount === '1040000' && payRow?.status === 'pending', JSON.stringify(payRow))

  const b3 = await seller.rpc('decide_payment', { p_payment_id: payHp, p_approve: true })
  check('B3 decide_payment(owner) → tx confirmed', b3.data?.[0]?.ok === true && b3.data?.[0]?.tx_status === 'confirmed', errOf(b3))
  const paidRow = (await q(`SELECT status, paid_at IS NOT NULL AS paid FROM public.payments WHERE id=$1`, [payHp]))[0]
  check('B3 DB: payment paid + paid_at terisi', paidRow?.status === 'paid' && paidRow?.paid === true)

  const b4 = await seller.rpc('start_rental', { p_rental_id: b1.row.rental_id })
  check('B4 start_rental → ongoing', b4.data?.[0]?.ok === true && b4.data?.[0]?.status === 'ongoing', errOf(b4))
  const b4b = await seller.rpc('start_rental', { p_rental_id: b1.row.rental_id })
  check('B4 start_rental berulang → illegal_transition', b4b.data?.[0]?.ok === false && b4b.data?.[0]?.error === 'illegal_transition', errOf(b4b))

  const b5 = await seller.rpc('record_return', { p_rental_id: b1.row.rental_id })
  check('B5 record_return → completed', b5.data?.[0]?.ok === true && b5.data?.[0]?.status === 'completed', errOf(b5))
  const retRow = (await q(`SELECT actual_return_date IS NOT NULL AS returned FROM public.rental_transactions WHERE id=$1`, [b1.row.rental_id]))[0]
  check('B5 DB: actual_return_date terisi', retRow?.returned === true)
  const b5b = await seller.rpc('record_return', { p_rental_id: b1.row.rental_id })
  check('B5 record_return berulang → illegal_transition', b5b.data?.[0]?.ok === false && b5b.data?.[0]?.error === 'illegal_transition', errOf(b5b))

  const b6 = await buyer3.rpc('create_review', { p_rental_id: b1.row.rental_id, p_rating: 0, p_comment: 'x' })
  check('B6 rating 0 → invalid_rating', b6.data?.[0]?.ok === false && b6.data?.[0]?.error === 'invalid_rating', errOf(b6))
  const b6b = await buyer3.rpc('create_review', { p_rental_id: b1.row.rental_id, p_rating: 5, p_comment: 'mantis' })
  check('B6 create_review → ok', b6b.data?.[0]?.ok === true, errOf(b6b))
  const revRow = (await q(`SELECT buyer_id, store_id, rating FROM public.reviews WHERE transaction_id=$1`, [b1.row.rental_id]))[0]
  check('B6 DB: review buyer3/store1/rating5', revRow?.buyer_id === buyer3Id && revRow?.store_id === state.store_id && revRow?.rating === 5)
  const b6c = await buyer3.rpc('create_review', { p_rental_id: b1.row.rental_id, p_rating: 4, p_comment: 'ubah' })
  check('B6 review ulang → already_reviewed', b6c.data?.[0]?.ok === false && b6c.data?.[0]?.error === 'already_reviewed', errOf(b6c))

  const b7 = await buyer3.rpc('cancel_rental', { p_rental_id: b1.row.rental_id, p_reason: 'x' })
  check('B7 cancel di completed → illegal_transition', b7.data?.[0]?.ok === false && b7.data?.[0]?.error === 'illegal_transition', errOf(b7))
}

// ============================================================================
console.log('\n== Skenario C: payment ditolak → revisi → approve (+ stok tetap dipegang) ==')
{
  const c1 = await callCreate(buyer3, d(8), d(9), [{ listing_id: LN.id, quantity: 1 }])
  check('C1 rental reject-flow dibuat', c1.row?.ok === true, c1.row?.error)
  createdRentals.push({ id: c1.row.rental_id, label: 'C-PR' })
  const c2 = await buyer3.rpc('submit_payment', { p_rental_id: c1.row.rental_id, p_method: 'qris', p_proof_url: 'https://example.com/proof/pr1.jpg' })
  const pay1 = c2.data?.[0]?.payment_id
  check('C2 submit_payment #1 → payment_verify', c2.data?.[0]?.ok === true, errOf(c2))

  const c3 = await seller.rpc('decide_payment', { p_payment_id: pay1, p_approve: false })
  check('C3 reject tanpa note → reason_required', c3.data?.[0]?.ok === false && c3.data?.[0]?.error === 'reason_required', errOf(c3))
  const c3v = (await q(`SELECT (SELECT status FROM public.payments WHERE id=$1) p, (SELECT status::text FROM public.rental_transactions WHERE id=$2) t`, [pay1, c1.row.rental_id]))[0]
  check('C3 DB: payment & tx tak berubah (atomik)', c3v?.p === 'pending' && c3v?.t === 'payment_verify', JSON.stringify(c3v))

  const c4 = await seller.rpc('decide_payment', { p_payment_id: pay1, p_approve: false, p_note: 'bukti tidak jelas' })
  check('C4 reject dengan note → ok=true, tx_status=pending', c4.data?.[0]?.ok === true && c4.data?.[0]?.tx_status === 'pending', errOf(c4))
  const pay1Row = (await q(`SELECT status FROM public.payments WHERE id=$1`, [pay1]))[0]
  check('C4 DB: payment #1 failed, tx pending', pay1Row?.status === 'failed')

  // PENTING: divergensi kontrak §3.5 #20 (menyatakan reject → tx cancelled).
  // Implementasi: tx kembali PENDING. Perilaku ini yang diverifikasi; divergensi dilaporkan.
  const c5 = await buyer3.rpc('submit_payment', { p_rental_id: c1.row.rental_id, p_method: 'bank_transfer', p_proof_url: 'https://example.com/proof/pr2.jpg' })
  check('C5 submit ulang setelah reject → payment_verify', c5.data?.[0]?.ok === true, errOf(c5))
  const nPays = (await q(`SELECT count(*)::int n FROM public.payments WHERE transaction_id=$1`, [c1.row.rental_id]))[0].n
  check('C5 DB: 2 baris payments untuk 1 transaksi', nPays === 2, `n=${nPays}`)
  const c6 = await seller.rpc('decide_payment', { p_payment_id: c5.data?.[0]?.payment_id, p_approve: true })
  check('C6 approve ulang → tx confirmed', c6.data?.[0]?.ok === true && c6.data?.[0]?.tx_status === 'confirmed', errOf(c6))

  const c7 = await buyer3.rpc('cancel_rental', { p_rental_id: c1.row.rental_id, p_reason: 'x' })
  check('C7 buyer cancel di confirmed → illegal_transition (sesuai matriks §5.2)', c7.data?.[0]?.ok === false && c7.data?.[0]?.error === 'illegal_transition', errOf(c7))
  const c8 = await seller.rpc('cancel_rental', { p_rental_id: c1.row.rental_id, p_reason: 'penutupan skenario C (owner sampai confirmed)' })
  check('C8 owner cancel di confirmed → cancelled (penutupan skenario)', c8.data?.[0]?.ok === true && c8.data?.[0]?.status === 'cancelled', errOf(c8))
}

// ============================================================================
console.log('\n== Skenario D: akses & role ==')
{
  const d1 = await callCreate(buyer3, d(15), d(16), [{ listing_id: LN.id, quantity: 1 }])
  createdRentals.push({ id: d1.row?.rental_id, label: 'D' })
  dRentId = d1.row?.rental_id ?? null
  const d1s = await buyer3.rpc('submit_payment', { p_rental_id: d1.row.rental_id, p_method: 'qris', p_proof_url: 'https://example.com/proof/d.jpg' })
  const dPay = d1s.data?.[0]?.payment_id

  const dA = await buyer.rpc('submit_payment', { p_rental_id: d1.row.rental_id, p_method: 'qris', p_proof_url: 'https://example.com/x.jpg' })
  check('D1 submit_payment oleh non-buyer → forbidden', dA.data?.[0]?.ok === false && dA.data?.[0]?.error === 'forbidden', errOf(dA))
  const dB = await seller2.rpc('decide_payment', { p_payment_id: dPay, p_approve: true })
  check('D2 decide_payment owner toko lain → forbidden', dB.data?.[0]?.ok === false && dB.data?.[0]?.error === 'forbidden', errOf(dB))
  const dC = await buyer3.rpc('decide_payment', { p_payment_id: dPay, p_approve: true })
  check('D3 decide_payment oleh buyer (bukan verifier) → forbidden', dC.data?.[0]?.ok === false && dC.data?.[0]?.error === 'forbidden', errOf(dC))

  const dD = await seller2.rpc('start_rental', { p_rental_id: d1.row.rental_id })
  check('D4 start_rental owner lain → forbidden', dD.data?.[0]?.ok === false && dD.data?.[0]?.error === 'forbidden', errOf(dD))
  const dE = await seller2.rpc('record_return', { p_rental_id: d1.row.rental_id })
  check('D5 record_return owner lain → forbidden', dE.data?.[0]?.ok === false && dE.data?.[0]?.error === 'forbidden', errOf(dE))

  const dF = await seller.rpc('decide_payment', { p_payment_id: dPay, p_approve: true })
  check('D6 approve oleh owner sah → confirmed', dF.data?.[0]?.ok === true, errOf(dF))
  const dG = await buyer3.rpc('cancel_rental', { p_rental_id: d1.row.rental_id, p_reason: 'x' })
  check('D7 cancel di confirmed (buyer) → illegal_transition', dG.data?.[0]?.ok === false, errOf(dG))
  const d8 = await seller.rpc('cancel_rental', { p_rental_id: d1.row.rental_id, p_reason: 'penutupan skenario D (owner)' })
  check('D8 owner cancel di confirmed → cancelled (penutupan skenario)', d8.data?.[0]?.ok === true && d8.data?.[0]?.status === 'cancelled', errOf(d8))
}

// ============================================================================
console.log('\n== Skenario E: keterlambatan + late fee ==')
{
  const e1 = await callCreate(buyer3, d(12), d(13), [{ listing_id: LN.id, quantity: 1 }])
  check('E1 rental late-flow dibuat', e1.row?.ok === true, e1.row?.error)
  createdRentals.push({ id: e1.row.rental_id, label: 'E-LF' })
  await buyer3.rpc('submit_payment', { p_rental_id: e1.row.rental_id, p_method: 'qris', p_proof_url: 'https://example.com/proof/lf.jpg' })
  const ePay = (await q(`SELECT id FROM public.payments WHERE transaction_id=$1`, [e1.row.rental_id]))[0]?.id
  await seller.rpc('decide_payment', { p_payment_id: ePay, p_approve: true })
  const e2 = await seller.rpc('start_rental', { p_rental_id: e1.row.rental_id })
  check('E2 start → ongoing', e2.data?.[0]?.ok === true, errOf(e2))

  const e3 = await seller.rpc('mark_overdue', { p_rental_id: e1.row.rental_id })
  check('E3 mark_overdue sebelum end → not_late', e3.data?.[0]?.ok === false && e3.data?.[0]?.error === 'not_late', errOf(e3))

  // Simulasi waktu (SQL, tercatat di state): geser KEDUA tanggal ke masa lalu
  // (CHECK dates_order: end >= start — menggeser end saja akan melanggar constraint)
  await q(`UPDATE public.rental_transactions SET start_date = CURRENT_DATE - 3, end_date = CURRENT_DATE - 1 WHERE id=$1`, [e1.row.rental_id])
  state.e2e.sql_mutations.push({ rental_id: e1.row.rental_id, field: 'start_date+end_date', to: 'CURRENT_DATE-3 / CURRENT_DATE-1', reason: 'simulasi keterlambatan' })
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))

  const e4 = await seller.rpc('mark_overdue', { p_rental_id: e1.row.rental_id })
  check('E4 mark_overdue → overdue', e4.data?.[0]?.ok === true && e4.data?.[0]?.status === 'overdue', errOf(e4))
  const e4b = await seller.rpc('mark_overdue', { p_rental_id: e1.row.rental_id })
  check('E4 mark_overdue berulang → illegal_transition (kontrak tanpa janji idempoten)', e4b.data?.[0]?.ok === false && e4b.data?.[0]?.error === 'illegal_transition', errOf(e4b))

  // not_late pada apply_late_fee terjangkau lewat rental completed ON-TIME (skenario B):
  // days_late = 0 → guard not_late.
  const e5 = await seller.rpc('apply_late_fee', { p_rental_id: hpRentId, p_daily_rate: 25000 })
  check('E5 apply_late_fee pada completed on-time (days_late=0) → not_late', e5.data?.[0]?.ok === false && e5.data?.[0]?.error === 'not_late', errOf(e5))

  const e6 = await seller.rpc('apply_late_fee', { p_rental_id: e1.row.rental_id, p_daily_rate: 25000 })
  check('E6 apply_late_fee (1 hari × 25rb) → total=25000', e6.data?.[0]?.ok === true && e6.data?.[0]?.total === 25000, errOf(e6))
  const feeRow = (await q(`SELECT days_late, daily_rate::text, total::text, status FROM public.late_fees WHERE transaction_id=$1`, [e1.row.rental_id]))[0]
  check('E6 DB: late_fees 1 baris unpaid (25rb)', feeRow?.days_late === 1 && feeRow?.total === '25000' && feeRow?.status === 'unpaid', JSON.stringify(feeRow))
  const lft1 = (await q(`SELECT late_fee_total::text FROM public.rental_transactions WHERE id=$1`, [e1.row.rental_id]))[0]
  check('E6 DB: late_fee_total=25000', lft1?.late_fee_total === '25000', lft1?.late_fee_total)

  const e7 = await seller.rpc('apply_late_fee', { p_rental_id: e1.row.rental_id, p_daily_rate: 50000 })
  check('E7 upsert rate baru → total=50000, tetap 1 baris', e7.data?.[0]?.ok === true && e7.data?.[0]?.total === 50000
    && (await q(`SELECT count(*)::int n FROM public.late_fees WHERE transaction_id=$1`, [e1.row.rental_id]))[0].n === 1, errOf(e7))
  const lft2 = (await q(`SELECT late_fee_total::text FROM public.rental_transactions WHERE id=$1`, [e1.row.rental_id]))[0]
  check('E7 DB: late_fee_total=50000', lft2?.late_fee_total === '50000')

  const e8 = await seller2.rpc('apply_late_fee', { p_rental_id: e1.row.rental_id, p_daily_rate: 1000 })
  check('E8 apply_late_fee owner lain → forbidden', e8.data?.[0]?.ok === false && e8.data?.[0]?.error === 'forbidden', errOf(e8))

  const e9 = await seller.rpc('decide_late_fee', { p_late_fee_id: (await q(`SELECT id FROM public.late_fees WHERE transaction_id=$1`, [e1.row.rental_id]))[0].id, p_decision: 'paid' })
  check('E9 decide_late_fee paid (owner) → ok', e9.data?.[0]?.ok === true, errOf(e9))

  const e10 = await seller.rpc('record_return', { p_rental_id: e1.row.rental_id })
  check('E10 record_return dari overdue → completed', e10.data?.[0]?.ok === true && e10.data?.[0]?.status === 'completed', errOf(e10))

  const feeId = (await q(`SELECT id FROM public.late_fees WHERE transaction_id=$1`, [e1.row.rental_id]))[0]?.id
  const e11 = await seller.rpc('decide_late_fee', { p_late_fee_id: feeId, p_decision: 'waived' })
  check('E11 waived oleh owner → forbidden (admin-only)', e11.data?.[0]?.ok === false && e11.data?.[0]?.error === 'forbidden', errOf(e11))
  const e12 = await admin.rpc('decide_late_fee', { p_late_fee_id: feeId, p_decision: 'waived' })
  check('E12 waived oleh admin → ok', e12.data?.[0]?.ok === true, errOf(e12))
  const lft3 = (await q(`SELECT late_fee_total::text FROM public.rental_transactions WHERE id=$1`, [e1.row.rental_id]))[0]
  check('E12 DB: waived tidak dihitung → late_fee_total=0', lft3?.late_fee_total === '0', lft3?.late_fee_total)
  const e13 = await admin.rpc('decide_late_fee', { p_late_fee_id: feeId, p_decision: 'unpaid' })
  check('E13 decision invalid → invalid_decision', e13.data?.[0]?.ok === false && e13.data?.[0]?.error === 'invalid_decision', errOf(e13))

  const e14 = await buyer3.rpc('create_review', { p_rental_id: e1.row.rental_id, p_rating: 3, p_comment: 'telat dikit' })
  check('E14 review setelah overdue-completed → ok', e14.data?.[0]?.ok === true, errOf(e14))
}

// ============================================================================
console.log('\n== Skenario F: dispute lifecycle (store2) ==')
{
  const f1 = await callCreate(buyer3, d(20), d(22), [{ listing_id: LO.id, quantity: 1 }])
  check('F1 rental dispute dibuat (store2)', f1.row?.ok === true, f1.row?.error)
  createdRentals.push({ id: f1.row.rental_id, label: 'F-DS' })
  await buyer3.rpc('submit_payment', { p_rental_id: f1.row.rental_id, p_method: 'e_wallet', p_proof_url: 'https://example.com/proof/ds.jpg' })
  const fPay = (await q(`SELECT id FROM public.payments WHERE transaction_id=$1`, [f1.row.rental_id]))[0]?.id
  await seller2.rpc('decide_payment', { p_payment_id: fPay, p_approve: true })
  const f2 = await seller2.rpc('start_rental', { p_rental_id: f1.row.rental_id })
  check('F2 start (owner2) → ongoing', f2.data?.[0]?.ok === true, errOf(f2))

  const f3 = await buyer3.rpc('open_dispute', { p_rental_id: f1.row.rental_id, p_reason: 'barang cacat', p_description: 'lensa retak' })
  check('F3 open_dispute (buyer) → ok, tx disputed', f3.data?.[0]?.ok === true
    && (await q(`SELECT status::text FROM public.rental_transactions WHERE id=$1`, [f1.row.rental_id]))[0]?.status === 'disputed', errOf(f3))
  const disRow = (await q(`SELECT opened_by, status FROM public.disputes WHERE transaction_id=$1`, [f1.row.rental_id]))[0]
  check('F3 DB: dispute open oleh buyer3', disRow?.opened_by === buyer3Id && disRow?.status === 'open')

  const f4 = await buyer3.rpc('open_dispute', { p_rental_id: f1.row.rental_id, p_reason: 'lagi' })
  check('F4 open_dispute saat disputed → illegal_transition (guard status dievaluasi dulu)', f4.data?.[0]?.ok === false && f4.data?.[0]?.error === 'illegal_transition', errOf(f4))

  const f5 = await seller.rpc('resolve_dispute', { p_dispute_id: (await q(`SELECT id FROM public.disputes WHERE transaction_id=$1`, [f1.row.rental_id]))[0]?.id, p_outcome: 'resolved', p_resolution: 'x' })
  check('F5 resolve oleh non-admin → forbidden', f5.data?.[0]?.ok === false && f5.data?.[0]?.error === 'forbidden', errOf(f5))

  // Catatan perilaku kontrak: inventory statuses TIDAK termasuk 'disputed' →
  // listing LO berstatus disputed tetap bisa dibooking di window sama. Diverifikasi:
  const f6 = await callCreate(buyer3, d(20), d(22), [{ listing_id: LO.id, quantity: 1 }])
  check('F6 booking window sama saat disputed → ok (perilaku kontrak; dicatat sbg catatan)', f6.row?.ok === true, f6.row?.error || f6.error?.message)
  createdRentals.push({ id: f6.row?.rental_id, label: 'F-DS2' })
  if (f6.row?.ok) {
    const f6c = await buyer3.rpc('cancel_rental', { p_rental_id: f6.row.rental_id, p_reason: 'cukup 1 booking' })
    check('F6 cancel booking ganda → cancelled', f6c.data?.[0]?.ok === true, errOf(f6c))
  }

  const disId = (await q(`SELECT id FROM public.disputes WHERE transaction_id=$1`, [f1.row.rental_id]))[0]?.id
  const f7 = await admin.rpc('resolve_dispute', { p_dispute_id: disId, p_outcome: 'rejected', p_resolution: 'bukti tidak cukup' })
  check('F7 resolve admin (rejected) → ok', f7.data?.[0]?.ok === true, errOf(f7))
  const f7v = (await q(`SELECT (SELECT status::text FROM public.rental_transactions WHERE id=$1) t, (SELECT status FROM public.disputes WHERE id=$2) d, (SELECT resolved_by IS NOT NULL FROM public.disputes WHERE id=$2) r`, [f1.row.rental_id, disId]))[0]
  check('F7 DB: dispute rejected + resolved_by admin; tx → completed (perilaku implementasi)', f7v?.d === 'rejected' && f7v?.r === true && f7v?.t === 'completed', JSON.stringify(f7v))

  // Kontrak "satu dispute AKTIF": setelah dispute pertama selesai (rejected) dan tx
  // completed, dispute BARU boleh dibuka — partial unique hanya memblok yang aktif.
  const f4b = await buyer3.rpc('open_dispute', { p_rental_id: f1.row.rental_id, p_reason: 'bandingan' })
  check('F4b dispute baru pasca-resolve → ok (satu AKTIF, bukan satu seumur hidup)', f4b.data?.[0]?.ok === true, errOf(f4b))
  const dis2Id = (await q(`SELECT id FROM public.disputes WHERE transaction_id=$1 AND status='open'`, [f1.row.rental_id]))[0]?.id
  const f4c = await admin.rpc('resolve_dispute', { p_dispute_id: dis2Id, p_outcome: 'resolved', p_resolution: 'kompensasi diberikan' })
  check('F4b resolve dispute kedua → ok, tx tetap completed', f4c.data?.[0]?.ok === true, errOf(f4c))

  const f8 = await buyer3.rpc('create_review', { p_rental_id: f1.row.rental_id, p_rating: 2, p_comment: 'masalah akhirnya selesai' })
  check('F8 review setelah resolve → ok (tx completed)', f8.data?.[0]?.ok === true, errOf(f8))
}

// ============================================================================
console.log('\n== Skenario G: input tidak valid & not_found ==')
{
  const g1 = await buyer3.rpc('submit_payment', { p_rental_id: '00000000-0000-0000-0000-000000000000', p_method: 'qris', p_proof_url: 'x' })
  check('G1 submit_payment ghost → not_found', g1.data?.[0]?.ok === false && g1.data?.[0]?.error === 'not_found', errOf(g1))
  const g2 = await seller.rpc('decide_payment', { p_payment_id: '00000000-0000-0000-0000-000000000000', p_approve: true })
  check('G2 decide_payment ghost → payment_not_found', g2.data?.[0]?.ok === false && g2.data?.[0]?.error === 'payment_not_found', errOf(g2))
  // RPC owner-only TIDAK membocorkan keberadaan resource (anti-enumeration):
  // ghost id → pemanggil bukan owner → forbidden (bukan not_found).
  const g3 = await seller.rpc('start_rental', { p_rental_id: '00000000-0000-0000-0000-000000000000' })
  check('G3 start_rental ghost → forbidden (anti-enumeration)', g3.data?.[0]?.ok === false && g3.data?.[0]?.error === 'forbidden', errOf(g3))
  const g4 = await seller.rpc('record_return', { p_rental_id: '00000000-0000-0000-0000-000000000000' })
  check('G4 record_return ghost → forbidden (anti-enumeration)', g4.data?.[0]?.ok === false && g4.data?.[0]?.error === 'forbidden', errOf(g4))
  const g5 = await seller.rpc('mark_overdue', { p_rental_id: '00000000-0000-0000-0000-000000000000' })
  check('G5 mark_overdue ghost → forbidden (anti-enumeration)', g5.data?.[0]?.ok === false && g5.data?.[0]?.error === 'forbidden', errOf(g5))
  const g6 = await seller.rpc('apply_late_fee', { p_rental_id: '00000000-0000-0000-0000-000000000000', p_daily_rate: 1000 })
  check('G6 apply_late_fee ghost → forbidden (anti-enumeration)', g6.data?.[0]?.ok === false && g6.data?.[0]?.error === 'forbidden', errOf(g6))
  const g7 = await buyer3.rpc('open_dispute', { p_rental_id: '00000000-0000-0000-0000-000000000000', p_reason: 'x' })
  check('G7 open_dispute ghost → not_found', g7.data?.[0]?.ok === false && g7.data?.[0]?.error === 'not_found', errOf(g7))
  const g8 = await admin.rpc('resolve_dispute', { p_dispute_id: '00000000-0000-0000-0000-000000000000', p_outcome: 'resolved', p_resolution: 'x' })
  check('G8 resolve_dispute ghost → not_found', g8.data?.[0]?.ok === false && g8.data?.[0]?.error === 'not_found', errOf(g8))
  const g9 = await admin.rpc('decide_late_fee', { p_late_fee_id: '00000000-0000-0000-0000-000000000000', p_decision: 'paid' })
  check('G9 decide_late_fee ghost → not_found', g9.data?.[0]?.ok === false && g9.data?.[0]?.error === 'not_found', errOf(g9))
  const g10 = await buyer3.rpc('create_review', { p_rental_id: '00000000-0000-0000-0000-000000000000', p_rating: 5, p_comment: 'x' })
  check('G10 create_review ghost → not_found', g10.data?.[0]?.ok === false && g10.data?.[0]?.error === 'not_found', errOf(g10))

  // proof_required: rental pending, submit tanpa URL bukti
  const g11r = await callCreate(buyer3, d(30), d(31), [{ listing_id: LN.id, quantity: 1 }])
  createdRentals.push({ id: g11r.row?.rental_id, label: 'G-PI' })
  const g11 = await buyer3.rpc('submit_payment', { p_rental_id: g11r.row.rental_id, p_method: 'bank_transfer', p_proof_url: '   ' })
  check('G11 submit_payment tanpa bukti → proof_required', g11.data?.[0]?.ok === false && g11.data?.[0]?.error === 'proof_required', errOf(g11))
  const g11v = (await q(`SELECT count(*)::int n FROM public.payments WHERE transaction_id=$1`, [g11r.row?.rental_id]))[0].n
  check('G11 DB: 0 payment terbuat (atomik)', g11v === 0, `n=${g11v}`)
  const g12 = await buyer3.rpc('cancel_rental', { p_rental_id: g11r.row.rental_id, p_reason: 'tutup' })
  check('G12 cancel rental pending → cancelled', g12.data?.[0]?.ok === true, errOf(g12))
}

// ============================================================================
console.log('\n== Verifikasi akhir: konsistensi & integritas ==')
{
  const nTx = (await q(`SELECT count(*)::int n FROM public.rental_transactions`))[0].n
  const nCreate = (await q(`SELECT count(*)::int n FROM public.audit_logs WHERE action='rental_create'`))[0].n
  check('invarian 1:1 audit rental_create = rental_transactions', nTx === nCreate, `rental=${nTx}, audit=${nCreate}`)

  const paySum = (await q(`SELECT status, count(*)::int n, COALESCE(SUM(amount),0)::text amt FROM public.payments GROUP BY status ORDER BY status`))
  console.log('  (info) payments per status:', JSON.stringify(paySum))
  const mismatch = (await q(`SELECT count(*)::int n FROM public.payments p JOIN public.rental_transactions r ON r.id=p.transaction_id WHERE p.amount <> r.total`))[0].n
  check('semua payment.amount = total transaksi (server)', mismatch === 0, `mismatch=${mismatch}`)

  const nActive = (await q(`SELECT count(*)::int n FROM public.rental_transactions WHERE status NOT IN ('completed','cancelled')`))[0].n
  check('tidak ada rental tertinggal di status aktif', nActive === 0, `aktif=${nActive}`)

  const occLN = await occupancy(LN.id, d(0), d(45))
  const occLO = await occupancy(LO.id, d(0), d(45))
  check('inventori LN & LO kembali bebas (semua completed/cancelled)', occLN.qty === 0 && occLO.qty === 0, `LN=${occLN.qty}, LO=${occLO.qty}`)

  const auditTail = await q(`SELECT action, count(*)::int n FROM public.audit_logs WHERE action IN ('payment_submit','payment_verify','payment_reject','return_record','latefee_apply','latefee_waive','dispute_open','dispute_resolve','review_create') GROUP BY action ORDER BY action`)
  console.log('  (info) audit lifecycle:', JSON.stringify(auditTail))

  const nRev = (await q(`SELECT count(*)::int n FROM public.reviews`))[0].n
  const nDis = (await q(`SELECT count(*)::int n FROM public.disputes`))[0].n
  const nFee = (await q(`SELECT count(*)::int n FROM public.late_fees`))[0].n
  check('delta lifecycle run ini: +3 review, +2 dispute, +1 late_fee',
    nRev - baseRev === 3 && nDis - baseDis === 2 && nFee - baseFee === 1,
    `rev+${nRev - baseRev}, dis+${nDis - baseDis}, fee+${nFee - baseFee}`)
}

state.e2e.rental_ids = createdRentals.map(r => r.id)
state.e2e.complete = true
writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
console.log(`\nSisa data: rental (semua completed/cancelled) tercatat di state.e2e — dibersihkan oleh test-rental-cleanup.mjs`)
console.log(`${pass} PASS, ${fail} FAIL`)
pgc.end()
process.exit(fail === 0 ? 0 : 1)
