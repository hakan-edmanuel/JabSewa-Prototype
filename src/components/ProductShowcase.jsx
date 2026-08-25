import { useState } from 'react';

const categories = [
  { id: 1, name: 'Gadget', icon: '📱', count: 342 },
  { id: 2, name: 'Furniture', icon: '🏠', count: 256 },
  { id: 3, name: 'Event & Party', icon: '🎉', count: 189 },
  { id: 4, name: 'Kendaraan', icon: '🚗', count: 127 },
  { id: 5, name: 'Olahraga', icon: '⚽', count: 95 },
  { id: 6, name: 'Fotografi', icon: '📷', count: 78 },
];

const products = [
  {
    id: 1,
    name: 'MacBook Pro 14"',
    category: 'Gadget',
    price: 50000,
    rating: 4.9,
    reviews: 128,
    image: '💻',
    seller: 'TechRent',
    verified: true,
  },
  {
    id: 2,
    name: 'Sofa Kulit Premium',
    category: 'Furniture',
    price: 150000,
    rating: 4.7,
    reviews: 64,
    image: '🛋️',
    seller: 'FurniRent',
    verified: true,
  },
  {
    id: 3,
    name: 'Camping Tent Set',
    category: 'Olahraga',
    price: 75000,
    rating: 4.8,
    reviews: 92,
    image: '⛺',
    seller: 'AdventureGear',
    verified: true,
  },
  {
    id: 4,
    name: 'Canon EOS R5',
    category: 'Fotografi',
    price: 200000,
    rating: 4.95,
    reviews: 156,
    image: '📸',
    seller: 'PhotoPro',
    verified: true,
  },
  {
    id: 5,
    name: 'PlayStation 5',
    category: 'Gadget',
    price: 80000,
    rating: 4.6,
    reviews: 203,
    image: '🎮',
    seller: 'GamingHub',
    verified: true,
  },
  {
    id: 6,
    name: 'Drone DJI Air 3',
    category: 'Gadget',
    price: 120000,
    rating: 4.85,
    reviews: 87,
    image: '🚁',
    seller: 'DroneStore',
    verified: true,
  },
];

export default function ProductShowcase() {
  const [selectedCategory, setSelectedCategory] = useState(null);

  const filteredProducts = selectedCategory
    ? products.filter(p => p.category === selectedCategory)
    : products;

  return (
    <section className="product-section" id="kategori">
      <div className="container">
        {/* Section Header */}
        <div className="section-header">
          <h2 className="section-title">Jelajahi Kategori</h2>
          <p className="section-subtitle">Pilih kategori barang yang ingin kamu sewa</p>
        </div>

        {/* Categories Filter */}
        <div className="categories-grid">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(selectedCategory === cat.name ? null : cat.name)}
              className={`category-btn ${selectedCategory === cat.name ? 'active' : ''}`}
            >
              <div className="category-icon">{cat.icon}</div>
              <p className="category-name">{cat.name}</p>
              <p className="category-count">{cat.count} items</p>
            </button>
          ))}
        </div>

        {/* Products Grid */}
        <div className="products-grid">
          {filteredProducts.map(product => (
            <div key={product.id} className="product-card">
              {/* Product Image */}
              <div className="product-image">{product.image}</div>

              {/* Product Info */}
              <div className="product-info">
                <div className="product-header">
                  <h3 className="product-name">{product.name}</h3>
                  {product.verified && <span className="verified-badge">✓</span>}
                </div>

                <p className="product-seller">{product.seller}</p>

                {/* Rating */}
                <div className="product-rating">
                  <span className="rating-stars">⭐ {product.rating}</span>
                  <span className="rating-count">({product.reviews})</span>
                </div>

                {/* Price and Button */}
                <div className="product-footer">
                  <div>
                    <p className="price-label">Harga/hari</p>
                    <p className="product-price">
                      Rp {product.price.toLocaleString('id-ID')}
                    </p>
                  </div>
                  <button className="btn-primary btn-small">Sewa</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* View All Button */}
        <div className="view-all-container">
          <button className="btn-primary btn-large">Lihat Semua Barang →</button>
        </div>
      </div>
    </section>
  );
}

