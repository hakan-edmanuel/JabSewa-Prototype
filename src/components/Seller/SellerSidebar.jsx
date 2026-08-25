export default function SellerSidebar({ activeMenu, setActiveMenu }) {
  const menuItems = [
    { id: 'dashboard', label: '📊 Dashboard', icon: '📊' },
    { id: 'items', label: '📦 Barang Saya', icon: '📦' },
    { id: 'orders', label: '📋 Pesanan', icon: '📋' },
    { id: 'analytics', label: '📈 Analitik', icon: '📈' },
  ];

  return (
    <aside className="seller-sidebar">
      <div className="seller-sidebar-content">
        <div className="seller-menu">
          {menuItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveMenu(item.id)}
              className={`seller-menu-item ${activeMenu === item.id ? 'active' : ''}`}
            >
              <span className="menu-icon">{item.icon}</span>
              <span className="menu-label">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="seller-sidebar-footer">
          <div className="seller-stats-mini">
            <div className="mini-stat">
              <p className="mini-stat-value">12</p>
              <p className="mini-stat-label">Barang Aktif</p>
            </div>
            <div className="mini-stat">
              <p className="mini-stat-value">4.8</p>
              <p className="mini-stat-label">Rating</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
