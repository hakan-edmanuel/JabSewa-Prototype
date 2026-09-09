import { getRentals } from '../../lib/userData'
import { ITEMS } from '../../data/catalog'

const formatPrice = (price) => `Rp ${price.toLocaleString('id-ID')}`

/*
 * Dashboard seller: fokus ke aktivitas nyata — permintaan sewa yang masuk
 * (disimpan lokal saat penyewa mengajukan) dan status daftar barang.
 * Tanpa statistik pendapatan palsu.
 */
export default function SellerDashboard({ onMenuChange }) {
  const incoming = getRentals()
  const storeItems = ITEMS.slice(0, 4)

  return (
    <div className="seller-dashboard">
      <div className="dashboard-header">
        <h1>Dashboard Seller</h1>
        <p>Kelola barang dan permintaan sewa dari satu tempat.</p>
      </div>

      <div className="dashboard-section">
        <div className="section-header">
          <h2>Permintaan sewa masuk</h2>
          <button className="link-more" onClick={() => onMenuChange('orders')}>Lihat semua →</button>
        </div>

        {incoming.length ? (
          <div className="orders-table">
            <table>
              <thead>
                <tr>
                  <th>Barang</th>
                  <th>Periode</th>
                  <th>Durasi</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {incoming.slice(0, 5).map((rental) => (
                  <tr key={rental.id}>
                    <td className="item-name">
                      {rental.itemName}
                      <span className="order-sub">dari penyewa · {formatPrice(rental.total)}</span>
                    </td>
                    <td>{rental.startDate} → {rental.endDate}</td>
                    <td>{rental.totalDays} hari</td>
                    <td>
                      <span className="status-badge status-pending">{rental.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="dashboard-empty-note">
            Belum ada permintaan sewa. Pastikan barangmu aktif agar muncul di marketplace.
          </p>
        )}
      </div>

      <div className="dashboard-section">
        <div className="section-header">
          <h2>Barang di katalog</h2>
          <button className="link-more" onClick={() => onMenuChange('items')}>Kelola barang →</button>
        </div>

        <ul className="dashboard-item-list">
          {storeItems.map((item) => (
            <li key={item.id} className="dashboard-item-row">
              <img src={item.image} alt="" className="dashboard-item-thumb" loading="lazy" />
              <div className="dashboard-item-info">
                <strong>{item.name}</strong>
                <span>{item.location}</span>
              </div>
              <div className="dashboard-item-side">
                <strong>{formatPrice(item.price)}</strong>
                <span className={item.available ? 'dash-status is-available' : 'dash-status is-rented'}>
                  {item.available ? 'Tersedia' : 'Disewa'}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
