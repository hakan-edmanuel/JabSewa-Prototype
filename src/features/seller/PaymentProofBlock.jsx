import ProofLink from "../../ui/ProofLink";

/**
 * Blok bukti pembayaran untuk pesanan berstatus payment_verify.
 * Dipisah dari daftar pesanan agar percabangan render tidak bertingkat
 * (dulu: `orderProofs ? (pending.length ? map : teks) : (memuat)`).
 */
export default function PaymentProofBlock({
  proofs,
  pendingProofs,
  busy,
  onApprove,
  onReject,
  onReload,
}) {
  if (proofs === undefined) {
    return (
      <div className="order-cancel-note">
        <span>Memuat bukti pembayaran…</span>
        <button className="btn-small btn-secondary" onClick={onReload}>
          Muat ulang bukti
        </button>
      </div>
    );
  }

  if (!pendingProofs.length) {
    return (
      <div className="order-cancel-note">
        <span>Tidak ada bukti pending.</span>
        <button className="btn-small btn-secondary" onClick={onReload}>
          Periksa ulang bukti
        </button>
      </div>
    );
  }

  return (
    <div className="order-cancel-note">
      {pendingProofs.map((payment) => (
        <div key={payment.id} className="order-reject-box">
          <span>
            Bukti: {payment.payment_method}
            {payment.payment_proof_url && (
              <>
                {" — "}
                <ProofLink value={payment.payment_proof_url} />
              </>
            )}
            {payment.external_reference ? ` · ref ${payment.external_reference}` : ""}
          </span>
          <button
            className="btn-small btn-primary"
            disabled={busy}
            onClick={() => onApprove(payment.id)}
          >
            Setujui Pembayaran
          </button>
          <button
            className="btn-small btn-danger"
            disabled={busy}
            onClick={() => onReject(payment.id)}
          >
            Tolak Bukti
          </button>
        </div>
      ))}
    </div>
  );
}
