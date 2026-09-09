import { useState } from 'react';
import SellerNavbar from '../components/Seller/SellerNavbar';
import SellerSidebar from '../components/Seller/SellerSidebar';
import SellerDashboard from '../components/Seller/SellerDashboard';
import SellerItems from '../components/Seller/SellerItems';
import SellerOrders from '../components/Seller/SellerOrders';

export default function SellerPage({ onNavigate }) {
  const [activeMenu, setActiveMenu] = useState('dashboard');

  const renderContent = () => {
    switch (activeMenu) {
      case 'dashboard':
        return <SellerDashboard onMenuChange={setActiveMenu} />;
      case 'items':
        return <SellerItems />;
      case 'orders':
        return <SellerOrders />;
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
          {renderContent()}
        </div>
      </div>
    </div>
  );
}