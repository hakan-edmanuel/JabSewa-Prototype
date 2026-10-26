/*
 * ============================================================================
 * SYS APPLICATIONS — JabSewa (ERD v2)
 * ============================================================================
 * Review ajuan toko untuk admin. Data dari RPC list_store_applications
 * (server-side guard is_admin()). Kontrak baris:
 *   { id, applicant: {name,email}, storeApplication: { status, storeName,
 *     description, address, submittedAt, reviewedAt, rejectionReason } }
 *
 * Keputusan lewat RPC decide_store_application — RPC menulis audit_logs
 * server-side (application_approve / application_reject), memvalidasi
 * self-review dan ajuan non-pending, serta membuat store saat approve.
 * Frontend tidak menulis audit dan tidak mengarang alasan penolakan: field
 * `rejection_reason` sudah ada di kontrak dan hanya ditampilkan.
 *
 * Layout memakai komponen bersama AdminPageHead / AdminFilters / AdminList /
 * AdminConfirm agar konsisten dengan modul admin lain.
 * ============================================================================
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listSellerApplications, decideAdmin } from '../../../data/admin'
import { formatDate, formatDateTime, initialOf } from '../../../domain/format'
import { APPLICATION_STATUS_META, translateServerError } from '../../../domain/constants'
import AdminPageHead from '../components/AdminPageHead'
import AdminFilters from '../components/AdminFilters'
import AdminList from '../components/AdminList'
import AdminConfirm from '../components/AdminConfirm'

const FILTERS = [
  { key: 'all', label: 'Semua' },
  { key: 'pending', label: 'Menunggu Review' },
  { key: 'approved', label: 'Disetujui' },
  { key: 'rejected', label: 'Ditolak' },
]

function statusMeta(status) {
  return APPLICATION_STATUS_META[status] || { label: status || '—', className: 'is-review' }
}

export default function AdminApplications() {
  const [rows, setRows] = useState([])
  const [state, setState] = useState('loading') // loading | ready | error
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [decision, setDecision] = useState(null) // null | 'approve' | 'reject'
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  // Ref (bukan state) agar dua klik pada tick yang sama tidak mengirim dua RPC.
  const savingRef = useRef(false)

  const load = useCallback(() => {
    setState('loading')
    setError('')
    return listSellerApplications()
      .then((data) => {
        setRows(Array.isArray(data) ? data : [])
        setState('ready')
      })
      .catch(() => {
        // Kegagalan query = error, bukan daftar kosong.
        setError('Gagal memuat ajuan seller. Periksa koneksi, lalu coba lagi.')
        setState('error')
      })
  }, [])

  useEffect(() => {
    Promise.resolve().then(load)
  }, [load])

  const counts = useMemo(() => {
    const next = { all: rows.length, pending: 0, approved: 0, rejected: 0 }
    rows.forEach((row) => {
      const status = row.storeApplication?.status
      if (status && status in next) next[status] += 1
    })
    return next
  }, [rows])

  const visible = useMemo(
    () => (filter === 'all' ? rows : rows.filter((r) => r.storeApplication?.status === filter)),
    [rows, filter],
  )

  const selected = rows.find((row) => row.id === selectedId) || null
  const selectedStatus = selected?.storeApplication?.status || null
  const isPending = selectedStatus === 'pending'

  const openDetail = (row) => {
    setSelectedId(row.id)
    setDecision(null)
    setReason('')
    setActionError('')
    setNotice('')
  }

  /** Keputusan tersimpan; audit ditulis server-side oleh RPC. */
  const confirmDecision = async () => {
    if (!selected || !decision || savingRef.current) return
    const approve = decision === 'approve'
    const storeName = selected.storeApplication?.storeName || 'toko'
    savingRef.current = true
    setSaving(true)
    setActionError('')
    setNotice('')
    try {
      await decideAdmin(selected.id, { approve, reason: approve ? '' : reason.trim() })
      setDecision(null)
      setReason('')
      setNotice(approve ? `Ajuan ${storeName} disetujui.` : `Ajuan ${storeName} ditolak.`)
      await load()
    } catch (err) {
      // Form konfirmasi tetap terbuka agar isian alasan tidak hilang.
      setActionError(translateServerError(err?.message))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div className="sys-page">
      <AdminPageHead
        title="Ajuan Seller"
        subtitle="Review dan putuskan ajuan menjadi toko mitra — setiap keputusan tercatat di audit log."
        pendingCount={state === 'ready' ? counts.pending : '—'}
        pendingLabel="ajuan menunggu review"
        onReload={load}
        loading={state === 'loading'}
      />

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

      <AdminFilters
        ariaLabel="Filter ajuan seller"
        filters={FILTERS}
        counts={counts}
        countsReady={state === 'ready'}
        value={filter}
        onChange={setFilter}
      />

      <div className="sys-content-cols">
        <AdminList
          ariaLabel="Daftar ajuan seller"
          state={state}
          error={error}
          loadingText="Memuat ajuan…"
          emptyText={
            filter === 'all' ? 'Belum ada ajuan seller.' : 'Tidak ada ajuan pada filter ini.'
          }
          rows={visible}
          selectedId={selectedId}
          onReload={load}
          onSelect={openDetail}
          renderRow={(row) => ({
            avatar: initialOf(row.applicant?.name || row.storeApplication?.storeName),
            name: row.applicant?.name || '—',
            sub: row.storeApplication?.storeName || '—',
            meta: `Dikirim ${formatDate(row.storeApplication?.submittedAt)}`,
            status: statusMeta(row.storeApplication?.status),
          })}
        />

        <section className="sys-detail" aria-label="Detail ajuan">
          {selected ? (
            <article className="sys-card">
              <header className="sys-detail-head">
                <div>
                  <h2>{selected.applicant?.name || '—'}</h2>
                  <p className="sys-detail-store">{selected.storeApplication?.storeName || '—'}</p>
                  <p className="sys-detail-email">{selected.applicant?.email || '—'}</p>
                </div>
                <span className={`sys-status-badge ${statusMeta(selectedStatus).className}`}>
                  {statusMeta(selectedStatus).label}
                </span>
              </header>

              <dl className="sys-kv">
                <div className="sys-kv-row">
                  <dt>Pemohon</dt>
                  <dd>{selected.applicant?.name || '—'}</dd>
                </div>
                <div className="sys-kv-row">
                  <dt>Email</dt>
                  <dd>{selected.applicant?.email || '—'}</dd>
                </div>
                <div className="sys-kv-row">
                  <dt>Toko</dt>
                  <dd>{selected.storeApplication?.storeName || '—'}</dd>
                </div>
                <div className="sys-kv-row">
                  <dt>Alamat</dt>
                  <dd>{selected.storeApplication?.address || '—'}</dd>
                </div>
                {selected.storeApplication?.description && (
                  <div className="sys-kv-row">
                    <dt>Deskripsi</dt>
                    <dd className="sys-kv-text">{selected.storeApplication.description}</dd>
                  </div>
                )}
                <div className="sys-kv-row">
                  <dt>Dikirim</dt>
                  <dd>{formatDateTime(selected.storeApplication?.submittedAt)}</dd>
                </div>
                {selected.storeApplication?.reviewedAt && (
                  <div className="sys-kv-row">
                    <dt>Diputus</dt>
                    <dd>{formatDateTime(selected.storeApplication.reviewedAt)}</dd>
                  </div>
                )}
                {selectedStatus === 'rejected' && selected.storeApplication?.rejectionReason && (
                  <div className="sys-kv-row">
                    <dt>Alasan</dt>
                    <dd className="sys-kv-text">{selected.storeApplication.rejectionReason}</dd>
                  </div>
                )}
                <div className="sys-kv-row">
                  <dt>ID</dt>
                  <dd>
                    <code>{selected.id}</code>
                  </dd>
                </div>
              </dl>

              {isPending ? (
                <>
                  {!decision && (
                    <div className="sys-decision-actions">
                      <button
                        type="button"
                        className="sys-btn is-approve"
                        disabled={saving}
                        onClick={() => {
                          setDecision('approve')
                          setActionError('')
                          setNotice('')
                        }}
                      >
                        Setujui ajuan
                      </button>
                      <button
                        type="button"
                        className="sys-btn is-danger"
                        disabled={saving}
                        onClick={() => {
                          setDecision('reject')
                          setActionError('')
                          setNotice('')
                        }}
                      >
                        Tolak ajuan
                      </button>
                    </div>
                  )}

                  {decision === 'approve' && (
                    <AdminConfirm
                      danger={false}
                      message={
                        <>
                          Setujui <strong>{selected.storeApplication?.storeName || 'toko ini'}</strong>?
                          Toko langsung aktif dan pemohon mendapat akses seller.
                        </>
                      }
                      hint="Dieksekusi via RPC decide_store_application dan tercatat di audit log."
                      busy={saving}
                      confirmLabel="Ya, setujui"
                      onCancel={() => setDecision(null)}
                      onConfirm={confirmDecision}
                    />
                  )}

                  {decision === 'reject' && (
                    <AdminConfirm
                      danger
                      message={
                        <>
                          Tolak ajuan <strong>{selected.storeApplication?.storeName || 'toko ini'}</strong>?
                          Alasan diteruskan ke pemohon.
                        </>
                      }
                      hint="Alasan wajib diisi. Aksi ini tercatat di audit log."
                      busy={saving}
                      confirmDisabled={!reason.trim()}
                      confirmLabel="Tolak ajuan"
                      onCancel={() => setDecision(null)}
                      onConfirm={confirmDecision}
                    >
                      <label className="sys-label" htmlFor="sys-reject-reason">
                        Alasan penolakan
                      </label>
                      <textarea
                        id="sys-reject-reason"
                        className="sys-textarea"
                        rows={3}
                        value={reason}
                        placeholder="cth: Deskripsi toko terlalu singkat."
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </AdminConfirm>
                  )}
                </>
              ) : (
                <p className="sys-note">
                  Ajuan ini sudah diputus — tidak ada aksi lanjutan. Keputusan hanya dapat diambil
                  untuk ajuan berstatus menunggu review.
                </p>
              )}
            </article>
          ) : (
            <div className="sys-empty">
              <p>Pilih ajuan dari daftar untuk melihat detail dan mengambil keputusan.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
