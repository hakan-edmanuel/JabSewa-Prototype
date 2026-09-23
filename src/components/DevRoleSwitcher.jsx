import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { resetDemoData } from '../lib/storage'
import { ROLE_TENANT, ROLE_STORE_OWNER, ROLE_SUPERADMIN } from '../lib/roles'

/*
 * ============================================================================
 * DEV ROLE SWITCHER — JabSewa (MODE MOCK / OFFLINE)
 * ============================================================================
 * Panel kecil khusus demo/testing untuk berganti role aktif dengan satu klik:
 *   TENANT <-> STORE_OWNER <-> SUPERADMIN
 *
 * Cara pakai:
 *   - Melayang di pojok kanan bawah.
 *   - Selalu tampil di mode mock (tidak ada lagi role server-side).
 *   - "Reset Data Demo" mengembalikan seluruh LocalStorage ke seed awal.
 *
 * PENTING: JANGAN dipakai di produksi nyata — hanya alat demo frontend.
 * ============================================================================
 */

const ROLE_META = {
  [ROLE_TENANT]: { label: 'Tenant', emoji: '🧑' },
  [ROLE_STORE_OWNER]: { label: 'Store Owner', emoji: '🏪' },
  [ROLE_SUPERADMIN]: { label: 'Superadmin', emoji: '🛡️' },
}

export default function DevRoleSwitcher() {
  const { user, switchRole, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  const handleSwitch = (role) => {
    if (role !== user?.role) switchRole(role)
    setConfirmReset(false)
  }

  return (
    <div className="dev-switcher">
      {open && (
        <div className="dev-switcher-panel">
          <p className="dev-switcher-title">Dev Mode — Ganti Role</p>
          <p className="dev-switcher-user">
            Aktif: <strong>{user?.name || 'Guest'}</strong> ({user?.role || '—'})
          </p>
          <div className="dev-switcher-actions">
            {Object.entries(ROLE_META).map(([role, meta]) => (
              <button
                key={role}
                type="button"
                className={`dev-switcher-btn ${user?.role === role ? 'is-active' : ''}`}
                onClick={() => handleSwitch(role)}
              >
                {meta.emoji} {meta.label}
              </button>
            ))}
          </div>
          <div className="dev-switcher-divider" />
          {confirmReset ? (
            <div className="dev-switcher-actions">
              <button
                type="button"
                className="dev-switcher-btn is-danger"
                onClick={() => {
                  resetDemoData()
                  window.location.href = '/'
                }}
              >
                ⚠️ Ya, reset semua
              </button>
              <button type="button" className="dev-switcher-btn" onClick={() => setConfirmReset(false)}>
                Batal
              </button>
            </div>
          ) : (
            <button type="button" className="dev-switcher-btn is-warning" onClick={() => setConfirmReset(true)}>
              ♻️ Reset Data Demo
            </button>
          )}
          <div className="dev-switcher-divider" />
          <button
            type="button"
            className="dev-switcher-btn"
            onClick={async () => {
              await logout()
              window.location.href = '/'
            }}
          >
            🚪 Keluar (logout)
          </button>
          <p className="dev-switcher-hint">
            Akun demo: admin@jabsewa.id / admin123 · owner@jabsewa.id / owner123 · tenant@jabsewa.id / tenant123
          </p>
        </div>
      )}
      <button
        type="button"
        className="dev-switcher-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Dev role switcher"
      >
        {open ? '✕' : '🛠️'} {ROLE_META[user?.role]?.label || 'Guest'}
      </button>
    </div>
  )
}
