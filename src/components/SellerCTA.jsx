export default function SellerCTA({ onNavigate }) {
  const steps = [
    ['1', 'Daftarkan barangmu'],
    ['2', 'Tentukan harga & deposit'],
    ['3', 'Terima pesanan, atur pengambilan'],
  ]

  return (
    <section className="seller-cta">
      <div className="container">
        <div className="seller-cta-box">
          <div className="seller-cta-content">
            <span className="seller-cta-badge">PUNYA BARANG NGANGGUR?</span>
            <h2 className="seller-cta-title">Sewakan, dapat penghasilan tambahan</h2>

            <div className="seller-cta-benefits">
              {steps.map(([n, text]) => (
                <div className="benefit-item" key={n}>
                  <span className="benefit-icon">{n}</span>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="seller-cta-action">
            <div className="seller-cta-action-card">
              <span className="action-card-label">Buka Rental</span>
              <p className="action-card-sub">Gratis. Verifikasi &lt; 24 jam.</p>
              <button
                type="button"
                className="primary-button seller-cta-btn"
                onClick={() => onNavigate('seller')}
              >
                Mulai Sekarang
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}