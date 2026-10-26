import { useCallback, useEffect, useState } from 'react'
import SellerNavbar from './SellerNavbar'
import SellerSidebar from './SellerSidebar'
import SellerDashboard from './SellerDashboard'
import SellerItems from './SellerItems'
import SellerOrders from './SellerOrders'
import SellerStoreInfo from './SellerStoreInfo'
import { useAuth } from '../auth/AuthContext'
import { getClient, isSupabaseConfigured } from '../../data/supabaseClient'

/*
 * Halaman seller center — Supabase-backed.
 * Toko di-resolve SERVER-SIDE dari sesi (rpc get_my_stores) — tidak dari
 * LocalStorage. Menu: Dashboard · Barang Saya · Pesanan · Info Toko.
 * onOrdersChanged dipakai agar aksi di Pesanan ikut menyegarkan Dashboard.
 */
export default function SellerPage({ onNavigate }) {
  const { user } = useAuth()
  const [activeMenu, setActiveMenu] = useState('dashboard')
  const [store, setStore] = useState(null)
  const [storeState, setStoreState] = useState('loading') // loading|ready|error

  const loadStore = useCallback(() => {
    if (!isSupabaseConfigured || !user?.id) {
      Promise.resolve().then(() => {
        setStore(null)
        setStoreState('ready')
      })
      return
    }
    getClient()
      .rpc('get_my_stores')
      .then(({ data, error }) => {
        if (error) throw error
        setStore(data?.[0] || null)
        setStoreState('ready')
      })
      .catch(() => setStoreState('error'))
  }, [user?.id])

  useEffect(() => {
    loadStore()
  }, [loadStore])

  const renderContent = () => {
    switch (activeMenu) {
      case 'items':
        return <SellerItems store={store} />
      case 'orders':
        return <SellerOrders />
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
          {storeState === 'loading' ? (
            <p className="dashboard-empty-note">Memuat toko…</p>
          ) : storeState === 'error' ? (
            <div>
              <p className="dashboard-empty-note">Gagal memuat data toko. Coba lagi.</p>
              <button className="btn-small btn-primary" onClick={loadStore}>
                Muat ulang
              </button>
            </div>
          ) : (
            renderContent()
          )}
        </div>
      </div>
    </div>
  )
}
