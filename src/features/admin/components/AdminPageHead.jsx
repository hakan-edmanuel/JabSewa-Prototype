/*
 * Header halaman admin: judul, subjudul, tombol muat ulang, angka pending.
 * `loading` menonaktifkan tombol sekaligus memberi label yang jujur — reload
 * berulang saat query berjalan hanya menambah request tanpa hasil baru.
 */
export default function AdminPageHead({
  title,
  subtitle,
  pendingCount,
  pendingLabel,
  onReload,
  loading = false,
}) {
  return (
    <header className="sys-page-head">
      <div>
        <h1>{title}</h1>
        <p className="sys-page-sub">{subtitle}</p>
        <button
          type="button"
          className="sys-btn-ghost"
          onClick={onReload}
          disabled={loading}
          aria-busy={loading}
        >
          {loading ? "Memuat…" : "Muat ulang"}
        </button>
      </div>
      <div className="sys-pending" aria-live="polite">
        <span className="sys-pending-num">{loading ? "—" : pendingCount}</span>
        <span className="sys-pending-label">{pendingLabel}</span>
      </div>
    </header>
  );
}
