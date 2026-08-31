const trustPoints = [
  {
    icon: '💼',
    title: 'Sistem Escrow Aman',
    description: 'Saldo ditahan dengan aman oleh sistem JabSewa dan baru diteruskan ke pemilik setelah barang dikembalikan dengan baik.',
  },
  {
    icon: '🔒',
    title: 'Deposit Aman & Transparan',
    description: 'Dana deposit tersimpan aman dan otomatis dikembalikan setelah masa sewa selesai tanpa potongan tersembunyi.',
  },
  {
    icon: '📋',
    title: 'Checklist Kondisi Barang',
    description: 'Dokumentasi foto dan kondisi fisik barang disepakati bersama sebelum serah terima dimulai.',
  },
  {
    icon: '🛡️',
    title: 'Bantuan & Mediasi Cepat',
    description: 'Tim JabSewa siap mendampingi bila terjadi kendala keterlambatan, kerusakan, atau pembatalan sewa.',
  },
]

export default function TrustSection() {
  return (
    <section className="trust-section">
      <div className="container trust-inner">
        <div className="section-heading trust-heading">
          <p className="eyebrow eyebrow-dark">KEAMANAN & KEPERCAYAAN</p>
          <h2>Platform sewa yang mengutamakan rasa aman kedua belah pihak</h2>
          <p className="trust-subtitle">JabSewa membangun ekosistem rental yang tertib dengan sistem deposit dan verifikasi terstandarisasi.</p>
        </div>

        <div className="trust-grid">
          {trustPoints.map((point) => (
            <article key={point.title} className="trust-card">
              <div className="trust-icon-box">{point.icon}</div>
              <h3 className="trust-title">{point.title}</h3>
              <p className="trust-description">{point.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}