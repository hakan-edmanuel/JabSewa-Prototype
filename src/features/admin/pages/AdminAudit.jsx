/*
 * ============================================================================
 * SYS AUDIT — JabSewa (ERD v2)
 * ============================================================================
 * Tampilan audit_logs: aktor → aksi → target → waktu, dengan label terbaca.
 *
 * Sumber data: RPC list_audit_logs (admin-only di dalam RPC; RLS audit_logs
 * juga admin-only), maksimum 500 baris per panggilan. Halaman ini meminta 100
 * aksi terbaru — dicantumkan eksplisit karena daftar yang lebih pendek BUKAN
 * bukti bahwa aksi lain tidak pernah terjadi.
 *
 * Audit hanya-baca: tidak ada kontrol ubah/hapus di UI. Kegagalan query
 * ditampilkan sebagai error + coba lagi, bukan sebagai "belum ada aksi".
 * ============================================================================
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { listAuditLogs } from '../../../data/admin'
import { formatDateTime, formatPrice } from '../../../domain/format'
import { auditActionMeta, auditEntityLabel, AUDIT_GROUP_LABELS } from '../auditLabels'

const AUDIT_LIMIT = 100

const GROUP_FILTERS = Object.entries(AUDIT_GROUP_LABELS).map(([key, label]) => ({ key, label }))

/** Nilai metadata ringkas: rupiah untuk key nominal, teks untuk sisanya. */
function metaValue(key, value) {
  if (value == null) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  if (['total', 'amount', 'daily_rate'].includes(key) && Number.isFinite(Number(value))) {
    return formatPrice(Number(value))
  }
  return String(value)
}

/** Ringkas metadata jsonb → "key: value · key: value" (maks 3). */
function metaSummary(metadata) {
  if (!metadata || typeof metadata !== 'object') return '—'
  const parts = Object.entries(metadata)
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${metaValue(key, value)}`)
  return parts.length ? parts.join(' · ') : '—'
}

export default function AdminAudit() {
  const [rows, setRows] = useState([])
  const [state, setState] = useState('loading') // loading | ready | error
  const [filter, setFilter] = useState('all')

  const load = useCallback(() => {
    setState('loading')
    return listAuditLogs(AUDIT_LIMIT)
      .then((data) => {
        setRows(Array.isArray(data) ? data : [])
        setState('ready')
      })
      .catch(() => {
        setRows([])
        setState('error')
      })
  }, [])

  useEffect(() => {
    Promise.resolve().then(load)
  }, [load])

  const counts = useMemo(() => {
    const next = { all: rows.length }
    rows.forEach((row) => {
      const group = auditActionMeta(row.action).group
      next[group] = (next[group] || 0) + 1
    })
    return next
  }, [rows])

  const visible = useMemo(
    () =>
      filter === 'all'
        ? rows
        : rows.filter((row) => auditActionMeta(row.action).group === filter),
    [rows, filter],
  )

  return (
    <div className="sys-page">
      <header className="sys-page-head">
        <div>
          <h1>Audit Log</h1>
          <p className="sys-page-sub">
            Jejak aksi sensitif yang ditulis server-side oleh RPC ke tabel{' '}
            <code>audit_logs</code>. Hanya-baca.
          </p>
          <button type="button" className="sys-btn-ghost" onClick={load} disabled={state === 'loading'}>
            {state === 'loading' ? 'Memuat…' : 'Muat ulang'}
          </button>
        </div>
        <div className="sys-pending" aria-live="polite">
          <span className="sys-pending-num">{state === 'ready' ? rows.length : '—'}</span>
          <span className="sys-pending-label">aksi terakhir dimuat</span>
        </div>
      </header>

      <nav className="sys-filters" aria-label="Filter kategori audit">
        {GROUP_FILTERS.map((group) => (
          <button
            key={group.key}
            type="button"
            className={`sys-filter ${filter === group.key ? 'is-active' : ''}`}
            aria-pressed={filter === group.key}
            onClick={() => setFilter(group.key)}
          >
            {group.label}
            <span className="sys-filter-count">
              {state === 'ready' ? counts[group.key] ?? 0 : '—'}
            </span>
          </button>
        ))}
      </nav>

      <section className="sys-panel" aria-label="Jejak audit">
        {state === 'loading' && (
          <p className="sys-note" role="status">
            Memuat audit log…
          </p>
        )}

        {state === 'error' && (
          <div className="sys-empty" role="alert">
            <p>Gagal memuat audit log. Periksa koneksi, lalu coba lagi.</p>
            <button type="button" className="sys-btn-ghost" onClick={load}>
              Coba lagi
            </button>
          </div>
        )}

        {state === 'ready' && rows.length === 0 && (
          <div className="sys-empty">
            <p>Belum ada aksi tercatat pada audit log.</p>
          </div>
        )}

        {state === 'ready' && rows.length > 0 && visible.length === 0 && (
          <div className="sys-empty">
            <p>Tidak ada aksi pada kategori ini dalam {AUDIT_LIMIT} baris terakhir.</p>
          </div>
        )}

        {state === 'ready' && visible.length > 0 && (
          <div className="sys-table-wrap">
            <table className="sys-table" aria-label="Jejak audit admin">
              <thead>
                <tr>
                  <th scope="col">Waktu</th>
                  <th scope="col">Aksi</th>
                  <th scope="col">Aktor</th>
                  <th scope="col">Target</th>
                  <th scope="col">Detail</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row, index) => {
                  const meta = auditActionMeta(row.action)
                  return (
                    <tr key={row.id ?? `${row.action}-${index}`}>
                      <td className="sys-audit-when">{formatDateTime(row.created_at)}</td>
                      <td>
                        <span className={`sys-audit-badge is-${meta.tone}`}>{meta.label}</span>
                        <span className="sys-audit-code">{row.action}</span>
                      </td>
                      <td className="sys-audit-actor">{row.actor_email || '—'}</td>
                      <td>
                        <span className="sys-audit-target">{auditEntityLabel(row.target_type)}</span>
                        {row.target_id && (
                          <span className="sys-audit-target-id" title={String(row.target_id)}>
                            {String(row.target_id).slice(0, 8)}…
                          </span>
                        )}
                      </td>
                      <td className="sys-audit-meta">{metaSummary(row.metadata)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="sys-note">
        Menampilkan maksimum {AUDIT_LIMIT} aksi terbaru. Aksi yang tidak muncul di sini belum tentu
        tidak pernah terjadi — riwayat lebih lama tidak dimuat oleh halaman ini. Catatan audit tidak
        dapat diubah atau dihapus dari antarmuka.
      </p>
    </div>
  )
}
