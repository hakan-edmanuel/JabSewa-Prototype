const listings = [
  {
    id: 1,
    name: 'Sony Alpha A7 III',
    location: 'Jakarta Selatan',
    price: 'Rp150.000',
    period: '/ hari',
    rating: 4.9,
    seller: 'Adit Studio',
    image:
      'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1000&q=80',
  },
  {
    id: 2,
    name: 'PlayStation 5',
    location: 'Bandung',
    price: 'Rp120.000',
    period: '/ hari',
    rating: 4.8,
    seller: 'GameNest',
    image:
      'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?auto=format&fit=crop&w=1000&q=80',
  },
  {
    id: 3,
    name: 'Camping Tent 4 Orang',
    location: 'Bogor',
    price: 'Rp85.000',
    period: '/ hari',
    rating: 4.9,
    seller: 'TrailBase',
    image:
      'https://images.unsplash.com/photo-1522163182402-834f871fd851?auto=format&fit=crop&w=1000&q=80',
  },
  {
    id: 4,
    name: 'Projector Epson',
    location: 'Surabaya',
    price: 'Rp180.000',
    period: '/ hari',
    rating: 4.7,
    seller: 'EventHub',
    image:
      'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1000&q=80',
  },
  {
    id: 5,
    name: 'Motor Honda PCX',
    location: 'Depok',
    price: 'Rp275.000',
    period: '/ hari',
    rating: 4.8,
    seller: 'RideFlow',
    image:
      'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=1000&q=80',
  },
  {
    id: 6,
    name: 'Gaming Setup Pro',
    location: 'Jakarta Pusat',
    price: 'Rp220.000',
    period: '/ hari',
    rating: 5.0,
    seller: 'PixelArena',
    image:
      'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1000&q=80',
  },
]

export default function FeaturedListings() {
  return (
    <section className="featured-section" id="jelajahi">
      <div className="container">
        <div className="featured-header-wrap">
          <div className="section-heading split-heading">
            <div>
              <p className="eyebrow eyebrow-dark">POPULAR RIGHT NOW</p>
              <h2>Rental picks that keep the JabSewa community moving.</h2>
            </div>
            <a href="#" className="inline-link">
              View all listings
            </a>
          </div>
          <div className="featured-note">
            <span className="featured-note-dot" />
            Live picks from trusted sellers
          </div>
        </div>

        <div className="listing-grid">
          {listings.map((item, index) => (
            <article
              key={item.id}
              className="listing-card reveal-on-scroll"
              style={{ transitionDelay: `${index * 90}ms` }}
            >
              <div className="listing-image-wrap">
                <img src={item.image} alt={item.name} className="listing-image" />
                <span className="listing-badge">Tersedia</span>
              </div>

              <div className="listing-body">
                <div className="listing-meta-top">
                  <p className="listing-category">Rent</p>
                  <span className="listing-rating">★ {item.rating}</span>
                </div>

                <h3>{item.name}</h3>

                <div className="listing-meta-row">
                  <span>{item.location}</span>
                  <span>{item.seller}</span>
                </div>

                <div className="listing-bottom">
                  <div>
                    <p className="listing-price">{item.price}</p>
                    <span className="listing-period">{item.period}</span>
                  </div>
                  <button className="mini-button">Sewa</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
