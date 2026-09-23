/*
 * ============================================================================
 * ERROR BOUNDARY — JabSewa
 * ============================================================================
 * Jaring pengaman render: exception apa pun di subtree React (mis. modul
 * gagal dimuat, bug komponen) tidak lagi menghasilkan LAYAR PUTIH tanpa
 * informasi — diganti kartu error yang menjelaskan apa yang terjadi dan
 * cara mencoba lagi (tanpa memuat ulang seluruh halaman).
 *
 * Komponen class: satu-satunya cara React menangkap error saat render
 * (fungsi/hook tidak punya lifecycle ini).
 * ============================================================================
 */

import { Component } from 'react'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[JabSewa][ErrorBoundary]', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          fontFamily: 'system-ui, sans-serif',
          background: '#f8fafc',
        }}
      >
        <div
          style={{
            maxWidth: 520,
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: 28,
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 40, margin: 0 }}>⚠️</p>
          <h1 style={{ fontSize: '1.15rem', margin: '10px 0 6px' }}>Terjadi kesalahan aplikasi</h1>
          <p style={{ color: '#475569', fontSize: '0.9rem', margin: 0 }}>
            {this.state.error?.message || 'Error tidak diketahui.'}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 18,
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: '#0f172a',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Coba Lagi
          </button>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary
