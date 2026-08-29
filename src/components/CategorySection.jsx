const categories = [
  {
    id: 1,
    name: 'Kamera & Lensa',
    subtitle: 'Mirrorless, DSLR, Lensa, Tripod, Lighting',
    image:
      'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=800&q=80',
    count: '780+ barang',
    tag: 'Terpopuler',
  },
  {
    id: 2,
    name: 'Gaming & Konsol',
    subtitle: 'PS5, Nintendo Switch, VR, Controller',
    image:
      'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?auto=format&fit=crop&w=800&q=80',
    count: '320+ barang',
    tag: 'Weekend Mode',
  },
  {
    id: 3,
    name: 'Outdoor & Camping',
    subtitle: 'Tenda 4P, Carrier, Matras, Kompor Portabel',
    image:
      'https://images.unsplash.com/photo-1522163182402-834f871fd851?auto=format&fit=crop&w=800&q=80',
    count: '900+ barang',
    tag: 'Adventure',
  },
  {
    id: 4,
    name: 'Gadget & Laptop',
    subtitle: 'MacBook Pro, iPad, Laptop Windows, Tablet',
    image:
      'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=800&q=80',
    count: '1.200+ barang',
    tag: 'Kerja & Project',
  },
  {
    id: 5,
    name: 'Audio & Event',
    subtitle: 'Projector Epson, Sound System, Mic Wireless',
    image:
      'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80',
    count: '450+ barang',
    tag: 'Acara & Rapat',
  },
  {
    id: 6,
    name: 'Kendaraan Harian',
    subtitle: 'Motor Matic, Sepeda Gunung, Sepeda Listrik',
    image:
      'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=800&q=80',
    count: '540+ barang',
    tag: 'Mobilitas',
  },
]

export default function CategorySection() {
  return (
    <section className="category-section" id="kategori">
      <div className="container">
        <div className="section-heading split-heading">
          <div>
            <p className="eyebrow eyebrow-dark">KATEGORI PILIHAN</p>
            <h2>Temukan barang sewa sesuai kebutuhan acaramu</h2>
          </div>
          <span className="section-kicker">Siap sewa harian & mingguan</span>
        </div>

        <div className="category-grid">
          {categories.map((category) => (
            <div key={category.id} className="category-card">
              <div className="category-image-container">
                <img src={category.image} alt={category.name} className="category-image" />
                <span className="category-tag-badge">{category.tag}</span>
              </div>
              <div className="category-card-content">
                <div className="category-card-header">
                  <h3 className="category-name">{category.name}</h3>
                  <span className="category-count-badge">{category.count}</span>
                </div>
                <p className="category-desc">{category.subtitle}</p>
                <div className="category-card-link">
                  <span>Lihat semua barang</span>
                  <span className="category-arrow">→</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
