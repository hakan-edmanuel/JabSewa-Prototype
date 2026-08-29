const testimonials = [
  {
    id: 1,
    name: 'Budi Santoso',
    role: 'Penyewa Kamera · Jakarta Selatan',
    itemRented: 'Sewa Sony Alpha A7 III (3 Hari)',
    content:
      'Sewa kamera Sony A7 III buat liputan wedding klien akhir pekan. Barangnya mulus, 2 baterai full charge, proses ambil cepat. Jauh lebih hemat daripada harus beli unit 25 juta.',
    rating: 5,
    avatar: '👨‍💼',
    verified: true,
  },
  {
    id: 2,
    name: 'Siti Nurhaliza',
    role: 'Pemilik Rental (Seller) · Bandung',
    itemRented: 'Menyewakan Drone DJI & Lensa',
    content:
      'Awalnya cuma iseng sewain drone DJI dan lensa yang nganggur di dry box. Sekarang sebulan konsisten dapat Rp3,5jt bersih. Sistem deposit bikin tenang dari resiko barang rusak.',
    rating: 5,
    avatar: '👩‍🦰',
    verified: true,
  },
  {
    id: 3,
    name: 'Andi Wijaya',
    role: 'Penyewa Outdoor · Bogor',
    itemRented: 'Sewa Tenda Camping 4P & Matras',
    content:
      'Tenda 4 orang kondisinya bersih dan wangi pas diambil. Frame alloy masih kokoh. Pemiliknya ramah dan kasih tips spot camp di Gunung Pancar.',
    rating: 5,
    avatar: '⛺',
    verified: true,
  },
  {
    id: 4,
    name: 'Rini Cahya',
    role: 'Penyewa Event · Surabaya',
    itemRented: 'Sewa Projector Epson 3600 Lumens',
    content:
      'Butuh projector mendadak untuk acara seminar kampus H-1. Seller fast response dalam 10 menit, alat langsung ready diambil malam itu juga. Sangat solutif!',
    rating: 5,
    avatar: '👩‍🎓',
    verified: true,
  },
]

export default function Testimonials() {
  return (
    <section className="testimonials-section" id="testimonial">
      <div className="container">
        <div className="section-heading">
          <p className="eyebrow eyebrow-dark">TESTIMONI KOMUNITAS</p>
          <h2>Pengalaman nyata menyewa di JabSewa</h2>
          <p className="testimonials-subtitle">
            Cerita dari para kreator, mahasiswa, event organizer, dan pemilik rental di berbagai kota.
          </p>
        </div>

        <div className="testimonials-grid">
          {testimonials.map((testimonial) => (
            <div key={testimonial.id} className="testimonial-card">
              <div className="testimonial-card-top">
                <div className="rating-stars">
                  {'★'.repeat(testimonial.rating)}
                </div>
                <span className="testimonial-item-tag">{testimonial.itemRented}</span>
              </div>

              <p className="testimonial-text">"{testimonial.content}"</p>

              <div className="testimonial-author">
                <div className="author-avatar">{testimonial.avatar}</div>
                <div className="author-info">
                  <p className="author-name">
                    {testimonial.name}
                    {testimonial.verified && <span className="verified-check">✓ Terverifikasi</span>}
                  </p>
                  <p className="author-role">{testimonial.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}