import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './auth/AuthContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { SpeedInsights } from '@vercel/speed-insights/react'

/*
 * ============================================================================
 * ENTRY POINT — JabSewa (MODE MOCK / OFFLINE)
 * ============================================================================
 * Urutan pemasangan:
 *   1. ErrorBoundary  — menangkap crash render agar tidak layar putih.
 *   2. AuthProvider   — context sesi LocalStorage untuk seluruh app.
 *
 * Tidak ada lagi guard env Supabase: seluruh data & auth berjalan lokal
 * (LocalStorage) — `npm run dev` langsung jalan tanpa internet.
 * ============================================================================
 */

const rootElement = document.getElementById('root')

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
        <SpeedInsights />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
