/* Kotak konfirmasi aksi admin (selalu via RPC server + audit log). */
export default function AdminConfirm({
  danger = true,
  message,
  hint,
  busy,
  confirmLabel = "Ya, ubah status",
  onCancel,
  onConfirm,
}) {
  return (
    <div className={`sys-confirm ${danger ? "is-reject" : "is-approve"}`}>
      <p>{message}</p>
      <p className="sys-confirm-hint">{hint}</p>
      <div className="sys-confirm-actions">
        <button type="button" className="sys-btn-ghost" disabled={busy} onClick={onCancel}>
          Batal
        </button>
        <button
          type="button"
          className={`sys-btn ${danger ? "is-danger" : "is-approve"}`}
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? "Menyimpan…" : confirmLabel}
        </button>
      </div>
    </div>
  );
}
