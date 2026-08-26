import { useState } from 'react';
import SellerNavbar from '../components/Seller/SellerNavbar';
import SellerSidebar from '../components/Seller/SellerSidebar';
import SellerDashboard from '../components/Seller/SellerDashboard';
import SellerItems from '../components/Seller/SellerItems';
import SellerOrders from '../components/Seller/SellerOrders';
import SellerAnalytics from '../components/Seller/SellerAnalytics';

export default function SellerPage({ onNavigate }) {
  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [showWelcome, setShowWelcome] = useState(true);

  const renderContent = () => {
    switch (activeMenu) {
      case 'dashboard':
        return <SellerDashboard onMenuChange={setActiveMenu} />;
      case 'items':
        return <SellerItems />;
      case 'orders':
        return <SellerOrders />;
      case 'analytics':
        return <SellerAnalytics />;
      default:
        return <SellerDashboard />;
    }
  };

  return (
    <div className="seller-page">
      <SellerNavbar onNavigate={onNavigate} />
      <div className="seller-container">
        <SellerSidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} />
        <div className="seller-content">
          {showWelcome && (
            <section className="seller-welcome-banner">
              <div className="seller-motif-1"></div>
              <div className="seller-motif-2"></div>

              <div className="seller-welcome-inner">
                <div className="seller-welcome-info">
                  <span className="seller-welcome-tag">SELLER CENTER</span>
                  <h1 className="seller-welcome-heading">
                    Mulai Hasilkan Uang dari <br />
                    <span>Barang Nganggurmu.</span>
                  </h1>
                  <p className="seller-welcome-desc">
                    Kelola inventaris, pantau pesanan, dan tingkatkan pendapatanmu dengan mudah melalui dashboard interaktif ini.
                  </p>
                </div>
                <div className="seller-welcome-buttons">
                  <button
                    className="primary-button seller-btn-main"
                    onClick={() => { setActiveMenu('items'); setShowWelcome(false); }}
                  >
                    Tambah Barang
                  </button>
                  <button
                    className="secondary-button seller-btn-close"
                    onClick={() => setShowWelcome(false)}
                  >
                    Tutup
                  </button>
                </div>
              </div>
            </section>
          )}
          {renderContent()}
        </div>
      </div>
    </div>
  );
}