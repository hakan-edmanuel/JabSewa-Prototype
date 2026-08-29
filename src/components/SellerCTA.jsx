export default function SellerCTA({ onNavigate }) {
  return (
    <section className="seller-cta">
      <div className="container">
        <div className="seller-cta-box">
          <div className="seller-cta-content">
            <span className="seller-cta-badge">PUNYA BARANG DI RUMAH?</span>
            <h2 className="seller-cta-title">
              Ubah barang nganggur jadi penghasilan harian
            </h2>
            <p className="seller-cta-desc">
              Kamera, drone, tenda, hingga konsol game yang jarang kamu pakai bisa disewakan ke orang terdekat.
              Rata-rata pemilik barang di JabSewa menghasilkan Rp1,5jt – Rp6jt/bulan.
            </p>

            <div className="seller-cta-benefits">
              <div className="benefit-item">
                <span className="benefit-icon">✓</span>
                <span>Atur tarif harian & deposit sendiri</span>
              </div>
              <div className="benefit-item">
                <span className="benefit-icon">✓</span>
                <span>Penyewa wajib verifikasi identitas</span>
              </div>
              <div className="benefit-item">
                <span className="benefit-icon">✓</span>
                <span>Bebas tentukan jadwal sewa</span>
              </div>
            </div>
          </div>

          <div className="seller-cta-action">
            <div className="seller-cta-action-card">
              <span className="action-card-label">Mulai Sewakan Barangmu</span>
              <p className="action-card-sub">Pendaftaran gratis tanpa biaya langganan bulanan.</p>
              <button
                type="button"
                className="primary-button seller-cta-btn"
                onClick={() => onNavigate('seller')}
              >
                Buka Rental Sekarang →
              </button>
              <span className="action-card-footnote">Proses verifikasi cepat &lt; 24 jam</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
