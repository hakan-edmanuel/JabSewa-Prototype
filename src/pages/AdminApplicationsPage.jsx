import { useMemo, useState } from 'react'
import SimpleNavbar from '../components/SimpleNavbar'
import Footer from '../components/Footer'
import { useAuth } from '../auth/AuthContext'

/*
 * ============================================================================
 * ADMIN — SELLER APPLICATIONS (halaman operasional JabSewa)
 * ============================================================================
 * Satu tugas: review ajuan jadi seller → lihat detail → setujui / tolak.
 * "JabSewa, but for platform operations": DNA visual sama (ink, teal scalpel,
 * hairline dividers, radius 8–10px), lebih padat informasi.
 *
 * Sumber data: mock multi-akun lokal (AuthContext.listSellerApplications).
 * Keputusan: AuthContext.decideAdmin(email, { approve, reason }) — bentuk data
 * sama dengan decideSellerApplication, jadi layar applicant tetap konsisten.
 * Rejection reason: teks opsional, diminta sebelum keputusan (intentional act).
 * ============================================================================
 */

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

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

function initialOf(name) {
  return (name || '?').trim().charAt(0).toUpperCase()
}

export default function AdminApplicationsPage({ onNavigate }) {
  const { listSellerApplications, decideAdmin } = useAuth()
  const [version, setVersion] = useState(0)
  const [filter, setFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [decision, setDecision] = useState(null) // null | 'approve' | 'reject'
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const applications = useMemo(
    () => listSellerApplications(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  )

  const counts = useMemo(() => {
    const base = { all: applications.length, under_review: 0, approved: 0, rejected: 0 }
    applications.forEach((a) => {
      const s = a.sellerApplication?.status
      if (s in base) base[s] += 1
    })
    return base
  }, [applications])

  const visible = useMemo(
    () => (filter === 'all' ? applications : applications.filter((a) => a.sellerApplication?.status === filter)),
    [applications, filter],
  )

  const selected = applications.find((a) => a.id === selectedId) || null
  const activeApplication = selected

  const openDetail = (id) => {
    setSelectedId(id)
    setDecision(null)
    setReason('')
    setSaved(false)
    if (window.innerWidth < 980) window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const startDecision = (kind) => {
    setDecision(kind)
    setReason('')
    setSaved(false)
  }

  const confirmDecision = async () => {
    if (!activeApplication || !decision) return
    setSaving(true)
    await decideAdmin(activeApplication.id, {
      approve: decision === 'approve',
      reason,
    })
    setSaving(false)
    setSaved(true)
    setDecision(null)
    setReason('')
    setVersion((v) => v + 1)
  }

  return (
    <div className="page-shell page-admin-shell">
      <SimpleNavbar onNavigate={onNavigate} currentPage="admin" />

      <main className="admin-page">
        {/* --- Header: editorial, compact --- */}
        <header className="admin-head">
          <div>
            <p className="admin-kicker">Admin</p>
            <h1>Seller Applications</h1>
            <p className="admin-sub">
              Review dan kelola orang yang ingin menjadi seller JabSewa.
            </p>
          </div>
          <div className="admin-pending" aria-live="polite">
            <span className="admin-pending-num">{counts.under_review}</span>
            <span className="admin-pending-label">
              ajuan
              <br />
              menunggu review
            </span>
          </div>
        </header>

        {/* --- Filter: underline tabs ringkas + counter --- */}
        <nav className="admin-filters" aria-label="Filter ajuan seller">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`admin-filter${filter === f.key ? ' is-active' : ''}`}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              <span className="admin-filter-count">{counts[f.key]}</span>
            </button>
          ))}
        </nav>

        {/* --- Konten: list + detail (stack di mobile, dua kolom ≥980px) --- */}
        <div className="admin-content">
          {/* --- List ajuan --- */}
          <section className="admin-list" aria-label="Daftar ajuan seller">
            {visible.length === 0 ? (
              <div className="admin-empty">
                <p>
                  {filter === 'all'
                    ? 'Belum ada ajuan seller.'
                    : `Tidak ada ajuan berstatus "${statusMeta(filter).label}".`}
                </p>
                <span>
                  Ajuan muncul otomatis setelah seseorang menyelesaikan form ajuan
                  seller.
                </span>
              </div>
            ) : (
              <ul className="admin-list-items">
                {visible.map((app) => {
                  const meta = statusMeta(app.sellerApplication?.status)
                  const isActive = app.id === selectedId
                  return (
                    <li key={app.id}>
                      <button
                        type="button"
                        className={`admin-row${isActive ? ' is-active' : ''}`}
                        onClick={() => openDetail(app.id)}
                        aria-current={isActive ? 'true' : undefined}
                      >
                        <span className="admin-row-avatar" aria-hidden="true">
                          {initialOf(app.applicant?.name)}
                        </span>
                        <span className="admin-row-main">
                          <span className="admin-row-name">{app.applicant?.name}</span>
                          <span className="admin-row-store">{app.sellerApplication?.storeName}</span>
                          <span className="admin-row-date">
                            Dikirim {formatDate(app.sellerApplication?.submittedAt)}
                          </span>
                        </span>
                        <span className="admin-row-side">
                          <span className={`seller-app-status-badge ${meta.className}`}>{meta.label}</span>
                          <span className="admin-row-cta">Review →</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {/* --- Detail ajuan terpilih --- */}
          <section className="admin-detail" aria-label="Detail ajuan">
            {activeApplication ? (
              <DetailPanel
                application={activeApplication}
                decision={decision}
                reason={reason}
                saved={saved}
                saving={saving}
                onDecision={startDecision}
                onReason={setReason}
                onConfirm={confirmDecision}
                onCancel={() => setDecision(null)}
              />
            ) : (
              <div className="admin-detail-placeholder">
                <p>Pilih ajuan dari daftar untuk melihat detailnya.</p>
              </div>
            )}
          </section>
        </div>
      </main>

      <Footer onNavigate={onNavigate} />
    </div>
  )
}

/* --- Panel detail: info applicant / seller / ajuan + keputusan admin --- */
function DetailPanel({
  application,
  decision,
  reason,
  saved,
  saving,
  onDecision,
  onReason,
  onConfirm,
  onCancel,
}) {
  const app = application.sellerApplication || {}
  const meta = statusMeta(app.status)
  const isDecided = app.status === 'approved' || app.status === 'rejected'

  return (
    <article className="admin-card">
      <header className="admin-detail-head">
        <div className="admin-detail-id">
          <span className="admin-row-avatar admin-row-avatar-lg" aria-hidden="true">
            {initialOf(application.applicant?.name)}
          </span>
          <div>
            <h2>{application.applicant?.name}</h2>
            <p className="admin-detail-store">{app.storeName}</p>
          </div>
          <span className={`seller-app-status-badge ${meta.className} admin-detail-badge`}>
            {meta.label}
          </span>
          <span className="admin-detail-ref">
            #{(application.id || '').split('@')[0].slice(0, 10).toUpperCase()}
          </span>
        </div>
      </header>

      <div className="admin-detail-cols">
        {/* Kolom kiri: toko & applicant */}
        <div className="admin-detail-main">
          <div className="admin-field-group">
            <h3 className="admin-field-title">Informasi Seller</h3>
            <div className="seller-app-review">
              <div className="seller-app-review-row"><span>Nama toko</span><strong>{app.storeName || '—'}</strong></div>
              <div className="seller-app-review-row"><span>Kota</span><strong>{app.city || '—'}</strong></div>
            </div>
            {app.description && (
              <div className="admin-desc">
                <span className="profile-row-label">Deskripsi</span>
                <p>{app.description}</p>
              </div>
            )}
            {app.address && (
              <div className="admin-desc">
                <span className="profile-row-label">Alamat</span>
                <p>{app.address}</p>
              </div>
            )}
          </div>

          <div className="admin-field-group">
            <h3 className="admin-field-title">Informasi Applicant</h3>
            <div className="seller-app-review">
              <div className="seller-app-review-row"><span>Nama</span><strong>{application.applicant?.name || '—'}</strong></div>
              <div className="seller-app-review-row"><span>Email</span><strong>{application.applicant?.email || '—'}</strong></div>
              <div className="seller-app-review-row"><span>Kontak</span><strong>{app.contact || '—'}</strong></div>
            </div>
          </div>

          <div className="admin-field-group">
            <h3 className="admin-field-title">Informasi Ajuan</h3>
            <div className="seller-app-review">
              <div className="seller-app-review-row"><span>Dikirim</span><strong>{formatDate(app.submittedAt)}</strong></div>
              <div className="seller-app-review-row"><span>Status</span><strong>{meta.label}</strong></div>
              {app.reviewedAt && (
                <div className="seller-app-review-row"><span>Direview</span><strong>{formatDate(app.reviewedAt)}</strong></div>
              )}
              {app.status === 'rejected' && app.rejectionReason && (
                <div className="seller-app-review-row admin-reject-row">
                  <span>Alasan reviewer</span>
                  <strong>{app.rejectionReason}</strong>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Kolom kanan: keputusan */}
        <aside className="admin-decision">
          <h3 className="admin-field-title">Keputusan</h3>

          {saved && (
            <p className="admin-saved-note">Keputusan tersimpan.</p>
          )}

          {isDecided && !decision ? (
            <p className="admin-decision-note">
              Ajuan ini sudah {app.status === 'approved' ? 'disetujui' : 'ditolak'}
              {app.reviewedAt ? ` pada ${formatDate(app.reviewedAt)}` : ''}. Keputusan
              bersifat final pada versi prototype ini.
            </p>
          ) : null}

          {!decision && !isDecided ? (
            <div className="admin-decision-actions">
              <button
                type="button"
                className="btn-small btn-primary admin-btn-approve"
                disabled={saving}
                onClick={() => onDecision('approve')}
              >
                Setujui Ajuan
              </button>
              <button
                type="button"
                className="btn-small btn-danger"
                disabled={saving}
                onClick={() => onDecision('reject')}
              >
                Tolak Ajuan
              </button>
            </div>
          ) : null}

          {decision === 'approve' && (
            <div className="admin-confirm-block is-approve">
              <p>
                Setujui <strong>{app.storeName}</strong>? Profil seller akan dibuat
                dan toko bisa langsung aktif.
              </p>
              <div className="admin-confirm-actions">
                <button type="button" className="auth-switch-link" onClick={onCancel}>
                  Batal
                </button>
                <button
                  type="button"
                  className="btn-small btn-primary"
                  disabled={saving}
                  onClick={onConfirm}
                >
                  {saving ? 'Menyimpan…' : 'Ya, Setujui'}
                </button>
              </div>
            </div>
          )}

          {decision === 'reject' && (
            <div className="admin-confirm-block is-reject">
              <label className="auth-label" htmlFor="admin-reject-reason">
                Alasan penolakan (diteruskan ke applicant)
              </label>
              <textarea
                id="admin-reject-reason"
                className="auth-input"
                rows={3}
                value={reason}
                placeholder="cth: Deskripsi toko terlalu singkat — tuliskan jenis barang yang kamu sewakan."
                onChange={(e) => onReason(e.target.value)}
              />
              <div className="admin-confirm-actions">
                <button type="button" className="auth-switch-link" onClick={onCancel}>
                  Batal
                </button>
                <button
                  type="button"
                  className="btn-small btn-danger"
                  disabled={saving || !reason.trim()}
                  onClick={onConfirm}
                >
                  {saving ? 'Menyimpan…' : 'Tolak Ajuan'}
                </button>
              </div>
              <p className="admin-confirm-hint">
                Alasan wajib diisi. Applicant melihat teks ini saat login.
              </p>
            </div>
          )}
        </aside>
      </div>
    </article>
  )
}
