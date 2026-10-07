/*
 * ============================================================================
 * SYS STORES — JabSewa (ERD v2)
 * ============================================================================
 * Moderasi toko. Data: direct SELECT public.stores (+ join owner) — policy
 * stores_read membuka semua baris untuk public.is_admin(); scope dari sesi.
 *
 * Aksi status HANYA via RPC admin_set_store_status (SECDEF): sync is_seller
 * owner + audit server-side (store_suspend / store_unsuspend /
 * store_deactivate). Frontend tidak pernah UPDATE stores langsung.
 * ============================================================================
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { listStores, setStoreStatus } from '../../lib/superadmin'
import { formatDate, initialOf } from '../../lib/format'
import { translateServerError } from '../../lib/constants'

const FILTERS = [
  { key: 'all', label: 'Semua' },
  { key: 'active', label: 'Aktif' },
  { key: 'inactive', label: 'Nonaktif' },
  { key: 'suspended', label: 'Suspended' },
]

const STATUS_META = {
  active: { label: 'Aktif', className: 'is-approved' },
  inactive: { label: 'Nonaktif', className: 'is-review' },
  suspended: { label: 'Suspended', className: 'is-rejected' },
}

export default function SysStores() {
  const [rows, setRows] = useState([])
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirm, setConfirm] = useState(null) // { value, label, danger }

  const load = useCallback(() => {
    setState('loading')
    setError('')
    listStores()
      .then((data) => {
        setRows(data)
        setState('ready')
      })
      .catch((err) => {
        setError(err?.message || 'Gagal memuat toko.')
        setState('error')
      })
  }, [])

  useEffect(() => {
    Promise.resolve().then(load)
  }, [load])

  const counts = useMemo(
    () => ({
      all: rows.length,
      active: rows.filter((s) => s.status === 'active').length,
      inactive: rows.filter((s) => s.status === 'inactive').length,
      suspended: rows.filter((s) => s.status === 'suspended').length,
    }),
    [rows],
  )

  const visible = useMemo(
    () => (filter === 'all' ? rows : rows.filter((s) => s.status === filter)),
    [rows, filter],
  )

  const selected = rows.find((s) => s.id === selectedId) || null

  const runAction = async (fn, okMessage) => {
    if (!selected) return
    setBusyId(selected.id)
    setActionError('')
    setNotice('')
    try {
      await fn()
      setNotice(okMessage)
      setConfirm(null)
      load()
    } catch (err) {
      setActionError(translateServerError(err?.message))
    } finally {
      setBusyId(null)
    }
  }

  const statusMeta = (s) => STATUS_META[s] || { label: s, className: 'is-review' }

  /** Opsi status berikutnya yang bermakna untuk admin. */
  const nextActions = (store) => {
    const list = []
    if (store.status !== 'active') {
      list.push({ value: 'active', label: 'Aktifkan toko', danger: false })
    }
    if (store.status !== 'suspended') {
      list.push({ value: 'suspended', label: 'Suspend toko', danger: true })
    }
    if (store.status !== 'inactive') {
      list.push({ value: 'inactive', label: 'Nonaktifkan toko', danger: true })
    }
    return list
  }

  return (
    <div className="sys-page">
      <header className="sys-page-head">
        <div>
          <h1>Stores</h1>
          <p className="sys-page-sub">
            Semua toko terdaftar — perubahan status menyinkronkan akses seller (is_seller) dan
            tercatat di audit log.
          </p>
          <button type="button" className="sys-btn sys-btn-ghost" onClick={load}>
            Muat ulang
          </button>
        </div>
        <div className="sys-pending" aria-live="polite">
          <span className="sys-pending-num">{counts.suspended}</span>
          <span className="sys-pending-label">toko di-suspend</span>
        </div>
      </header>

      {notice && <p className="sys-note sys-note-ok">{notice}</p>}
      {actionError && <p className="sys-note sys-note-err">⚠ {actionError}</p>}

      <nav className="sys-filters" aria-label="Filter status toko">
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

      <div className="sys-content-cols">
        <section className="sys-list" aria-label="Daftar toko">
          {state === 'loading' && (
            <div className="sys-empty">
              <p>Memuat toko…</p>
            </div>
          )}
          {state === 'error' && (
            <div className="sys-empty">
              <p>{error}</p>
              <button type="button" className="sys-btn sys-btn-ghost" onClick={load}>
                Coba lagi
              </button>
            </div>
          )}
          {state === 'ready' && visible.length === 0 && (
            <div className="sys-empty">
              <p>{filter === 'all' ? 'Belum ada toko terdaftar.' : 'Tidak ada toko pada filter ini.'}</p>
            </div>
          )}
          {state === 'ready' && visible.length > 0 && (
            <ul className="sys-list-items">
              {visible.map((store) => {
                const meta = statusMeta(store.status)
                const isActive = store.id === selectedId
                return (
                  <li key={store.id}>
                    <button
                      type="button"
                      className={`sys-row ${isActive ? 'is-active' : ''}`}
                      onClick={() => {
                        setSelectedId(store.id)
                        setActionError('')
                        setNotice('')
                        setConfirm(null)
                      }}
                      aria-current={isActive ? 'true' : undefined}
                    >
                      <span className="sys-row-avatar" aria-hidden="true">
                        {initialOf(store.name)}
                      </span>
                      <span className="sys-row-main">
                        <span className="sys-row-name">{store.name}</span>
                        <span className="sys-row-store">{store.owner?.email || 'owner —'}</span>
                        <span className="sys-row-date">Sejak {formatDate(store.createdAt)}</span>
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

        <section className="sys-detail" aria-label="Detail toko">
          {selected ? (
            <article className="sys-card">
              <header className="sys-detail-head">
                <div>
                  <h2>{selected.name}</h2>
                  <p className="sys-detail-email">{selected.owner?.email || '—'}</p>
                </div>
                <span className={`sys-status-badge ${statusMeta(selected.status).className}`}>
                  {statusMeta(selected.status).label}
                </span>
              </header>

              <dl className="sys-kv">
                <div className="sys-kv-row">
                  <dt>Owner</dt>
                  <dd>{selected.owner?.name || selected.owner?.email || '—'}</dd>
                </div>
                <div className="sys-kv-row">
                  <dt>Alamat</dt>
                  <dd>{selected.address || '—'}</dd>
                </div>
                {selected.description && (
                  <div className="sys-kv-row">
                    <dt>Deskripsi</dt>
                    <dd>{selected.description}</dd>
                  </div>
                )}
                <div className="sys-kv-row">
                  <dt>Dibuat</dt>
                  <dd>{formatDate(selected.createdAt)}</dd>
                </div>
                <div className="sys-kv-row">
                  <dt>ID</dt>
                  <dd>
                    <code>{selected.id}</code>
                  </dd>
                </div>
              </dl>

              <div className="sys-decision-actions">
                {nextActions(selected).map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    className={`sys-btn ${a.danger ? 'is-danger' : 'is-approve'}`}
                    disabled={busyId === selected.id}
                    onClick={() => setConfirm(a)}
                  >
                    {a.label}
                  </button>
                ))}
              </div>

              {confirm && (
                <div className={`sys-confirm ${confirm.danger ? 'is-reject' : 'is-approve'}`}>
                  <p>
                    Ubah status <strong>{selected.name}</strong> menjadi{' '}
                    <strong>{confirm.value}</strong>?
                  </p>
                  <p className="sys-confirm-hint">
                    Dieksekusi via RPC admin_set_store_status; akses seller owner ikut
                    disinkronkan server, dan aksi ini tercatat di audit log.
                  </p>
                  <div className="sys-confirm-actions">
                    <button
                      type="button"
                      className="sys-btn-ghost"
                      disabled={busyId === selected.id}
                      onClick={() => setConfirm(null)}
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      className={`sys-btn ${confirm.danger ? 'is-danger' : 'is-approve'}`}
                      disabled={busyId === selected.id}
                      onClick={() =>
                        runAction(
                          () => setStoreStatus(selected.id, confirm.value),
                          `Status toko diubah ke ${confirm.value}.`,
                        )
                      }
                    >
                      {busyId === selected.id ? 'Menyimpan…' : 'Ya, ubah status'}
                    </button>
                  </div>
                </div>
              )}
            </article>
          ) : (
            <div className="sys-empty">
              <p>Pilih toko dari daftar untuk melihat detail dan aksi status.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
