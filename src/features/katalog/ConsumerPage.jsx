import { useEffect, useState } from 'react';
import ConsumerNavbar from './ConsumerNavbar';
import ConsumerHero from './ConsumerHero';
import ConsumerBrowser from './ConsumerBrowser';
import ConsumerFilters from './ConsumerFilters';
import Footer from '../../ui/Footer';
import ProductDetail from './ProductDetail';
import { fetchListingById } from '../../data/listings';
import { PRICE_FILTER_MAX } from '../../domain/constants';

/*
 * Halaman marketplace (mode penyewa).
 *
 * `initialItemId` dipakai untuk langsung membuka detail barang — misalnya
 * setelah login dari tombol "Sewa sekarang" atau dari wishlist di dashboard
 * penyewa. App meremount halaman ini (lewat `key`) setiap kali id berubah.
 *
 * Sumber data katalog ada di ConsumerBrowser (hybridSearch). Halaman ini TIDAK
 * lagi mengambil seluruh katalog hanya untuk menemukan satu item deep-link:
 * cukup fetchListingById(id) — satu request, satu pesan error.
 */
/** Jeda sebelum query dipakai — satu permintaan per jeda, bukan per ketikan. */
const SEARCH_DEBOUNCE_MS = 250;

export default function ConsumerPage({ onNavigate, onRequireAuth, initialItemId = null }) {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [maxPrice, setMaxPrice] = useState(PRICE_FILTER_MAX);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [detailError, setDetailError] = useState('');

  // Input tetap responsif; hanya query yang dikirim ke pencarian yang ditunda.
  useEffect(() => {
    const timer = setTimeout(() => setActiveSearch(searchQuery), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (!initialItemId) return undefined;

    let active = true;
    fetchListingById(initialItemId)
      .then((item) => {
        if (!active) return;
        if (item) setSelectedProduct(item);
        else setDetailError('Barang tidak ditemukan atau sudah tidak aktif.');
      })
      .catch(() => {
        if (active) setDetailError('Gagal memuat detail barang. Coba muat ulang halaman.');
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

  return (
    <div className="consumer-page">
      <ConsumerNavbar onNavigate={onNavigate} currentPage="consumer" />
      <ConsumerHero onSearch={setSearchQuery} />

      {detailError && (
        <div className="consumer-browser">
          <div className="no-results">
            <p className="no-results-text">{detailError}</p>
          </div>
        </div>
      )}

      <div className="consumer-main">
        <ConsumerFilters
          onCategoryChange={setSelectedCategory}
          onPriceChange={setMaxPrice}
          currentCategory={selectedCategory}
        />

        <ConsumerBrowser
          category={selectedCategory}
          search={activeSearch}
          maxPrice={maxPrice}
          onSelect={setSelectedProduct}
        />
      </div>

      <Footer onNavigate={onNavigate} />
    </div>
  );
}
