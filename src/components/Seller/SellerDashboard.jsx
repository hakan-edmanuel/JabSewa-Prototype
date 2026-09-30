import { useEffect, useState } from 'react'
import { getRentalsByStore } from '../../lib/userData'
import { fetchListingsByStore } from '../../lib/listings'
import { formatPrice } from '../../lib/format'
import { TRANSACTION_STATUS_META } from '../../lib/constants'

/*
 * Dashboard seller — Supabase-backed.
 * Ringkasan permintaan sewa yang masuk ke TOKO milik seller login
 * (direct SELECT rental_transactions, RLS-scoped via policy rentals_select)
 * + status katalog toko tersebut (listings, RLS-scoped).
 * Semua data dari lapisan data Supabase — tanpa fallback demo.
 */
export default function SellerDashboard({ store, onMenuChange }) {
  const [storeItems, setStoreItems] = useState(null) // null = masih memuat
  const [itemsError, setItemsError] = useState('')
  const [incoming, setIncoming] = useState([])
  const [incomingState, setIncomingState] = useState('loading') // loading|ready|error

  useEffect(() => {
    let active = true
    getRentalsByStore(store?.id ?? null)
      .then((data) => {
        if (active) {
          setIncoming(data)
          setIncomingState('ready')
        }
      })
      .catch(() => {
        if (active) setIncomingState('error')
      })
    return () => {
      active = false
    }
  }, [store?.id])

  useEffect(() => {
    let active = true
    if (!store) {
      const t = setTimeout(() => setStoreItems([]), 0)
      return () => {
        clearTimeout(t)
        active = false
      }
    }
    fetchListingsByStore()
      .then((data) => {
        if (active) setStoreItems(data)
      })
      .catch(() => {
        if (active) setItemsError('Gagal memuat katalog toko.')
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
        <p>
          {store
            ? `Ringkasan toko ${store.name}.`
            : 'Kelola barang dan permintaan sewa dari satu tempat.'}
        </p>
      </div>

      {!store && (
        <div className="dashboard-section">
          <p className="dashboard-empty-note">
            Toko belum terhubung ke akun ini. Hubungi admin bila data toko belum muncul.
          </p>
        </div>
      )}

      <div className="dashboard-section">
        <div className="section-header">
          <h2>Permintaan sewa masuk</h2>
          <button className="link-more" onClick={() => onMenuChange('orders')}>Lihat semua →</button>
        </div>

        {incomingState === 'loading' ? (
          <p className="dashboard-empty-note">Memuat permintaan sewa…</p>
        ) : incomingState === 'error' ? (
          <p className="dashboard-empty-note">Gagal memuat permintaan sewa. Coba muat ulang halaman.</p>
        ) : incoming.length ? (
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
                  const meta = TRANSACTION_STATUS_META[rental.status] || { label: rental.status, className: 'status-pending' }
                  return (
                    <tr key={rental.id}>
                      <td className="item-name">
                        {rental.items.map((i) => i.name).join(', ') || 'Transaksi sewa'}
                        <span className="order-sub">{formatPrice(rental.total)}</span>
                      </td>
                      <td>{rental.start_date} → {rental.end_date}</td>
                      <td>{rental.total_days} hari · {rental.items.length} item</td>
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
        ) : itemsError ? (
          <p className="dashboard-empty-note">{itemsError}</p>
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
