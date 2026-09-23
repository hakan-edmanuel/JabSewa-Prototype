/*
 * ============================================================================
 * SYS DASHBOARD — JabSewa (FITUR 2)
 * ============================================================================
 * Ringkasan platform untuk superadmin. Data diambil dari lapisan service
 * superadmin (LocalStorage store — siap ditukar query backend tanpa
 * mengubah komponen).
 * ============================================================================
 */

import { useEffect, useState } from 'react'
import { listSellerApplications, summarizeApplications } from '../../lib/superadmin'

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

  useEffect(() => {
    let active = true
    listSellerApplications().then((data) => {
      if (active) {
        setApps(data)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [])

  const stats = summarizeApplications(apps)

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

      <section className="sys-panel">
        <div className="sys-panel-head">
          <h2>Aksi cepat</h2>
        </div>
        <div className="sys-quick-actions">
          <button type="button" className="sys-btn" onClick={() => onNavigate('applications')}>
            Review ajuan seller
            {stats.underReview > 0 && <span className="sys-badge-pill">{stats.underReview}</span>}
          </button>
          <button type="button" className="sys-btn" onClick={() => onNavigate('audit')}>
            Lihat audit log
          </button>
        </div>
      </section>

      <p className="sys-note">
        Catatan: modul ini terisolasi dari dashboard user. Semua aksi tercatat di
        koleksi <code>audit_logs</code> (LocalStorage — mode mock/offline).
      </p>
    </div>
  )
}
