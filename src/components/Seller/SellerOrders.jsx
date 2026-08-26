import { useMemo, useState } from 'react'

const INITIAL_ORDERS = [
  { id: 'ORD-001', item: 'Sony Alpha Camera', customer: 'Budi Santoso', period: '22–25 Agustus 2026', total: 450000, status: 'Pending' },
  { id: 'ORD-002', item: 'DJI Mini Drone', customer: 'Siti Nurhaliza', period: '24–27 Agustus 2026', total: 660000, status: 'Active' },
  { id: 'ORD-003', item: 'Camping Tent', customer: 'Andi Wijaya', period: '15–18 Agustus 2026', total: 225000, status: 'Completed' },
]

export default function SellerOrders() {
  const [orders, setOrders] = useState(INITIAL_ORDERS)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('Semua Status')
  const [notice, setNotice] = useState('')
  const visibleOrders = useMemo(() => orders.filter((order) => `${order.id} ${order.item} ${order.customer}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'Semua Status' || order.status === filter)), [filter, orders, query])
  const updateStatus = (id, status) => { setOrders((current) => current.map((order) => order.id === id ? { ...order, status } : order)); setNotice(`Pesanan ${id} diperbarui menjadi ${status}.`) }
  return (
    <div className="seller-orders">
      <div className="orders-header">
        <div>
          <p className="section-kicker">Permintaan sewa</p>
          <h1>Pesanan Saya</h1>
        </div>
        <div className="orders-summary">
          <div className="summary-item">
            <span className="summary-label">Total</span>
            <span className="summary-value">{orders.length}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Pending</span>
            <span className="summary-value">
              {orders.filter((order) => order.status === 'Pending').length}
            </span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Aktif</span>
            <span className="summary-value">
              {orders.filter((order) => order.status === 'Active').length}
            </span>
          </div>
        </div>
      </div>

      {notice && <p className="request-success">{notice}</p>}

      <div className="orders-filters">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          type="search"
          placeholder="Cari pesanan..."
          className="search-box-small"
        />
        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="filter-select"
        >
          <option>Semua Status</option>
          <option>Pending</option>
          <option>Accepted</option>
          <option>Active</option>
          <option>Completed</option>
          <option>Cancelled</option>
        </select>
      </div>

      <div className="orders-list">
        {visibleOrders.map((order) => (
          <article key={order.id} className="order-card">
            <div className="order-header">
              <div className="order-info">
                <h3 className="order-id">{order.id}</h3>
                <p className="order-item">{order.item}</p>
              </div>
              <span className={`status-badge status-${order.status.toLowerCase()}`}>
                {order.status}
              </span>
            </div>

            <div className="order-details-grid">
              <div className="detail-col">
                <p className="detail-label">Pelanggan</p>
                <p className="detail-value">{order.customer}</p>
              </div>
              <div className="detail-col">
                <p className="detail-label">Periode sewa</p>
                <p className="detail-value">{order.period}</p>
              </div>
              <div className="detail-col">
                <p className="detail-label">Total</p>
                <p className="detail-value detail-price">
                  Rp {order.total.toLocaleString('id-ID')}
                </p>
              </div>
            </div>

            <div className="order-footer">
              <button
                className="btn-small btn-secondary"
                onClick={() =>
                  setNotice(`${order.id}: ${order.customer} menyewa ${order.item}.`)
                }
              >
                Lihat detail
              </button>
              <div className="order-actions">
                {order.status === 'Pending' && (
                  <>
                    <button
                      className="btn-small btn-primary"
                      onClick={() => updateStatus(order.id, 'Accepted')}
                    >
                      Terima
                    </button>
                    <button
                      className="btn-small btn-danger"
                      onClick={() => updateStatus(order.id, 'Cancelled')}
                    >
                      Tolak
                    </button>
                  </>
                )}
                {order.status === 'Accepted' && (
                  <button
                    className="btn-small btn-primary"
                    onClick={() => updateStatus(order.id, 'Active')}
                  >
                    Mulai sewa
                  </button>
                )}
                {order.status === 'Active' && (
                  <button
                    className="btn-small btn-success"
                    onClick={() => updateStatus(order.id, 'Completed')}
                  >
                    Selesaikan
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
        {!visibleOrders.length && (
          <p className="empty-state">Tidak ada pesanan yang sesuai.</p>
        )}
      </div>
    </div>
  )

}