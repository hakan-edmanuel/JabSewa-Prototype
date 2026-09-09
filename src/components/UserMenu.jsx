import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'

/*
 * Chip profil + dropdown kecil (profil, keluar).
 * Dipakai di semua navbar untuk user yang sudah login.
 */
export default function UserMenu({ onLogout, onNavigate }) {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)

  const initial = (user?.name || user?.email || '?').charAt(0).toUpperCase()

  const handleLogout = async () => {
    setOpen(false)
    await logout()
    onLogout?.()
  }

  return (
    <div className="user-menu">
      <button
        type="button"
        className="profile-btn avatar-initial"
        onClick={() => setOpen((o) => !o)}
        aria-label="Menu profil"
        aria-expanded={open}
      >
        {initial}
      </button>
      {open && (
        <div className="profile-dropdown-menu is-open">
          <div className="dropdown-header">
            <span className="dropdown-name">{user?.name}</span>
            <span className="dropdown-email">{user?.email}</span>
          </div>
          <div className="dropdown-divider"></div>
          {onNavigate && (
            <button
              type="button"
              className="dropdown-item"
              onClick={() => {
                setOpen(false)
                onNavigate('profile')
              }}
            >
              Profil
            </button>
          )}
          {onNavigate && <div className="dropdown-divider"></div>}
          <button type="button" className="dropdown-item text-danger" onClick={handleLogout}>
            Keluar
          </button>
        </div>
      )}
    </div>
  )
}