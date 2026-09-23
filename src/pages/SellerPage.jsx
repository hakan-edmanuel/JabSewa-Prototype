import { useState } from 'react'
import SellerNavbar from '../components/Seller/SellerNavbar'
import SellerSidebar from '../components/Seller/SellerSidebar'
import SellerDashboard from '../components/Seller/SellerDashboard'
import SellerItems from '../components/Seller/SellerItems'
import SellerOrders from '../components/Seller/SellerOrders'
import SellerStoreInfo from '../components/Seller/SellerStoreInfo'
import { useAuth } from '../auth/AuthContext'
import { findStoreByOwner } from '../lib/storage'

/*
 * Halaman seller center. Seluruh konten di-scope ke TOKO milik user yang
 * login (sellerProfile → stores.owner_id) — bukan lagi demo global.
 * Menu: Dashboard · Barang Saya · Pesanan · Info Toko.
 */
export default function SellerPage({ onNavigate }) {
  const { user } = useAuth()
  const [activeMenu, setActiveMenu] = useState('dashboard')

  // Toko milik seller aktif; fallback id null tetap aman (list kosong).
  const store = findStoreByOwner(user?.id)

  const renderContent = () => {
    switch (activeMenu) {
      case 'items':
        return <SellerItems store={store} />
      case 'orders':
        return <SellerOrders store={store} />
      case 'store':
        return <SellerStoreInfo store={store} />
      case 'dashboard':
      default:
        return <SellerDashboard store={store} onMenuChange={setActiveMenu} />
    }
  }

  return (
    <div className="seller-page">
      <SellerNavbar onNavigate={onNavigate} />
      <div className="seller-container">
        <SellerSidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} />
        <div className="seller-content">
          {renderContent()}
        </div>
      </div>
    </div>
  )
}
