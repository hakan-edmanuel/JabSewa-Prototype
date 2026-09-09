const steps = [
  {
    number: '01',
    title: 'Cari & ajukan booking',
    description: 'Pilih barang yang dibutuhkan, tentukan durasi sewa, lalu kirim permintaan ke pemilik.',
  },
  {
    number: '02',
    title: 'Konfirmasi & serah terima',
    description: 'Setelah disetujui, bayar sewa dan deposit. Cek kondisi barang bersama saat pengambilan.',
  },
  {
    number: '03',
    title: 'Gunakan & kembalikan',
    description: 'Gunakan sesuai jadwal, kembalikan dalam kondisi semula, dan deposit langsung cair.',
  },
]

export default function HowItWorks() {
  return (
    <section className="how-section" id="cara-kerja">
      <div className="container">
        <div className="section-heading">
          <p className="eyebrow eyebrow-dark">CARA KERJA</p>
          <h2>Cara sewa di JabSewa</h2>
        </div>

        <div className="how-grid">
          {steps.map((step) => (
            <div key={step.number} className="step-item">
              <span className="step-number">{step.number}</span>
              <h3 className="step-title">{step.title}</h3>
              <p className="step-description">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}