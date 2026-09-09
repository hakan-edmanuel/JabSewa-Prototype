import { useState } from 'react';
import ConsumerNavbar from '../components/Consumer/ConsumerNavbar';
import ConsumerHero from '../components/Consumer/ConsumerHero';
import ConsumerBrowser from '../components/Consumer/ConsumerBrowser';
import ConsumerFilters from '../components/Consumer/ConsumerFilters';
import Footer from '../components/Footer';
import ProductDetail from '../components/Consumer/ProductDetail';
import { ITEMS } from '../data/catalog';

/*
 * Halaman marketplace (mode penyewa). `initialItemId` dipakai untuk
 * langsung membuka detail barang — misalnya setelah login dari tombol
 * "Sewa sekarang" atau dari wishlist di Buyer Dashboard. App meremount
 * halaman ini (lewat `key`) setiap kali id berubah.
 */
export default function ConsumerPage({ onNavigate, onRequireAuth, initialItemId = null }) {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [priceRange, setPriceRange] = useState({ min: 0, max: 500000 });
  const [selectedProduct, setSelectedProduct] = useState(() =>
    initialItemId ? ITEMS.find((item) => item.id === Number(initialItemId)) || null : null,
  );

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

  return (
    <div className="consumer-page">
      <ConsumerNavbar onNavigate={onNavigate} currentPage="consumer" />
      <ConsumerHero onSearch={setSearchQuery} />

      <div className="consumer-main">
        <ConsumerFilters
          onCategoryChange={setSelectedCategory}
          onPriceChange={setPriceRange}
          currentCategory={selectedCategory}
        />

        <ConsumerBrowser
          category={selectedCategory}
          search={searchQuery}
          priceRange={priceRange}
          onSelect={setSelectedProduct}
        />
      </div>

      <Footer onNavigate={onNavigate} />
    </div>
  );
}