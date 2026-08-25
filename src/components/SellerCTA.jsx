export default function SellerCTA({ onNavigate }) {
  return (
    <section className="seller-cta reveal-on-scroll">
      <div className="container seller-cta-inner">
        <div className="seller-copy">
          <p className="eyebrow eyebrow-light">JADI SELLER</p>
          <h2>Punya barang yang jarang dipakai?</h2>
          <p>
            Jadikan barangmu menghasilkan dengan menyewakannya di JabSewa. Setiap item yang
            cocok bisa jadi sumber pendapatan tanpa ribet.
          </p>
        </div>

        <button className="primary-button primary-button-light" onClick={() => onNavigate('seller')}>Buka Seller Center</button>
      </div>
    </section>
  )
}
