/*
 * ============================================================================
 * SYS DASHBOARD — JabSewa (ERD v2)
 * ============================================================================
 * Ringkasan platform untuk superadmin: ajuan seller + transaksi rental live
 * (direct SELECT RLS-scoped — bukan data mock).
 * ============================================================================
 */

import { useEffect, useState } from 'react'
import {
  listSellerApplications,
  summarizeApplications,
  adminListRentals,
} from '../../lib/superadmin'
import { TRANSACTION_STATUS } from '../../lib/constants'

function StatCard({ label, value, tone = '' }) {
  return (
    <article className={`sys-stat ${tone}`}>
      <p className="sys-stat-value">{value}</p>
      <p className="sys-stat-label">{label}</p>
    </article>
  )
}

export default function SysDashboard({ onNavigate }) {
  const [apps, setApps] = useState([])
  const [loading, setLoading] = useState(true)
  const [rentals, setRentals] = useState([])

  useEffect(() => {
    let active = true
    listSellerApplications()
      .then((data) => {
        if (active) {
          setApps(data)
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    adminListRentals()
      .then((data) => {
        if (active) setRentals(data)
      })
      .catch(() => {
        if (active) setRentals([])
      })
    return () => {
      active = false
    }
  }, [])

  const stats = summarizeApplications(apps)
  const rentalStats = {
    total: rentals.length,
    needVerify: rentals.filter((r) => r.status === TRANSACTION_STATUS.PAYMENT_VERIFY).length,
    active: rentals.filter((r) =>
      [TRANSACTION_STATUS.ONGOING, TRANSACTION_STATUS.OVERDUE, TRANSACTION_STATUS.DISPUTED].includes(
        r.status,
      ),
    ).length,
    gmv: rentals
      .filter((r) => r.status !== TRANSACTION_STATUS.CANCELLED)
      .reduce((sum, r) => sum + (Number(r.total) || 0), 0),
  }

  return (
    <div className="sys-page">
      <header className="sys-page-head">
        <div>
          <h1>Dashboard Platform</h1>
          <p className="sys-page-sub">Ringkasan operasional JabSewa.</p>
        </div>
      </header>

      <section className="sys-stats-grid" aria-label="Statistik platform">
        <StatCard label="Total ajuan seller" value={loading ? '…' : stats.total} />
        <StatCard label="Menunggu review" value={loading ? '…' : stats.underReview} tone="is-warning" />
        <StatCard label="Toko disetujui" value={loading ? '…' : stats.approved} tone="is-success" />
        <StatCard label="Ajuan ditolak" value={loading ? '…' : stats.rejected} tone="is-danger" />
      </section>

      <section className="sys-stats-grid" aria-label="Statistik transaksi">
        <StatCard label="Total transaksi" value={rentalStats.total} />
        <StatCard label="Verifikasi bayar" value={rentalStats.needVerify} tone="is-warning" />
        <StatCard label="Berjalan/sengketa" value={rentalStats.active} tone="is-success" />
        <StatCard label="Nilai (non-batal)" value={formatPriceShort(rentalStats.gmv)} />
      </section>

      <section className="sys-panel">
        <div className="sys-panel-head">
          <h2>Aksi cepat</h2>
        </div>
        <div className="sys-quick-actions">
          <button type="button" className="sys-btn" onClick={() => onNavigate('applications')}>
            Review ajuan seller
            {stats.underReview > 0 && <span className="sys-badge-pill">{stats.underReview}</span>}
          </button>
          <button type="button" className="sys-btn" onClick={() => onNavigate('orders')}>
            Verifikasi pembayaran & sengketa
            {rentalStats.needVerify > 0 && (
              <span className="sys-badge-pill">{rentalStats.needVerify}</span>
            )}
          </button>
          <button type="button" className="sys-btn" onClick={() => onNavigate('audit')}>
            Lihat audit log
          </button>
        </div>
      </section>

      <p className="sys-note">
        Catatan: modul ini terisolasi dari dashboard user. Semua aksi tercatat
        server-side di tabel <code>audit_logs</code> oleh RPC.
      </p>
    </div>
  )
}

/** Ringkas nilai ke format pendek (1,2 jt) untuk kartu statistik. */
function formatPriceShort(value) {
  const n = Number(value || 0)
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)} M`
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)} jt`
  if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)} rb`
  return `Rp ${n.toLocaleString('id-ID')}`
}
