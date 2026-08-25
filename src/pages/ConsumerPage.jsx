import { useState } from 'react';
import ConsumerNavbar from '../components/Consumer/ConsumerNavbar';
import ConsumerHero from '../components/Consumer/ConsumerHero';
import ConsumerBrowser from '../components/Consumer/ConsumerBrowser';
import ConsumerFilters from '../components/Consumer/ConsumerFilters';
import ConsumerFooter from '../components/Consumer/ConsumerFooter';
import ProductDetail from '../components/Consumer/ProductDetail';

export default function ConsumerPage({ onNavigate }) {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [priceRange, setPriceRange] = useState({ min: 0, max: 500000 });
  const [selectedProduct, setSelectedProduct] = useState(null);

  if (selectedProduct) return <ProductDetail item={selectedProduct} onBack={() => setSelectedProduct(null)} />;

  return (
    <div className="consumer-page">
      <ConsumerNavbar onNavigate={onNavigate} />
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
      
      <ConsumerFooter />
    </div>
  );
}
