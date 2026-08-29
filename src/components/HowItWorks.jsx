const steps = [
  {
    number: '01',
    title: 'Cari & Ajukan Booking',
    description: 'Pilih barang yang dibutuhkan, tentukan durasi sewa harian/mingguan, dan kirim permintaan sewa ke pemilik.',
    tip: 'Pilih lokasi terdekat untuk kemudahan ambil barang',
  },
  {
    number: '02',
    title: 'Konfirmasi & Serah Terima',
    description: 'Setelah disetujui, bayar sewa dan deposit aman. Cek kondisi barang bersama saat serah terima barang.',
    tip: 'Foto kondisi barang saat serah terima',
  },
  {
    number: '03',
    title: 'Gunakan & Kembalikan',
    description: 'Gunakan barang untuk keperluanmu, kembalikan sesuai jadwal, dan dana deposit langsung dikembalikan.',
    tip: 'Deposit langsung cair setelah barang dicek',
  },
]

export default function HowItWorks() {
  return (
    <section className="how-section" id="cara-kerja">
      <div className="container">
        <div className="section-heading">
          <p className="eyebrow eyebrow-dark">ALUR MUDAH</p>
          <h2>Cara menyewa barang di JabSewa</h2>
          <p className="how-subtitle">Proses 3 langkah sederhana yang aman bagi penyewa maupun pemilik barang.</p>
        </div>

        <div className="how-grid">
          {steps.map((step) => (
            <article key={step.number} className="step-card">
              <div className="step-card-top">
                <span className="step-number-badge">{step.number}</span>
                <span className="step-connector" aria-hidden="true"></span>
              </div>
              <h3 className="step-title">{step.title}</h3>
              <p className="step-description">{step.description}</p>
              <div className="step-tip-box">
                <span className="step-tip-icon">💡</span>
                <span className="step-tip-text">{step.tip}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

