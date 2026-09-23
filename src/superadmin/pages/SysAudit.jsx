/*
 * ============================================================================
 * SYS AUDIT — JabSewa (MODE MOCK / OFFLINE)
 * ============================================================================
 * Tampilan audit_logs: aksi, target, aktor, waktu, IP perangkat.
 *
 * Sumber data: koleksi `audit_logs` di LocalStorage (src/lib/storage.js)
 * via lib/superadmin.listAuditLogs — tidak ada lagi RPC Supabase.
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
    listAuditLogs(100).then((data) => {
      if (!active) return
      setRows(Array.isArray(data) ? data : [])
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="sys-page">
      <header className="sys-page-head">
        <div>
          <h1>Audit Log</h1>
          <p className="sys-page-sub">
            Jejak setiap aksi superadmin — tersimpan lokal di perangkat ini (LocalStorage).
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
              <th>IP</th>
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
                    {r.target_type ? `${r.target_type}:${r.target_id}` : '—'}
                  </td>
                  <td>{r.ip_address || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
