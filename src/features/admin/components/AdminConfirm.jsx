/*
 * Kotak konfirmasi aksi admin (selalu via RPC server + audit log).
 * `children` dirender di antara pesan dan tombol — dipakai halaman yang
 * mewajibkan isian (mis. alasan penolakan ajuan). `confirmDisabled` mencegah
 * tombol aktif sebelum isian valid; `busy` mencegah klik ganda.
 */
export default function AdminConfirm({
  danger = true,
  message,
  hint,
  busy,
  confirmDisabled = false,
  confirmLabel = "Ya, ubah status",
  cancelLabel = "Batal",
  onCancel,
  onConfirm,
  children,
}) {
  return (
    <div className={`sys-confirm ${danger ? "is-reject" : "is-approve"}`}>
      <p>{message}</p>
      {children}
      {hint && <p className="sys-confirm-hint">{hint}</p>}
      <div className="sys-confirm-actions">
        <button type="button" className="sys-btn-ghost" disabled={busy} onClick={onCancel}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`sys-btn ${danger ? "is-danger" : "is-approve"}`}
          disabled={busy || confirmDisabled}
          onClick={onConfirm}
        >
          {busy ? "Menyimpan…" : confirmLabel}
        </button>
      </div>
    </div>
  );
}
