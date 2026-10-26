/* Ganti mode Penyewa ↔ Seller (hanya untuk user dengan akses seller). */
export default function ModeSwitch({ currentPage, onGo, mobile = false }) {
  return (
    <div
      className={`nav-mode-switch ${mobile ? "nav-mode-switch-mobile" : ""}`}
      role={mobile ? undefined : "group"}
      aria-label={mobile ? undefined : "Ganti mode"}
    >
      <button
        type="button"
        className={`nav-mode-btn ${currentPage === "consumer" ? "is-active" : ""}`}
        onClick={() => onGo("consumer")}
      >
        Mode Penyewa
      </button>
      <button
        type="button"
        className={`nav-mode-btn ${currentPage === "seller" ? "is-active" : ""}`}
        onClick={() => onGo("seller")}
      >
        Mode Seller
      </button>
    </div>
  );
}
