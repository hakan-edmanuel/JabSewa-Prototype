import { useState } from 'react';
import logo from '../../assets/logo-jabsewa.jpeg';

export default function ConsumerNavbar({ onNavigate }) {
  return (
    <nav className="consumer-navbar">
      <div className="consumer-navbar-container">
        <button className="consumer-logo consumer-logo-button" onClick={() => onNavigate('home')} aria-label="Kembali ke halaman utama">
          <img src={logo} alt="JabSewa Consumer" className="consumer-logo-img" />
          <span className="consumer-brand">JabSewa</span>
        </button>

        <div className="consumer-nav-menu">
          <button onClick={() => onNavigate('home')} className="nav-menu-item" style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🏠</span> Beranda Utama
          </button>
          <a href="#kategori" className="nav-menu-item">Kategori</a>
          <a href="#" onClick={(e) => { e.preventDefault(); onNavigate('about'); }} className="nav-menu-item">Tentang</a>
        </div>

        <div className="consumer-navbar-actions">
          <button className="search-toggle" title="Cari">🔍</button>
          
          <button 
            className="cart-btn"
            onClick={() => onNavigate('cart')}
            title="Keranjang"
          >
            🛒
            <span className="cart-badge">0</span>
          </button>

          <button className="profile-btn" title="Profile">👤</button>
        </div>
      </div>
    </nav>
  );
}