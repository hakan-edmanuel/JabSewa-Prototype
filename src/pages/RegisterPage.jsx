import SimpleNavbar from '../components/SimpleNavbar';
import Footer from '../components/Footer';

export default function RegisterPage({ onNavigate }) {
  return (
    <div className="page-shell" style={{ background: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SimpleNavbar onNavigate={onNavigate} />
      <main style={{ flex: 1, padding: '40px 20px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ background: 'white', borderRadius: '24px', padding: '40px', width: '100%', maxWidth: '400px', border: '1px solid #e2e8f0' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '8px', color: '#0f172a', textAlign: 'center' }}>Daftar / Masuk</h1>
          <p style={{ color: '#64748b', textAlign: 'center', marginBottom: '32px' }}>Bergabung dengan komunitas JabSewa.</p>
          
          <form onSubmit={(e) => { e.preventDefault(); onNavigate('home'); }}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Email</label>
              <input type="email" required placeholder="Masukkan email Anda" style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '1rem' }} />
            </div>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Password</label>
              <input type="password" required placeholder="Masukkan password" style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '1rem' }} />
            </div>
            <button type="submit" style={{ width: '100%', background: '#fbbf24', color: '#0f172a', padding: '14px', borderRadius: '12px', border: 'none', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer' }}>
              Masuk / Daftar
            </button>
          </form>
        </div>
      </main>
      <Footer onNavigate={onNavigate} />
    </div>
  );
}