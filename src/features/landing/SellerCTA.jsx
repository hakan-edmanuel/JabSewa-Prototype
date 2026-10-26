export default function SellerCTA({ onNavigate }) {
  return (
    <section className="seller-cta">
      <div className="container">
        <div className="seller-cta-box texture-dots">
          <div className="seller-cta-content">
            <h2 className="seller-cta-title">
              Punya barang yang jarang dipakai?
              <span className="seller-cta-title-accent">Sewakan di JabSewa.</span>
            </h2>
            <p className="seller-cta-desc">
              Daftarkan barang, tentukan harga sewa dan deposit, lalu terima
              pesanan dari penyewa di sekitarmu.
            </p>
          </div>

          <div className="seller-cta-action">
            <button
              type="button"
              className="primary-button seller-cta-btn"
              onClick={() => onNavigate('seller')}
            >
              Mulai Sewakan Barang
            </button>
            <p className="action-card-footnote">Gratis. Kamu atur sendiri harga dan jadwalnya.</p>
          </div>
        </div>
      </div>
    </section>
  )
}
