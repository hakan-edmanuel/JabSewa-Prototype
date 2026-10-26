import Navbar from './Navbar'

/*
 * Navbar ringkas untuk halaman non-landing (about, cart, buyer).
 * Menghilangkan anchor section home — sisanya mengikuti status login/role.
 */
export default function SimpleNavbar({ onNavigate, currentPage }) {
  return <Navbar onNavigate={onNavigate} simple currentPage={currentPage} />
}