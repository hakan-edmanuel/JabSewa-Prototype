const trustPoints = [
  {
    title: 'Seller terverifikasi',
    description: 'Setiap pemilik barang melewati proses pengecekan identitas dan kualitas item.',
    icon: '✓',
  },
  {
    title: 'Transaksi aman',
    description: 'Pembayaran dan jadwal sewa diproses dengan sistem yang jelas dan terstruktur.',
    icon: '🔒',
  },
  {
    title: 'Info rental jelas',
    description: 'Detail harga, lokasi, dan kondisi barang tersedia sebelum kamu memutuskan sewa.',
    icon: '📋',
  },
  {
    title: 'Support saat masalah',
    description: 'Tim JabSewa siap membantu bila ada kendala saat proses sewa atau pengembalian.',
    icon: '☎',
  },
]

export default function TrustSection() {
  return (
    <section className="trust-section">
      <div className="container trust-inner">
        <div className="section-heading trust-heading">
          <p className="eyebrow eyebrow-dark">MENGAPA PILIH JABSEWA</p>
          <h2>Platform sewa yang dibuat untuk ketenangan.</h2>
        </div>

        <div className="trust-grid">
          {trustPoints.map((point, index) => (
            <article
              key={point.title}
              className="trust-card reveal-on-scroll"
              style={{ transitionDelay: `${index * 100}ms` }}
            >
              <div className="trust-icon">{point.icon}</div>
              <h3>{point.title}</h3>
              <p>{point.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
