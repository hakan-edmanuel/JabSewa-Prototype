import { useState } from "react";

/* Sengketa untuk transaksi ongoing/overdue/completed (divalidasi server). */
export default function DisputeForm({ busy, onSubmit, onCancel }) {
  const [reason, setReason] = useState("");

  return (
    <div className="order-reject-box" style={{ marginTop: 8 }}>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Jelaskan masalahnya (wajib)"
        className="search-box-small"
      />
      <button
        className="btn-small btn-primary"
        disabled={busy || !reason.trim()}
        onClick={() => onSubmit(reason)}
      >
        Kirim sengketa
      </button>
      <button className="btn-small btn-secondary" onClick={onCancel}>
        Batal
      </button>
    </div>
  );
}
