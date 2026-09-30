import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './auth/AuthContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { SpeedInsights } from '@vercel/speed-insights/react'

/*
 * ============================================================================
 * ENTRY POINT — JabSewa
 * ============================================================================
 * Urutan pemasangan:
 *   1. ErrorBoundary  — menangkap crash render agar tidak layar putih.
 *   2. AuthProvider   — context sesi Supabase Auth untuk seluruh app.
 *
 * Data & auth bersumber dari Supabase (sumber kebenaran). Tanpa env
 * VITE_SUPABASE_*, service melempar error konfigurasi yang jelas — TIDAK ada
 * fallback demo/localStorage (lihat lib/listings.js, 07-frontend-integration §3).
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
