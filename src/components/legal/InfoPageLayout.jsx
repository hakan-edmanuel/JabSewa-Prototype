import SimpleNavbar from '../SimpleNavbar'
import Footer from '../Footer'

/*
 * ============================================================================
 * INFO PAGE LAYOUT — halaman informasi/legal JabSewa (Terms, Privacy)
 * ============================================================================
 * Pola visual mengikuti halaman statis existing (AboutPage):
 *   SimpleNavbar → kartu konten terpusat → Footer.
 * - Daftar isi berupa anchor in-page (#id) — tidak menyentuh router.
 * - Link "Kembali ke Beranda" memakai onNavigate('home') bila tersedia,
 *   fallback ke href="/" (full reload) agar selalu berfungsi.
 * ============================================================================
 */
export default function InfoPageLayout({ kicker, title, updated, toc = [], onNavigate, children }) {
  const handleBack = (e) => {
    e.preventDefault()
    if (onNavigate) onNavigate('home')
  }

  return (
    <div className="page-shell page-legal-shell">
      <SimpleNavbar onNavigate={onNavigate} currentPage="home" />

      <main className="legal-page-main">
        <article className="legal-card">
          <header className="legal-header">
            <p className="about-intro-kicker">{kicker}</p>
            <h1>{title}</h1>
            <p className="legal-updated">Terakhir diperbarui: {updated}</p>
          </header>

          {toc.length > 0 && (
            <nav className="legal-toc" aria-label="Daftar isi">
              <p className="legal-toc-title">Daftar Isi</p>
              <ol>
                {toc.map((item) => (
                  <li key={item.id}>
                    <a href={`#${item.id}`}>{item.label}</a>
                  </li>
                ))}
              </ol>
            </nav>
          )}

          <div className="legal-body">{children}</div>

          <div className="legal-back">
            <a href="/" onClick={handleBack}>
              ← Kembali ke Beranda
            </a>
          </div>
        </article>
      </main>

      <Footer onNavigate={onNavigate} />
    </div>
  )
}
