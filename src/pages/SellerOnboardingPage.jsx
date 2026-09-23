import { useState } from 'react'
import SimpleNavbar from '../components/SimpleNavbar'
import Footer from '../components/Footer'
import { useAuth } from '../auth/AuthContext'
import { formatDate } from '../lib/format'
import { CITIES } from '../lib/constants'

const WIZARD_STEPS = ['Info Seller', 'Perjanjian', 'Review & Kirim']

/*
 * ============================================================================
 * SELLER ONBOARDING — alur ajuan jadi seller (lifecycle, bukan switch role).
 * ============================================================================
 * SELLER APPLICATION = proses/permintaan menjadi seller.
 * SELLER PROFILE     = identitas seller yang HANYA tercipta setelah ajuan
 *                      disetujui (lihat AuthContext.decideSellerApplication).
 *
 * Alur:
 *   belum ada ajuan / draft → wizard 3 langkah (Info → Perjanjian → Review)
 *   under_review            → layar status "Sedang Ditinjau"
 *   rejected                → layar status dengan alasan + tombol ajukan ulang
 *   approved                → kartu "Disetujui" dengan pintu ke seller dashboard
 *
 * Keputusan review kini dilakukan admin di halaman Admin Applications
 * (/admin) — bukan lagi simulasi di layar applicant.
 * ============================================================================
 */

function AgreementText() {
  return (
    <div className="seller-app-agreement-text">
      <p><strong>Ketentuan Seller JabSewa</strong></p>
      <p>1. Barang yang disewakan adalah milik sah kamu dan layak digunakan.</p>
      <p>2. Kamu bertanggung jawab atas keakuratan deskripsi, foto, harga, dan deposit barang.</p>
      <p>3. Permintaan sewa yang kamu setujui adalah komitmen — pembatalan sepihak dapat memengaruhi reputasi tokomu.</p>
      <p>4. Deposit keamanan wajib dikembalikan penyewa dalam kondisi yang sama saat penyerahan.</p>
      <p>5. JabSewa dapat menonaktifkan toko yang melanggar ketentuan atau menipu penyewa.</p>
      <p>6. Penarikan pendapatan mengikuti jadwal pembayaran JabSewa yang berlaku.</p>
    </div>
  )
}

