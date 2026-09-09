import { useMemo } from 'react'
import SimpleNavbar from '../components/SimpleNavbar'
import Footer from '../components/Footer'
import { useAuth } from '../auth/AuthContext'
import { getRentals, getWishlist } from '../lib/userData'
import { ITEMS } from '../data/catalog'

const formatPrice = (price) => `Rp ${price.toLocaleString('id-ID')}`

export default function BuyerPage({ onNavigate, onSellerIntent }) {
  const { user } = useAuth()
  const rentals = getRentals()
  const wishlist = getWishlist()
  const wishItems = useMemo(() => ITEMS.filter((item) => wishlist.includes(item.id)), [wishlist])

  const firstName = (user?.name || 'Penyewa').split(' ')[0]

  return (
    <div className="page-shell page-buyer-shell">
      <SimpleNavbar onNavigate={onNavigate} currentPage="buyer" />

      <main className="buyer-page">
        <header className="buyer-head">
          <div>
            <p className="buyer-kicker">Mode Penyewa</p>
            <h1>Halo, {firstName}</h1>
            <p>Kelola pesanan sewa dan barang yang kamu simpan.</p>
          </div>
          <button className="primary-button" onClick={() => onNavigate('consumer')}>
            Cari Barang
          </button>
        </header>

        <section className="buyer-section">
          <div className="buyer-section-head">
            <h2>Pesanan sewa</h2>
            <span className="buyer-count">{rentals.length}</span>
          </div>

          {rentals.length ? (
            <div className="buyer-rental-list">
              {rentals.map((rental) => (
                <article key={rental.id} className="buyer-rental-card">
                  <div className="buyer-rental-top">
                    <div>
                      <h3>{rental.itemName}</h3>
                      <p>Pemilik: {rental.seller}</p>
                    </div>
                    <span className="status-badge status-pending">{rental.status}</span>
                  </div>
                  <div className="buyer-rental-meta">
                    <span>
                      {rental.startDate} → {rental.endDate} · {rental.totalDays} hari
                    </span>
                    <strong>{formatPrice(rental.total)}</strong>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="buyer-empty">
              <p>Belum ada pesanan sewa.</p>
              <p className="buyer-empty-sub">Cari barang yang kamu butuhkan, lalu kirim permintaan sewa.</p>
              <button className="primary-button" onClick={() => onNavigate('consumer')}>
                Mulai Cari Barang
              </button>
            </div>
          )}
        </section>

        <section className="buyer-section">
          <div className="buyer-section-head">
            <h2>Wishlist</h2>
            <span className="buyer-count">{wishItems.length}</span>
          </div>

          {wishItems.length ? (
            <div className="buyer-wish-grid">
              {wishItems.map((item) => (
                <article key={item.id} className="buyer-wish-card">
                  <img src={item.image} alt={item.name} className="buyer-wish-thumb" />
                  <div className="buyer-wish-info">
                    <h3>{item.name}</h3>
                    <p>{item.seller} · {item.location}</p>
                    <p className="buyer-wish-price">
                      {formatPrice(item.price)} <small>/hari</small>
                    </p>
                    <button
                      className="btn-small btn-primary"
                      onClick={() => onNavigate('consumer', { itemId: item.id })}
                    >
                      Sewa
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="buyer-empty">
              <p>Wishlist masih kosong.</p>
              <p className="buyer-empty-sub">Simpan barang favorit dengan ikon ♡ saat menjelajah marketplace.</p>
            </div>
          )}
        </section>

        <section className="buyer-cta-strip">
          <div>
            <h2>Punya barang yang jarang dipakai?</h2>
            <p>Daftarkan barangmu dan mulai terima pesanan sewa.</p>
          </div>
          <button className="primary-button buyer-cta-btn" onClick={onSellerIntent}>
            Mulai Jadi Seller
          </button>
        </section>
      </main>

      <Footer onNavigate={onNavigate} />
    </div>
  )
}