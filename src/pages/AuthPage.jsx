import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import logo from '../assets/logo-jabsewa.jpeg'

/*
 * Halaman login/daftar. Mode ditentukan dari route (/login vs /register).
 * Setelah berhasil, onAuthenticated(user) meneruskan ke tujuan semula
 * (barang yang ingin disewa, onboarding seller, atau buyer dashboard).
 *
 * Auth mock lokal (LocalStorage):
 * - Akun diverifikasi terhadap koleksi `users` (seed: superadmin/tenant/owner).
 * - Email belum terdaftar / password salah diterjemahkan ke pesan Indonesia.
 */

const ERROR_TRANSLATIONS = [
  { match: /invalid login credentials/i, message: 'Email atau password salah.' },
  { match: /user already registered/i, message: 'Email sudah terdaftar. Coba masuk saja.' },
  { match: /password should be at least/i, message: 'Password minimal 6 karakter.' },
]

function translateError(message) {
  if (!message) return 'Gagal masuk. Coba lagi.'
  const found = ERROR_TRANSLATIONS.find((rule) => rule.match.test(message))
  return found ? found.message : message
}

export default function AuthPage({ onNavigate, mode, onAuthenticated, intent }) {
  const { login, register } = useAuth()
  const isLogin = mode === 'login'
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)
    const data = new FormData(e.currentTarget)
    const email = data.get('email')
    const password = data.get('password')
    try {
      if (isLogin) {
        const user = await login({ email, password })
        onAuthenticated(user)
      } else {
        const name = data.get('name')
        const user = await register({ name, email, password })
        onAuthenticated(user)
      }
    } catch (err) {
      setError(translateError(err?.message))
    } finally {
      setIsSubmitting(false)
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
              <input id="auth-password" name="password" type="password" required placeholder="Minimal 6 karakter" className="auth-input" minLength={6} />
            </div>
            <button type="submit" className="auth-submit-btn" disabled={isSubmitting}>
              {isSubmitting ? 'Memproses…' : isLogin ? 'Masuk' : 'Daftar'}
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

          <p className="auth-demo-note">
            Akun demo — penyewa: tenant@jabsewa.id / tenant123 · toko: owner@jabsewa.id / owner123
          </p>
        </div>
      </main>
    </div>
  )
}
