export default function SellerAnalytics() {
  const monthlyData = [
    { month: 'Jun', revenue: 2500000, orders: 8, views: 342 },
    { month: 'Jul', revenue: 3800000, orders: 12, views: 521 },
    { month: 'Agu', revenue: 5200000, orders: 15, views: 687 },
  ];

  const topItems = [
    { name: 'MacBook Pro 14"', revenue: 1500000, times: 24, rating: 4.9 },
    { name: 'Drone DJI Air 3', revenue: 1200000, times: 18, rating: 4.85 },
    { name: 'Sofa Kulit Premium', revenue: 1050000, times: 12, rating: 4.7 },
  ];

  return (
    <div className="seller-analytics">
      <div className="analytics-header">
        <h1>Analitik Penjual</h1>
        <div className="analytics-period">
          <button className="period-btn active">1 Bulan</button>
          <button className="period-btn">3 Bulan</button>
          <button className="period-btn">1 Tahun</button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="analytics-metrics">
        <div className="metric-card">
          <p className="metric-label">Total Pendapatan</p>
          <p className="metric-value">Rp 11.500.000</p>
          <p className="metric-change">+35% dari bulan lalu</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Total Pesanan</p>
          <p className="metric-value">35</p>
          <p className="metric-change">+25% dari bulan lalu</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Total Views</p>
          <p className="metric-value">1,550</p>
          <p className="metric-change">+42% dari bulan lalu</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Rating Rata-rata</p>
          <p className="metric-value">4.81</p>
          <p className="metric-change">⭐ Sangat Baik</p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="analytics-section">
        <h2>Tren Pendapatan & Pesanan</h2>
        <div className="chart-placeholder">
          <p>📊 Grafik ditampilkan di sini (chart library diperlukan)</p>
          <table className="chart-data">
            <thead>
              <tr>
                <th>Bulan</th>
                <th>Pendapatan</th>
                <th>Pesanan</th>
                <th>Views</th>
              </tr>
            </thead>
            <tbody>
              {monthlyData.map((data, idx) => (
                <tr key={idx}>
                  <td>{data.month}</td>
                  <td>Rp {data.revenue.toLocaleString('id-ID')}</td>
                  <td>{data.orders}</td>
                  <td>{data.views}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Items */}
      <div className="analytics-section">
        <h2>Barang Terbaik</h2>
        <div className="top-items-grid">
          {topItems.map((item, idx) => (
            <div key={idx} className="top-item-card">
              <div className="item-rank">#{idx + 1}</div>
              <h3 className="item-name">{item.name}</h3>
              <div className="item-stats">
                <div className="stat">
                  <p className="stat-label">Pendapatan</p>
                  <p className="stat-val">Rp {(item.revenue / 1000000).toFixed(1)}M</p>
                </div>
                <div className="stat">
                  <p className="stat-label">Disewa</p>
                  <p className="stat-val">{item.times}x</p>
                </div>
                <div className="stat">
                  <p className="stat-label">Rating</p>
                  <p className="stat-val">⭐ {item.rating}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Customer Insights */}
      <div className="analytics-section">
        <h2>Wawasan Pelanggan</h2>
        <div className="insights-grid">
          <div className="insight-card">
            <p className="insight-label">Pelanggan Baru</p>
            <p className="insight-value">8</p>
          </div>
          <div className="insight-card">
            <p className="insight-label">Pelanggan Kembali</p>
            <p className="insight-value">12</p>
          </div>
          <div className="insight-card">
            <p className="insight-label">Kepuasan Pelanggan</p>
            <p className="insight-value">96%</p>
          </div>
          <div className="insight-card">
            <p className="insight-label">Waktu Respons Rata-rata</p>
            <p className="insight-value">2.5 jam</p>
          </div>
        </div>
      </div>
    </div>
  );
}
