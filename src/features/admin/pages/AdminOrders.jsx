/*
 * ============================================================================
 * SYS ORDERS — JabSewa (ERD v2)
 * ============================================================================
 * Modul sengketa rental + verifikasi pembayaran & denda.
 *
 * ENTITAS: skema JabSewa HANYA punya `disputes` (sengketa per transaksi
 * rental, dibuka buyer atau pemilik toko). Tidak ada tabel laporan pelanggan
 * terpisah dan tidak ada kolom bukti/riwayat keputusan selain resolution,
 * resolved_by, resolved_at. UI tidak mengarang entitas, status, atau bukti
 * yang tidak ada — kekosongan itu dinyatakan apa adanya.
 *
 * Sumber data:
 *   - rental_transactions (direct SELECT, RLS admin melihat semua baris)
 *   - payments / late_fees per transaksi (RLS admin)
 *   - disputes aktif open/investigating (RLS admin)
 * Semua keputusan lewat RPC dan tercatat audit_logs server-side
 * (payment_verify/payment_reject, dispute_resolve, latefee_waive).
 *
 * CATATAN-K: menolak bukti TIDAK membatalkan transaksi — server mengembalikan
 * tx ke `pending` agar buyer dapat mengirim ulang bukti.
 * ============================================================================
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  adminListRentals,
  adminListActiveDisputes,
  adminDecidePayment,
  adminResolveDispute,
  adminDecideLateFee,
} from '../../../data/admin'
import { getPaymentsForRental, getLateFeeForRental } from '../../../data/rentals'
import { formatPrice, formatDate, formatDateTime } from '../../../domain/format'
import {
  TRANSACTION_STATUS,
  TRANSACTION_STATUS_META,
  DISPUTE_STATUS_META,
  PAYMENT_METHODS,
  translateServerError,
} from '../../../domain/constants'
import ProofLink from '../../../ui/ProofLink'
import AdminConfirm from '../components/AdminConfirm'

const FILTERS = [
  { key: 'all', label: 'Semua' },
  { key: TRANSACTION_STATUS.PAYMENT_VERIFY, label: 'Verifikasi Bayar' },
  { key: TRANSACTION_STATUS.DISPUTED, label: 'Sengketa' },
  { key: TRANSACTION_STATUS.OVERDUE, label: 'Terlambat' },
  { key: TRANSACTION_STATUS.ONGOING, label: 'Berjalan' },
]

const OUTCOMES = [
  { value: 'resolved', label: 'resolved — keputusan untuk pelapor' },
  { value: 'rejected', label: 'rejected — komplain ditolak' },
]

const LATE_FEE_STATUS = {
  unpaid: 'Belum dibayar',
  paid: 'Sudah dibayar',
  waived: 'Dihapus (waived)',
}

const PAYMENT_METHOD_LABELS = Object.fromEntries(
  PAYMENT_METHODS.map((method) => [method.id, method.label]),
)

/* Sentinel cache: undefined = belum dimuat, 'error' = gagal dimuat. */
const LOAD_ERROR = 'error'

/* Meta status transaksi memakai kelas UI pembeli/seller; area admin memakai
 * badge sendiri (.sys-status-badge) agar tidak bergantung pada CSS fitur user. */
const SYS_BADGE_TONE = {
  'status-pending': 'is-review',
  'status-accepted': 'is-approved',
  'status-active': 'is-approved',
  'status-completed': 'is-approved',
  'status-rejected': 'is-rejected',
  'status-cancelled': 'is-review',
}

function transactionMeta(status) {
  const meta = TRANSACTION_STATUS_META[status] || {
    label: status || '—',
    className: 'status-pending',
  }
  return { ...meta, sysClassName: SYS_BADGE_TONE[meta.className] || 'is-review' }
}

function disputeMeta(status) {
  return DISPUTE_STATUS_META[status] || { label: status || '—', className: 'is-review' }
}

/** Pembuka sengketa: hanya buyer atau pemilik toko (guard open_dispute). */
function reporterLabel(dispute) {
  if (!dispute.opened_by) return '—'
  if (!dispute.rental?.buyer_id) return '—'
  return dispute.opened_by === dispute.rental.buyer_id ? 'Penyewa' : 'Pemilik toko'
}

