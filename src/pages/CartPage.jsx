import SimpleNavbar from '../components/SimpleNavbar';
import Footer from '../components/Footer';

export default function CartPage({ onNavigate }) {
  return (
    <div className="page-shell page-cart-shell">
      <SimpleNavbar onNavigate={onNavigate} />
      <main className="cart-page-main">
        <h1 className="cart-page-title">Keranjang Belanja</h1>
        <div className="cart-empty-card">
          <h2 className="cart-empty-title">Belum ada barang di keranjang</h2>
          <p className="cart-empty-subtitle">Barang yang kamu pilih untuk disewa akan muncul di sini.</p>
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