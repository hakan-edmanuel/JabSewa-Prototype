import { useState } from "react";
import { useAuth } from "../features/auth/AuthContext";
import UserMenu from "./UserMenu";
import NavLinks from "./NavLinks";
import ModeSwitch from "./ModeSwitch";
import logo from "../assets/logo-jabsewa.jpeg";

/*
 * Navbar utama, sadar status login dan role:
 *   guest      → Beranda · Cari Barang · Sewakan Barang · Masuk · Daftar
 *   penyewa    → Beranda · Cari Barang · Dashboard · Mulai Jadi Seller · profil
 *   seller     → Beranda · Cari Barang · Dashboard · Mode Penyewa/Seller · profil
 * `simple` dipakai halaman non-landing (about, cart, buyer) — tanpa link Beranda.
 */
export default function Navbar({
  onNavigate,
  onSellerIntent,
  currentPage = "home",
  simple = false,
}) {
  const { user, hasSellerAccess, storeApplication, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Lifecycle: belum ada ajuan → "Mulai Jadi Seller"; ajuan berjalan → status.
  // Hanya status `pending` yang disebut ajuan berjalan (rejected bukan).
  const hasPendingApplication =
    storeApplication?.status === "pending" && !hasSellerAccess;

  const close = () => setMobileOpen(false);
  const go = (page, opts) => {
    close();
    onNavigate(page, opts);
  };

  // Jika onSellerIntent tidak diberikan (navbar simple di About/Cart),
  // fallback ke route /seller — route guard di App tetap mengarahkan
  // guest ke login dan non-seller ke onboarding.
  const handleSellerIntent = () => {
    close();
    if (onSellerIntent) onSellerIntent();
    else onNavigate("seller");
  };

  const links = [
    ...(simple ? [] : [{ key: "home", label: "Beranda", page: "home" }]),
    { key: "consumer", label: "Cari Barang", page: "consumer" },
    ...(user
      ? [{ key: "buyer", label: "Dashboard", page: "buyer" }]
      : [
          {
            key: "seller-intent",
            label: "Sewakan Barang",
            onSelect: handleSellerIntent,
          },
        ]),
  ];

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <button className="logo-button" onClick={() => go("home")} aria-label="JabSewa home">
          <img src={logo} alt="JabSewa logo" className="logo-image" />
          <span className="logo-text">JabSewa</span>
        </button>

        <div className="nav-links">
          <NavLinks links={links} currentPage={currentPage} onGo={go} />
        </div>

        <div className="nav-buttons">
          {!user && (
            <>
              <button className="nav-login" onClick={() => go("auth", { mode: "login" })}>
                Masuk
              </button>
              <button className="nav-register" onClick={() => go("auth", { mode: "register" })}>
                Daftar
              </button>
            </>
          )}
          {user && !hasSellerAccess && (
            <button type="button" className="nav-seller-cta" onClick={handleSellerIntent}>
              {hasPendingApplication ? "Status Ajuan Seller" : "Mulai Jadi Seller"}
            </button>
          )}
          {hasSellerAccess && (
            <ModeSwitch currentPage={currentPage} onGo={go} />
          )}
          {user && <UserMenu onLogout={() => go("home")} onNavigate={onNavigate} />}
        </div>

        <button
          type="button"
          className="nav-mobile-toggle"
          aria-label={mobileOpen ? "Tutup menu" : "Buka menu"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((o) => !o)}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>

      {mobileOpen && (
        <div className="nav-mobile-panel">
          <NavLinks links={links} currentPage={currentPage} onGo={go} />
          {user && !hasSellerAccess && (
            <button
              type="button"
              className="nav-link nav-link-accent"
              onClick={handleSellerIntent}
            >
              {hasPendingApplication ? "Status Ajuan Seller" : "Mulai Jadi Seller"}
            </button>
          )}
          {hasSellerAccess && (
            <ModeSwitch currentPage={currentPage} onGo={go} mobile />
          )}
          {!user && (
            <div className="nav-mobile-auth">
              <button
                className="nav-login nav-mobile-login"
                onClick={() => go("auth", { mode: "login" })}
              >
                Masuk
              </button>
              <button
                className="nav-register nav-mobile-register"
                onClick={() => go("auth", { mode: "register" })}
              >
                Daftar
              </button>
            </div>
          )}
          {user && (
            <button
              type="button"
              className="nav-link nav-link-danger"
              onClick={async () => {
                close();
                await logout();
                onNavigate("home");
              }}
            >
              Keluar
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
