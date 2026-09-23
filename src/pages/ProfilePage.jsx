import SimpleNavbar from '../components/SimpleNavbar'
import Footer from '../components/Footer'
import { useAuth } from '../auth/AuthContext'

/*
 * Halaman profil — satu akun, satu siklus.
 * Akun → aktivitas penyewa (rentals/wishlist) → status ajuan seller.
 * Tidak ada switch role: seller adalah LIFECYCLE (ajuan → review → approved),
 * profil seller hanya muncul setelah ajuan disetujui.
 */
export default function ProfilePage({ onNavigate, onSellerIntent }) {
  const { user, hasSellerAccess, sellerApplication, logout } = useAuth()

  const handleLogout = async () => {
    await logout()
    onNavigate('home')
  }

  const appStatus = sellerApplication?.status

  /* --- Blok status seller sesuai lifecycle --- */
  const renderSellerBlock = () => {
    if (hasSellerAccess) {
      const profile = user?.sellerProfile
      return (
        <div className="profile-block">
          <h2 className="profile-block-title">Seller</h2>
          <div className="profile-row">
            <span className="profile-row-label">Profil seller</span>
            <span className="profile-row-value">Aktif</span>
          </div>
          <div className="profile-row">
            <span className="profile-row-label">Nama toko</span>
            <span className="profile-row-value">{profile?.storeName}</span>
          </div>
          <div className="profile-row">
            <span className="profile-row-label">Kota</span>
            <span className="profile-row-value">{profile?.city || '—'}</span>
          </div>
          <div className="profile-seller-actions">
            <button
              type="button"
              className="btn-small btn-primary"
              onClick={() => onNavigate('seller')}
            >
              Buka Seller Dashboard
            </button>
          </div>
        </div>
      )
    }

    if (appStatus === 'under_review' || appStatus === 'submitted') {
      return (
        <div className="profile-block">
          <h2 className="profile-block-title">Seller</h2>
          <div className="seller-app-status-inline is-review">
            <span className="seller-app-status-badge is-review">Sedang Ditinjau</span>
            <p>
              Ajuan tokomu <strong>{sellerApplication.storeName}</strong> sedang
              ditinjau tim JabSewa. Kamu akan diberi tahu setelah ada keputusan.
            </p>
            <button
              type="button"
              className="btn-small btn-secondary"
              onClick={() => onNavigate('seller-onboarding')}
            >
              Lihat Status Ajuan
            </button>
          </div>
        </div>
      )
    }

    if (appStatus === 'rejected') {
      return (
        <div className="profile-block">
          <h2 className="profile-block-title">Seller</h2>
          <div className="seller-app-status-inline is-rejected">
            <span className="seller-app-status-badge is-rejected">Ajuan Ditolak</span>
            <p>
              {sellerApplication.rejectionReason || 'Ajuanmu belum disetujui.'}{' '}
              Kamu bisa mengajukan ulang kapan saja.
            </p>
            <button
              type="button"
              className="btn-small btn-secondary"
              onClick={() => onNavigate('seller-onboarding')}
            >
              Ajukan Ulang
            </button>
          </div>
        </div>
      )
    }

    // Belum ada ajuan → pintu masuk onboarding, bukan switch role
    return (
      <div className="profile-block">
        <h2 className="profile-block-title">Seller</h2>
        <p className="profile-block-desc">
          Punya barang yang jarang dipakai? Ajukan dirimu jadi seller — satu akun,
          tanpa registrasi baru.
        </p>
        <div className="profile-seller-actions">
          <button type="button" className="btn-small btn-primary" onClick={onSellerIntent}>
            Jadi Seller
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page-shell page-buyer-shell">
      <SimpleNavbar onNavigate={onNavigate} currentPage="profile" />

      <main className="buyer-page">
        <header className="buyer-head">
          <div>
            <p className="buyer-kicker">Profil</p>
            <h1>{user?.name}</h1>
            <p>Kelola akun dan aktivitas JabSewa kamu.</p>
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
            <div className="profile-links">
              <button type="button" className="profile-link-item" onClick={() => onNavigate('consumer')}>
                <span>Cari Barang</span>
                <span className="profile-link-arrow" aria-hidden="true">→</span>
              </button>
            </div>
          </div>

          <div className="profile-divider"></div>

          <div className="profile-block">
            <h2 className="profile-block-title">Penyewaan</h2>
            <div className="profile-links">
              <button type="button" className="profile-link-item" onClick={() => onNavigate('buyer')}>
                <span>My Rentals</span>
                <span className="profile-link-arrow" aria-hidden="true">→</span>
              </button>
              <button type="button" className="profile-link-item" onClick={() => onNavigate('buyer')}>
                <span>Wishlist</span>
                <span className="profile-link-arrow" aria-hidden="true">→</span>
              </button>
            </div>
          </div>

          <div className="profile-divider"></div>

          {renderSellerBlock()}

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