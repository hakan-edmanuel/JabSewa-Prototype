import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ROLE_CONSUMER, ROLE_ADMIN } from '../lib/roles'

/*
 * ============================================================================
 * DEV ROLE SWITCHER — JabSewa (DEV ONLY)
 * ============================================================================
 * Panel kecil khusus development: info sesi + logout cepat. HANYA dirender
 * pada build development (import.meta.env.DEV) — production build tidak
 * pernah memuat panel ini (pengaman juga ada di App.jsx Shell).
 *
 * ERD v2 (D1): role DB hanya consumer | admin. "Seller" bukan role — status
 * turunan dari kepemilikan store aktif (users.is_seller cache server).
 * Role server-side TIDAK pernah diubah dari frontend — hanya via SQL manual
 * oleh operator (bootstrap admin) atau RPC admin_set_user_role.
 * ============================================================================
 */

const ROLE_META = {
  [ROLE_CONSUMER]: { label: 'Consumer', emoji: '🧑' },
  [ROLE_ADMIN]: { label: 'Admin', emoji: '🛡️' },
}

export default function DevRoleSwitcher() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)

  // Pengaman tambahan: sembunyikan juga saat runtime produksi.
  if (!import.meta.env.DEV) return null

  return (
    <div className="dev-switcher">
      {open && (
        <div className="dev-switcher-panel">
          <p className="dev-switcher-title">Dev Mode — Info Sesi</p>
          <p className="dev-switcher-user">
            Aktif: <strong>{user?.name || 'Guest'}</strong> ({user?.role || '—'})
            {user?.isSeller ? ' · seller (store aktif)' : ''}
          </p>
          <div className="dev-switcher-actions">
            {Object.entries(ROLE_META).map(([role, meta]) => (
              <span
                key={role}
                className={`dev-switcher-btn ${user?.role === role ? 'is-active' : ''}`}
              >
                {meta.emoji} {meta.label}
              </span>
            ))}
          </div>
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
            Panel ini hanya muncul di build development. Role & akses seller
            diverifikasi server-side via Supabase Auth + RLS.
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
        {open ? '✕' : '🛠️'} {user?.role === ROLE_ADMIN ? 'Admin' : user?.role === ROLE_CONSUMER ? 'Consumer' : 'Guest'}
      </button>
    </div>
  )
}
