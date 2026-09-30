/*
 * ============================================================================
 * SYS AUDIT — JabSewa (ERD v2)
 * ============================================================================
 * Tampilan audit_logs: aksi, target, aktor, waktu, metadata ringkas.
 *
 * Sumber data: RPC list_audit_logs (admin-only di dalam RPC; RLS audit_logs
 * juga admin-only). Metadata jsonb diringkas menjadi pasangan key:value.
 * ============================================================================
 */

import { useEffect, useState } from 'react'
import { listAuditLogs } from '../../lib/superadmin'
import { formatDateTime } from '../../lib/format'

export default function SysAudit() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    listAuditLogs(100)
      .then((data) => {
        if (!active) return
        setRows(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => {
        if (active) {
          setRows([])
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [])

  /** Ringkas metadata jsonb → "key: value · key: value". */
  const metaSummary = (metadata) => {
    if (!metadata || typeof metadata !== 'object') return '—'
    const parts = Object.entries(metadata)
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}`)
    return parts.length ? parts.join(' · ') : '—'
  }

  return (
    <div className="sys-page">
      <header className="sys-page-head">
        <div>
          <h1>Audit Log</h1>
          <p className="sys-page-sub">
            Jejak setiap aksi sensitif — ditulis server-side oleh RPC (Supabase audit_logs).
          </p>
        </div>
      </header>

      <div className="sys-panel">
        <table className="sys-table">
          <thead>
            <tr>
              <th>Waktu</th>
              <th>Aksi</th>
              <th>Oleh</th>
              <th>Target</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5}>Memuat…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5}>Belum ada aksi tercatat.</td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={r.id ?? `${r.action}-${i}`}>
                  <td>{formatDateTime(r.created_at)}</td>
                  <td>
                    <code>{r.action}</code>
                  </td>
                  <td>{r.actor_email || '—'}</td>
                  <td>
                    {r.target_type ? `${r.target_type}:${String(r.target_id).slice(0, 8)}…` : '—'}
                  </td>
                  <td className="sys-audit-meta">{metaSummary(r.metadata)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
