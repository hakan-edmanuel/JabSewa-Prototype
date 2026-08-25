const categories = [
  {
    id: 1,
    name: 'Electronics',
    subtitle: 'Laptop, gadget, audio',
    image:
      'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80',
    size: 'wide',
    tag: 'Popular',
    count: '1.2k items',
    tone: 'blue',
  },
  {
    id: 2,
    name: 'Vehicles',
    subtitle: 'Motor, mobil, rental harian',
    image:
      'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=1200&q=80',
    size: 'tall',
    tag: 'Fast pickup',
    count: '540 listings',
    tone: 'dark',
  },
  {
    id: 3,
    name: 'Cameras',
    subtitle: 'Mirrorless, drone, crew',
    image:
      'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80',
    size: 'standard',
    tag: 'Creator favorite',
    count: '780 items',
    tone: 'light',
  },
  {
    id: 4,
    name: 'Gaming',
    subtitle: 'Console & setup lengkap',
    image:
      'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80',
    size: 'standard',
    tag: 'Weekend mode',
    count: '320 items',
    tone: 'soft',
  },
  {
    id: 5,
    name: 'Outdoor',
    subtitle: 'Tenda, alat hiking, camping',
    image:
      'https://images.unsplash.com/photo-1522163182402-834f871fd851?auto=format&fit=crop&w=1200&q=80',
    size: 'wide',
    tag: 'Adventure',
    count: '900 items',
    tone: 'blue',
  },
  {
    id: 6,
    name: 'Property',
    subtitle: 'Ruang kerja & venue',
    image:
      'https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1200&q=80',
    size: 'tall',
    tag: 'Flexible',
    count: '220 listings',
    tone: 'dark',
  },
]

export default function CategorySection() {
  return (
    <section className="category-section" id="kategori">
      <div className="container">
        <div className="section-heading split-heading">
          <div>
            <p className="eyebrow eyebrow-dark">EXPLORE</p>
            <h2>Temukan kebutuhanmu di ekosistem JabSewa.</h2>
          </div>
          <span className="section-kicker">Built for everyday flexibility</span>
        </div>

        <div className="category-grid">
          {categories.map((category, index) => (
            <article
              key={category.id}
              className={`category-card category-${category.size} category-${category.tone} reveal-on-scroll`}
              style={{ transitionDelay: `${index * 90}ms` }}
            >
              <img src={category.image} alt={category.name} className="category-image" />
              <div className="category-overlay" />
              <div className="category-pattern" aria-hidden="true" />
              <div className="category-content">
                <div className="category-meta-row">
                  <span className="category-tag">{category.tag}</span>
                  <span className="category-count">{category.count}</span>
                </div>
                <h3>{category.name}</h3>
                <p>{category.subtitle}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
