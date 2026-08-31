import SimpleNavbar from '../components/SimpleNavbar';
import AboutUs from '../components/AboutUs';
import Footer from '../components/Footer';

export default function AboutPage({ onNavigate }) {
  return (
    <div className="page-shell page-about-shell">
      <SimpleNavbar onNavigate={onNavigate} />
      <main className="about-page-main">
        <AboutUs />
      </main>
      <Footer onNavigate={onNavigate} />
    </div>
  );
}