import { useState } from "react";
import { formatDate, formatPrice } from "../../domain/format";
import { TRANSACTION_STATUS, TRANSACTION_STATUS_META } from "../../domain/constants";
import { getBuyerActions } from "../../domain/rentalActions";
import RentalStatusTimeline from "./RentalStatusTimeline";
import PaymentProofForm from "./PaymentProofForm";
import DisputeForm from "./DisputeForm";
import ReviewForm from "./ReviewForm";

/* Satu kartu pesanan sewa: ringkasan, timeline, dan panel aksi buyer. */
export default function RentalCard({
  rental,
  paymentRows,
  reviewedIds,
  busy,
  onCancelRequest,
  onSubmitProof,
  onDispute,
  onSubmitReview,
  onRefreshPayments,
}) {
  const [mode, setMode] = useState(null); // null | "pay" | "cancel" | "dispute" | "review"

  const meta = TRANSACTION_STATUS_META[rental.status] || {
    label: rental.status,
    className: "status-pending",
  };
  // Satu sumber aturan aksi (domain/rentalActions) — server tetap
  // memvalidasi ulang setiap transisi.
  const actions = getBuyerActions(rental, { reviewedIds });
  const paying = mode === "pay";
  const reviewing = mode === "review";
  const confirmingCancel = mode === "cancel";
  const disputing = mode === "dispute";
  // Bukti terakhir yang DITOLAK — alasan verifikator ditampilkan
  // (tx kembali pending, bukan cancelled — CATATAN-K).
  const rejectedProof = (paymentRows[rental.id] || []).find((p) => p.status === "failed");

  return (
    <article className="buyer-rental-card">
      <div className="buyer-rental-top">
        <div>
          <h3>{rental.items.map((i) => i.name).join(", ") || "Transaksi sewa"}</h3>
          <p>Pemilik: {rental.store_name}</p>
        </div>
        <span className={`status-badge ${meta.className}`}>{meta.label}</span>
      </div>
      <div className="buyer-rental-meta">
        <span>
          {formatDate(rental.start_date)} → {formatDate(rental.end_date)} ·{" "}
          {rental.total_days} hari · {rental.items.length} barang
        </span>
        <strong>{formatPrice(rental.total)}</strong>
      </div>
      {/* Timeline status — murni dari data backend (rentalTimeline.js) */}
      <RentalStatusTimeline rental={rental} />
      {rental.status === TRANSACTION_STATUS.OVERDUE && (
        <p className="buyer-rental-payment">
          Denda keterlambatan: {formatPrice(rental.late_fee_total)}
        </p>
      )}
      {rental.cancel_reason && (
        <p className="buyer-rental-reject">Alasan: {rental.cancel_reason}</p>
      )}
      {actions.canPay && rejectedProof && (
        <p className="buyer-rental-reject">
          Bukti pembayaran sebelumnya ditolak
          {rejectedProof.external_reference
            ? ` (ref ${rejectedProof.external_reference})`
            : "."}{" "}
          Silakan kirim ulang bukti yang benar.
        </p>
      )}
      {(actions.canCancel || actions.canPay || actions.canDispute) && (
        <div className="buyer-rental-actions">
          {actions.canPay && !paying && !reviewing && (
            <button
              type="button"
              className="btn-small btn-primary"
              disabled={busy}
              onClick={() => setMode("pay")}
            >
              Kirim bukti pembayaran
            </button>
          )}
          {actions.canCancel && !paying && !reviewing && !confirmingCancel && (
            <button
              type="button"
              className="btn-small btn-danger"
              disabled={busy}
              onClick={() => setMode("cancel")}
            >
              Batalkan permintaan
            </button>
          )}
          {actions.canCancel && confirmingCancel && (
            <span className="buyer-cancel-confirm">
              <span>Batalkan permintaan sewa ini?</span>
              <button
                type="button"
                className="btn-small btn-danger"
                disabled={busy}
                onClick={async () => {
                  setMode(null);
                  await onCancelRequest(rental.id);
                }}
              >
                {busy ? "Membatalkan…" : "Ya, batalkan"}
              </button>
              <button
                type="button"
                className="btn-small btn-secondary"
                onClick={() => setMode(null)}
              >
                Tidak
              </button>
            </span>
          )}
          {actions.canDispute && !paying && !reviewing && !disputing && (
            <button
              type="button"
              className="btn-small btn-secondary"
              disabled={busy}
              onClick={() => setMode("dispute")}
            >
              Buka sengketa
            </button>
          )}
          {actions.canReview && !reviewing && !disputing && (
            <button
              type="button"
              className="btn-small btn-success"
              disabled={busy}
              onClick={() => setMode("review")}
            >
              Beri ulasan
            </button>
          )}
        </div>
      )}
      {actions.canPay && !paying && !reviewing && rejectedProof && (
        <button
          type="button"
          className="btn-small btn-secondary"
          disabled={busy}
          onClick={() => onRefreshPayments(rental.id)}
        >
          Perbarui status bukti
        </button>
      )}
      {disputing && (
        <DisputeForm
          busy={busy}
          onSubmit={async (reason) => {
            const ok = await onDispute(rental.id, reason);
            if (ok) setMode(null);
          }}
          onCancel={() => setMode(null)}
        />
      )}
      {reviewing && (
        <ReviewForm
          busy={busy}
          onSubmit={async (rating, comment) => {
            const ok = await onSubmitReview(rental.id, rating, comment);
            if (ok) setMode(null);
          }}
          onCancel={() => setMode(null)}
        />
      )}
      {paying && (
        <PaymentProofForm
          rentalId={rental.id}
          busy={busy}
          onSubmit={(payload) => onSubmitProof(rental.id, payload)}
          onCancel={() => setMode(null)}
        />
      )}
    </article>
  );
}
