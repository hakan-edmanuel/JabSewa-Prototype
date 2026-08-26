const testimonials = [
  {
    id: 1,
    name: 'Budi Santoso',
    role: 'Freelancer',
    content: 'Jabsewa sangat membantu saya ketika butuh laptop untuk project. Prosesnya cepat dan amanah!',
    rating: 5,
    avatar: '👨‍💼',
    verified: true,
  },
  {
    id: 2,
    name: 'Siti Nurhaliza',
    role: 'Content Creator',
    content: 'Kamera dan drone yang saya sewa kualitasnya bagus. Pemiliknya sangat responsif dan ramah.',
    rating: 5,
    avatar: '👩‍🦰',
    verified: true,
  },
  {
    id: 3,
    name: 'Andi Wijaya',
    role: 'Event Organizer',
    content: 'Projector dan sound system yang saya sewa untuk acara sangat berkualitas dan lengkap.',
    rating: 4.5,
    avatar: '👨‍💼',
    verified: true,
  },
  {
    id: 4,
    name: 'Rini Cahya',
    role: 'Student',
    content: 'Terima kasih Jabsewa! Akhirnya bisa menggunakan barang premium tanpa harus membeli.',
    rating: 5,
    avatar: '👩‍🎓',
    verified: true,
  },
];

export default function Testimonials() {
  return (
    <section className="testimonials-section" id="testimonial">
      <div className="container">
        {/* Section Header */}
        <div className="section-header">
          <h2 className="section-title">Testimoni Pengguna</h2>
          <p className="section-subtitle">Apa kata mereka tentang Jabsewa?</p>
        </div>

        {/* Testimonials Grid */}
        <div className="testimonials-grid">
          {testimonials.map(testimonial => (
            <div key={testimonial.id} className="testimonial-card">
              {/* Rating */}
              <div className="rating-stars">
                {[...Array(5)].map((_, i) => (
                  <span key={i}>
                    {i < Math.floor(testimonial.rating) ? '⭐' : '☆'}
                  </span>
                ))}
              </div>

              {/* Review Text */}
              <p className="testimonial-text">"{testimonial.content}"</p>

              {/* User Info */}
              <div className="testimonial-author">
                <div className="author-avatar">{testimonial.avatar}</div>
                <div className="author-info">
                  <p className="author-name">
                    {testimonial.name}
                    {testimonial.verified && <span className="verified-check">✓</span>}
                  </p>
                  <p className="author-role">{testimonial.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* More Testimonials */}
        <div className="view-all-container">
          <button className="btn-outline">Lihat Semua Ulasan →</button>
        </div>
      </div>
    </section>
  );
}