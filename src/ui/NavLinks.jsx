/* Daftar tautan navigasi — dirender identik di desktop & panel mobile. */
export default function NavLinks({ links, currentPage, onGo }) {
  return (
    <>
      {links.map((link) => (
        <button
          key={link.key}
          type="button"
          className={`nav-link ${link.page && currentPage === link.page ? "is-active" : ""}`}
          onClick={link.onSelect || (() => onGo(link.page))}
        >
          {link.label}
        </button>
      ))}
    </>
  );
}
