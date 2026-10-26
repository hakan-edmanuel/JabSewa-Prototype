/*
 * ============================================================================
 * APP — komposisi route JabSewa
 * ============================================================================
 * Tugas file ini HANYA: pilih halaman berdasarkan path + guard UX, lalu render.
 * Pengetahuan path ada di app/routes.js; aturan admin di domain/postLoginRouting.
 *
 *   /                      → landing publik
 *   /consumer /buyer ...   → UI penyewa (consumer)
 *   /sys-control-jab/*     → area ADMIN (subtree terisolasi; non-admin melihat
 *                            404 — bukan 403 — agar route tidak dapat
 *                            di-enumerate)
 *
 * ATURAN ISOLASI: fitur user tidak boleh mengimpor apa pun dari
 * features/admin, dan sebaliknya. Guard UI (AdminGuard, 404 palsu) hanya
 * cermin UX — otorisasi sesungguhnya: Supabase Auth + RLS + guard is_admin()
 * di setiap RPC.
 * ============================================================================
 */
import { lazy, Suspense, useEffect, useState } from 'react'
import '../styles/app.css'
import '../styles/dev-switcher.css'
import Navbar from '../ui/Navbar'
import Footer from '../ui/Footer'
import DevRoleSwitcher from '../ui/DevRoleSwitcher'
import HeroSection from '../features/landing/HeroSection'
import CategorySection from '../features/landing/CategorySection'
import FeaturedListings from '../features/landing/FeaturedListings'
import HowItWorks from '../features/landing/HowItWorks'
import SellerCTA from '../features/landing/SellerCTA'
import ConsumerPage from '../features/katalog/ConsumerPage'
import ConsumerOrdersPage from '../features/rental/ConsumerOrdersPage'
import SellerOnboardingPage from '../features/seller/SellerOnboardingPage'
import ProfilePage from '../features/profile/ProfilePage'
import AuthPage from '../features/auth/AuthPage'
import AboutPage from '../features/about/AboutPage'
import NotFoundPage from '../ui/NotFoundPage'
import { useAuth } from '../features/auth/AuthContext'
import {
  resolvePostLoginTarget,
  recordSysControlVisit,
  getSysControlReturnPath,
  clearSysControlReturnPath,
} from '../domain/postLoginRouting'
import {
  ADMIN_PAGE,
  AUTH_PAGE,
  NOT_FOUND_PAGE,
  getAuthModeFromPath,
  getGuardTarget,
  getPageFromPath,
  planNavigation,
  resolveIntentDestination,
} from './routes'

/*
 * Halaman berat dimuat saat benar-benar dibutuhkan. Area admin, seller center,
 * dan halaman legal tidak ikut bundle awal landing/katalog.
 */
const AdminApp = lazy(() => import('../features/admin/AdminApp'))
const SellerPage = lazy(() => import('../features/seller/SellerPage'))
const TermsPage = lazy(() => import('../features/legal/TermsPage'))
const PrivacyPage = lazy(() => import('../features/legal/PrivacyPage'))

/** Layar netral saat sesi masih dibaca — mencegah "flash" ke halaman login. */
function SessionLoading() {
  return (
    <div className="page-shell centered-screen">
      <p>Memuat…</p>
    </div>
  )
}

/** Fallback netral selama chunk halaman dimuat. */
function PageSuspense({ children }) {
  return <Suspense fallback={<SessionLoading />}>{children}</Suspense>
}

/** Pembungkus halaman user: menambahkan panel dev (hanya tampil di dev). */
function Shell({ children }) {
  return (
    <>
      {children}
      <DevRoleSwitcher />
    </>
  )
}

function HomeLanding({ onNavigate, onSellerIntent }) {
  return (
    <div className="page-shell">
      <Navbar onNavigate={onNavigate} onSellerIntent={onSellerIntent} currentPage="home" />

      <main>
        <HeroSection onNavigate={onNavigate} onSellerIntent={onSellerIntent} />
        <CategorySection onNavigate={onNavigate} />
        <FeaturedListings onNavigate={onNavigate} />
        <HowItWorks />
        <SellerCTA onNavigate={onSellerIntent} />
      </main>

      <Footer onNavigate={onNavigate} />
      <DevRoleSwitcher />
    </div>
  )
}

