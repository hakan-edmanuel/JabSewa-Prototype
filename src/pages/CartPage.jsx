import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export default function CartPage({ onNavigate }) {
  return (
    <div className="page-shell" style={{ background: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar onNavigate={onNavigate} />
      <main style={{ flex: 1, padding: '40px 20px', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '24px', color: '#1e293b' }}>Keranjang Belanja</h1>
        <div style={{ background: 'white', borderRadius: '16px', padding: '40px', textAlign: 'center', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
          <div style={{ fontSize: '4rem', marginBottom: '16px' }}>🛒</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Keranjang Anda masih kosong</h2>
          <p style={{ color: '#64748b', marginBottom: '24px' }}>Belum ada barang yang disimpan untuk disewa.</p>
          <button 
            onClick={() => onNavigate('consumer')}
            style={{ background: '#4f46e5', color: 'white', padding: '12px 24px', borderRadius: '8px', fontWeight: '600', border: 'none', cursor: 'pointer' }}
          >
            Mulai Cari Barang
          </button>
        </div>
      </main>
      <Footer onNavigate={onNavigate} />
    </div>
  );
}