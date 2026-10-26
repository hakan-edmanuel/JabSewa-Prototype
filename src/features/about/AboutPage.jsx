import SimpleNavbar from '../../ui/SimpleNavbar';
import AboutUs from './AboutUs';
import Footer from '../../ui/Footer';

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