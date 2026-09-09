import SimpleNavbar from '../components/SimpleNavbar'
import Footer from '../components/Footer'
import { useAuth } from '../auth/AuthContext'

/*
 * Halaman profil — satu akun untuk dua sisi.
 * Satu panel dengan divider antar blok: akun, mode, dan toko.
 */
export default function ProfilePage({ onNavigate, onSellerIntent }) {
  const { user, hasSellerAccess, logout } = useAuth()

  const handleLogout = async () => {
    await logout()
    onNavigate('home')
  }

  return (
    <div className="page-shell page-buyer-shell">
      <SimpleNavbar onNavigate={onNavigate} currentPage="profile" />

      <main className="buyer-page">
        <header className="buyer-head">
          <div>
            <p className="buyer-kicker">Profil</p>
            <h1>{user?.name}</h1>
            <p>Kelola akun dan mode JabSewa kamu.</p>
          </div>
        </header>

        <section className="buyer-section">
          <div className="profile-block">
            <h2 className="profile-block-title">Akun</h2>
            <div className="profile-row">
              <span className="profile-row-label">Nama</span>
              <span className="profile-row-value">{user?.name}</span>
            </div>
            <div className="profile-row">
              <span className="profile-row-label">Email</span>
              <span className="profile-row-value">{user?.email}</span>
            </div>
            <div className="profile-row">
              <span className="profile-row-label">Status seller</span>
              <span className="profile-row-value">{hasSellerAccess ? 'Aktif' : 'Belum aktif'}</span>
            </div>
          </div>

          <div className="profile-divider"></div>

          <div className="profile-block">
            <h2 className="profile-block-title">Mode</h2>
            <p className="profile-block-desc">
              Satu akun untuk dua sisi. Pindah mode kapan saja tanpa akun baru.
            </p>
            <div className="profile-mode-switch" role="group" aria-label="Pilih mode">
              <button
                type="button"
                className="nav-mode-btn is-active"
                onClick={() => onNavigate('consumer')}
              >
                Mode Penyewa
              </button>
              {hasSellerAccess ? (
                <button type="button" className="nav-mode-btn" onClick={() => onNavigate('seller')}>
                  Mode Seller
                </button>
              ) : (
                <button type="button" className="nav-mode-btn" onClick={onSellerIntent}>
                  Aktifkan Mode Seller
                </button>
              )}
            </div>
          </div>

          {hasSellerAccess && (
            <>
              <div className="profile-divider"></div>

              <div className="profile-block">
                <h2 className="profile-block-title">Toko</h2>
                <div className="profile-row">
                  <span className="profile-row-label">Nama toko</span>
                  <span className="profile-row-value">{user?.seller?.storeName}</span>
                </div>
                <div className="profile-row">
                  <span className="profile-row-label">Lokasi pengambilan</span>
                  <span className="profile-row-value">{user?.seller?.location}</span>
                </div>
                <div style={{ marginTop: 16 }}>
                  <button
                    type="button"
                    className="btn-small btn-primary"
                    onClick={() => onNavigate('seller')}
                  >
                    Buka Seller Dashboard
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="profile-divider"></div>

          <div className="profile-block">
            <button type="button" className="profile-logout-btn" onClick={handleLogout}>
              Keluar dari JabSewa
            </button>
          </div>
        </section>
      </main>

      <Footer onNavigate={onNavigate} />
    </div>
  )
}