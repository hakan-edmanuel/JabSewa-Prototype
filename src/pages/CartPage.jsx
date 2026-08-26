import SimpleNavbar from '../components/SimpleNavbar';
import Footer from '../components/Footer';

export default function CartPage({ onNavigate }) {
  return (
    <div className="page-shell page-cart-shell">
      <SimpleNavbar onNavigate={onNavigate} />
      <main className="cart-page-main">
        <h1 className="cart-page-title">Keranjang Belanja</h1>
        <div className="cart-empty-card">
          <div className="cart-empty-icon">🛒</div>
          <h2 className="cart-empty-title">Keranjang Anda masih kosong</h2>
          <p className="cart-empty-subtitle">Belum ada barang yang disimpan untuk disewa.</p>
          <button
            onClick={() => onNavigate('consumer')}
            className="primary-button cart-empty-btn"
          >
            Mulai Cari Barang
          </button>
        </div>
      </main>
      <Footer onNavigate={onNavigate} />
    </div>
  );
}