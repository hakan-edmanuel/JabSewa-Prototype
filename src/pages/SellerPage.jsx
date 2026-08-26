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
            <section style={{ 
              background: '#ffffff', 
              borderRadius: '24px', 
              padding: '40px', 
              marginBottom: '32px', 
              color: '#0f172a',
              position: 'relative',
              overflow: 'hidden',
              border: '1px solid #e2e8f0'
            }}>
              {/* JabSewa Signature Motif */}
              <div style={{ position: 'absolute', right: '-40px', top: '-40px', width: '200px', height: '200px', background: 'rgba(37, 99, 235, 0.05)', borderRadius: '50%', pointerEvents: 'none' }}></div>
              <div style={{ position: 'absolute', left: '-40px', bottom: '-40px', width: '200px', height: '200px', background: 'rgba(251, 191, 36, 0.05)', borderRadius: '50%', pointerEvents: 'none' }}></div>
              
              <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '24px' }}>
                <div style={{ maxWidth: '600px' }}>
                  <span style={{ display: 'inline-block', background: '#fffbeb', padding: '6px 12px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: '800', letterSpacing: '0.1em', marginBottom: '16px', color: '#d97706', border: '1px solid #fde68a' }}>SELLER CENTER</span>
                  <h1 style={{ fontSize: '2.5rem', fontWeight: '800', marginBottom: '12px', lineHeight: '1.2', letterSpacing: '-0.05em' }}>Mulai Hasilkan Uang dari <br /><span style={{ color: '#2563eb' }}>Barang Nganggurmu.</span></h1>
                  <p style={{ fontSize: '1.05rem', color: '#475569', lineHeight: '1.6', marginBottom: '0' }}>Kelola inventaris, pantau pesanan, dan tingkatkan pendapatanmu dengan mudah melalui dashboard interaktif ini.</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button onClick={() => { setActiveMenu('items'); setShowWelcome(false); }} style={{ background: '#2563eb', color: 'white', border: 'none', padding: '14px 28px', borderRadius: '14px', fontWeight: '700', fontSize: '1rem', cursor: 'pointer', transition: 'transform 0.2s' }}>Tambah Barang</button>
                  <button onClick={() => setShowWelcome(false)} style={{ background: 'white', color: '#0f172a', border: '1.5px solid #e2e8f0', padding: '14px 28px', borderRadius: '14px', fontWeight: '700', fontSize: '1rem', cursor: 'pointer', transition: 'background 0.2s' }}>Tutup</button>
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