/*
 * ============================================================================
 * SYS DASHBOARD — JabSewa (ERD v2)
 * ============================================================================
 * Dashboard menjawab SATU pertanyaan: "Admin harus melakukan apa sekarang?"
 *
 * Semua angka dihitung dari data live — tidak ada angka mock:
 *   - ajuan seller pending       → list_store_applications (RPC, is_admin)
 *   - bukti bayar payment_verify → rental_transactions (RLS admin)
 *   - sengketa aktif             → disputes open/investigating (RLS admin)
 *   - transaksi terlambat        → rental_transactions status overdue
 *
 * Tiap sumber dimuat TERPISAH (Promise.allSettled): satu query gagal tidak
 * mengosongkan yang lain. Sumber gagal ditampilkan sebagai "—", bukan "0" —
 * angka nol yang salah membuat antrian tampak kosong padahal datanya tidak
 * terbaca. Semua kartu antrian menuju modul penanganannya.
 * ============================================================================
 */

import { useCallback, useEffect, useState } from 'react'
import {
  listSellerApplications,
  adminListRentals,
  adminListActiveDisputes,
} from '../../../data/admin'
import { TRANSACTION_STATUS, DISPUTE_STATUS_META } from '../../../domain/constants'
import { formatPrice, formatDate } from '../../../domain/format'

const APP_SOURCE = 'apps'
const RENTAL_SOURCE = 'rentals'
const DISPUTE_SOURCE = 'disputes'

/** Kartu metrik. Dengan `onClick`, kartu menjadi tombol menuju modul terkait. */
function StatCard({ label, value, tone = '', hint, onClick }) {
  const body = (
    <>
      <span className="sys-stat-value">{value}</span>
      <span className="sys-stat-label">{label}</span>
      {hint && <span className="sys-stat-hint">{hint}</span>}
    </>
  )

  if (!onClick) return <article className={`sys-stat ${tone}`}>{body}</article>

  return (
    <button type="button" className={`sys-stat is-action ${tone}`} onClick={onClick}>
      {body}
    </button>
  )
}

/** Baris antrian kerja — klik menuju modul penanganan. */
function QueueRow({ title, meta, badge, badgeClass = 'is-review', onClick }) {
  return (
    <button type="button" className="sys-row" onClick={onClick}>
      <span className="sys-row-main">
        <span className="sys-row-name">{title}</span>
        <span className="sys-row-store">{meta}</span>
      </span>
      <span className="sys-row-side">
        <span className={`sys-status-badge ${badgeClass}`}>{badge}</span>
      </span>
    </button>
  )
}

/** Nilai metrik untuk sumber yang belum siap / gagal dimuat. */
function metric(sourceState, value) {
  if (sourceState === 'failed') return '—'
  if (sourceState === 'loading') return '…'
  return value
}

