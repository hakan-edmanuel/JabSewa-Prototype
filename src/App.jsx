import { useEffect, useState } from 'react'
import './App.css'
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
import CartPage from './pages/CartPage'
import AuthPage from './pages/AuthPage'
import BuyerPage from './pages/BuyerPage'
import SellerOnboardingPage from './pages/SellerOnboardingPage'
import ProfilePage from './pages/ProfilePage'
import AdminApplicationsPage from './pages/AdminApplicationsPage'
import AgentChat from './AgentChat'
import { useAuth } from './auth/AuthContext'

function getPageFromPath(pathname) {
  if (pathname === '/consumer') return 'consumer'
  if (pathname === '/seller') return 'seller'
  if (pathname === '/seller/onboarding') return 'seller-onboarding'
  if (pathname === '/buyer') return 'buyer'
  if (pathname === '/profile') return 'profile'
  if (pathname === '/admin') return 'admin'
  if (pathname === '/agent') return 'agent'
  if (pathname === '/about') return 'about'
  if (pathname === '/cart') return 'cart'
  if (pathname === '/login' || pathname === '/register') return 'auth'
  return 'home'
}

function App() {
  const { user, hasSellerAccess } = useAuth()
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

  // --- Route guard ---
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

  if ((page === 'seller' || page === 'seller-onboarding' || page === 'buyer' || page === 'profile' || page === 'admin') && !user) {
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
      <AuthPage
        mode={authMode}
        onNavigate={navigate}
        onAuthenticated={handleAuthenticated}
        intent={authIntent || (guardTarget ? { page: guardTarget } : null)}
      />
    )
  }
  if (effectivePage === 'consumer') {
    return (
      <ConsumerPage
        key={consumerItemId ?? 'consumer'}
        onNavigate={navigate}
        onRequireAuth={goRent}
        initialItemId={consumerItemId}
      />
    )
  }
  if (effectivePage === 'seller') return <SellerPage onNavigate={navigate} />
  if (effectivePage === 'seller-onboarding') return <SellerOnboardingPage onNavigate={navigate} />
  if (effectivePage === 'buyer') return <BuyerPage onNavigate={navigate} onSellerIntent={goSeller} />
  if (effectivePage === 'profile') return <ProfilePage onNavigate={navigate} onSellerIntent={goSeller} />
  if (effectivePage === 'admin') return <AdminApplicationsPage onNavigate={navigate} />
  if (effectivePage === 'agent') return <AgentChat title="jabsewa Coding Agent" />
  if (effectivePage === 'about') return <AboutPage onNavigate={navigate} />
  if (effectivePage === 'cart') return <CartPage onNavigate={navigate} />

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
    </div>
  )
}

export default App