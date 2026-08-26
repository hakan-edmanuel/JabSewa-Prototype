import SimpleNavbar from '../components/SimpleNavbar';
import Footer from '../components/Footer';

export default function RegisterPage({ onNavigate }) {
  return (
    <div className="page-shell page-auth-shell">
      <SimpleNavbar onNavigate={onNavigate} />
      <main className="auth-page-main">
        <div className="auth-card">
          <h1 className="auth-title">Daftar / Masuk</h1>
          <p className="auth-subtitle">Bergabung dengan komunitas JabSewa.</p>

          <form onSubmit={(e) => { e.preventDefault(); onNavigate('home'); }}>
            <div className="auth-field">
              <label className="auth-label">Email</label>
              <input type="email" required placeholder="Masukkan email Anda" className="auth-input" />
            </div>
            <div className="auth-field">
              <label className="auth-label">Password</label>
              <input type="password" required placeholder="Masukkan password" className="auth-input" />
            </div>
            <button type="submit" className="auth-submit-btn">
              Masuk / Daftar
            </button>
          </form>
        </div>
      </main>
      <Footer onNavigate={onNavigate} />
    </div>
  );
}