import { useState } from "react";

/* Ulasan transaksi selesai (satu per transaksi — divalidasi server). */
export default function ReviewForm({ busy, onSubmit, onCancel }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  return (
    <div className="order-reject-box" style={{ marginTop: 8 }}>
      <select
        value={rating}
        onChange={(e) => setRating(Number(e.target.value))}
        className="filter-select"
      >
        {[5, 4, 3, 2, 1].map((n) => (
          <option key={n} value={n}>
            {"★".repeat(n)} ({n}/5)
          </option>
        ))}
      </select>
      <input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Ulasan kamu (wajib)"
        className="search-box-small"
      />
      <button
        className="btn-small btn-primary"
        disabled={busy || !comment.trim()}
        onClick={() => onSubmit(rating, comment)}
      >
        Kirim ulasan
      </button>
      <button className="btn-small btn-secondary" onClick={onCancel}>
        Batal
      </button>
    </div>
  );
}