export default function SellerOnboardingPage({ onNavigate }) {
  const { user, sellerApplication, hasSellerAccess, submitSellerApplication, startSellerApplication } = useAuth()

  const [step, setStep] = useState(1)
  const [form, setForm] = useState(() => ({
    storeName: sellerApplication?.storeName || '',
    description: sellerApplication?.description || '',
    contact: sellerApplication?.contact || user?.email || '',
    city: sellerApplication?.city || '',
    address: sellerApplication?.address || '',
    agreement: false,
  }))
  const [submitting, setSubmitting] = useState(false)

  const setField = (name, value) => setForm((f) => ({ ...f, [name]: value }))

  // --- Layar status (ajuan sudah pernah dikirim / approved) ---
  if (hasSellerAccess || (sellerApplication && sellerApplication.status !== 'draft')) {
    return (
      <ApplicationStatusScreen
        application={sellerApplication || { status: 'approved', storeName: user?.sellerProfile?.storeName }}
        onNavigate={onNavigate}
        onReapply={() => startSellerApplication({ ...form, agreement: false })}
      />
    )
  }

  const step1Valid = form.storeName.trim() && form.description.trim() && form.contact.trim() && form.city && form.address.trim()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    await submitSellerApplication({
      storeName: form.storeName,
      description: form.description,
      contact: form.contact,
      city: form.city,
      address: form.address,
    })
    setSubmitting(false)
  }

  return (
    <div className="page-shell page-auth-shell">
      <SimpleNavbar onNavigate={onNavigate} currentPage="seller-onboarding" />

      <main className="onboarding-main">
        <div className="onboarding-card">
          <p className="about-intro-kicker">Jadi Seller</p>
          <h1>Ajukan dirimu jadi seller</h1>
          <p className="onboarding-lede">
            Halo, {user?.name?.split(' ')[0]}. Satu akun JabSewa-mu akan mendapat{' '}
            <strong>profil seller</strong> setelah ajuan ini disetujui tim kami.
            Tidak perlu akun baru.
          </p>

          {/* Stepper */}
          <ol className="seller-app-stepper" aria-label="Langkah ajuan seller">
            {WIZARD_STEPS.map((label, i) => {
              const n = i + 1
              const state = n < step ? 'done' : n === step ? 'active' : 'todo'
              return (
                <li key={label} className={`seller-app-step is-${state}`}>
                  <span className="seller-app-step-dot">{n < step ? '✓' : n}</span>
                  <span className="seller-app-step-label">{label}</span>
                </li>
              )
            })}
          </ol>

          {/* STEP 1 — Informasi seller */}
          {step === 1 && (
            <form
              className="onboarding-form"
              onSubmit={(e) => { e.preventDefault(); setStep(2) }}
            >
              <div className="auth-field">
                <label className="auth-label" htmlFor="store-name">Nama toko / seller</label>
                <input
                  id="store-name"
                  type="text"
                  required
                  placeholder="cth: Rental Kamera Jaya"
                  className="auth-input"
                  value={form.storeName}
                  onChange={(e) => setField('storeName', e.target.value)}
                />
              </div>
              <div className="auth-field">
                <label className="auth-label" htmlFor="seller-desc">Deskripsi seller</label>
                <textarea
                  id="seller-desc"
                  required
                  rows={3}
                  placeholder="Ceritakan singkat barang apa yang kamu sewakan."
                  className="auth-input"
                  value={form.description}
                  onChange={(e) => setField('description', e.target.value)}
                />
              </div>
              <div className="auth-field">
                <label className="auth-label" htmlFor="seller-contact">Kontak (WA / telepon)</label>
                <input
                  id="seller-contact"
                  type="text"
                  required
                  placeholder="cth: 0812xxxxxxx"
                  className="auth-input"
                  value={form.contact}
                  onChange={(e) => setField('contact', e.target.value)}
                />
              </div>
              <div className="auth-field">
                <label className="auth-label" htmlFor="seller-city">Kota</label>
                <select
                  id="seller-city"
                  required
                  className="auth-input"
                  value={form.city}
                  onChange={(e) => setField('city', e.target.value)}
                >
                  <option value="" disabled>Pilih kota</option>
                  {CITIES.map((city) => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </div>
              <div className="auth-field">
                <label className="auth-label" htmlFor="seller-address">Alamat lengkap</label>
                <textarea
                  id="seller-address"
                  required
                  rows={2}
                  placeholder="Alamat pengambilan / pengembalian barang."
                  className="auth-input"
                  value={form.address}
                  onChange={(e) => setField('address', e.target.value)}
                />
              </div>
              <button type="submit" className="auth-submit-btn" disabled={!step1Valid}>
                Lanjut ke Perjanjian
              </button>
              <p className="auth-switch">
                <button type="button" className="auth-switch-link" onClick={() => onNavigate('buyer')}>
                  Nanti saja, kembali ke dashboard penyewa
                </button>
              </p>
            </form>
          )}

          {/* STEP 2 — Perjanjian */}
          {step === 2 && (
            <form
              className="onboarding-form"
              onSubmit={(e) => { e.preventDefault(); setStep(3) }}
            >
              <AgreementText />
              <label className="seller-app-agreement-check">
                <input
                  type="checkbox"
                  required
                  checked={form.agreement}
                  onChange={(e) => setField('agreement', e.target.checked)}
                />
                <span>Saya telah membaca dan menyetujui Ketentuan Seller JabSewa.</span>
              </label>
              <div className="seller-app-btn-row">
                <button type="button" className="auth-switch-link" onClick={() => setStep(1)}>
                  ← Kembali
                </button>
                <button type="submit" className="auth-submit-btn" disabled={!form.agreement}>
                  Lanjut ke Review
                </button>
              </div>
            </form>
          )}

          {/* STEP 3 — Review & kirim */}
          {step === 3 && (
            <form className="onboarding-form" onSubmit={handleSubmit}>
              <div className="seller-app-review">
                {[
                  ['Nama toko', form.storeName],
                  ['Deskripsi', form.description],
                  ['Kontak', form.contact],
                  ['Kota', form.city],
                  ['Alamat', form.address],
                  ['Perjanjian', 'Disetujui'],
                ].map(([label, value]) => (
                  <div key={label} className="seller-app-review-row">
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <p className="seller-app-note">
                Ajuan akan ditinjau tim JabSewa. Kamu tetap bisa menyewa barang
                selama menunggu hasil review.
              </p>
              <div className="seller-app-btn-row">
                <button type="button" className="auth-switch-link" onClick={() => setStep(2)}>
                  ← Kembali
                </button>
                <button type="submit" className="auth-submit-btn" disabled={submitting}>
                  {submitting ? 'Mengirim…' : 'Kirim Ajuan'}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>

      <Footer onNavigate={onNavigate} />
    </div>
  )
}

/* --- Layar status ajuan: under_review / rejected / approved --- */
function ApplicationStatusScreen({ application, onNavigate, onReapply }) {
  const { user, hasSellerAccess } = useAuth()

  if (hasSellerAccess || application.status === 'approved') {
    return (
      <div className="page-shell page-auth-shell">
        <SimpleNavbar onNavigate={onNavigate} currentPage="seller-onboarding" />
        <main className="onboarding-main">
          <div className="onboarding-card seller-app-status">
            <span className="seller-app-status-badge is-approved">Disetujui</span>
            <h1>Selamat, tokomu aktif!</h1>
            <p className="onboarding-lede">
              Profil seller <strong>{application.storeName}</strong> sudah dibuat.
              Lanjutkan ke dashboard seller untuk mengelola barang dan permintaan sewa.
            </p>
            <button className="auth-submit-btn" onClick={() => onNavigate('seller')}>
              Buka Seller Dashboard
            </button>
          </div>
        </main>
        <Footer onNavigate={onNavigate} />
      </div>
    )
  }

  if (application.status === 'rejected') {
    return (
      <div className="page-shell page-auth-shell">
        <SimpleNavbar onNavigate={onNavigate} currentPage="seller-onboarding" />
        <main className="onboarding-main">
          <div className="onboarding-card seller-app-status">
            <span className="seller-app-status-badge is-rejected">Ditolak</span>
            <h1>Ajuanmu belum disetujui</h1>
            <div className="seller-app-reject-reason">
              <span className="profile-row-label">Alasan reviewer</span>
              <p>{application.rejectionReason || 'Tidak ada alasan yang dicantumkan.'}</p>
            </div>
            <p className="onboarding-lede">
              Kamu bisa memperbaiki data dan mengajukan ulang kapan saja.
            </p>
            <div className="seller-app-btn-row">
              <button className="auth-switch-link" onClick={() => onNavigate('buyer')}>
                Kembali ke dashboard penyewa
              </button>
              <button className="auth-submit-btn" onClick={onReapply}>
                Ajukan Ulang
              </button>
            </div>
          </div>
        </main>
        <Footer onNavigate={onNavigate} />
      </div>
    )
  }

  // under_review (atau submitted)
  return (
    <div className="page-shell page-auth-shell">
      <SimpleNavbar onNavigate={onNavigate} currentPage="seller-onboarding" />
      <main className="onboarding-main">
        <div className="onboarding-card seller-app-status">
          <span className="seller-app-status-badge is-review">
            <span className="seller-app-pulse" aria-hidden="true"></span>
            Sedang Ditinjau
          </span>
          <h1>Ajuan seller diterima</h1>
          <p className="onboarding-lede">
            Terima kasih, {user?.name?.split(' ')[0] || 'kamu'}. Ajuan tokomu{' '}
            <strong>{application.storeName}</strong> sudah kami terima dan sedang
            ditinjau tim JabSewa. Kamu akan diberi tahu setelah ada keputusan —
            selama menunggu, kamu tetap bisa menyewa barang seperti biasa.
          </p>
          <div className="seller-app-review">
            {[
              ['Nama toko', application.storeName],
              ['Kota', application.city || '—'],
              ['Dikirim', formatDate(application.submittedAt)],
            ].map(([label, value]) => (
              <div key={label} className="seller-app-review-row">
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>            <button className="auth-switch-link" onClick={() => onNavigate('buyer')}>
            Kembali ke dashboard penyewa
          </button>
        </div>
      </main>
      <Footer onNavigate={onNavigate} />
    </div>
  )
}
