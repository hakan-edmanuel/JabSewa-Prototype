import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import logo from '../assets/logo-jabsewa.jpeg'

/*
 * Halaman login/daftar. Mode ditentukan dari route (/login vs /register).
 * Setelah berhasil, onAuthenticated(user) meneruskan ke tujuan semula
 * (barang yang ingin disewa, onboarding seller, atau buyer dashboard).
 */
export default function AuthPage({ onNavigate, mode, onAuthenticated, intent }) {
  const { login, register } = useAuth()
  const isLogin = mode === 'login'
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const data = new FormData(e.currentTarget)
    try {
      const user = isLogin
        ? await login({ email: data.get('email'), password: data.get('password') })
        : await register({ name: data.get('name'), email: data.get('email'), password: data.get('password') })
      onAuthenticated(user)
    } catch (err) {
      setError(err?.message || 'Gagal masuk. Coba lagi.')
    }
  }

  const intentNote =
    intent?.page === 'seller'
      ? 'Kamu akan diarahkan untuk mengaktifkan tokomu setelah masuk.'
      : intent?.page === 'buyer'
        ? 'Kamu akan diarahkan ke dashboard setelah masuk.'
        : intent?.page === 'profile'
          ? 'Kamu akan diarahkan ke profil setelah masuk.'
        : intent?.page === 'consumer'
          ? 'Kamu akan kembali ke barang yang ingin disewa setelah masuk.'
          : null

  return (
    <div className="page-shell page-auth-shell">
      <header className="auth-topbar">
        <div className="auth-topbar-inner">
          <button className="logo-button" onClick={() => onNavigate('home')} aria-label="Kembali ke beranda">
            <img src={logo} alt="Logo JabSewa" className="logo-image" />
            <span className="logo-text">JabSewa</span>
          </button>
        </div>
      </header>

      <main className="auth-page-main">
        <div className="auth-card">
          <h1 className="auth-title">{isLogin ? 'Masuk ke JabSewa' : 'Daftar JabSewa'}</h1>
          <p className="auth-subtitle">
            {isLogin
              ? 'Masuk untuk melanjutkan sewa atau kelola barangmu.'
              : 'Buat akun untuk mulai menyewa atau menyewakan barang. Satu akun untuk dua sisi.'}
          </p>

          {intentNote && <p className="auth-context-note">{intentNote}</p>}
          {error && <p className="auth-error">{error}</p>}

          <form onSubmit={handleSubmit}>
            {!isLogin && (
              <div className="auth-field">
                <label className="auth-label" htmlFor="auth-name">Nama lengkap</label>
                <input id="auth-name" name="name" type="text" required placeholder="Nama kamu" className="auth-input" />
              </div>
            )}
            <div className="auth-field">
              <label className="auth-label" htmlFor="auth-email">Email</label>
              <input id="auth-email" name="email" type="email" required placeholder="nama@email.com" className="auth-input" />
            </div>
            <div className="auth-field">
              <label className="auth-label" htmlFor="auth-password">Password</label>
              <input id="auth-password" name="password" type="password" required placeholder="Minimal 8 karakter" className="auth-input" minLength={8} />
            </div>
            <button type="submit" className="auth-submit-btn">
              {isLogin ? 'Masuk' : 'Daftar'}
            </button>
          </form>

          <p className="auth-switch">
            {isLogin ? 'Belum punya akun?' : 'Sudah punya akun?'}{' '}
            <button
              type="button"
              className="auth-switch-link"
              onClick={() => onNavigate('auth', { mode: isLogin ? 'register' : 'login' })}
            >
              {isLogin ? 'Daftar' : 'Masuk'}
            </button>
          </p>

          <p className="auth-note">
            Dengan melanjutkan, kamu menyetujui Syarat Layanan dan Kebijakan Privasi JabSewa.
          </p>
        </div>
      </main>
    </div>
  )
}