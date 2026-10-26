import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import App from './app/App'
import { AuthProvider } from './features/auth/AuthContext'
import ErrorBoundary from './ui/ErrorBoundary'
import { SpeedInsights } from '@vercel/speed-insights/react'

/*
 * ============================================================================
 * ENTRY POINT — JabSewa
 * ============================================================================
 * Urutan pemasangan:
 *   1. ErrorBoundary  — menangkap crash render agar tidak layar putih.
 *   2. AuthProvider   — context sesi Supabase Auth untuk seluruh app.
 *
 * Struktur src/:
 *   app/       router + guard (komposisi route)
 *   features/  fitur per area produk (auth, katalog, rental, seller, admin)
 *   domain/    logika murni tanpa I/O (konstanta, aturan aksi, format, search)
 *   data/      lapisan Supabase (satu-satunya tempat I/O data)
 *   ui/        komponen UI lintas fitur
 *   styles/    CSS global + per area
 *
 * Data & auth bersumber dari Supabase (sumber kebenaran). Tanpa env
 * VITE_SUPABASE_*, service melempar error konfigurasi yang jelas — TIDAK ada
 * fallback demo/localStorage (lihat data/listings.js).
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
