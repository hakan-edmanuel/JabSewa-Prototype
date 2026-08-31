import AgentChat from "./AgentChat";
import { useEffect, useState } from 'react'
import './App.css'
import Navbar from './components/Navbar'
import HeroSection from './components/HeroSection'
import CategorySection from './components/CategorySection'
import FeaturedListings from './components/FeaturedListings'
import HowItWorks from './components/HowItWorks'
import SellerCTA from './components/SellerCTA'
import AboutUs from './components/AboutUs'
import Footer from './components/Footer'
import ConsumerPage from './pages/ConsumerPage'
import SellerPage from './pages/SellerPage'
import AboutPage from './pages/AboutPage'
import CartPage from './pages/CartPage'
import RegisterPage from './pages/RegisterPage'

function getPageFromPath(pathname) {
  if (pathname === '/consumer') return 'consumer'
  if (pathname === '/seller') return 'seller'
  if (pathname === '/agent') return 'agent'
  if (pathname === '/about') return 'about'
  if (pathname === '/cart') return 'cart'
  if (pathname === '/register') return 'register'
  return 'home'
}

function App() {
  const [page, setPage] = useState(() => getPageFromPath(window.location.pathname))

  const navigate = (nextPage) => {
    const path = nextPage === 'home' ? '/' : `/${nextPage}`
    window.history.pushState({}, '', path)
    setPage(nextPage)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Fungsi khusus navigasi ke halaman Consumer dan Seller
  const goToConsumerPage = () => navigate('consumer')
  const goToSellerPage = () => navigate('seller')

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

  
  if (page === 'consumer') return <ConsumerPage onNavigate={navigate} />
  if (page === 'seller') return <SellerPage onNavigate={navigate} />
  if (page === 'agent') return <AgentChat title="jabsewa Coding Agent" />
  if (page === 'about') return <AboutPage onNavigate={navigate} />
  if (page === 'cart') return <CartPage onNavigate={navigate} />
  if (page === 'register') return <RegisterPage onNavigate={navigate} />

  return (
    <div className="page-shell">
      <Navbar
        onNavigate={navigate}
        onGoToConsumer={goToConsumerPage}
        onGoToSeller={goToSellerPage}
      />

      <main>
        <HeroSection onNavigate={navigate} />
        <CategorySection />
        <FeaturedListings />
        <HowItWorks />
        <SellerCTA onNavigate={navigate} />
      </main>

      <Footer onNavigate={navigate} />
    </div>
  )
}

export default App