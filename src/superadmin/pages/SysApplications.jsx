/*
 * ============================================================================
 * SYS APPLICATIONS — JabSewa (FITUR 2)
 * ============================================================================
 * Review ajuan seller untuk superadmin. Data dari lapisan service superadmin
 * (LocalStorage store — kontrak data sama, jadi penukaran ke backend nyata
 * nanti tidak menyentuh komponen).
 *
 * Setiap keputusan (setujui/tolak) wajib membubuhkan admin_audit_logs via
 * logAdminAction — aksi tanpa jejak audit ditolak oleh alur UI.
 * ============================================================================
 */

import { useEffect, useState } from 'react'
import { listSellerApplications, decideAdmin, logAdminAction, AUDIT_ACTIONS } from '../../lib/superadmin'
import { formatDate, initialOf } from '../../lib/format'

const FILTERS = [
  { key: 'all', label: 'Semua' },
  { key: 'under_review', label: 'Sedang Ditinjau' },
  { key: 'approved', label: 'Disetujui' },
  { key: 'rejected', label: 'Ditolak' },
]

const STATUS_META = {
  under_review: { label: 'Sedang Ditinjau', className: 'is-review' },
  approved: { label: 'Disetujui', className: 'is-approved' },
  rejected: { label: 'Ditolak', className: 'is-rejected' },
}

function statusMeta(status) {
  return STATUS_META[status] || { label: status, className: 'is-review' }
}

