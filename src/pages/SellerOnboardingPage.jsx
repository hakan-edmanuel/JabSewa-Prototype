import SimpleNavbar from '../components/SimpleNavbar'
import Footer from '../components/Footer'
import { useAuth } from '../auth/AuthContext'

const steps = [
  ['1', 'Daftarkan barang', 'Foto dan deskripsi singkat barang yang ingin disewakan.'],
  ['2', 'Atur harga & deposit', 'Tentukan tarif sewa harian dan deposit keamanan.'],
  ['3', 'Terima pesanan', 'Setujui permintaan sewa dan atur waktu pengambilan.'],
]

const CITIES = ['Jakarta Selatan', 'Jakarta Pusat', 'Jakarta Utara', 'Bandung', 'Bogor', 'Depok', 'Tangerang', 'Bekasi']

/*
 * Onboarding seller: ditampilkan sekali untuk user yang sudah login
 * tetapi belum pernah mengaktifkan role seller. Setelah selesai,
 * akses seller tersimpan di akun (completeSellerOnboarding) dan
 * onboarding tidak akan muncul lagi.
 */
export default function SellerOnboardingPage({ onNavigate }) {
  const { user, completeSellerOnboarding } = useAuth()

  const handleSubmit = (e) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    completeSellerOnboarding({
      storeName: data.get('storeName'),
      location: data.get('location'),
    })
    onNavigate('seller')
  }

  return (
    <div className="page-shell page-auth-shell">
      <SimpleNavbar onNavigate={onNavigate} currentPage="seller-onboarding" />

      <main className="onboarding-main">
        <div className="onboarding-card">
          <p className="about-intro-kicker">Jadi Seller</p>
          <h1>Mulai menyewakan barangmu</h1>
          <p className="onboarding-lede">
            Halo, {user?.name?.split(' ')[0]}. Kamu sudah punya akun JabSewa — tinggal
            aktifkan tokomu. Gratis, dan kamu baru mulai menerima pesanan setelah
            barang pertamamu terdaftar.
          </p>

          <div className="onboarding-steps">
            {steps.map(([number, title, desc]) => (
              <div key={number} className="onboarding-step">
                <span className="benefit-icon">{number}</span>
                <div>
                  <strong>{title}</strong>
                  <p>{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <form className="onboarding-form" onSubmit={handleSubmit}>
            <div className="auth-field">
              <label className="auth-label" htmlFor="store-name">Nama toko</label>
              <input
                id="store-name"
                name="storeName"
                type="text"
                required
                placeholder="cth: Rental Kamera Jaya"
                className="auth-input"
              />
            </div>
            <div className="auth-field">
              <label className="auth-label" htmlFor="store-location">Lokasi pengambilan</label>
              <select id="store-location" name="location" required className="auth-input">
                <option value="" disabled selected>Pilih kota</option>
                {CITIES.map((city) => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="auth-submit-btn">Aktifkan Toko</button>
            <p className="auth-switch">
              <button
                type="button"
                className="auth-switch-link"
                onClick={() => onNavigate('buyer')}
              >
                Nanti saja, kembali ke dashboard penyewa
              </button>
            </p>
          </form>
        </div>
      </main>

      <Footer onNavigate={onNavigate} />
    </div>
  )
}