function App() {
  const { user, hasSellerAccess, isReady } = useAuth()
  const [page, setPage] = useState(() => getPageFromPath(window.location.pathname))
  // Tujuan setelah login/daftar: { page: 'seller' | 'buyer' | 'consumer', itemId? }
  const [authIntent, setAuthIntent] = useState(null)
  // Item yang ingin dibuka di halaman consumer (setelah login / dari wishlist)
  const [consumerItemId, setConsumerItemId] = useState(null)

  /**
   * `opts.replace` menimpa entri history alih-alih menambah — dipakai setelah
   * login agar tombol back tidak mengembalikan ke form login yang sudah lewat.
   * Keputusan URL/state ada di planNavigation (murni, teruji).
   */
  const navigate = (nextPage, opts = {}) => {
    const plan = planNavigation(nextPage, opts)
    if (plan.itemId !== undefined) setConsumerItemId(plan.itemId)

    if (plan.replace) window.history.replaceState({}, '', plan.url)
    else window.history.pushState({}, '', plan.url)
    setPage(nextPage)
    window.scrollTo({ top: 0 })
  }

  // Pintu masuk seller (lifecycle, bukan switch role):
  //   belum login            → auth (dengan intent) → onboarding
  //   login, belum ada ajuan → onboarding
  //   ajuan pending/rejected → layar status ajuan
  //   approved (store aktif) → dashboard seller
  const goSeller = () => {
    if (!user) {
      setAuthIntent({ page: 'seller' })
      navigate('auth', { mode: 'register' })
      return
    }
    navigate(hasSellerAccess ? 'seller' : 'seller-onboarding')
  }

  // Pintu masuk sewa: tamu diminta masuk dulu, lalu dikembalikan ke barang
  // yang sama. Dipanggil dari tombol "Masuk untuk sewa" di ProductDetail.
  const goRent = (item) => {
    if (user) return
    setAuthIntent({ page: 'consumer', itemId: item.id })
    navigate('auth', { mode: 'login' })
  }

  // Dipanggil setelah login/daftar berhasil — lanjut ke tujuan semula.
  // `guardTarget` berasal dari render saat AuthPage tampil.
  const handleAuthenticated = (authenticatedUser) => {
    const intent = authIntent || (guardTarget ? { page: guardTarget } : null)
    setAuthIntent(null)

    // Operator entry: admin aktif tanpa intent eksplisit masuk workspace-nya.
    // Keputusan murni UX; otorisasi tetap server-side (is_admin + RLS + RPC).
    const operatorTarget = resolvePostLoginTarget({
      profile: authenticatedUser,
      intent,
      sysControlReturnPath: getSysControlReturnPath(),
    })
    if (operatorTarget.kind === 'sys-control') {
      clearSysControlReturnPath()
      window.history.replaceState({}, '', operatorTarget.path)
      setPage(ADMIN_PAGE)
      window.scrollTo({ top: 0 })
      return
    }

    const destination = resolveIntentDestination(intent, authenticatedUser)
    // replace: setelah login, back harus kembali ke halaman sebelum login.
    navigate(destination.page, { itemId: destination.itemId, replace: true })
  }

  useEffect(() => {
    const handlePopState = () => setPage(getPageFromPath(window.location.pathname))
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // Rekam deep-link /sys-control-jab/* yang dibuka TANPA sesi (yang tampil
  // tetap 404 samaran). Return-to hanya dipakai bila yang login belakangan
  // adalah operator aktif.
  useEffect(() => {
    if (page === ADMIN_PAGE && !user) {
      recordSysControlVisit(window.location.pathname)
    }
  }, [page, user])

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

  // Tunggu sesi Supabase selesai dibaca sebelum guard dievaluasi. Diletakkan
  // SETELAH semua hooks — jangan dinaikkan ke atas.
  if (!isReady) return <SessionLoading />

  if (page === ADMIN_PAGE) {
    return (
      <PageSuspense>
        <AdminApp onExit={() => navigate('home')} />
      </PageSuspense>
    )
  }

  // --- Guard UX halaman penyewa/seller ---
  // Halaman yang butuh login menampilkan form auth (bukan redirect paksa)
  // sambil membawa intent tujuannya.
  const guardTarget = user ? null : getGuardTarget(page)
  let effectivePage = guardTarget ? AUTH_PAGE : page

  // Dashboard seller butuh toko aktif; selain itu arahkan ke onboarding.
  if (page === 'seller' && user && !hasSellerAccess) effectivePage = 'seller-onboarding'
  // Seller aktif tidak perlu onboarding lagi.
  if (page === 'seller-onboarding' && user && hasSellerAccess) effectivePage = 'seller'

  if (effectivePage === AUTH_PAGE) {
    return (
      <Shell>
        <AuthPage
          mode={getAuthModeFromPath(window.location.pathname)}
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

  if (effectivePage === 'buyer') {
    return (
      <Shell>
        <ConsumerOrdersPage onNavigate={navigate} onSellerIntent={goSeller} />
      </Shell>
    )
  }

  if (effectivePage === 'profile') {
    return (
      <Shell>
        <ProfilePage onNavigate={navigate} onSellerIntent={goSeller} />
      </Shell>
    )
  }

  if (effectivePage === 'seller') {
    return (
      <Shell>
        <PageSuspense>
          <SellerPage onNavigate={navigate} />
        </PageSuspense>
      </Shell>
    )
  }

  if (effectivePage === 'seller-onboarding') {
    return (
      <Shell>
        <SellerOnboardingPage onNavigate={navigate} />
      </Shell>
    )
  }

  if (effectivePage === 'about') {
    return (
      <Shell>
        <AboutPage onNavigate={navigate} />
      </Shell>
    )
  }

  if (effectivePage === 'terms') {
    return (
      <Shell>
        <PageSuspense>
          <TermsPage onNavigate={navigate} />
        </PageSuspense>
      </Shell>
    )
  }

  if (effectivePage === 'privacy') {
    return (
      <Shell>
        <PageSuspense>
          <PrivacyPage onNavigate={navigate} />
        </PageSuspense>
      </Shell>
    )
  }

  if (effectivePage === NOT_FOUND_PAGE) return <NotFoundPage />

  return <HomeLanding onNavigate={navigate} onSellerIntent={goSeller} />
}

export default App