export default function SysApplications() {
  const [apps, setApps] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [decision, setDecision] = useState(null) // null | 'approve' | 'reject'
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => {
    listSellerApplications().then((data) => {
      setApps(data)
      setLoading(false)
    })
  }

  useEffect(load, [])

  const counts = { all: apps.length, under_review: 0, approved: 0, rejected: 0 }
  apps.forEach((a) => {
    const s = a.sellerApplication?.status
    if (s in counts) counts[s] += 1
  })

  const visible = filter === 'all' ? apps : apps.filter((a) => a.sellerApplication?.status === filter)
  const selected = apps.find((a) => a.id === selectedId) || null

  const openDetail = (id) => {
    setSelectedId(id)
    setDecision(null)
    setReason('')
    if (window.innerWidth < 980) window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /** Keputusan tersimpan + audit log ditulis sebelum UI diperbarui. */
  const confirmDecision = async () => {
    if (!selected || !decision) return
    setSaving(true)
    try {
      await decideAdmin(selected.id, { approve: decision === 'approve', reason })
      await logAdminAction(
        decision === 'approve' ? AUDIT_ACTIONS.APPROVE_STORE_APPLICATION : AUDIT_ACTIONS.REJECT_STORE_APPLICATION,
        {
          targetType: 'store_application',
          targetId: selected.id,
          payload: {
            storeName: selected.sellerApplication?.storeName || '',
            decision: decision === 'approve' ? 'approved' : 'rejected',
            reason: decision === 'reject' ? reason : '',
            at: new Date().toISOString(),
          },
        },
      )
      setDecision(null)
      setReason('')
      load()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="sys-page">
      <header className="sys-page-head">
        <div>
          <h1>Ajuan Seller</h1>
          <p className="sys-page-sub">Review dan putuskan ajuan menjadi toko mitra.</p>
          <button type="button" className="sys-btn sys-btn-ghost" onClick={load}>
            Muat ulang
          </button>
        </div>
        <div className="sys-pending" aria-live="polite">
          <span className="sys-pending-num">{counts.under_review}</span>
          <span className="sys-pending-label">ajuan menunggu review</span>
</div>
      </header>

      <nav className="sys-filters" aria-label="Filter ajuan">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`sys-filter ${filter === f.key ? 'is-active' : ''}`}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
            <span className="sys-filter-count">{counts[f.key]}</span>
          </button>
        ))}
      </nav>

      <div className="sys-content-cols">
        <section className="sys-list" aria-label="Daftar ajuan seller">
          {loading ? (
            <div className="sys-empty">
              <p>Memuat ajuan…</p>
            </div>
          ) : visible.length === 0 ? (
            <div className="sys-empty">
              <p>{filter === 'all' ? 'Belum ada ajuan seller.' : 'Tidak ada ajuan pada filter ini.'}</p>
            </div>
          ) : (
            <ul className="sys-list-items">
              {visible.map((app) => {
                const meta = statusMeta(app.sellerApplication?.status)
                const isActive = app.id === selectedId
                return (
                  <li key={app.id}>
                    <button
                      type="button"
                      className={`sys-row ${isActive ? 'is-active' : ''}`}
                      onClick={() => openDetail(app.id)}
                      aria-current={isActive ? 'true' : undefined}
                    >
                      <span className="sys-row-avatar" aria-hidden="true">
                        {initialOf(app.applicant?.name)}
                      </span>
                      <span className="sys-row-main">
                        <span className="sys-row-name">{app.applicant?.name}</span>
                        <span className="sys-row-store">{app.sellerApplication?.storeName}</span>
                        <span className="sys-row-date">Dikirim {formatDate(app.sellerApplication?.submittedAt)}</span>
                      </span>
                      <span className="sys-row-side">
                        <span className={`sys-status-badge ${meta.className}`}>{meta.label}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="sys-detail" aria-label="Detail ajuan">
          {selected ? (
            <article className="sys-card">
              <header className="sys-detail-head">
                <div>
                  <h2>{selected.applicant?.name}</h2>
                  <p className="sys-detail-store">{selected.sellerApplication?.storeName}</p>
                  <p className="sys-detail-email">{selected.applicant?.email}</p>
                </div>
                <span className={`sys-status-badge ${statusMeta(selected.sellerApplication?.status).className}`}>
                  {statusMeta(selected.sellerApplication?.status).label}
                </span>
              </header>

              <dl className="sys-kv">
                <div className="sys-kv-row">
                  <dt>Kota</dt>
                  <dd>{selected.sellerApplication?.city || '—'}</dd>
                </div>
                <div className="sys-kv-row">
                  <dt>Kontak</dt>
                  <dd>{selected.sellerApplication?.contact || '—'}</dd>
                </div>
                <div className="sys-kv-row">
                  <dt>Dikirim</dt>
                  <dd>{formatDate(selected.sellerApplication?.submittedAt)}</dd>
                </div>
                {selected.sellerApplication?.description && (
                  <div className="sys-kv-row">
                    <dt>Deskripsi</dt>
                    <dd>{selected.sellerApplication.description}</dd>
                  </div>
                )}
              </dl>

              {!decision && (
                <div className="sys-decision-actions">
                  <button type="button" className="sys-btn is-approve" disabled={saving} onClick={() => setDecision('approve')}>
                    Setujui Ajuan
                  </button>
                  <button type="button" className="sys-btn is-danger" disabled={saving} onClick={() => setDecision('reject')}>
                    Tolak Ajuan
                  </button>
                </div>
              )}

              {decision === 'approve' && (
                <div className="sys-confirm is-approve">
                  <p>
                    Setujui <strong>{selected.sellerApplication?.storeName}</strong>? Toko bisa langsung aktif.
                  </p>
                  <div className="sys-confirm-actions">
                    <button type="button" className="sys-btn-ghost" onClick={() => setDecision(null)}>
                      Batal
                    </button>
                    <button type="button" className="sys-btn is-approve" disabled={saving} onClick={confirmDecision}>
                      {saving ? 'Menyimpan…' : 'Ya, Setujui'}
                    </button>
                  </div>
                </div>
              )}

              {decision === 'reject' && (
                <div className="sys-confirm is-reject">
                  <label className="sys-label" htmlFor="sys-reject-reason">
                    Alasan penolakan (diteruskan ke applicant)
                  </label>
                  <textarea
                    id="sys-reject-reason"
                    className="sys-textarea"
                    rows={3}
                    value={reason}
                    placeholder="cth: Deskripsi toko terlalu singkat."
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <div className="sys-confirm-actions">
                    <button type="button" className="sys-btn-ghost" onClick={() => setDecision(null)}>
                      Batal
                    </button>
                    <button
                      type="button"
                      className="sys-btn is-danger"
                      disabled={saving || !reason.trim()}
                      onClick={confirmDecision}
                    >
                      {saving ? 'Menyimpan…' : 'Tolak Ajuan'}
                    </button>
                  </div>
                  <p className="sys-confirm-hint">Alasan wajib diisi. Aksi ini tercatat di audit log.</p>
                </div>
              )}
            </article>
          ) : (
            <div className="sys-empty">
              <p>Pilih ajuan dari daftar untuk melihat detailnya.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
