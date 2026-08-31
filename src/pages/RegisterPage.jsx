import { useState } from 'react';
import logo from '../assets/logo-jabsewa.jpeg';

export default function RegisterPage({ onNavigate }) {
  const [mode, setMode] = useState('login');
  const isLogin = mode === 'login';

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
              : 'Buat akun untuk mulai menyewa atau menyewakan barang.'}
          </p>

          <form onSubmit={(e) => { e.preventDefault(); onNavigate('home'); }}>
            {!isLogin && (
              <div className="auth-field">
                <label className="auth-label" htmlFor="auth-name">Nama lengkap</label>
                <input id="auth-name" type="text" required placeholder="Nama kamu" className="auth-input" />
              </div>
            )}
            <div className="auth-field">
              <label className="auth-label" htmlFor="auth-email">Email</label>
              <input id="auth-email" type="email" required placeholder="nama@email.com" className="auth-input" />
            </div>
            <div className="auth-field">
              <label className="auth-label" htmlFor="auth-password">Password</label>
              <input id="auth-password" type="password" required placeholder="Minimal 8 karakter" className="auth-input" minLength={8} />
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
              onClick={() => setMode(isLogin ? 'register' : 'login')}
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
  );
}