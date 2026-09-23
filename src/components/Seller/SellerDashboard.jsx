import { useEffect, useState } from 'react'
import { getRentalsByStore } from '../../lib/userData'
import { fetchListingsByStore } from '../../lib/listings'
import { formatPrice } from '../../lib/format'
import { RENTAL_STATUS_META } from '../../lib/constants'

/*
 * Dashboard seller: ringkasan permintaan sewa yang masuk ke TOKO MILIK
 * seller aktif + status katalog toko tersebut. Semua data dari lapisan
 * data (lib/userData, lib/listings) — tidak ada lagi data demo internal.
 */
export default function SellerDashboard({ store, onMenuChange }) {
  const [storeItems, setStoreItems] = useState(null) // null = masih memuat
  // Permintaan sewa masuk dibaca saat render (baca localStorage sinkron);
  // refresh antar-tab cukup dengan remount dari navigasi sidebar.
  const incoming = store ? getRentalsByStore(store.id) : []

  useEffect(() => {
    let active = true
    if (!store) return undefined
    fetchListingsByStore(store.id).then((data) => {
      if (active) setStoreItems(data)
    })
    return () => {
      active = false
    }
  }, [store])

  const isLoading = storeItems === null

  return (
    <div className="seller-dashboard">
      <div className="dashboard-header">
        <h1>Dashboard Seller</h1>
        <p>{store ? `Ringkasan toko ${store.name}.` : 'Kelola barang dan permintaan sewa dari satu tempat.'}</p>
      </div>

      {!store && (
        <div className="dashboard-section">
          <p className="dashboard-empty-note">
            Toko belum terhubung ke akun ini. Data demo ditampilkan dari katalog umum.
          </p>
        </div>
      )}

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
                {incoming.slice(0, 5).map((rental) => {
                  const meta = RENTAL_STATUS_META[rental.status] || { label: rental.status, className: 'status-pending' }
                  return (
                    <tr key={rental.id}>
                      <td className="item-name">
                        {rental.item_name}
                        <span className="order-sub">{formatPrice(rental.total)}</span>
                      </td>
                      <td>{rental.start_date} → {rental.end_date}</td>
                      <td>{rental.total_days} hari</td>
                      <td>
                        <span className={`status-badge ${meta.className}`}>{meta.label}</span>
                      </td>
                    </tr>
                  )
                })}
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

        {isLoading ? (
          <p className="dashboard-empty-note">Memuat katalog…</p>
        ) : storeItems.length ? (
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
        ) : (
          <p className="dashboard-empty-note">
            Belum ada barang di katalog. Tambahkan lewat menu "Barang Saya".
          </p>
        )}
      </div>
    </div>
  )
}
