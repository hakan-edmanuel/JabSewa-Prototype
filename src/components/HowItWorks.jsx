const steps = [
  {
    number: '01',
    title: 'Cari barang',
    description: 'Jelajahi barang yang dibutuhkan dengan kategori jelas dan detail penyewaan yang siap dibaca.',
  },
  {
    number: '02',
    title: 'Sewa',
    description: 'Pilih durasi, cek lokasi, dan lakukan pemesanan dengan proses yang cepat dan transparan.',
  },
  {
    number: '03',
    title: 'Gunakan & kembalikan',
    description: 'Nikmati penggunaannya, lalu kembalikan sesuai jadwal dengan sistem yang memudahkan semua pihak.',
  },
]

export default function HowItWorks() {
  return (
    <section className="how-section" id="cara-kerja">
      <div className="container">
        <div className="section-heading">
          <p className="eyebrow eyebrow-dark">CARA KERJA</p>
          <h2>Mudah, cepat, dan jelas dari mulai cari sampai balik.</h2>
        </div>

        <div className="how-grid">
          {steps.map((step, index) => (
            <article
              key={step.number}
              className="step-card reveal-on-scroll"
              style={{ transitionDelay: `${index * 110}ms` }}
            >
              <div className="step-number">{step.number}</div>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