export default function AdminDashboard({ onNavigate }) {
  const [data, setData] = useState({ apps: null, rentals: null, disputes: null })
  const [failed, setFailed] = useState({ apps: false, rentals: false, disputes: false })
  const [loading, setLoading] = useState(true)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let active = true
    const load = async () => {
      const [apps, rentals, disputes] = await Promise.allSettled([
        listSellerApplications(),
        adminListRentals(),
        adminListActiveDisputes(),
      ])
      if (!active) return

      setData({
        apps: apps.status === 'fulfilled' ? apps.value || [] : null,
        rentals: rentals.status === 'fulfilled' ? rentals.value || [] : null,
        disputes: disputes.status === 'fulfilled' ? disputes.value || [] : null,
      })
      setFailed({
        apps: apps.status === 'rejected',
        rentals: rentals.status === 'rejected',
        disputes: disputes.status === 'rejected',
      })
      setLoading(false)
    }

    Promise.resolve().then(load)
    return () => {
      active = false
    }
  }, [reloadToken])

  const reload = useCallback(() => {
    setLoading(true)
    setReloadToken((token) => token + 1)
  }, [])

  const stateOf = (source) => {
    if (failed[source]) return 'failed'
    return data[source] === null ? 'loading' : 'ready'
  }

  const appsState = stateOf(APP_SOURCE)
  const rentalsState = stateOf(RENTAL_SOURCE)
  const disputesState = stateOf(DISPUTE_SOURCE)

  const pendingApps = (data.apps || []).filter((a) => a.storeApplication?.status === 'pending')
  const verifyQueue = (data.rentals || []).filter(
    (r) => r.status === TRANSACTION_STATUS.PAYMENT_VERIFY,
  )
  const overdueQueue = (data.rentals || []).filter(
    (r) => r.status === TRANSACTION_STATUS.OVERDUE,
  )
  const disputeQueue = data.disputes || []

  const latestApp = pendingApps[0] || null
  const latestVerify = verifyQueue[0] || null
  const latestOverdue = overdueQueue[0] || null
  const latestDispute = disputeQueue[0] || null

  const stats = {
    pendingApps: pendingApps.length,
    needVerify: verifyQueue.length,
    activeDisputes: disputeQueue.length,
    overdue: overdueQueue.length,
  }
  const totalWork = stats.pendingApps + stats.needVerify + stats.activeDisputes

  const nonCancelled = (data.rentals || []).filter(
    (r) => r.status !== TRANSACTION_STATUS.CANCELLED,
  )
  const totalValue = nonCancelled.reduce((sum, r) => sum + (Number(r.total) || 0), 0)
  const runningCount = (data.rentals || []).filter((r) =>
    [
      TRANSACTION_STATUS.ONGOING,
      TRANSACTION_STATUS.OVERDUE,
      TRANSACTION_STATUS.DISPUTED,
    ].includes(r.status),
  ).length
  const approvedApps = (data.apps || []).filter(
    (a) => a.storeApplication?.status === 'approved',
  ).length

  const anyFailed = failed.apps || failed.rentals || failed.disputes
  const allFailed = failed.apps && failed.rentals && failed.disputes
  const allReady = !anyFailed && !loading

  return (
    <div className="sys-page">
      <header className="sys-page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="sys-page-sub">
            {allReady && totalWork === 0
              ? 'Tidak ada pekerjaan yang menunggu keputusanmu.'
              : 'Antrian keputusan yang menunggu tindakanmu.'}
          </p>
          <button type="button" className="sys-btn-ghost" onClick={reload} disabled={loading}>
            {loading ? 'Memuat…' : 'Muat ulang'}
          </button>
        </div>
      </header>

      <section className="sys-stats-grid" aria-label="Antrian kerja" aria-busy={loading}>
        <StatCard
          label="Ajuan seller menunggu review"
          value={metric(appsState, stats.pendingApps)}
          tone="is-warning"
          hint="Buka modul ajuan"
          onClick={() => onNavigate('applications')}
        />
        <StatCard
          label="Bukti bayar menunggu verifikasi"
          value={metric(rentalsState, stats.needVerify)}
          tone="is-warning"
          hint="Buka antrian transaksi"
          onClick={() => onNavigate('orders')}
        />
        <StatCard
          label="Sengketa aktif"
          value={metric(disputesState, stats.activeDisputes)}
          tone="is-danger"
          hint="Buka antrian sengketa"
          onClick={() => onNavigate('orders')}
        />
        <StatCard
          label="Transaksi terlambat"
          value={metric(rentalsState, stats.overdue)}
          tone="is-danger"
          hint="Buka antrian transaksi"
          onClick={() => onNavigate('orders')}
        />
      </section>

      {anyFailed && (
        <p className="sys-note sys-note-err" role="alert">
          Sebagian data gagal dimuat
          {failed.apps ? ' (ajuan seller)' : ''}
          {failed.rentals ? ' (transaksi)' : ''}
          {failed.disputes ? ' (sengketa)' : ''} — angka bertanda “—” tidak diketahui, bukan nol.
          <button type="button" className="sys-btn-ghost" onClick={reload} disabled={loading}>
            Coba lagi
          </button>
        </p>
      )}

      <section className="sys-panel" aria-label="Antrian keputusan">
        <div className="sys-panel-head">
          <h2>Antrian keputusan</h2>
        </div>

        {loading && (
          <p className="sys-note" role="status">
            Memuat antrian…
          </p>
        )}

        {!loading && allFailed && (
          <div className="sys-empty" role="alert">
            <p>Gagal memuat seluruh data antrian. Periksa koneksi lalu coba lagi.</p>
            <button type="button" className="sys-btn sys-btn-ghost" onClick={reload}>
              Coba lagi
            </button>
          </div>
        )}

        {!loading && !allFailed && totalWork === 0 && (
          <p className="sys-note" role="status">
            {anyFailed
              ? 'Tidak ada antrian pada data yang berhasil dimuat — belum tentu kosong seluruhnya.'
              : 'Semua antrian kosong: tidak ada ajuan, verifikasi pembayaran, atau sengketa yang menunggu.'}
          </p>
        )}

        {!loading && !allFailed && totalWork > 0 && (
          <div className="sys-queue">
            {latestApp && (
              <QueueRow
                title={
                  latestApp.storeApplication?.storeName || latestApp.applicant?.name || 'Ajuan toko'
                }
                meta={`${latestApp.applicant?.name || '—'} · dikirim ${formatDate(
                  latestApp.storeApplication?.submittedAt,
                )}`}
                badge={
                  pendingApps.length > 1 ? `+${pendingApps.length - 1} lainnya` : 'Menunggu review'
                }
                onClick={() => onNavigate('applications')}
              />
            )}
            {latestVerify && (
              <QueueRow
                title={latestVerify.store_name || 'Verifikasi pembayaran'}
                meta={`${
                  latestVerify.items
                    ?.map((i) => i.name)
                    .filter(Boolean)
                    .slice(0, 2)
                    .join(', ') || 'Transaksi'
                } · ${formatPrice(latestVerify.total)}`}
                badge={verifyQueue.length > 1 ? `+${verifyQueue.length - 1} lainnya` : 'Verifikasi bayar'}
                onClick={() => onNavigate('orders')}
              />
            )}
            {latestDispute && (
              <QueueRow
                title={latestDispute.reason || 'Sengketa aktif'}
                meta={`${latestDispute.rental?.store_name || '—'} · ${
                  latestDispute.rental?.buyer_email || 'buyer —'
                } · dibuka ${formatDate(latestDispute.created_at)}`}
                badge={`${
                  DISPUTE_STATUS_META[latestDispute.status]?.label || 'Sengketa'
                }${disputeQueue.length > 1 ? ` · +${disputeQueue.length - 1} lainnya` : ''}`}
                badgeClass={DISPUTE_STATUS_META[latestDispute.status]?.className || 'is-review'}
                onClick={() => onNavigate('orders')}
              />
            )}
            {latestOverdue && (
              <QueueRow
                title={`Terlambat: ${latestOverdue.store_name || 'transaksi'}`}
                meta={`${
                  latestOverdue.items
                    ?.map((i) => i.name)
                    .filter(Boolean)
                    .slice(0, 2)
                    .join(', ') || '—'
                } · kembali sebelum ${formatDate(latestOverdue.end_date)}`}
                badge={overdueQueue.length > 1 ? `+${overdueQueue.length - 1} lainnya` : 'Terlambat'}
                badgeClass="is-rejected"
                onClick={() => onNavigate('orders')}
              />
            )}
          </div>
        )}
      </section>

      <section className="sys-stats-grid" aria-label="Ringkasan transaksi">
        <StatCard
          label="Total transaksi terlihat"
          value={metric(rentalsState, (data.rentals || []).length)}
        />
        <StatCard label="Nilai transaksi (non-batal)" value={metric(rentalsState, formatPrice(totalValue))} />
        <StatCard label="Berjalan / terlambat / sengketa" value={metric(rentalsState, runningCount)} />
        <StatCard label="Toko disetujui" value={metric(appsState, approvedApps)} tone="is-success" />
      </section>

      <section className="sys-quick-actions" aria-label="Aksi cepat">
        <button type="button" className="sys-btn" onClick={() => onNavigate('applications')}>
          Review ajuan seller
          {stats.pendingApps > 0 && <span className="sys-badge-pill">{stats.pendingApps}</span>}
        </button>
        <button type="button" className="sys-btn" onClick={() => onNavigate('orders')}>
          Verifikasi pembayaran &amp; sengketa
          {stats.needVerify + stats.activeDisputes > 0 && (
            <span className="sys-badge-pill">{stats.needVerify + stats.activeDisputes}</span>
          )}
        </button>
        <button type="button" className="sys-btn" onClick={() => onNavigate('audit')}>
          Lihat audit log
        </button>
      </section>

      <p className="sys-note">
        Semua angka dihitung live dari database sesuai RLS (is_admin). Setiap keputusan ditulis
        server-side oleh RPC ke tabel <code>audit_logs</code>.
      </p>
    </div>
  )
}
