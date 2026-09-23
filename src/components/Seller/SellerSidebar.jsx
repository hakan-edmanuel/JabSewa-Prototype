export default function SellerSidebar({ activeMenu, setActiveMenu }) {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'items', label: 'Barang Saya' },
    { id: 'orders', label: 'Pesanan' },
    { id: 'store', label: 'Info Toko' },
  ]

  return (
    <aside className="seller-sidebar">
      <div className="seller-sidebar-content">
        <div className="seller-menu">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveMenu(item.id)}
              className={`seller-menu-item ${activeMenu === item.id ? 'active' : ''}`}
            >
              <span className="menu-label">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
