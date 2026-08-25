export default function SellerDashboard({ onMenuChange }) {
  const stats = [
    { label: 'Pendapatan Bulan Ini', value: 'Rp 5.200.000', icon: '💰', color: 'green' },
    { label: 'Total Barang', value: '12', icon: '📦', color: 'blue' },
    { label: 'Pesanan Aktif', value: '8', icon: '🔄', color: 'orange' },
    { label: 'Rating Penjual', value: '4.8/5.0', icon: '⭐', color: 'yellow' },
  ];

  const recentOrders = [
    { id: 1, item: 'MacBook Pro', customer: 'Budi Santoso', status: 'Dalam Pengiriman', date: '18 Agust 2024' },
    { id: 2, item: 'Drone DJI', customer: 'Siti Nurhaliza', status: 'Selesai', date: '17 Agust 2024' },
    { id: 3, item: 'Sofa Kulit', customer: 'Andi Wijaya', status: 'Menunggu Pengambilan', date: '16 Agust 2024' },
  ];

  return (
    <div className="seller-dashboard">
      <div className="dashboard-header">
        <h1>Dashboard Penjual</h1>
        <p>Selamat datang kembali! Kelola barang dan pesanan Anda</p>
      </div>

      {/* Stats Grid */}
      <div className="dashboard-stats">
        {stats.map((stat, idx) => (
          <div key={idx} className={`stat-card stat-${stat.color}`}>
            <div className="stat-icon">{stat.icon}</div>
            <div className="stat-content">
              <p className="stat-label">{stat.label}</p>
              <p className="stat-number">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Orders */}
      <div className="dashboard-section">
        <div className="section-header">
          <h2>Pesanan Terbaru</h2>
          <button className="link-more" onClick={() => onMenuChange('orders')}>Lihat semua →</button>
        </div>

        <div className="orders-table">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Pelanggan</th>
                <th>Status</th>
                <th>Tanggal</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map(order => (
                <tr key={order.id}>
                  <td className="item-name">{order.item}</td>
                  <td>{order.customer}</td>
                  <td><span className={`status-badge status-${order.status.replace(/\s+/g, '-').toLowerCase()}`}>{order.status}</span></td>
                  <td>{order.date}</td>
                  <td className="actions">
                    <button className="btn-small">Detail</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="dashboard-section">
        <h2>Aksi Cepat</h2>
        <div className="quick-actions">
          <button className="action-btn" onClick={() => onMenuChange('items')}>
            <span className="action-icon">➕</span>
            <span>Tambah Barang</span>
          </button>
          <button className="action-btn" onClick={() => onMenuChange('analytics')}>
            <span className="action-icon">📊</span>
            <span>Lihat Statistik</span>
          </button>
          <button className="action-btn">
            <span className="action-icon">⚙️</span>
            <span>Pengaturan Toko</span>
          </button>
          <button className="action-btn">
            <span className="action-icon">💬</span>
            <span>Chat Pelanggan</span>
          </button>
        </div>
      </div>
    </div>
  );
}
