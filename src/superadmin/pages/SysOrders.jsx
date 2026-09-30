/*
 * ============================================================================
 * SYS ORDERS — JabSewa (ERD v2)
 * ============================================================================
 * Modul transaksi admin: verifikasi pembayaran (D5 — owner ATAU admin),
 * resolusi sengketa (admin-only), dan penanganan denda (waived admin-only).
 *
 * Sumber data:
 *   - rental_transactions (direct SELECT, RLS admin melihat semua baris)
 *   - payments / late_fees per transaksi (RLS admin)
 *   - disputes aktif (RLS admin) — antrian resolusi
 * Semua keputusan lewat RPC dan tercatat audit_logs server-side
 * (payment_verify/payment_reject, dispute_resolve, latefee_waive).
 *
 * CATATAN-K: menolak bukti TIDAK membatalkan transaksi — server mengembalikan
 * tx ke `pending` agar buyer dapat mengirim ulang bukti.
 * ============================================================================
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  adminListRentals,
  adminListActiveDisputes,
  adminDecidePayment,
  adminResolveDispute,
  adminDecideLateFee,
} from '../../lib/superadmin'
import { getPaymentsForRental, getLateFeeForRental } from '../../lib/userData'
import { formatPrice, formatDate } from '../../lib/format'
import { TRANSACTION_STATUS, TRANSACTION_STATUS_META } from '../../lib/constants'

const FILTERS = [
  { key: 'all', label: 'Semua' },
  { key: TRANSACTION_STATUS.PAYMENT_VERIFY, label: 'Verifikasi Bayar' },
  { key: TRANSACTION_STATUS.DISPUTED, label: 'Sengketa' },
  { key: TRANSACTION_STATUS.OVERDUE, label: 'Terlambat' },
  { key: TRANSACTION_STATUS.ONGOING, label: 'Berjalan' },
]

export default function SysOrders() {
  const [rentals, setRentals] = useState([])
  const [state, setState] = useState('loading')
  const [filter, setFilter] = useState('all')
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState(null)

  const [proofs, setProofs] = useState({}) // rental_id → payments[]
  const [fees, setFees] = useState({}) // rental_id → late_fee row | null
  const [rejectTarget, setRejectTarget] = useState(null) // { orderId, paymentId }
  const [rejectReason, setRejectReason] = useState('')

  const [disputes, setDisputes] = useState([])
  const [disputeState, setDisputeState] = useState('loading')
  const [resolveTarget, setResolveTarget] = useState(null) // dispute id
  const [resolveOutcome, setResolveOutcome] = useState('resolved')
  const [resolveText, setResolveText] = useState('')

  const load = useCallback(() => {
    Promise.resolve().then(() => setState('loading'))
    adminListRentals()
      .then((data) => {
        setRentals(data)
        setState('ready')
      })
      .catch(() => setState('error'))
  }, [])

  const loadDisputes = useCallback(() => {
    Promise.resolve().then(() => setDisputeState('loading'))
    adminListActiveDisputes()
      .then((data) => {
        setDisputes(data)
        setDisputeState('ready')
      })
      .catch(() => setDisputeState('error'))
  }, [])

  // Microtask: hindari setState sinkron di body effect (aturan lint proyek).
  useEffect(() => {
    Promise.resolve().then(() => {
      load()
      loadDisputes()
    })
  }, [load, loadDisputes])

  // Auto-muat bukti & denda untuk rental yang membutuhkannya.
  useEffect(() => {
    if (state !== 'ready') return
    rentals.forEach((order) => {
      if (order.status === TRANSACTION_STATUS.PAYMENT_VERIFY && proofs[order.id] === undefined) {
        getPaymentsForRental(order.id)
          .then((rows) => setProofs((cur) => ({ ...cur, [order.id]: rows })))
          .catch(() => setProofs((cur) => ({ ...cur, [order.id]: [] })))
      }
      if (order.late_fee_total > 0 && fees[order.id] === undefined) {
        getLateFeeForRental(order.id)
          .then((row) => setFees((cur) => ({ ...cur, [order.id]: row })))
          .catch(() => setFees((cur) => ({ ...cur, [order.id]: null })))
      }
    })
  }, [state, rentals, proofs, fees])

  const run = async (fn, okMessage) => {
    setActionError('')
    setNotice('')
    try {
      await fn()
      if (okMessage) setNotice(okMessage)
      load()
      loadDisputes()
    } catch (err) {
      setActionError(err?.message || 'Aksi gagal.')
    } finally {
      setBusyId(null)
    }
  }

  const visible = useMemo(
    () => (filter === 'all' ? rentals : rentals.filter((r) => r.status === filter)),
    [rentals, filter],
  )

  const counts = useMemo(
    () => ({
      all: rentals.length,
      [TRANSACTION_STATUS.PAYMENT_VERIFY]: rentals.filter(
        (r) => r.status === TRANSACTION_STATUS.PAYMENT_VERIFY,
      ).length,
      [TRANSACTION_STATUS.DISPUTED]: rentals.filter((r) => r.status === TRANSACTION_STATUS.DISPUTED)
        .length,
      [TRANSACTION_STATUS.OVERDUE]: rentals.filter((r) => r.status === TRANSACTION_STATUS.OVERDUE)
        .length,
      [TRANSACTION_STATUS.ONGOING]: rentals.filter((r) => r.status === TRANSACTION_STATUS.ONGOING)
        .length,
    }),
    [rentals],
  )

  return (
    <div className="sys-page">
      <header className="sys-page-head">
        <div>
          <h1>Transaksi & Sengketa</h1>
          <p className="sys-page-sub">
            Verifikasi pembayaran, resolusi sengketa, dan denda — semua keputusan tercatat di audit log.
          </p>
          <button type="button" className="sys-btn sys-btn-ghost" onClick={() => { load(); loadDisputes() }}>
            Muat ulang
          </button>
        </div>
        <div className="sys-pending" aria-live="polite">
          <span className="sys-pending-num">{counts[TRANSACTION_STATUS.PAYMENT_VERIFY]}</span>
          <span className="sys-pending-label">bukti menunggu verifikasi</span>
        </div>
      </header>

      {notice && <p className="sys-note">{notice}</p>}
      {actionError && <p className="sys-note">⚠ {actionError}</p>}

      {/* --- Sengketa aktif (admin-only resolver) --- */}
      <section className="sys-panel" aria-label="Sengketa aktif">
        <div className="sys-panel-head">
          <h2>Sengketa aktif ({disputes.length})</h2>
        </div>
        {disputeState === 'loading' ? (
          <p className="sys-note">Memuat sengketa…</p>
        ) : disputeState === 'error' ? (
          <p className="sys-note">Gagal memuat sengketa. Coba muat ulang.</p>
        ) : disputes.length === 0 ? (
          <p className="sys-note">Tidak ada sengketa aktif.</p>
        ) : (
          disputes.map((d) => (
            <article key={d.id} className="sys-card" style={{ marginBottom: 12 }}>
              <header className="sys-detail-head">
                <div>
                  <h2>{d.reason}</h2>
                  <p className="sys-detail-store">
                    {d.rental?.store_name || '—'} · {d.rental?.buyer_email || 'buyer —'} ·{' '}
                    {formatPrice(d.rental?.total || 0)}
                  </p>
                </div>
                <span className="sys-status-badge is-review">{d.status}</span>
              </header>
              {d.description && <p className="sys-note">{d.description}</p>}
              <p className="sys-note">
                Transaksi {d.rental?.start_date} → {d.rental?.end_date} · dibuka {formatDate(d.created_at)}
              </p>
              {resolveTarget === d.id ? (
                <div>
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
                  <div className="sys-confirm-actions">
                    <select
                      className="sys-textarea"
                      style={{ maxWidth: 180 }}
                      value={resolveOutcome}
                      onChange={(e) => setResolveOutcome(e.target.value)}
                    >
                      <option value="resolved">resolved — kabar baik</option>
                      <option value="rejected">rejected — komplain ditolak</option>
                    </select>
                    <button
                      type="button"
                      className="sys-btn is-approve"
                      disabled={busyId === d.id || !resolveText.trim()}
                      onClick={() => {
                        setBusyId(d.id)
                        run(
                          () => adminResolveDispute(d.id, resolveOutcome, resolveText.trim()),
                          'Sengketa diselesaikan.',
                        ).then(() => {
                          setResolveTarget(null)
                          setResolveText('')
                        })
                      }}
                    >
                      {busyId === d.id ? 'Menyimpan…' : 'Kirim keputusan'}
                    </button>
                    <button
                      type="button"
                      className="sys-btn-ghost"
                      onClick={() => setResolveTarget(null)}
                    >
                      Batal
                    </button>
                  </div>
                </div>
              ) : (
                <div className="sys-confirm-actions">
                  <button
                    type="button"
                    className="sys-btn is-approve"
                    disabled={busyId === d.id}
                    onClick={() => {
                      setResolveTarget(d.id)
                      setResolveOutcome('resolved')
                      setResolveText('')
                    }}
                  >
                    Proses sengketa
                  </button>
                </div>
              )}
            </article>
          ))
        )}
      </section>

      {/* --- Daftar transaksi --- */}
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
            <span className="sys-filter-count">{counts[f.key] ?? 0}</span>
          </button>
        ))}
      </nav>

      <section className="sys-panel" aria-label="Daftar transaksi">
        {state === 'loading' && <p className="sys-note">Memuat transaksi…</p>}
        {state === 'error' && (
          <p className="sys-note">Gagal memuat transaksi. Coba muat ulang.</p>
        )}
        {state === 'ready' && !visible.length && (
          <p className="sys-note">Tidak ada transaksi pada filter ini.</p>
        )}
        {visible.map((order) => {
          const meta = TRANSACTION_STATUS_META[order.status] || {
            label: order.status,
            className: 'status-pending',
          }
          const orderProofs = proofs[order.id]
          const orderFee = fees[order.id]
          const pendingProofs = (orderProofs || []).filter((p) => p.status === 'pending')
          return (
            <article key={order.id} className="sys-card" style={{ marginBottom: 12 }}>
              <header className="sys-detail-head">
                <div>
                  <h2>{order.items.map((i) => i.name).join(', ') || 'Transaksi sewa'}</h2>
                  <p className="sys-detail-store">
                    {order.store_name} · {order.start_date} → {order.end_date} ·{' '}
                    {formatPrice(order.total)}
                  </p>
                </div>
                <span className={`status-badge ${meta.className}`}>{meta.label}</span>
              </header>

              {order.cancel_reason && (
                <p className="sys-note">Dibatalkan: {order.cancel_reason}</p>
              )}

              {order.status === TRANSACTION_STATUS.PAYMENT_VERIFY && (
                <div className="order-cancel-note">
                  {orderProofs === undefined ? (
                    <span>Memuat bukti pembayaran…</span>
                  ) : pendingProofs.length ? (
                    pendingProofs.map((p) => (
                      <div key={p.id} className="order-reject-box">
                        <span>
                          Bukti: {p.payment_method}
                          {p.payment_proof_url && (
                            <>
                              {' — '}
                              <a href={p.payment_proof_url} target="_blank" rel="noreferrer">
                                lihat bukti
                              </a>
                            </>
                          )}
                          {p.external_reference ? ` · ref ${p.external_reference}` : ''}
                        </span>
                        <button
                          className="btn-small btn-primary"
                          disabled={busyId === order.id}
                          onClick={() => {
                            setBusyId(order.id)
                            run(
                              () => adminDecidePayment(p.id, true, ''),
                              'Pembayaran disetujui.',
                            )
                          }}
                        >
                          Setujui
                        </button>
                        <button
                          className="btn-small btn-danger"
                          disabled={busyId === order.id}
                          onClick={() => {
                            setRejectTarget({ orderId: order.id, paymentId: p.id })
                            setRejectReason('')
                          }}
                        >
                          Tolak
                        </button>
                      </div>
                    ))
                  ) : (
                    <span>Tidak ada bukti pending.</span>
                  )}
                </div>
              )}

              {order.status === TRANSACTION_STATUS.PAYMENT_VERIFY &&
                rejectTarget?.orderId === order.id && (
                  <div className="order-reject-box">
                    <input
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                      placeholder="Alasan penolakan (wajib — dilihat penyewa)"
                      className="search-box-small"
                    />
                    <button
                      className="btn-small btn-danger"
                      disabled={busyId === order.id || !rejectReason.trim()}
                      onClick={() => {
                        setBusyId(order.id)
                        run(
                          () => adminDecidePayment(rejectTarget.paymentId, false, rejectReason.trim()),
                          'Bukti ditolak — transaksi kembali menunggu pembayaran.',
                        ).then(() => {
                          setRejectTarget(null)
                          setRejectReason('')
                        })
                      }}
                    >
                      Kirim penolakan
                    </button>
                    <button
                      className="btn-small btn-secondary"
                      onClick={() => setRejectTarget(null)}
                    >
                      Batal
                    </button>
                  </div>
                )}

              {order.late_fee_total > 0 && orderFee && orderFee.status === 'unpaid' && (
                <div className="order-cancel-note">
                  <span>
                    Denda belum dibayar: {orderFee.days_late} hari × {formatPrice(orderFee.daily_rate)} ={' '}
                    <strong>{formatPrice(orderFee.total)}</strong>
                  </span>
                  <button
                    className="btn-small btn-primary"
                    disabled={busyId === order.id}
                    onClick={() => {
                      setBusyId(order.id)
                      run(() => adminDecideLateFee(orderFee.id, 'paid'), 'Denda ditandai dibayar.')
                    }}
                  >
                    Tandai dibayar
                  </button>
                  <button
                    className="btn-small btn-secondary"
                    disabled={busyId === order.id}
                    onClick={() => {
                      setBusyId(order.id)
                      run(() => adminDecideLateFee(orderFee.id, 'waived'), 'Denda dihapus (waived).')
                    }}
                  >
                    Waive (hapus denda)
                  </button>
                </div>
              )}
            </article>
          )
        })}
      </section>
    </div>
  )
}
