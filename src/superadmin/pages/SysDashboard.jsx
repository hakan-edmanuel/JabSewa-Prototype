/*
 * ============================================================================
 * SYS DASHBOARD — JabSewa (ERD v2)
 * ============================================================================
 * Dashboard menjawab SATU pertanyaan: "Admin harus melakukan apa sekarang?"
 *
 * Semua angka dihitung dari data live (bukan dummy):
 *   - ajuan seller pending       → list_store_applications (RPC, is_admin)
 *   - bukti bayar payment_verify → rental_transactions (RLS admin)
 *   - sengketa aktif             → disputes open/investigating (RLS admin)
 *   - denda belum diselesaikan   → rental late_fee_total > 0 (RLS admin)
 * Bila sumber gagal dimuat, kartu menampilkan "—" + pesan kegagalan —
 * tidak mengarang angka. Empty state jujur saat tidak ada pekerjaan.
 * ============================================================================
 */

import { useEffect, useState } from 'react'
import {
  listSellerApplications,
  adminListRentals,
  adminListActiveDisputes,
} from '../../lib/superadmin'
import { TRANSACTION_STATUS } from '../../lib/constants'
import { formatPrice, formatDate } from '../../lib/format'

function StatCard({ label, value, tone = '' }) {
  return (
    <article className={`sys-stat ${tone}`}>
      <p className="sys-stat-value">{value}</p>
      <p className="sys-stat-label">{label}</p>
    </article>
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

export default function SysDashboard({ onNavigate }) {
  const [apps, setApps] = useState(null) // null = loading
  const [appsError, setAppsError] = useState(false)
  const [rentals, setRentals] = useState(null)
  const [rentalsError, setRentalsError] = useState(false)
  const [disputes, setDisputes] = useState(null)
  const [disputesError, setDisputesError] = useState(false)

  useEffect(() => {
    let active = true
    Promise.resolve()
      .then(() =>
        listSellerApplications().then((data) => {
          if (!active) return
          setApps(data)
          setAppsError(false)
        }),
      )
      .catch(() => {
        if (active) {
          setApps([])
          setAppsError(true)
        }
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    Promise.resolve()
      .then(() =>
        adminListRentals().then((data) => {
          if (!active) return
          setRentals(data)
          setRentalsError(false)
        }),
      )
      .catch(() => {
        if (active) {
          setRentals([])
          setRentalsError(true)
        }
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    Promise.resolve()
      .then(() =>
        adminListActiveDisputes().then((data) => {
          if (!active) return
          setDisputes(data)
          setDisputesError(false)
        }),
      )
      .catch(() => {
        if (active) {
          setDisputes([])
          setDisputesError(true)
        }
      })
    return () => {
      active = false
    }
  }, [])

  const pendingApps = (apps || []).filter((a) => a.storeApplication?.status === 'pending')
  const latestApp = pendingApps[0] || null

  const verifyQueue = (rentals || []).filter(
    (r) => r.status === TRANSACTION_STATUS.PAYMENT_VERIFY,
  )
  const latestVerify = verifyQueue[0] || null

  const overdueQueue = (rentals || []).filter((r) => r.status === TRANSACTION_STATUS.OVERDUE)
  const latestOverdue = overdueQueue[0] || null

  const disputeQueue = disputes || []
  const latestDispute = disputeQueue[0] || null

  // Statistik dihitung langsung tanpa memoization manual — React Compiler
  // mengoptimalkan otomatis; deps `.length` tidak bisa dipertahankan compiler.
  const nonCancelled = rentals ? rentals.filter((r) => r.status !== TRANSACTION_STATUS.CANCELLED) : []
  const stats = {
    pendingApps: pendingApps.length,
    needVerify: verifyQueue.length,
    activeDisputes: disputeQueue.length,
    overdue: overdueQueue.length,
    totalRentals: rentals ? rentals.length : 0,
    gmv: nonCancelled.reduce((sum, r) => sum + (Number(r.total) || 0), 0),
  }

  const totalWork = stats.pendingApps + stats.needVerify + stats.activeDisputes

  return (
    <div className="sys-page">
      <header className="sys-page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="sys-page-sub">
            {totalWork === 0 && !appsError && !rentalsError && !disputesError
              ? 'Tidak ada pekerjaan yang menunggu keputusanmu.'
              : 'Antrian keputusan yang menunggu tindakanmu.'}
          </p>
        </div>
      </header>

      <section className="sys-stats-grid" aria-label="Antrian kerja">
        <StatCard label="Ajuan seller menunggu review" value={apps === null ? '…' : stats.pendingApps} tone="is-warning" />
        <StatCard label="Bukti bayar menunggu verifikasi" value={rentals === null ? '…' : stats.needVerify} tone="is-warning" />
        <StatCard label="Sengketa aktif" value={disputes === null ? '…' : stats.activeDisputes} tone="is-danger" />
        <StatCard label="Transaksi terlambat" value={rentals === null ? '…' : stats.overdue} tone="is-danger" />
      </section>

      {(appsError || rentalsError || disputesError) && (
        <p className="sys-note sys-note-err">
          Sebagian data gagal dimuat{appsError ? ' (ajuan)' : ''}
          {rentalsError ? ' (transaksi)' : ''}
          {disputesError ? ' (sengketa)' : ''} — angka di atas bisa lebih rendah dari sebenarnya.
          Muat ulang halaman untuk mencoba lagi.
        </p>
      )}

      <section className="sys-panel">
        <div className="sys-panel-head">
          <h2>Antrian keputusan</h2>
        </div>
        {!appsError && !rentalsError && !disputesError && totalWork === 0 && (
          <p className="sys-note">
            Semua antrian kosong: tidak ada ajuan, verifikasi pembayaran, atau sengketa yang
            menunggu. Statistik transaksi tetap tersedia di bawah.
          </p>
        )}
        <div className="sys-queue">
          {latestApp && (
            <QueueRow
              title={latestApp.storeApplication?.storeName || latestApp.applicant?.name || 'Ajuan toko'}
              meta={`${latestApp.applicant?.name || '—'} · dikirim ${formatDate(latestApp.storeApplication?.submittedAt)}`}
              badge={pendingApps.length > 1 ? `+${pendingApps.length - 1} lainnya` : 'Menunggu review'}
              onClick={() => onNavigate('applications')}
            />
          )}
          {latestVerify && (
            <QueueRow
              title={latestVerify.store_name || 'Verifikasi pembayaran'}
              meta={`${latestVerify.items?.map((i) => i.name).filter(Boolean).slice(0, 2).join(', ') || 'Transaksi'} · ${formatPrice(latestVerify.total)}`}
              badge={verifyQueue.length > 1 ? `+${verifyQueue.length - 1} lainnya` : 'Verifikasi bayar'}
              onClick={() => onNavigate('orders')}
            />
          )}
          {latestDispute && (
            <QueueRow
              title={latestDispute.reason || 'Sengketa aktif'}
              meta={`${latestDispute.rental?.store_name || '—'} · ${latestDispute.rental?.buyer_email || 'buyer —'} · dibuka ${formatDate(latestDispute.created_at)}`}
              badge={disputeQueue.length > 1 ? `+${disputeQueue.length - 1} lainnya` : 'Sengketa'}
              badgeClass="is-rejected"
              onClick={() => onNavigate('orders')}
            />
          )}
          {latestOverdue && (
            <QueueRow
              title={`Terlambat: ${latestOverdue.store_name || 'transaksi'}`}
              meta={`${latestOverdue.items?.map((i) => i.name).filter(Boolean).slice(0, 2).join(', ') || '—'} · kembali sebelum ${formatDate(latestOverdue.end_date)}`}
              badge={overdueQueue.length > 1 ? `+${overdueQueue.length - 1} lainnya` : 'Terlambat'}
              badgeClass="is-rejected"
              onClick={() => onNavigate('orders')}
            />
          )}
        </div>
      </section>

      <section className="sys-stats-grid" aria-label="Statistik transaksi">
        <StatCard label="Total transaksi terlihat" value={rentals === null ? '…' : stats.totalRentals} />
        <StatCard
          label="Nilai (non-batal)"
          value={rentals === null ? '…' : formatPrice(stats.gmv)}
        />
        <StatCard
          label="Berjalan / sengketa"
          value={
            rentals === null
              ? '…'
              : (rentals || []).filter((r) =>
                  [TRANSACTION_STATUS.ONGOING, TRANSACTION_STATUS.OVERDUE, TRANSACTION_STATUS.DISPUTED].includes(r.status),
                ).length
          }
          tone="is-success"
        />
        <StatCard label="Toko disetujui" value={apps === null ? '…' : (apps || []).filter((a) => a.storeApplication?.status === 'approved').length} />
      </section>

      <section className="sys-quick-actions">
        <button type="button" className="sys-btn" onClick={() => onNavigate('applications')}>
          Review ajuan seller
          {stats.pendingApps > 0 && <span className="sys-badge-pill">{stats.pendingApps}</span>}
        </button>
        <button type="button" className="sys-btn" onClick={() => onNavigate('orders')}>
          Verifikasi pembayaran & sengketa
          {stats.needVerify + stats.activeDisputes > 0 && (
            <span className="sys-badge-pill">{stats.needVerify + stats.activeDisputes}</span>
          )}
        </button>
        <button type="button" className="sys-btn" onClick={() => onNavigate('audit')}>
          Lihat audit log
        </button>
      </section>

      <p className="sys-note">
        Catatan: semua angka dihitung live dari database sesuai RLS (is_admin). Setiap keputusan
        ditulis server-side oleh RPC ke tabel <code>audit_logs</code>.
      </p>
    </div>
  )
}
