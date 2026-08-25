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
        <div className="testimonials-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginTop: '40px' }}>
          {testimonials.map(testimonial => (
            <div key={testimonial.id} className="testimonial-card" style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Rating */}
              <div className="rating-stars" style={{ color: '#fbbf24', fontSize: '1.2rem' }}>
                {[...Array(5)].map((_, i) => (
                  <span key={i}>
                    {i < Math.floor(testimonial.rating) ? '⭐' : '☆'}
                  </span>
                ))}
              </div>

              {/* Review Text */}
              <p className="testimonial-text" style={{ color: '#475569', lineHeight: '1.6', fontSize: '0.95rem', flex: 1 }}>"{testimonial.content}"</p>

              {/* User Info */}
              <div className="testimonial-author" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
                <div className="author-avatar" style={{ fontSize: '2rem', background: '#f8fafc', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>{testimonial.avatar}</div>
                <div className="author-info">
                  <p className="author-name" style={{ fontWeight: '700', color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {testimonial.name}
                    {testimonial.verified && <span className="verified-check" style={{ color: '#3b82f6', fontSize: '0.8rem' }}>✓</span>}
                  </p>
                  <p className="author-role" style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>{testimonial.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* More Testimonials */}
        <div className="view-all-container" style={{ textAlign: 'center', marginTop: '40px' }}>
          <button className="btn-outline" style={{ background: 'transparent', border: '1px solid #cbd5e1', padding: '10px 24px', borderRadius: '8px', fontWeight: '600', color: '#475569', cursor: 'pointer' }}>Lihat Semua Ulasan →</button>
        </div>
      </div>
    </section>
  );
}