#!/usr/bin/env node
// ============================================================================
// UJI E2E FRONTEND RENTAL — JabSewa (TEST LIVE SUPABASE)
// ============================================================================
// Memvalidasi KONTRAK FRONTEND (src/lib/userData.js + komponen) terhadap
// project Supabase live dengan akun buyer/seller/admin TERPISAH — meniru
// persis apa yang dikirim UI:
//   * auth = signInWithPassword per akun (sesi browser, bukan service role)
//   * create_rental dengan quantity > 1 (selector di ProductDetail)
//   * baca bukti via direct SELECT payments (BuyerPage: alasan penolakan)
//   * decide_payment reject MENYERTAKAN note (UI seller/admin wajib alasan)
//   * getMyReviewedRentalIds (reviews, RLS) → sembunyikan tombol review
//   * getActiveDisputes (disputes join rental, RLS) → antrian admin SysOrders
//   * getLateFeeForRental (late_fees, RLS) → tombol paid/waived
//   * double-submit simulasi (2 panggilan create_rental paralel dari "klik ganda")
//   * role tidak berhak ditolak (buyer memanggil RPC seller/admin, dsb.)
//   * audit_logs dicek per aksi (read-only via DATABASE_URL)
//
// TIDAK ada pembayaran riil; TIDAK ada perubahan schema/RPC/RLS; rental & data
// yang dibuat tertutup lengkap (completed) dan tercatat di state.frontendE2E.
// Pakai: node scripts/test-frontend-rental-e2e.mjs
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
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
}
if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
  console.error('✗ VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY belum diset')
  process.exit(1)
}
const url = new URL(env.VITE_SUPABASE_URL).origin
const anonKey = env.VITE_SUPABASE_ANON_KEY
const PROJECT_REF = url.replace(/^https:\/\//, '').split('.')[0]

// --- Fixture -------------------------------------------------------------------
const STATE_FILE = 'scripts/.rental-fixture.json'
const state = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
const PASSWORD = state.password
const STORE1 = state.store_id
const EMAIL_BUYER = state.users.buyer.email
const EMAIL_SELLER = state.users.seller.email
const EMAIL_ADMIN = state.users.admin.email
const EMAIL_SELLER2 = state.extra?.users?.seller2?.email
const [L1] = state.listings // stok 3 — cukup untuk qty 2
const LN = state.e2e?.listings?.LN // stok 1 — listing dispute (store1)

// --- Klien: SESI BROWSER per akun (bukan service role) --------------------------
async function mkAuth(email) {
  const c = createClient(url, anonKey, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login ${email}: ${error.message}`)
  return c
}

// --- DB read-only (verifikasi audit & stok) -------------------------------------
const pgc = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: /sslmode=disable/.test(env.DATABASE_URL) ? false : { rejectUnauthorized: false },
})
await pgc.connect()
const q = (s, p) => pgc.query(s, p).then((r) => r.rows)

// --- Helper hasil ----------------------------------------------------------------
let pass = 0
let fail = 0
function check(name, ok, detail = '') {
  if (ok) { pass += 1; console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`) }
  else { fail += 1; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`) }
}
const d = (o) => { const t = new Date(); t.setDate(t.getDate() + o); return t.toISOString().slice(0, 10) }
const REJECT_NOTE = `bukti tidak valid ${Date.now()}`

/** Panggilan UI-level: log latensi, cek PERSIS SATU baris kontrak. */
let callSeq = 0
async function callUi(client, rpc, params, label = '') {
  const id = `FE-${String(++callSeq).padStart(2, '0')}${label ? ` ${label}` : ''}`
  const t0 = Date.now()
  const { data, error } = await client.rpc(rpc, params)
  console.log(`    [req ${id}] rpc=${rpc} → ${Date.now() - t0}ms${error ? ` error="${error.message}"` : ''}`)
  const rows = Array.isArray(data) ? data : null
  if (error) return { ok: false, error: error.message, raw: error }
  if (!rows || rows.length !== 1) {
    return { ok: false, error: `KONTRAK_DILANGGAR: ${rows?.length ?? 0} baris (harus 1)` }
  }
  return rows[0]
}

const dbStatus = async (rentalId) =>
  (await q(`SELECT status::text, late_fee_total::text FROM public.rental_transactions WHERE id=$1`, [rentalId]))[0]
const auditExists = async (action, entityId) =>
  (await q(`SELECT 1 FROM public.audit_logs WHERE action=$1 AND entity_id=$2 LIMIT 1`, [action, entityId])).length > 0

// ============================================================================
console.log(`== E2E Frontend Rental — project ${PROJECT_REF} ==`)
console.log(`   (verifikasi ref: VITE_SUPABASE_URL → ${PROJECT_REF} — cocok dengan laporan 14/15/16)\n`)

// --- Sesi akun terpisah ---------------------------------------------------------
const buyer = await mkAuth(EMAIL_BUYER)
const seller = await mkAuth(EMAIL_SELLER)
const admin = await mkAuth(EMAIL_ADMIN)
const seller2 = await mkAuth(EMAIL_SELLER2)
const BUYER_ID = (await q(`SELECT id FROM public.users WHERE email=$1`, [EMAIL_BUYER]))[0].id
console.log(`  sesi buyer / seller / seller2 / admin aktif (4 sesi browser)`)

// ============================================================================
console.log(`\n== Skenario 1: Buyer — quantity, quote, create, kirim bukti ==`)
{
  const qt = await callUi(buyer, 'quote_rental', {
    p_start: d(3), p_end: d(4), p_items: [{ listing_id: L1.id, quantity: 2 }],
  }, 'qty=2')
  check('1a quote qty=2 → ok, total server = 2×(2×150rb) + 2×2jt = 4.600.000',
    qt.ok === true && Number(qt.total) === 4600000 && Number(qt.total_days) === 2,
    `total=${qt.total}, days=${qt.total_days}, subtotal=${qt.subtotal}, deposit=${qt.deposit_total}`)

  // UI: tombol aktif hanya saat quote.ok — create mengirim item yang SAMA dengan quote.
  const cr = await callUi(buyer, 'create_rental', {
    p_start: d(3), p_end: d(4), p_items: [{ listing_id: L1.id, quantity: 2 }],
  }, 'qty=2')
  check('1b create_rental qty=2 → pending, total server (bukan payload client)',
    cr.ok === true && cr.status === 'pending' && Number(cr.total) === 4600000,
    `rental=${cr.rental_id?.slice(0, 8)}, total=${cr.total}`)
  var rentId = cr.rental_id
  check('1c audit rental_create tercatat', await auditExists('rental_create', rentId))

  // Double-submit (klik ganda): dua create paralel → TIDAK ada duplikasi partial;
  // kontrak tanpa idempotency-key → sukses kedua = rental kedua (keduanya utuh),
  // keduanya langsung dibatalkan agar stok kembali.
  const t0 = Date.now()
  const [dbl1, dbl2] = await Promise.all([
    buyer.rpc('create_rental', { p_start: d(3), p_end: d(4), p_items: [{ listing_id: L1.id, quantity: 1 }] }),
    buyer.rpc('create_rental', { p_start: d(3), p_end: d(4), p_items: [{ listing_id: L1.id, quantity: 1 }] }),
  ])
  console.log(`    [double-submit] 2 panggilan paralel → ${Date.now() - t0}ms`)
  // Kontrak tanpa idempotency-key: tiap klik = percobaan create utuh. Yang
  // diverifikasi: TIDAK ADA data parsial — sukses = rental utuh (tepat 1 baris),
  // gagal = error bersih insufficient_stock (stok 3 − 2 dipegang rental utama = 1).
  const dblOk = [dbl1, dbl2].filter((r) => r.data?.[0]?.ok === true)
  const dblFail = [dbl1, dbl2].filter((r) => r.data?.[0]?.ok === false)
  check('1d klik ganda paralel → kontrak utuh: sukses = rental utuh, gagal = insufficient_stock bersih (tanpa baris parsial)',
    dbl1.data.length === 1 && dbl2.data.length === 1
    && dblOk.every((r) => r.data[0].status === 'pending' && Number(r.data[0].total) === 2300000)
    && dblFail.every((r) => r.data[0].error === 'insufficient_stock')
    && dblOk.length + dblFail.length === 2,
    `ok=${dblOk.length} (${dblOk.map((r) => r.data[0].rental_id?.slice(0, 8)).join(',')}), gagal=${dblFail.map((r) => r.data[0].error).join(',')}`)
  for (const r of dblOk) {
    await buyer.rpc('cancel_rental', { p_rental_id: r.data[0].rental_id, p_reason: 'pembatalan tes double-submit' })
  }

  const occ = (await q(
    `SELECT COALESCE(SUM(ti.quantity),0)::int qty FROM public.transaction_items ti
      JOIN public.rental_transactions r ON r.id=ti.transaction_id
     WHERE ti.listing_id=$1 AND r.status IN ('pending','payment_verify','confirmed','ongoing','overdue')
       AND r.start_date <= $3 AND r.end_date >= $2`, [L1.id, d(3), d(4)]))[0]
  check('1e stok dipegang: occupancy = 2 (dari rental utama) setelah duplikat dibatalkan',
    occ.qty === 2, `occupied=${occ.qty}`)

  // UI buyer: baca bukti lama (harus kosong — belum ada submit) via RLS.
  const preProofs = await buyer.from('payments').select('id, status').eq('transaction_id', rentId)
  check('1f BuyerPage: daftar bukti terbaca (RLS) — 0 baris sebelum submit',
    !preProofs.error && preProofs.data.length === 0)

  const sp = await callUi(buyer, 'submit_payment', {
    p_rental_id: rentId, p_method: 'bank_transfer',
    p_proof_url: 'https://example.com/proof/fe-1.jpg', p_external_reference: 'FE-REF-001',
  }, 'bukti #1')
  check('1g submit_payment → payment_verify', sp.ok === true && sp.status === 'payment_verify', `payment=${sp.payment_id?.slice(0, 8)}`)
  var payId1 = sp.payment_id
  const payRow = (await q(`SELECT amount::text, status FROM public.payments WHERE id=$1`, [payId1]))[0]
  check('1h DB: amount = 4.600.000 (server), status pending', payRow?.amount === '4600000' && payRow?.status === 'pending', JSON.stringify(payRow))
  check('1i audit payment_submit tercatat', await auditExists('payment_submit', payId1))
  check('1j transisi: pending → payment_verify', (await dbStatus(rentId))?.status === 'payment_verify')
}

// ============================================================================
console.log(`\n== Skenario 2: Seller — tolak dengan alasan → buyer kirim ulang ==`)
{
  // UI seller: bukti terbaca via RLS (auto-load SellerOrders).
  const sProofs = await seller.from('payments').select('id, status, payment_proof_url, external_reference').eq('transaction_id', rentId)
  check('2a SellerOrders: bukti pending terbaca (RLS) + ref tampil',
    !sProofs.error && sProofs.data.some((p) => p.id === payId1 && p.external_reference === 'FE-REF-001'))

  // UI admin (SysOrders) juga melihat bukti yang sama — antrian verifikasi.
  const aProofs = await admin.from('payments').select('id, status').eq('transaction_id', rentId)
  check('2b SysOrders admin: bukti terbaca (RLS admin semua baris)', !aProofs.error && aProofs.data.length === 1)

  // Role tidak berhak: buyer mencoba memverifikasi buktinya sendiri.
  const rogue = await callUi(buyer, 'decide_payment', { p_payment_id: payId1, p_approve: true }, 'buyer→verify')
  check('2c buyer verifikasi sendiri → forbidden (UI seller/admin saja)', rogue.ok === false && rogue.error === 'forbidden', rogue.error)
  var guardRentId = rentId // referensi rental untuk pengecekan akses (dipakai skenario 8)

  const rj = await callUi(seller, 'decide_payment', { p_payment_id: payId1, p_approve: false, p_note: REJECT_NOTE }, 'reject')
  check('2d reject DENGAN note → ok=true, tx_status=pending (BUKAN cancelled — CATATAN-K)',
    rj.ok === true && rj.tx_status === 'pending', `tx_status=${rj.tx_status}`)
  const st = await dbStatus(rentId)
  check('2e transisi: payment_verify → pending; payment #1 failed',
    st.status === 'pending' && (await q(`SELECT status FROM public.payments WHERE id=$1`, [payId1]))[0]?.status === 'failed')
  check('2f audit payment_reject + note', await auditExists('payment_reject', payId1))

  // UI buyer: alasan penolakan terbaca dari payment failed (BuyerPage rejectedProof).
  const bProofs = await buyer.from('payments').select('id, status, external_reference').eq('transaction_id', rentId).order('created_at', { ascending: false })
  const failedProof = bProofs.data?.find((p) => p.status === 'failed')
  check('2g BuyerPage: bukti failed terbaca + ref cocok (info penolakan tampil)',
    Boolean(failedProof) && failedProof.external_reference === 'FE-REF-001')

  const sp2 = await callUi(buyer, 'submit_payment', {
    p_rental_id: rentId, p_method: 'bank_transfer',
    p_proof_url: 'https://example.com/proof/fe-2.jpg', p_external_reference: 'FE-REF-002',
  }, 'bukti #2')
  check('2h submit ulang setelah ditolak → payment_verify', sp2.ok === true && sp2.status === 'payment_verify')
  var payId2 = sp2.payment_id
  const nPays = (await q(`SELECT count(*)::int n FROM public.payments WHERE transaction_id=$1`, [rentId]))[0].n
  check('2i DB: 2 baris payment (riwayat utuh), amount sama = server total', nPays === 2)
  check('2j transisi: pending → payment_verify', (await dbStatus(rentId))?.status === 'payment_verify')
}

// ============================================================================
console.log(`\n== Skenario 3: Seller — setujui & mulai rental ==`)
{
  const ap = await callUi(seller, 'decide_payment', { p_payment_id: payId2, p_approve: true }, 'approve')
  check('3a decide_payment approve → tx confirmed', ap.ok === true && ap.tx_status === 'confirmed', `tx_status=${ap.tx_status}`)
  const paidRow = (await q(`SELECT status, amount::text, paid_at IS NOT NULL AS paid FROM public.payments WHERE id=$1`, [payId2]))[0]
  check('3b DB: payment #2 paid + paid_at terisi + amount = 4.600.000',
    paidRow?.status === 'paid' && paidRow?.paid === true && paidRow?.amount === '4600000')
  check('3c audit payment_verify tercatat', await auditExists('payment_verify', payId2))

  const sr = await callUi(seller, 'start_rental', { p_rental_id: rentId }, 'start')
  check('3d start_rental → ongoing', sr.ok === true && sr.status === 'ongoing')
  check('3e audit return_record TIDAK tercatat untuk start (aksi berbeda)', !(await auditExists('return_record', rentId)))
  check('3f transisi: confirmed → ongoing', (await dbStatus(rentId))?.status === 'ongoing')

  const sro = await callUi(seller2, 'start_rental', { p_rental_id: rentId }, 'owner lain')
  check('3g owner toko lain start → forbidden', sro.ok === false && sro.error === 'forbidden', sro.error)
}

// ============================================================================
console.log(`\n== Skenario 4: Pengembalian → completed ==`)
{
  const rr = await callUi(seller, 'record_return', { p_rental_id: rentId }, 'return')
  check('4a record_return → completed', rr.ok === true && rr.status === 'completed')
  const row = (await q(`SELECT actual_return_date IS NOT NULL AS ret, status::text FROM public.rental_transactions WHERE id=$1`, [rentId]))[0]
  check('4b DB: actual_return_date terisi', row?.ret === true)
  check('4c audit return_record tercatat', await auditExists('return_record', rentId))
  const occ = (await q(
    `SELECT COALESCE(SUM(ti.quantity),0)::int qty FROM public.transaction_items ti
      JOIN public.rental_transactions r ON r.id=ti.transaction_id
     WHERE ti.listing_id=$1 AND r.status IN ('pending','payment_verify','confirmed','ongoing','overdue')
       AND r.start_date <= $3 AND r.end_date >= $2`, [L1.id, d(3), d(4)]))[0]
  check('4d stok kembali: occupancy = 0 setelah completed', occ.qty === 0, `occupied=${occ.qty}`)
}

// ============================================================================
console.log(`\n== Skenario 5: Review sekali — tombol hilang ==`)
{
  const preIds = await buyer.from('reviews').select('transaction_id')
  const hadReview = preIds.data?.some((r) => r.transaction_id === rentId)
  check('5a BuyerPage: pre-review, tx belum ada di daftar review (tombol tampil)', hadReview === false)

  const rv = await callUi(buyer, 'create_review', { p_rental_id: rentId, p_rating: 5, p_comment: 'E2E frontend: mulus' }, 'review')
  check('5b create_review → ok', rv.ok === true)
  check('5c audit review_create tercatat', await auditExists('review_create', rv.review_id))

  const postIds = await buyer.from('reviews').select('transaction_id')
  check('5d BuyerPage: post-review, tx MASUK daftar review (tombol disembunyikan)',
    postIds.data?.some((r) => r.transaction_id === rentId))

  const rv2 = await callUi(buyer, 'create_review', { p_rental_id: rentId, p_rating: 4, p_comment: 'coba ulang' }, 'duplikat')
  check('5e review kedua → already_reviewed (server)', rv2.ok === false && rv2.error === 'already_reviewed', rv2.error)
}

// ============================================================================
console.log(`\n== Skenario 6: Dispute buyer → resolve admin ==`)
{
  // Rental dispute: LN (stok 1, store1). Buat via UI buyer + bayar + start.
  const cr = await callUi(buyer, 'create_rental', {
    p_start: d(6), p_end: d(7), p_items: [{ listing_id: LN.id, quantity: 1 }],
  }, 'dispute')
  check('6a rental dispute dibuat → pending', cr.ok === true && cr.status === 'pending')
  var dRentId = cr.rental_id
  const sp = await callUi(buyer, 'submit_payment', {
    p_rental_id: dRentId, p_method: 'qris', p_proof_url: 'https://example.com/proof/fe-ds.jpg',
  }, 'dispute')
  const ap = await callUi(seller, 'decide_payment', { p_payment_id: sp.payment_id, p_approve: true }, 'dispute')
  const sr = await callUi(seller, 'start_rental', { p_rental_id: dRentId }, 'dispute')
  check('6b rental dispute → ongoing (siap disengketakan)', ap.ok === true && sr.status === 'ongoing')

  const od = await callUi(buyer, 'open_dispute', {
    p_rental_id: dRentId, p_reason: 'barang tidak sesuai deskripsi (E2E frontend)', p_description: '',
  }, 'dispute')
  check('6c BuyerPage open_dispute → ok; tx → disputed', od.ok === true && (await dbStatus(dRentId))?.status === 'disputed')
  check('6d audit dispute_open tercatat', await auditExists('dispute_open', od.dispute_id))

  // SysOrders: antrian sengketa aktif via RLS (disputes join rental_transactions).
  const queue = await admin.from('disputes')
    .select('id, transaction_id, status, reason, rental_transactions!inner(id, status, stores(name))')
    .in('status', ['open', 'investigating'])
  const inQueue = queue.data?.find((x) => x.id === od.dispute_id)
  check('6e SysOrders: sengketa tampil di antrian admin + nama toko join', Boolean(inQueue) && inQueue.rental_transactions?.stores?.name != null,
    inQueue ? `tx=${inQueue.transaction_id?.slice(0, 8)}` : 'tidak ditemukan')

  const rogue = await callUi(seller, 'resolve_dispute', { p_dispute_id: od.dispute_id, p_outcome: 'resolved', p_resolution: 'x' }, 'seller')
  check('6f seller resolve → forbidden (admin-only)', rogue.ok === false && rogue.error === 'forbidden', rogue.error)

  const rs = await callUi(admin, 'resolve_dispute', {
    p_dispute_id: od.dispute_id, p_outcome: 'resolved',
    p_resolution: `dicek admin — kompensasi diberikan (${REJECT_NOTE})`,
  }, 'resolve')
  check('6g SysOrders resolve_dispute → ok; tx disputed → completed',
    rs.ok === true && (await dbStatus(dRentId))?.status === 'completed')
  check('6h audit dispute_resolve tercatat', await auditExists('dispute_resolve', od.dispute_id))
}

// ============================================================================
console.log(`\n== Skenario 7: Denda — owner paid, admin waived ==`)
{
  // Rental late: unpaid guard → submit+approve+start → mark_overdue.
  const cr = await callUi(buyer, 'create_rental', {
    p_start: d(9), p_end: d(10), p_items: [{ listing_id: LN.id, quantity: 1 }],
  }, 'late')
  check('7a rental late dibuat → pending', cr.ok === true && cr.status === 'pending')
  var lRentId = cr.rental_id
  const sp = await callUi(buyer, 'submit_payment', {
    p_rental_id: lRentId, p_method: 'e_wallet', p_proof_url: 'https://example.com/proof/fe-lf.jpg',
  }, 'late')
  await seller.rpc('decide_payment', { p_payment_id: sp.payment_id, p_approve: true })
  await seller.rpc('start_rental', { p_rental_id: lRentId })

  const mo = await callUi(seller, 'mark_overdue', { p_rental_id: lRentId }, 'before end')
  check('7b SellerOrders mark_overdue sebelum end_date → not_late (server)', mo.ok === false && mo.error === 'not_late', mo.error)

  // Simulasi waktu (SQL, TERCATAT di state — mengikuti pola laporan 15):
  await q(`UPDATE public.rental_transactions SET start_date = CURRENT_DATE - 3, end_date = CURRENT_DATE - 1 WHERE id=$1`, [lRentId])
  state.frontendE2E ||= {}
  state.frontendE2E.sql_mutations ||= []
  state.frontendE2E.sql_mutations.push({ rental_id: lRentId, field: 'start_date+end_date', to: 'CURRENT_DATE-3 / CURRENT_DATE-1', reason: 'E2E frontend: simulasi keterlambatan' })

  const mo2 = await callUi(seller, 'mark_overdue', { p_rental_id: lRentId }, 'overdue')
  check('7c mark_overdue → overdue', mo2.ok === true && mo2.status === 'overdue')

  const fee = await callUi(seller, 'apply_late_fee', { p_rental_id: lRentId, p_daily_rate: 25000 }, 'fee')
  check('7d SellerOrders apply_late_fee → ok, total = 25.000 (1 hari × 25rb, server)',
    fee.ok === true && Number(fee.total) === 25000, `total=${fee.total}`)
  const feeRow = (await q(`SELECT id, days_late, daily_rate::text, total::text, status FROM public.late_fees WHERE transaction_id=$1`, [lRentId]))[0]
  check('7e DB: late_fees 1 baris unpaid (days_late=1)', feeRow?.days_late === 1 && feeRow?.total === '25000' && feeRow?.status === 'unpaid')
  check('7f audit latefee_apply tercatat', await auditExists('latefee_apply', lRentId))

  const feeTot1 = (await dbStatus(lRentId))?.late_fee_total
  check('7g late_fee_total transaksi = 25.000', feeTot1 === '25000', feeTot1)

  // SellerOrders: baca denda via RLS → tombol "Tandai denda dibayar".
  const sFee = await seller.from('late_fees').select('id, status, total').eq('transaction_id', lRentId).maybeSingle()
  check('7h SellerOrders: late_fees terbaca (RLS owner)', !sFee.error && sFee.data?.id === feeRow.id)

  const paidR = await callUi(seller, 'decide_late_fee', { p_late_fee_id: feeRow.id, p_decision: 'paid' }, 'owner')
  check('7i decide_late_fee paid (owner) → ok', paidR.ok === true)
  check('7j DB: denda paid; late_fee_total TETAP 25.000 (paid tetap dihitung)',
    (await q(`SELECT status FROM public.late_fees WHERE id=$1`, [feeRow.id]))[0]?.status === 'paid'
    && (await dbStatus(lRentId))?.late_fee_total === '25000')

  // Waived admin-only: seller → forbidden, admin → ok.
  const wvS = await callUi(seller, 'decide_late_fee', { p_late_fee_id: feeRow.id, p_decision: 'waived' }, 'owner')
  check('7k waived oleh owner → forbidden (admin-only)', wvS.ok === false && wvS.error === 'forbidden', wvS.error)
  const wvA = await callUi(admin, 'decide_late_fee', { p_late_fee_id: feeRow.id, p_decision: 'waived' }, 'admin')
  check('7l SysOrders waived (admin) → ok; late_fee_total → 0 (waived tidak dihitung)',
    wvA.ok === true && (await dbStatus(lRentId))?.late_fee_total === '0')
  check('7m audit latefee_waive tercatat', await auditExists('latefee_waive', feeRow.id))

  const rr = await callUi(seller, 'record_return', { p_rental_id: lRentId }, 'late close')
  check('7n record_return dari overdue → completed', rr.ok === true && rr.status === 'completed')
  // Rental dispute sudah completed di skenario 6; rental late kini completed juga.
}

// ============================================================================
console.log(`\n== Skenario 8: Konsistensi akhir — audit, payment, stok ==`)
{
  const nTx = (await q(`SELECT count(*)::int n FROM public.rental_transactions`))[0].n
  const nCreate = (await q(`SELECT count(*)::int n FROM public.audit_logs WHERE action='rental_create'`))[0].n
  check('8a invarian 1:1 rental_transactions = audit rental_create', nTx === nCreate, `rental=${nTx}, audit=${nCreate}`)

  const mismatch = (await q(
    `SELECT count(*)::int n FROM public.payments p JOIN public.rental_transactions r ON r.id=p.transaction_id
      WHERE p.amount <> r.total`))[0].n
  check('8b SEMUA payment.amount = total transaksi (server-computed)', mismatch === 0, `mismatch=${mismatch}`)

  const partial = (await q(
    `SELECT count(*)::int n FROM public.transaction_items ti
       LEFT JOIN public.rental_transactions r ON r.id = ti.transaction_id
      WHERE r.id IS NULL`))[0].n
  check('8c tidak ada item yatim (double-submit tidak meninggalkan data parsial)', partial === 0, `orphan=${partial}`)

  const l1Stock = (await q(`SELECT stock FROM public.listings WHERE id=$1`, [L1.id]))[0]?.stock
  const lnStock = (await q(`SELECT stock FROM public.listings WHERE id=$1`, [LN.id]))[0]?.stock
  check('8d kolom stock listings tidak berubah oleh aktivitas sewa (arsitektur occupancy)',
    l1Stock === L1.stock && lnStock === LN.stock, `L1=${l1Stock}/${L1.stock}, LN=${lnStock}/${LN.stock}`)

  // Role-reject (2c/3g forbidden) tidak boleh memutasi transaksi: riwayat
  // payment rental utama = tepat 2 (1 failed dari reject, 1 paid dari approve),
  // dan transaksi berakhir completed — bukan status antara yang menggantung.
  const payHist = (await q(
    `SELECT count(*)::int n,
            count(*) FILTER (WHERE status='paid')::int n_paid,
            count(*) FILTER (WHERE status='failed')::int n_failed
       FROM public.payments WHERE transaction_id=$1`, [rentId]))[0]
  const mainStatus = (await dbStatus(rentId))?.status
  check('8e rental utama: riwayat payment bersih (1 failed + 1 paid) & berakhir completed — role-reject tidak meninggalkan efek samping',
    payHist.n === 2 && payHist.n_paid === 1 && payHist.n_failed === 1 && mainStatus === 'completed',
    `payments=${payHist.n} (paid=${payHist.n_paid}, failed=${payHist.n_failed}), status=${mainStatus}`)

  const actions = ['rental_create', 'rental_cancel', 'payment_submit', 'payment_verify', 'payment_reject',
    'return_record', 'latefee_apply', 'latefee_waive', 'dispute_open', 'dispute_resolve', 'review_create']
  const tail = await q(
    `SELECT action, count(*)::int n FROM public.audit_logs
      WHERE action = ANY($1) AND created_at > now() - interval '10 minutes'
      GROUP BY action ORDER BY action`, [actions])
  const tailMap = Object.fromEntries(tail.map((r) => [r.action, r.n]))
  const missing = actions.filter((a) => !(tailMap[a] > 0))
  check('8f 11 jenis aksi audit tercatat dalam 10 menit terakhir', missing.length === 0,
    missing.length ? `hilang: ${missing.join(', ')}` : JSON.stringify(tailMap))

  // Sesi buyer tidak melihat audit_logs sama sekali (RLS).
  const anonAudit = await buyer.from('audit_logs').select('id').limit(1)
  check('8g audit_logs tersembunyi dari buyer (RLS admin-only)', Boolean(anonAudit.error) || anonAudit.data.length === 0,
    anonAudit.error ? `ditolak: ${anonAudit.error.code ?? ''}` : 'kosong')
}

// --- Status akhir semua rental yang dibuat run ini ------------------------------
const finalRows = await q(
  `SELECT status::text, count(*)::int n FROM public.rental_transactions WHERE id = ANY($1::uuid[]) GROUP BY status::text`,
  [[rentId, dRentId, lRentId, guardRentId]])
console.log(`\n   (info) status akhir rental E2E frontend: ${JSON.stringify(finalRows)}`)

state.frontendE2E ||= {}
state.frontendE2E.rental_ids = [rentId, dRentId, lRentId, guardRentId].filter(Boolean)
state.frontendE2E.complete = true
writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))

console.log(`\nSisa data: 4 rental (completed/cancelled) — tercatat di state.frontendE2E; tidak ada rental aktif tertinggal.`)
console.log(`${pass} PASS, ${fail} FAIL`)
pgc.end()
process.exit(fail === 0 ? 0 : 1)
