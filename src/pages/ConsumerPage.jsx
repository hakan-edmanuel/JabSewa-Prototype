import { useEffect, useState } from 'react';
import ConsumerNavbar from '../components/Consumer/ConsumerNavbar';
import ConsumerHero from '../components/Consumer/ConsumerHero';
import ConsumerBrowser from '../components/Consumer/ConsumerBrowser';
import ConsumerFilters from '../components/Consumer/ConsumerFilters';
import Footer from '../components/Footer';
import ProductDetail from '../components/Consumer/ProductDetail';
import { fetchListings } from '../lib/listings';

/*
 * Halaman marketplace (mode penyewa). `initialItemId` dipakai untuk
 * langsung membuka detail barang — misalnya setelah login dari tombol
 * "Sewa sekarang" atau dari wishlist di Buyer Dashboard. App meremount
 * halaman ini (lewat `key`) setiap kali id berubah.
 */
export default function ConsumerPage({ onNavigate, onRequireAuth, initialItemId = null }) {
  const [selectedCategory, setSelectedCategory] = useState(null);
  // Query pencarian digabung dari dua sumber: input hero + tag populer.
  const [searchQuery, setSearchQuery] = useState('');
  const [priceRange, setPriceRange] = useState({ min: 0, max: 500000 });
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [loadError, setLoadError] = useState('');

  // Sumber data barang dari LocalStorage store (via lib/listings).
  // Resolusi detail awal (deep-link dari wishlist / featured) dilakukan
  // sekali saat data pertama datang; detail selanjutnya via klik kartu.
  useEffect(() => {
    let active = true;
    fetchListings()
      .then((data) => {
        if (!active) return;
        if (initialItemId) {
          const found = data.find((item) => String(item.id) === String(initialItemId));
          if (found) setSelectedProduct(found);
        }
      })
      .catch(() => {
        if (active) setLoadError('Gagal memuat katalog. Coba muat ulang halaman.');
      });
    return () => {
      active = false;
    };
  }, [initialItemId]);

  if (selectedProduct) {
    return (
      <ProductDetail
        item={selectedProduct}
        onBack={() => setSelectedProduct(null)}
        onNavigate={onNavigate}
        onRequireAuth={onRequireAuth}
      />
    );
  }

  const effectiveSearch = searchQuery;

  return (
    <div className="consumer-page">
      <ConsumerNavbar onNavigate={onNavigate} currentPage="consumer" />
      <ConsumerHero onSearch={setSearchQuery} />

      {loadError && (
        <div className="consumer-browser">
          <div className="no-results">
            <p className="no-results-text">{loadError}</p>
          </div>
        </div>
      )}

      {!loadError && (
        <div className="consumer-main">
          <ConsumerFilters
            onCategoryChange={setSelectedCategory}
            onPriceChange={setPriceRange}
            currentCategory={selectedCategory}
          />

          <ConsumerBrowser
            category={selectedCategory}
            search={effectiveSearch}
            priceRange={priceRange}
            onSelect={setSelectedProduct}
          />
        </div>
      )}

      <Footer onNavigate={onNavigate} />
    </div>
  );
}
