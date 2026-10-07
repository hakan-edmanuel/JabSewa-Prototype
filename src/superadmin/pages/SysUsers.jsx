/*
 * ============================================================================
 * SYS USERS — JabSewa (ERD v2)
 * ============================================================================
 * Moderasi akun. Data: direct SELECT public.users — RLS users_select_admin
 * hanya membuka baris untuk public.is_admin() (role `admin` + status active);
 * scope ditentukan server dari sesi.
 *
 * Aksi lewat RPC server-side (frontend tidak menulis users langsung):
 *   - admin_set_user_status  → user_suspend / user_activate (audit server)
 *   - admin_set_user_role    → role_change (audit server)
 * Guard server: is_admin() di dalam RPC + self_action_forbidden (admin tidak
 * bisa mengubah akunnya sendiri) — UI hanya menyembunyikan opsi tsb untuk UX.
 * ============================================================================
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { listUsers, setUserStatus, setUserRole } from '../../lib/superadmin'
import { formatDate, initialOf } from '../../lib/format'
import { translateServerError } from '../../lib/constants'

const STATUS_FILTERS = [
  { key: 'all', label: 'Semua' },
  { key: 'active', label: 'Aktif' },
  { key: 'suspended', label: 'Suspended' },
]

const STATUS_META = {
  active: { label: 'Aktif', className: 'is-approved' },
  inactive: { label: 'Nonaktif', className: 'is-review' },
  suspended: { label: 'Suspended', className: 'is-rejected' },
}

const ROLE_LABELS = { consumer: 'Consumer', admin: 'Admin' }

export default function SysUsers() {
  const [rows, setRows] = useState([])
  const [state, setState] = useState('loading') // loading | ready | error
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmAction, setConfirmAction] = useState(null) // { kind, value, label }

  const load = useCallback(() => {
    setState('loading')
    setError('')
    listUsers()
      .then((data) => {
        setRows(data)
        setState('ready')
      })
      .catch((err) => {
        setError(err?.message || 'Gagal memuat user.')
        setState('error')
      })
  }, [])

  useEffect(() => {
    Promise.resolve().then(load)
  }, [load])

  const counts = useMemo(
    () => ({
      all: rows.length,
      active: rows.filter((r) => r.status === 'active').length,
      suspended: rows.filter((r) => r.status === 'suspended').length,
      admins: rows.filter((r) => r.role === 'admin').length,
      sellers: rows.filter((r) => r.is_seller).length,
    }),
    [rows],
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows
      .filter((r) => (filter === 'all' ? true : r.status === filter))
      .filter((r) =>
        q
          ? String(r.email || '').toLowerCase().includes(q) ||
            String(r.full_name || '').toLowerCase().includes(q)
          : true,
      )
  }, [rows, filter, query])

  const selected = rows.find((r) => r.id === selectedId) || null

  /** Semua aksi via RPC — hasil dari backend, bukan state lokal. */
  const runAction = async (fn, okMessage) => {
    if (!selected) return
    setBusyId(selected.id)
    setActionError('')
    setNotice('')
    try {
      await fn()
      setNotice(okMessage)
      setConfirmAction(null)
      load()
    } catch (err) {
      setActionError(translateServerError(err?.message))
    } finally {
      setBusyId(null)
    }
  }

  const statusMeta = (s) => STATUS_META[s] || { label: s, className: 'is-review' }

  return (
    <div className="sys-page">
      <header className="sys-page-head">
        <div>
          <h1>Users</h1>
          <p className="sys-page-sub">
            {counts.all} akun · {counts.sellers} seller · {counts.admins} admin — scope dari RLS
            (is_admin).
          </p>
          <button type="button" className="sys-btn sys-btn-ghost" onClick={load}>
            Muat ulang
          </button>
        </div>
        <div className="sys-pending" aria-live="polite">
          <span className="sys-pending-num">{counts.suspended}</span>
          <span className="sys-pending-label">akun di-suspend</span>
        </div>
      </header>

      {notice && <p className="sys-note sys-note-ok">{notice}</p>}
      {actionError && <p className="sys-note sys-note-err">⚠ {actionError}</p>}

      <nav className="sys-filters" aria-label="Filter status akun">
        {STATUS_FILTERS.map((f) => (
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
        <input
          type="search"
          className="sys-search"
          placeholder="Cari email / nama…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Cari user"
        />
      </nav>

      <div className="sys-content-cols">
        <section className="sys-list" aria-label="Daftar user">
          {state === 'loading' && (
            <div className="sys-empty">
              <p>Memuat user…</p>
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
              <p>Tidak ada user yang cocok.</p>
            </div>
          )}
          {state === 'ready' && visible.length > 0 && (
            <ul className="sys-list-items">
              {visible.map((u) => {
                const meta = statusMeta(u.status)
                const isActive = u.id === selectedId
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      className={`sys-row ${isActive ? 'is-active' : ''}`}
                      onClick={() => {
                        setSelectedId(u.id)
                        setActionError('')
                        setNotice('')
                        setConfirmAction(null)
                      }}
                      aria-current={isActive ? 'true' : undefined}
                    >
                      <span className="sys-row-avatar" aria-hidden="true">
                        {initialOf(u.full_name || u.email)}
                      </span>
                      <span className="sys-row-main">
                        <span className="sys-row-name">{u.full_name || u.email}</span>
                        <span className="sys-row-store">
                          {ROLE_LABELS[u.role] || u.role}
                          {u.is_seller ? ' · Seller' : ''}
                        </span>
                        <span className="sys-row-date">Daftar {formatDate(u.created_at)}</span>
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

        <section className="sys-detail" aria-label="Detail user">
          {selected ? (
            <article className="sys-card">
              <header className="sys-detail-head">
                <div>
                  <h2>{selected.full_name || '—'}</h2>
                  <p className="sys-detail-email">{selected.email}</p>
                </div>
                <span className={`sys-status-badge ${statusMeta(selected.status).className}`}>
                  {statusMeta(selected.status).label}
                </span>
              </header>

              <dl className="sys-kv">
                <div className="sys-kv-row">
                  <dt>Role</dt>
                  <dd>{ROLE_LABELS[selected.role] || selected.role}</dd>
                </div>
                <div className="sys-kv-row">
                  <dt>Seller</dt>
                  <dd>{selected.is_seller ? 'Ya (cache is_seller)' : 'Bukan'}</dd>
                </div>
                <div className="sys-kv-row">
                  <dt>Status</dt>
                  <dd>{statusMeta(selected.status).label}</dd>
                </div>
                <div className="sys-kv-row">
                  <dt>Terdaftar</dt>
                  <dd>{formatDate(selected.created_at)}</dd>
                </div>
                <div className="sys-kv-row">
                  <dt>ID</dt>
                  <dd>
                    <code>{selected.id}</code>
                  </dd>
                </div>
              </dl>

              {selected.status !== 'suspended' && selected.status !== 'inactive' && (
                <div className="sys-decision-actions">
                  <button
                    type="button"
                    className="sys-btn is-danger"
                    disabled={busyId === selected.id}
                    onClick={() =>
                      setConfirmAction({ kind: 'status', value: 'suspended', label: 'Suspend akun' })
                    }
                  >
                    Suspend akun
                  </button>
                  {selected.role !== 'admin' && (
                    <button
                      type="button"
                      className="sys-btn"
                      disabled={busyId === selected.id}
                      onClick={() =>
                        setConfirmAction({ kind: 'role', value: 'admin', label: 'Jadikan admin' })
                      }
                    >
                      Jadikan admin
                    </button>
                  )}
                </div>
              )}

              {selected.status === 'suspended' && (
                <div className="sys-decision-actions">
                  <button
                    type="button"
                    className="sys-btn is-approve"
                    disabled={busyId === selected.id}
                    onClick={() =>
                      setConfirmAction({ kind: 'status', value: 'active', label: 'Aktifkan akun' })
                    }
                  >
                    Aktifkan kembali
                  </button>
                </div>
              )}

              {confirmAction && (
                <div className={`sys-confirm ${confirmAction.kind === 'role' ? 'is-reject' : confirmAction.value === 'active' ? 'is-approve' : 'is-reject'}`}>
                  <p>
                    {confirmAction.kind === 'role'
                      ? `Ubah role ${selected.email} menjadi ${ROLE_LABELS[confirmAction.value]}?`
                      : `${confirmAction.label} untuk ${selected.email}?`}
                  </p>
                  <p className="sys-confirm-hint">
                    Dieksekusi server-side via RPC; setiap perubahan tercatat di audit log.
                    {confirmAction.kind === 'role' && ' Akun admin dapat mengakses seluruh modul kontrol.'}
                  </p>
                  <div className="sys-confirm-actions">
                    <button
                      type="button"
                      className="sys-btn-ghost"
                      disabled={busyId === selected.id}
                      onClick={() => setConfirmAction(null)}
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      className={`sys-btn ${confirmAction.value === 'active' ? 'is-approve' : 'is-danger'}`}
                      disabled={busyId === selected.id}
                      onClick={() =>
                        confirmAction.kind === 'status'
                          ? runAction(
                              () => setUserStatus(selected.id, confirmAction.value),
                              `Status akun diubah ke ${confirmAction.value}.`,
                            )
                          : runAction(
                              () => setUserRole(selected.id, confirmAction.value),
                              `Role diubah menjadi ${confirmAction.value}.`,
                            )
                      }
                    >
                      {busyId === selected.id ? 'Menyimpan…' : 'Ya, lanjutkan'}
                    </button>
                  </div>
                </div>
              )}

              <p className="sys-note" style={{ marginTop: 12 }}>
                Catatan: admin tidak dapat mengubah akunnya sendiri (server:
                <code> self_action_forbidden</code>).
              </p>
            </article>
          ) : (
            <div className="sys-empty">
              <p>Pilih user dari daftar untuk melihat detail dan aksi.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
