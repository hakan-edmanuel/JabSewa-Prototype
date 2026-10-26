/* Header halaman admin: judul, subjudul, tombol muat ulang, angka pending. */
export default function AdminPageHead({ title, subtitle, pendingCount, pendingLabel, onReload }) {
  return (
    <header className="sys-page-head">
      <div>
        <h1>{title}</h1>
        <p className="sys-page-sub">{subtitle}</p>
        <button type="button" className="sys-btn sys-btn-ghost" onClick={onReload}>
          Muat ulang
        </button>
      </div>
      <div className="sys-pending" aria-live="polite">
        <span className="sys-pending-num">{pendingCount}</span>
        <span className="sys-pending-label">{pendingLabel}</span>
      </div>
    </header>
  );
}
