/*
 * ============================================================================
 * ROUTER — JabSewa
 * ============================================================================
 * Pemisahan route (FITUR 2):
 *   /                      → landing publik
 *   /consumer /buyer ...   → UI user (Tenant & Store Owner)
 *   /sys-control-jab/*     → SUPERADMIN (subtree terisolasi; non-admin
 *                            melihat 404 — bukan 403 — agar route tidak
 *                            bisa di-enumerate)
 *
 * ATURAN ISOLASI: folder src/superadmin tidak boleh diimpor komponen user,
 * dan komponen user tidak boleh mengimpor apa pun dari src/superadmin.
 * Guard: UI (SuperadminGuard, 404 palsu) berbasis role `jabsewa_current_user`
 * (LocalStorage — mode mock/offline, tanpa RLS Postgres).
 * ============================================================================
 */
import { useEffect, useState } from 'react'
import './App.css'
import './styles/dev-switcher.css'
import Navbar from './components/Navbar'
import HeroSection from './components/HeroSection'
import CategorySection from './components/CategorySection'
import FeaturedListings from './components/FeaturedListings'
import HowItWorks from './components/HowItWorks'
import SellerCTA from './components/SellerCTA'
import Footer from './components/Footer'
import ConsumerPage from './pages/ConsumerPage'
import SellerPage from './pages/SellerPage'
import AboutPage from './pages/AboutPage'
import AuthPage from './pages/AuthPage'
import BuyerPage from './pages/BuyerPage'
import SellerOnboardingPage from './pages/SellerOnboardingPage'
import ProfilePage from './pages/ProfilePage'
import NotFoundPage from './pages/NotFoundPage'
import SysControlApp from './superadmin/SysControlApp'
import DevRoleSwitcher from './components/DevRoleSwitcher'
import { useAuth } from './auth/AuthContext'

function getPageFromPath(pathname) {
  if (pathname === '/consumer') return 'consumer'
  if (pathname === '/seller') return 'seller'
  if (pathname === '/seller/onboarding') return 'seller-onboarding'
  if (pathname === '/buyer') return 'buyer'
  if (pathname === '/profile') return 'profile'
  if (pathname === '/sys-control-jab' || pathname.startsWith('/sys-control-jab/')) return 'sys-control'
  if (pathname === '/about') return 'about'
  if (pathname === '/login' || pathname === '/register') return 'auth'
  if (pathname === '/') return 'home'
  return 'not-found'
}

