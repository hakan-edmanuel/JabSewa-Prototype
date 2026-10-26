import { useState } from "react";
import { formatDate, formatPrice } from "../../domain/format";
import { TRANSACTION_STATUS, TRANSACTION_STATUS_META } from "../../domain/constants";
import { getSellerActions } from "../../domain/rentalActions";
import PaymentProofBlock from "./PaymentProofBlock";

/*
 * Satu kartu pesanan seller beserta panel aksinya:
 *   payment_verify → Verifikasi bukti (setujui → confirmed / tolak + alasan → pending)
 *   pending / payment_verify → Batalkan (alasan wajib — matriks PRD §5.2)
 *   confirmed      → Mulai sewa (ongoing)
 *   ongoing        → Selesaikan (completed) / Tandai terlambat (overdue)
 *   overdue        → Selesaikan + beri denda (rate ditetapkan owner)
 *   late_fee_total > 0 → Tandai denda dibayar (decide_late_fee 'paid')
 */
export default function SellerOrderCard({
  order,
  proofs,
  orderFee,
  busy,
  onApprovePayment,
  onRejectPayment,
  onReloadProofs,
  onMarkFeePaid,
  onCancel,
  onStart,
  onRecordReturned,
  onMarkLate,
  onRateReturn,
}) {
  const [rejectPaymentId, setRejectPaymentId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [feeOpen, setFeeOpen] = useState(false);
  const [feeRate, setFeeRate] = useState("");

  const meta = TRANSACTION_STATUS_META[order.status] || {
    label: order.status,
    className: "status-pending",
  };
  const pendingProofs = (proofs || []).filter((p) => p.status === "pending");
  // Satu sumber aturan aksi (domain/rentalActions) — sebelumnya daftar
  // status ditulis ulang di sini dan menyimpang dari aturan server.
  const actions = getSellerActions(order, {
    hasPendingPayment: pendingProofs.length > 0,
    lateFeeStatus: orderFee?.status ?? null,
  });

  const submitReject = async () => {
    await onRejectPayment(rejectPaymentId, rejectReason.trim());
    setRejectPaymentId(null);
    setRejectReason("");
  };

  const submitCancel = async () => {
    await onCancel(cancelReason);
    setCancelOpen(false);
    setCancelReason("");
  };

  const submitFee = async () => {
    await onRateReturn(Number(feeRate));
    setFeeOpen(false);
    setFeeRate("");
  };

  return (
    <article className="order-card">
      <div className="order-header">
        <div className="order-info">
          <h3 className="order-id">{order.items.map((i) => i.name).join(", ")}</h3>
          <p className="order-item">
            {order.items.length} barang · {order.store_name}
          </p>
        </div>
        <span className={`status-badge ${meta.className}`}>{meta.label}</span>
      </div>

      <div className="order-details-grid">
        <div className="detail-col">
          <p className="detail-label">Periode sewa</p>
          <p className="detail-value">
            {formatDate(order.start_date)} → {formatDate(order.end_date)}
          </p>
        </div>
        <div className="detail-col">
          <p className="detail-label">Sewa + deposit</p>
          <p className="detail-value">
            {formatPrice(order.subtotal)} + {formatPrice(order.deposit_total)}
          </p>
        </div>
        <div className="detail-col">
          <p className="detail-label">Total</p>
          <p className="detail-value detail-price">{formatPrice(order.total)}</p>
        </div>
      </div>

      {order.status === TRANSACTION_STATUS.PAYMENT_VERIFY && (
        <PaymentProofBlock
          proofs={proofs}
          pendingProofs={pendingProofs}
          busy={busy}
          onApprove={onApprovePayment}
          onReject={(paymentId) => {
            setRejectPaymentId(paymentId);
            setRejectReason("");
          }}
          onReload={onReloadProofs}
        />
      )}

      {order.status === TRANSACTION_STATUS.PAYMENT_VERIFY && rejectPaymentId && (
        <div className="order-reject-box">
          <input
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            placeholder="Alasan penolakan (dilihat penyewa — wajib)"
            className="search-box-small"
          />
          <button
            className="btn-small btn-danger"
            disabled={busy || !rejectReason.trim()}
            onClick={submitReject}
          >
            Kirim penolakan
          </button>
          <button className="btn-small btn-secondary" onClick={() => setRejectPaymentId(null)}>
            Batal
          </button>
        </div>
      )}

      {actions.canSetLateFee && (
        <p className="order-cancel-note">
          Terlambat dikembalikan. Selesaikan dengan penilaian denda
          (isi 0 bila diberi maaf).
        </p>
      )}

      {orderFee && orderFee.status === "unpaid" && (
        <div className="order-cancel-note">
          <span>
            Denda belum dibayar: {orderFee.days_late} hari × {formatPrice(orderFee.daily_rate)} ={" "}
            <strong>{formatPrice(orderFee.total)}</strong>
          </span>
          <button
            className="btn-small btn-primary"
            disabled={busy}
            onClick={() => onMarkFeePaid(orderFee.id)}
          >
            Tandai denda dibayar
          </button>
        </div>
      )}

      <div className="order-footer">
        <span className="order-period-note">
          {order.total_days} hari · {order.items.length} item
        </span>
        <div className="order-actions">
          {actions.canCancel && !cancelOpen && (
            <button
              className="btn-small btn-danger"
              disabled={busy}
              onClick={() => {
                setCancelOpen(true);
                setCancelReason("");
              }}
            >
              Batalkan
            </button>
          )}
          {actions.canCancel && cancelOpen && (
            <div className="order-reject-box">
              <input
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder="Alasan pembatalan (untuk penyewa)"
                className="search-box-small"
              />
              <button
                className="btn-small btn-danger"
                disabled={busy}
                onClick={submitCancel}
              >
                Kirim pembatalan
              </button>
              <button className="btn-small btn-secondary" onClick={() => setCancelOpen(false)}>
                Batal
              </button>
            </div>
          )}
          {actions.canStart && (
            <button className="btn-small btn-primary" disabled={busy} onClick={onStart}>
              Mulai sewa
            </button>
          )}
          {actions.canRecordReturn && (
            <button
              className="btn-small btn-success"
              disabled={busy}
              onClick={onRecordReturned}
            >
              Selesaikan (kembali)
            </button>
          )}
          {actions.canMarkOverdue && (
            <button
              className="btn-small btn-danger"
              disabled={busy}
              onClick={onMarkLate}
            >
              Tandai terlambat
            </button>
          )}
          {actions.canSetLateFee && !feeOpen && (
            <button
              className="btn-small btn-primary"
              onClick={() => {
                setFeeOpen(true);
                setFeeRate("");
              }}
            >
              Nilai denda
            </button>
          )}
          {actions.canSetLateFee && feeOpen && (
            <div className="order-reject-box">
              <input
                value={feeRate}
                onChange={(event) => setFeeRate(event.target.value)}
                type="number"
                min="0"
                placeholder="Tarif denda per hari (Rp)"
                className="search-box-small"
              />
              <button
                className="btn-small btn-primary"
                disabled={
                  busy ||
                  feeRate === "" ||
                  Number.isNaN(Number(feeRate)) ||
                  Number(feeRate) < 0
                }
                onClick={submitFee}
              >
                Simpan denda & selesaikan
              </button>
              <button className="btn-small btn-secondary" onClick={() => setFeeOpen(false)}>
                Batal
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
