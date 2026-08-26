import SimpleNavbar from '../components/SimpleNavbar';
import AboutUs from '../components/AboutUs';
import Footer from '../components/Footer';

export default function AboutPage({ onNavigate }) {
  return (
    <div className="page-shell" style={{ background: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SimpleNavbar onNavigate={onNavigate} />
      <main style={{ flex: 1, padding: '60px 20px' }}>
        <div style={{ background: 'white', borderRadius: '24px', padding: '40px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)', maxWidth: '900px', margin: '0 auto', border: '1px solid #e2e8f0' }}>
          <AboutUs />
        </div>
      </main>
      <Footer onNavigate={onNavigate} />
    </div>
  );
}