function App() {
  const { user, hasSellerAccess, isReady } = useAuth()
  const [page, setPage] = useState(() => getPageFromPath(window.location.pathname))
  // Tujuan setelah login/daftar: { page: 'seller' | 'buyer' | 'consumer', itemId? }
  const [authIntent, setAuthIntent] = useState(null)
  // Item yang ingin dibuka di halaman consumer (setelah login / dari wishlist)
  const [consumerItemId, setConsumerItemId] = useState(null)

  const navigate = (nextPage, opts = {}) => {
    let path
    if (nextPage === 'home') path = '/'
    else if (nextPage === 'auth') path = opts.mode === 'login' ? '/login' : '/register'
    else if (nextPage === 'seller-onboarding') path = '/seller/onboarding'
    else path = `/${nextPage}`

    if (nextPage === 'consumer' && opts.itemId) setConsumerItemId(opts.itemId)

    window.history.pushState({}, '', path)
    setPage(nextPage)
    window.scrollTo({ top: 0 })
  }

  // Pintu masuk seller yang benar (lifecycle, bukan switch role):
  //   belum login            → auth (dengan intent) → onboarding
  //   login, belum ada ajuan → onboarding (ajuan seller)
  //   ajuan under_review/rejected → layar status ajuan
  //   approved (sellerProfile ada) → dashboard seller
  const goSeller = () => {
    if (!user) {
      setAuthIntent({ page: 'seller' })
      navigate('auth', { mode: 'register' })
      return
    }
    if (!hasSellerAccess) {
      navigate('seller-onboarding')
      return
    }
    navigate('seller')
  }

  // Pintu masuk sewa: user belum login diminta masuk dulu,
  // lalu dikembalikan ke detail barang yang sama.
  const goRent = (item) => {
    if (!user) {
      setAuthIntent({ page: 'consumer', itemId: item.id })
      navigate('auth', { mode: 'login' })
    }
  }

  // Dipanggil setelah login/daftar berhasil — lanjut ke tujuan semula.
  // `guardTarget` berasal dari render terakhir (saat AuthPage tampil),
  // jadi user yang semula dicegat route dilanjutkan ke halaman itu.
  const handleAuthenticated = (authenticatedUser) => {
    const intent = authIntent || (guardTarget ? { page: guardTarget } : null)
    setAuthIntent(null)
    if (!intent) {
      navigate('home')
      return
    }
    if (intent.page === 'seller') {
      if (authenticatedUser?.sellerProfile) navigate('seller')
      else navigate('seller-onboarding')
    } else if (intent.page === 'buyer') {
      navigate('buyer')
    } else if (intent.page === 'profile') {
      navigate('profile')
    } else if (intent.page === 'consumer') {
      setConsumerItemId(intent.itemId ?? null)
      navigate('consumer')
    } else {
      navigate('home')
    }
  }

  useEffect(() => {
    const handlePopState = () => setPage(getPageFromPath(window.location.pathname))
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (page !== 'home') return undefined

    const revealItems = document.querySelectorAll('.reveal-on-scroll')
    if (!revealItems.length) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -30px 0px' },
    )

    revealItems.forEach((item) => observer.observe(item))
    return () => observer.disconnect()
  }, [page])

  // Tunggu sesi lokal (LocalStorage) selesai dibaca sebelum route guard
  // dievaluasi, supaya refresh halaman tidak “flash” ke halaman login.
  // (Diletakkan SETELAH semua hooks — jangan dinaikkan ke atas.)
  if (!isReady) {
    return (
      <div className="page-shell" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <p>Memuat…</p>
      </div>
    )
  }

  // --- Route area superadmin (terisolasi; guard sendiri di SuperadminGuard) ---
  // Role diverifikasi terhadap koleksi `users` di LocalStorage via
  // lib/superadmin.requireSuperAdmin (default-deny).
  if (page === 'sys-control') {
    return <SysControlApp onExit={() => navigate('home')} />
  }

  // --- Route guard user (TENANT / STORE_OWNER) ---
  let effectivePage = page
  const authMode = window.location.pathname.includes('/login') ? 'login' : 'register'

  // Halaman yang memicu redirect ke auth saat belum login:
  const guardTarget = !user
    ? page === 'buyer'
      ? 'buyer'
      : page === 'profile'
        ? 'profile'
        : page === 'seller' || page === 'seller-onboarding'
          ? 'seller'
          : null
    : null

  if ((page === 'seller' || page === 'seller-onboarding' || page === 'buyer' || page === 'profile') && !user) {
    effectivePage = 'auth'
  }
  // Seller dashboard membutuhkan akses seller — selain itu tampilkan onboarding.
  if (page === 'seller' && user && !hasSellerAccess) {
    effectivePage = 'seller-onboarding'
  }
  // User yang sudah seller tidak perlu onboarding lagi.
  if (page === 'seller-onboarding' && user && hasSellerAccess) {
    effectivePage = 'seller'
  }

  if (effectivePage === 'auth') {
    return (
      <Shell>
        <AuthPage
          mode={authMode}
          onNavigate={navigate}
          onAuthenticated={handleAuthenticated}
          intent={authIntent || (guardTarget ? { page: guardTarget } : null)}
        />
      </Shell>
    )
  }
  if (effectivePage === 'consumer') {
    return (
      <Shell>
        <ConsumerPage
          key={consumerItemId ?? 'consumer'}
          onNavigate={navigate}
          onRequireAuth={goRent}
          initialItemId={consumerItemId}
        />
      </Shell>
    )
  }
  if (effectivePage === 'seller') return <Shell><SellerPage onNavigate={navigate} /></Shell>
  if (effectivePage === 'seller-onboarding')
    return <Shell><SellerOnboardingPage onNavigate={navigate} /></Shell>
  if (effectivePage === 'buyer') return <Shell><BuyerPage onNavigate={navigate} onSellerIntent={goSeller} /></Shell>
  if (effectivePage === 'profile') return <Shell><ProfilePage onNavigate={navigate} onSellerIntent={goSeller} /></Shell>
  if (effectivePage === 'about') return <Shell><AboutPage onNavigate={navigate} /></Shell>

  if (effectivePage === 'not-found') return <NotFoundPage />

  return (
    <div className="page-shell">
      <Navbar
        onNavigate={navigate}
        onSellerIntent={goSeller}
        currentPage="home"
      />

      <main>
        <HeroSection onNavigate={navigate} onSellerIntent={goSeller} />
        <CategorySection onNavigate={navigate} />
        <FeaturedListings onNavigate={navigate} />
        <HowItWorks />
        <SellerCTA onNavigate={goSeller} />
      </main>

      <Footer onNavigate={navigate} />
      <DevRoleSwitcher />
    </div>
  )
}

/**
 * Pembungkus ringan untuk halaman user: menambahkan DevRoleSwitcher
 * (panel demo ganti role) tanpa mengubah komponen halamannya.
 */
function Shell({ children }) {
  return (
    <>
      {children}
      <DevRoleSwitcher />
    </>
  )
}

export default App