export default function AdminOrders() {
  const [rentals, setRentals] = useState([])
  const [rentalState, setRentalState] = useState('loading') // loading | ready | error
  const [filter, setFilter] = useState('all')

  const [disputes, setDisputes] = useState([])
  const [disputeState, setDisputeState] = useState('loading')

  const [proofs, setProofs] = useState({}) // rental_id → payments[] | 'error'
  const [fees, setFees] = useState({}) // rental_id → late_fee | null | 'error'

  const [rejectTarget, setRejectTarget] = useState(null) // { orderId, paymentId }
  const [rejectReason, setRejectReason] = useState('')

  const [resolveTarget, setResolveTarget] = useState(null) // dispute id
  const [resolveOutcome, setResolveOutcome] = useState('resolved')
  const [resolveText, setResolveText] = useState('')
  const [waiveTarget, setWaiveTarget] = useState(null) // { orderId, feeId, total }

  const [busyKey, setBusyKey] = useState(null) // mencegah klik ganda lintas aksi
  // Ref menutup celah dua klik pada tick yang sama (state belum ter-render).
  const busyRef = useRef(false)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')

  const busy = busyKey !== null

  const loadRentals = useCallback(() => {
    setRentalState('loading')
    return adminListRentals()
      .then((data) => {
        setRentals(Array.isArray(data) ? data : [])
        setRentalState('ready')
      })
      .catch(() => setRentalState('error'))
  }, [])

  const loadDisputes = useCallback(() => {
    setDisputeState('loading')
    return adminListActiveDisputes()
      .then((data) => {
        setDisputes(Array.isArray(data) ? data : [])
        setDisputeState('ready')
      })
      .catch(() => setDisputeState('error'))
  }, [])

  // Microtask: hindari setState sinkron di body effect (aturan lint proyek).
  useEffect(() => {
    Promise.resolve().then(() => {
      loadRentals()
      loadDisputes()
    })
  }, [loadRentals, loadDisputes])

  // Muat bukti & denda hanya untuk transaksi yang membutuhkannya.
  useEffect(() => {
    if (rentalState !== 'ready') return

    rentals.forEach((order) => {
      if (order.status === TRANSACTION_STATUS.PAYMENT_VERIFY && proofs[order.id] === undefined) {
        getPaymentsForRental(order.id)
          .then((rows) =>
            setProofs((cur) =>
              cur[order.id] === undefined ? { ...cur, [order.id]: rows || [] } : cur,
            ),
          )
          .catch(() =>
            setProofs((cur) =>
              cur[order.id] === undefined ? { ...cur, [order.id]: LOAD_ERROR } : cur,
            ),
          )
      }
      if (order.late_fee_total > 0 && fees[order.id] === undefined) {
        getLateFeeForRental(order.id)
          .then((row) =>
            setFees((cur) => (cur[order.id] === undefined ? { ...cur, [order.id]: row } : cur)),
          )
          .catch(() =>
            setFees((cur) =>
              cur[order.id] === undefined ? { ...cur, [order.id]: LOAD_ERROR } : cur,
            ),
          )
      }
    })
  }, [rentalState, rentals, proofs, fees])

  /** Hapus cache satu transaksi → effect memuat ulang dari server. */
  const retryProofs = (rentalId) =>
    setProofs((cur) => {
      const next = { ...cur }
      delete next[rentalId]
      return next
    })

  const retryFee = (rentalId) =>
    setFees((cur) => {
      const next = { ...cur }
      delete next[rentalId]
      return next
    })

  /**
   * Jalankan mutasi RPC. `true` hanya bila backend mengonfirmasi sukses —
   * form konfirmasi baru boleh ditutup setelah itu (sebelumnya ditutup juga
   * saat gagal, sehingga alasan yang diketik operator hilang).
   */
  const run = async (key, fn, okMessage) => {
    if (busyRef.current) return false
    busyRef.current = true
    setBusyKey(key)
    setActionError('')
    setNotice('')
    try {
      await fn()
      setNotice(okMessage)
      // Bukti/denda bisa berubah setelah keputusan: buang cache lalu muat ulang.
      setProofs({})
      setFees({})
      await Promise.all([loadRentals(), loadDisputes()])
      return true
    } catch (err) {
      setActionError(translateServerError(err?.message))
      return false
    } finally {
      busyRef.current = false
      setBusyKey(null)
    }
  }

  const visible = useMemo(
    () => (filter === 'all' ? rentals : rentals.filter((r) => r.status === filter)),
    [rentals, filter],
  )

  const counts = useMemo(() => {
    const next = { all: rentals.length }
    FILTERS.slice(1).forEach((f) => {
      next[f.key] = rentals.filter((r) => r.status === f.key).length
    })
    return next
  }, [rentals])

  const submitResolution = async (dispute) => {
    const ok = await run(
      `dispute:${dispute.id}`,
      () => adminResolveDispute(dispute.id, resolveOutcome, resolveText.trim()),
      'Sengketa diputus dan tercatat di audit log.',
    )
    if (ok) {
      setResolveTarget(null)
      setResolveText('')
    }
  }

  const submitRejectPayment = async (paymentId) => {
    const ok = await run(
      `payment:${paymentId}`,
      () => adminDecidePayment(paymentId, false, rejectReason.trim()),
      'Bukti ditolak — transaksi kembali menunggu pembayaran.',
    )
    if (ok) {
      setRejectTarget(null)
      setRejectReason('')
    }
  }

  const confirmWaive = async () => {
    if (!waiveTarget) return
    const ok = await run(
      `fee:${waiveTarget.feeId}`,
      () => adminDecideLateFee(waiveTarget.feeId, 'waived'),
      'Denda dihapus (waived).',
    )
    if (ok) setWaiveTarget(null)
  }

  return (
    <div className="sys-page">
      <header className="sys-page-head">
        <div>
          <h1>Sengketa Rental</h1>
          <p className="sys-page-sub">
            Antrian sengketa, verifikasi pembayaran, dan denda. Semua keputusan tercatat di audit
            log.
          </p>
          <button
            type="button"
            className="sys-btn-ghost"
            disabled={busy}
            onClick={() => {
              setActionError('')
              setNotice('')
              loadRentals()
              loadDisputes()
            }}
          >
            Muat ulang
          </button>
        </div>
        <div className="sys-pending" aria-live="polite">
          <span className="sys-pending-num">
            {disputeState === 'ready' ? disputes.length : '—'}
          </span>
          <span className="sys-pending-label">sengketa aktif</span>
        </div>
      </header>

      {notice && (
        <p className="sys-note sys-note-ok" role="status">
          {notice}
        </p>
      )}
      {actionError && (
        <p className="sys-note sys-note-err" role="alert">
          {actionError}
        </p>
      )}

      {/* --- Sengketa aktif (admin-only resolver) --- */}
      <section className="sys-panel" aria-label="Antrian sengketa">
        <div className="sys-panel-head">
          <h2>Antrian sengketa</h2>
          <p className="sys-note">
            Hanya sengketa berstatus open/investigating yang tampil. Skema belum menyimpan bukti
            lampiran atau riwayat keputusan sengketa selain resolusi akhir.
          </p>
        </div>

        {disputeState === 'loading' && (
          <p className="sys-note" role="status">
            Memuat sengketa…
          </p>
        )}

        {disputeState === 'error' && (
          <div className="sys-empty" role="alert">
            <p>Gagal memuat sengketa. Periksa koneksi, lalu coba lagi.</p>
            <button type="button" className="sys-btn-ghost" disabled={busy} onClick={loadDisputes}>
              Coba lagi
            </button>
          </div>
        )}

        {disputeState === 'ready' && disputes.length === 0 && (
          <p className="sys-note" role="status">
            Tidak ada sengketa aktif.
          </p>
        )}

        {disputeState === 'ready' && disputes.length > 0 && (
          <div className="sys-dispute-list">
            {disputes.map((d) => {
              const meta = disputeMeta(d.status)
              const rentalMeta = transactionMeta(d.rental?.status)
              const isResolving = resolveTarget === d.id
              return (
                <article key={d.id} className="sys-card">
                  <header className="sys-detail-head">
                    <div>
                      <h3 className="sys-card-title">{d.reason || 'Sengketa rental'}</h3>
                      <p className="sys-detail-store">
                        {d.rental?.store_name || '—'} · {d.rental?.buyer_name || d.rental?.buyer_email || 'penyewa —'}
                      </p>
                    </div>
                    <span className={`sys-status-badge ${meta.className}`}>{meta.label}</span>
                  </header>

                  {d.description && <p className="sys-kv-text">{d.description}</p>}

                  <dl className="sys-kv">
                    <div className="sys-kv-row">
                      <dt>Transaksi</dt>
                      <dd>
                        {formatDate(d.rental?.start_date)} → {formatDate(d.rental?.end_date)} ·{' '}
                        {formatPrice(d.rental?.total || 0)}
                      </dd>
                    </div>
                    <div className="sys-kv-row">
                      <dt>Status rental</dt>
                      <dd>
                        <span className={`sys-status-badge ${rentalMeta.sysClassName}`}>
                          {rentalMeta.label}
                        </span>
                      </dd>
                    </div>
                    <div className="sys-kv-row">
                      <dt>Pelapor</dt>
                      <dd>
                        {reporterLabel(d)}
                        {d.rental?.buyer_email ? ` · ${d.rental.buyer_email}` : ''}
                      </dd>
                    </div>
                    <div className="sys-kv-row">
                      <dt>Dibuka</dt>
                      <dd>{formatDateTime(d.created_at)}</dd>
                    </div>
                    <div className="sys-kv-row">
                      <dt>ID</dt>
                      <dd>
                        <code>{d.id}</code>
                      </dd>
                    </div>
                  </dl>

                  {isResolving ? (
                    <div className="sys-decision-form">
                      <div className="sys-field">
                        <label className="sys-label" htmlFor={`sys-outcome-${d.id}`}>
                          Keputusan
                        </label>
                        <select
                          id={`sys-outcome-${d.id}`}
                          className="sys-select"
                          value={resolveOutcome}
                          onChange={(e) => setResolveOutcome(e.target.value)}
                        >
                          {OUTCOMES.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sys-field">
                        <label className="sys-label" htmlFor={`sys-resolution-${d.id}`}>
                          Resolusi (wajib)
                        </label>
                        <textarea
                          id={`sys-resolution-${d.id}`}
                          className="sys-textarea"
                          rows={3}
                          value={resolveText}
                          placeholder="Uraikan keputusan dan alasannya…"
                          onChange={(e) => setResolveText(e.target.value)}
                        />
                      </div>

                      <div className="sys-confirm-actions">
                        <button
                          type="button"
                          className="sys-btn is-approve"
                          disabled={busy || !resolveText.trim()}
                          onClick={() => submitResolution(d)}
                        >
                          {busy ? 'Menyimpan…' : 'Kirim keputusan'}
                        </button>
                        <button
                          type="button"
                          className="sys-btn-ghost"
                          disabled={busy}
                          onClick={() => setResolveTarget(null)}
                        >
                          Batal
                        </button>
                      </div>
                      <p className="sys-confirm-hint">
                        Resolusi wajib diisi. Bila transaksi masih berstatus sengketa, server
                        mengembalikannya ke selesai.
                      </p>
                    </div>
                  ) : (
                    <div className="sys-decision-actions">
                      <button
                        type="button"
                        className="sys-btn"
                        disabled={busy}
                        onClick={() => {
                          setResolveTarget(d.id)
                          setResolveOutcome('resolved')
                          setResolveText('')
                          setActionError('')
                          setNotice('')
                        }}
                      >
                        Proses sengketa
                      </button>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>

      {/* --- Verifikasi pembayaran & denda per transaksi --- */}
      <section className="sys-panel" aria-label="Transaksi">
        <div className="sys-panel-head">
          <h2>Transaksi</h2>
          <p className="sys-note">
            Bukti bayar dan denda yang menunggu tindakan admin. Keputusan pembayaran juga bisa
            dilakukan pemilik toko lewat dasbor seller.
          </p>
        </div>

        <nav className="sys-filters" aria-label="Filter transaksi">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`sys-filter ${filter === f.key ? 'is-active' : ''}`}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              <span className="sys-filter-count">
                {rentalState === 'ready' ? counts[f.key] ?? 0 : '—'}
              </span>
            </button>
          ))}
        </nav>

        {rentalState === 'loading' && (
          <p className="sys-note" role="status">
            Memuat transaksi…
          </p>
        )}

        {rentalState === 'error' && (
          <div className="sys-empty" role="alert">
            <p>Gagal memuat transaksi. Periksa koneksi, lalu coba lagi.</p>
            <button type="button" className="sys-btn-ghost" onClick={loadRentals}>
              Coba lagi
            </button>
          </div>
        )}

        {rentalState === 'ready' && visible.length === 0 && (
          <p className="sys-note" role="status">
            Tidak ada transaksi pada filter ini.
          </p>
        )}

        {rentalState === 'ready' && visible.length > 0 && (
          <div className="sys-transaction-list">
            {visible.map((order) => {
              const meta = transactionMeta(order.status)
              const orderProofs = proofs[order.id]
              const orderFee = fees[order.id]
              const pendingProofs = Array.isArray(orderProofs)
                ? orderProofs.filter((p) => p.status === 'pending')
                : []
              return (
                <article key={order.id} className="sys-card">
                  <header className="sys-detail-head">
                    <div>
                      <h3 className="sys-card-title">
                        {order.items?.map((i) => i.name).filter(Boolean).join(', ') ||
                          'Transaksi sewa'}
                      </h3>
                      <p className="sys-detail-store">
                        {order.store_name || '—'} · {formatDate(order.start_date)} →{' '}
                        {formatDate(order.end_date)} · {formatPrice(order.total)}
                      </p>
                      <p className="sys-detail-email">
                        Dibuat {formatDate(order.created_at)} · ID {String(order.id).slice(0, 8)}…
                      </p>
                    </div>
                    <span className={`sys-status-badge ${meta.sysClassName}`}>{meta.label}</span>
                  </header>

                  {order.cancel_reason && (
                    <p className="sys-note">Dibatalkan: {order.cancel_reason}</p>
                  )}

                  {order.status === TRANSACTION_STATUS.PAYMENT_VERIFY && (
                    <div className="sys-subcard">
                      <p className="sys-subcard-title">Bukti pembayaran</p>

                      {orderProofs === undefined && (
                        <p className="sys-note">Memuat bukti pembayaran…</p>
                      )}

                      {orderProofs === LOAD_ERROR && (
                        <p className="sys-note sys-note-err">
                          Gagal memuat bukti pembayaran.
                          <button
                            type="button"
                            className="sys-btn-ghost"
                            disabled={busy}
                            onClick={() => retryProofs(order.id)}
                          >
                            Coba lagi
                          </button>
                        </p>
                      )}

                      {Array.isArray(orderProofs) && pendingProofs.length === 0 && (
                        <p className="sys-note">
                          Tidak ada bukti berstatus pending untuk transaksi ini.
                        </p>
                      )}

                      {pendingProofs.map((proof) => {
                        const isRejecting =
                          rejectTarget?.orderId === order.id &&
                          rejectTarget?.paymentId === proof.id
                        return (
                          <div key={proof.id} className="sys-proof-row">
                            <div className="sys-proof-meta">
                              <span className="sys-proof-title">
                                {PAYMENT_METHOD_LABELS[proof.payment_method] ||
                                  proof.payment_method}
                                {proof.amount != null ? ` · ${formatPrice(proof.amount)}` : ''}
                              </span>
                              <span className="sys-note">
                                Dikirim {formatDateTime(proof.created_at)}
                                {proof.external_reference
                                  ? ` · ref ${proof.external_reference}`
                                  : ''}
                              </span>
                              {proof.payment_proof_url ? (
                                <ProofLink value={proof.payment_proof_url} />
                              ) : (
                                <span className="sys-note">Tanpa lampiran</span>
                              )}
                            </div>
                            <div className="sys-proof-actions">
                              <button
                                type="button"
                                className="sys-btn is-approve sys-btn-sm"
                                disabled={busy}
                                onClick={() =>
                                  run(
                                    `payment:${proof.id}`,
                                    () => adminDecidePayment(proof.id, true, ''),
                                    'Pembayaran disetujui — transaksi dikonfirmasi.',
                                  )
                                }
                              >
                                Setujui
                              </button>
                              <button
                                type="button"
                                className="sys-btn is-danger sys-btn-sm"
                                disabled={busy}
                                onClick={() => {
                                  setRejectTarget({ orderId: order.id, paymentId: proof.id })
                                  setRejectReason('')
                                  setActionError('')
                                  setNotice('')
                                }}
                              >
                                Tolak
                              </button>
                            </div>

                            {isRejecting && (
                              <div className="sys-decision-form sys-reject-form">
                                <label
                                  className="sys-label"
                                  htmlFor={`sys-reject-${proof.id}`}
                                >
                                  Alasan penolakan (wajib — dilihat penyewa)
                                </label>
                                <input
                                  id={`sys-reject-${proof.id}`}
                                  className="sys-input"
                                  value={rejectReason}
                                  placeholder="cth: Bukti tidak terbaca / nominal tidak sesuai."
                                  onChange={(e) => setRejectReason(e.target.value)}
                                />
                                <div className="sys-confirm-actions">
                                  <button
                                    type="button"
                                    className="sys-btn is-danger sys-btn-sm"
                                    disabled={busy || !rejectReason.trim()}
                                    onClick={() => submitRejectPayment(proof.id)}
                                  >
                                    {busy ? 'Menyimpan…' : 'Kirim penolakan'}
                                  </button>
                                  <button
                                    type="button"
                                    className="sys-btn-ghost"
                                    disabled={busy}
                                    onClick={() => {
                                      setRejectTarget(null)
                                      setRejectReason('')
                                    }}
                                  >
                                    Batal
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {order.late_fee_total > 0 && (
                    <div className="sys-subcard">
                      <p className="sys-subcard-title">Denda keterlambatan</p>

                      {orderFee === undefined && <p className="sys-note">Memuat denda…</p>}

                      {orderFee === LOAD_ERROR && (
                        <p className="sys-note sys-note-err">
                          Gagal memuat rincian denda.
                          <button
                            type="button"
                            className="sys-btn-ghost"
                            disabled={busy}
                            onClick={() => retryFee(order.id)}
                          >
                            Coba lagi
                          </button>
                        </p>
                      )}

                      {orderFee === null && (
                        <p className="sys-note">
                          Transaksi mencatat denda {formatPrice(order.late_fee_total)}, tetapi
                          rinciannya tidak ditemukan (mungkin sudah dihapus).
                        </p>
                      )}

                      {orderFee && orderFee !== LOAD_ERROR && (
                        <>
                          <p className="sys-note">
                            {orderFee.days_late} hari × {formatPrice(orderFee.daily_rate)} ={' '}
                            <strong>{formatPrice(orderFee.total)}</strong> ·{' '}
                            {LATE_FEE_STATUS[orderFee.status] || orderFee.status}
                          </p>

                          {orderFee.status === 'unpaid' && (
                            <div className="sys-proof-actions">
                              <button
                                type="button"
                                className="sys-btn is-approve sys-btn-sm"
                                disabled={busy}
                                onClick={() =>
                                  run(
                                    `fee:${orderFee.id}`,
                                    () => adminDecideLateFee(orderFee.id, 'paid'),
                                    'Denda ditandai dibayar.',
                                  )
                                }
                              >
                                Tandai dibayar
                              </button>
                              <button
                                type="button"
                                className="sys-btn is-danger sys-btn-sm"
                                disabled={busy}
                                onClick={() => {
                                  setWaiveTarget({
                                    orderId: order.id,
                                    feeId: orderFee.id,
                                    total: orderFee.total,
                                  })
                                  setActionError('')
                                  setNotice('')
                                }}
                              >
                                Hapus denda
                              </button>
                            </div>
                          )}

                          {waiveTarget?.orderId === order.id && (
                            <AdminConfirm
                              message={
                                <>
                                  Hapus denda <strong>{formatPrice(waiveTarget.total)}</strong> untuk
                                  transaksi ini?
                                </>
                              }
                              hint="RPC decide_late_fee — aksi admin-only, total denda transaksi ikut diperbarui dan tercatat di audit log."
                              busy={busy}
                              confirmLabel="Ya, hapus denda"
                              onCancel={() => setWaiveTarget(null)}
                              onConfirm={confirmWaive}
                            />
                          )}
                        </>
                      )}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
