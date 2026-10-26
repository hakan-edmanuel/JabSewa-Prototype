const categories = [
  {
    id: 1,
    name: 'Kamera & Lensa',
    subtitle: 'Mirrorless, DSLR, lensa, tripod, lighting',
    image:
      'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 2,
    name: 'Gaming & Konsol',
    subtitle: 'PS5, Nintendo Switch, VR, controller',
    image:
      'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 3,
    name: 'Outdoor & Camping',
    subtitle: 'Tenda, carrier, matras, kompor portabel',
    image:
      'https://images.unsplash.com/photo-1522163182402-834f871fd851?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 4,
    name: 'Gadget & Laptop',
    subtitle: 'MacBook, iPad, tablet, laptop kerja',
    image:
      'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 5,
    name: 'Audio & Event',
    subtitle: 'Projector, sound system, mic wireless',
    image:
      'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 6,
    name: 'Kendaraan Harian',
    subtitle: 'Motor matic, sepeda gunung, sepeda listrik',
    image:
      'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=800&q=80',
  },
]

export default function CategorySection({ onNavigate }) {
  return (
    <section className="category-section" id="kategori">
      <div className="container">
        <div className="section-heading">
          <p className="eyebrow eyebrow-dark">KATEGORI</p>
          <h2>Kategori populer</h2>
          <p className="section-subtitle">Sewa harian &amp; mingguan di sekitar kamu.</p>
        </div>

        <div className="category-grid">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className="category-card"
              onClick={() => onNavigate('consumer')}
            >
              <div className="category-image-container">
                <img src={category.image} alt={category.name} className="category-image" />
              </div>
              <div className="category-card-content">
                <h3 className="category-name">{category.name}</h3>
                <p className="category-desc">{category.subtitle}</p>
                <span className="category-card-link">
                  Lihat barang <span aria-hidden="true">→</span>
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}