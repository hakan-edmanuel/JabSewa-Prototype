import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getRentalsByStore,
  getPaymentsForRental,
  getLateFeeForRental,
  decideLateFee,
  decidePayment,
  startRental,
  recordReturn,
  markOverdue,
  cancelRental,
  applyLateFee,
  translateRentalError,
} from "../../lib/userData";
import { formatPrice } from "../../lib/format";
import { TRANSACTION_STATUS, TRANSACTION_STATUS_META } from "../../lib/constants";
import ProofLink from "../ProofLink";

/*
 * Pesanan Saya (seller) — ERD v2.
 * Data rental yang masuk ke toko milik seller login (RLS-scoped).
 * Aksi owner (otorisasi & transisi divalidasi server):
 *   payment_verify → Verifikasi bukti (setujui → confirmed / tolak + alasan → pending)
 *   pending / payment_verify → Batalkan (alasan wajib — matriks PRD §5.2)
 *   confirmed      → Mulai sewa (ongoing)
 *   ongoing        → Selesaikan (completed) / Tandai terlambat (overdue)
 *   overdue        → Selesaikan + beri denda (rate ditetapkan owner)
 *   late_fee_total > 0 → Tandai denda dibayar (decide_late_fee 'paid')
 *
 * Pembayaran ditolak TIDAK membatalkan transaksi — tx kembali `pending`
 * (CATATAN-K) agar buyer dapat mengirim ulang bukti; bukti gagal tetap
 * tampil sebagai riwayat payment `failed`.
 */
export default function SellerOrders({ store, onChanged }) {
  const [orders, setOrders] = useState([]);
  const [state, setState] = useState("loading");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Semua Status");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [proofs, setProofs] = useState({}); // rental_id → payments[]
  const [fees, setFees] = useState({}); // rental_id → late_fee row | null
  const [feeTarget, setFeeTarget] = useState(null); // rental yang sedang diberi denda
  const [feeRate, setFeeRate] = useState("");
  const [rejectTarget, setRejectTarget] = useState(null); // { orderId, paymentId }
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(() => {
    Promise.resolve().then(() => setState("loading"));
    getRentalsByStore(store?.id ?? null)
      .then((data) => {
        setOrders(data);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [store?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const loadProofs = useCallback(async (rentalId) => {
    try {
      const rows = await getPaymentsForRental(rentalId);
      setProofs((cur) => ({ ...cur, [rentalId]: rows }));
    } catch {
      /* daftar bukti kosong bila gagal */
    }
  }, []);

  const loadFee = useCallback(async (rentalId) => {
    try {
      const row = await getLateFeeForRental(rentalId);
      setFees((cur) => ({ ...cur, [rentalId]: row }));
    } catch {
      /* tanpa baris denda — biarkan undefined */
    }
  }, []);

  // Auto-muat bukti untuk pesanan yang menunggu verifikasi & denda yang
  // tercatat — tanpa klik manual (bukti sebelumnya dimuat ulang setelah
  // aksi agar status tombol selalu segar).
  useEffect(() => {
    if (state !== "ready") return;
    orders.forEach((order) => {
      if (order.status === TRANSACTION_STATUS.PAYMENT_VERIFY && !proofs[order.id]) {
        loadProofs(order.id);
      }
      if (order.late_fee_total > 0 && fees[order.id] === undefined) {
        loadFee(order.id);
      }
    });
  }, [state, orders, proofs, fees, loadProofs, loadFee]);

  const run = async (fn, okMessage) => {
    setActionError("");
    setNotice("");
    try {
      await fn();
      if (okMessage) setNotice(okMessage);
      load();
      onChanged?.();
    } catch (err) {
      setActionError(translateRentalError(err?.message));
    } finally {
      setBusyId(null);
    }
  };

  const verifyPayment = (order, paymentId, approve, note = "") => {
    setBusyId(order.id);
    run(
      () => decidePayment(paymentId, approve, approve ? "" : note),
      approve
        ? "Pembayaran disetujui — menunggu serah terima."
        : "Bukti ditolak — transaksi kembali menunggu pembayaran.",
    ).then(() => {
      setRejectTarget(null);
      setRejectReason("");
      loadProofs(order.id);
    });
  };

  const markFeePaid = (order, feeId) => {
    setBusyId(order.id);
    run(() => decideLateFee(feeId, "paid"), "Denda ditandai dibayar.").then(() =>
      loadFee(order.id),
    );
  };

  const confirmCancel = (order) => {
    if (!cancelReason.trim()) return; // alasan wajib untuk owner (server: reason_required)
    setBusyId(order.id);
    run(
      () => cancelRental(order.id, cancelReason.trim()),
      "Pesanan dibatalkan.",
    ).then(() => {
      setCancelTarget(null);
      setCancelReason("");
    });
  };

  const pendingCount = orders.filter((o) => o.status === TRANSACTION_STATUS.PENDING).length;
  const verifyCount = orders.filter((o) => o.status === TRANSACTION_STATUS.PAYMENT_VERIFY).length;
  const activeCount = orders.filter((o) =>
    [TRANSACTION_STATUS.ONGOING, TRANSACTION_STATUS.OVERDUE].includes(o.status),
  ).length;

  const visibleOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          `${order.store_name} ${order.items.map((i) => i.name).join(" ")}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (filter === "Semua Status" || order.status === filter),
      ),
    [filter, orders, query],
  );

  return (
    <div className="seller-orders">
      <div className="orders-header">
        <div>
          <p className="section-kicker">Permintaan sewa</p>
          <h1>Pesanan Saya</h1>
        </div>
        <div className="orders-summary">
          <div className="summary-item">
            <span className="summary-label">Total</span>
            <span className="summary-value">{orders.length}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Menunggu Bayar</span>
            <span className="summary-value">{pendingCount}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Verifikasi</span>
            <span className="summary-value">{verifyCount}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Berjalan</span>
            <span className="summary-value">{activeCount}</span>
          </div>
        </div>
      </div>

      {notice && <p className="request-success">{notice}</p>}
      {actionError && <p className="rental-note is-error">{actionError}</p>}

      <div className="orders-filters">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          type="search"
          placeholder="Cari pesanan..."
          className="search-box-small"
        />
        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="filter-select"
        >
          <option>Semua Status</option>
          {Object.entries(TRANSACTION_STATUS_META).map(([key, meta]) => (
            <option key={key} value={key}>
              {meta.label}
            </option>
          ))}
        </select>
      </div>

      <div className="orders-list">
        {state === "loading" && <p className="empty-state">Memuat pesanan…</p>}
        {state === "error" && (
          <div className="empty-state">
            <p>Gagal memuat pesanan. Coba lagi.</p>
            <button className="btn-small btn-primary" onClick={load}>
              Muat ulang
            </button>
          </div>
        )}
        {state === "ready" &&
          visibleOrders.map((order) => {
            const meta = TRANSACTION_STATUS_META[order.status] || {
              label: order.status,
              className: "status-pending",
            };
            const orderProofs = proofs[order.id];
            const orderFee = fees[order.id];
            const cancellable = [
              TRANSACTION_STATUS.PENDING,
              TRANSACTION_STATUS.PAYMENT_VERIFY,
            ].includes(order.status);
            return (
              <article key={order.id} className="order-card">
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
                      {order.start_date} → {order.end_date}
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
                  <div className="order-cancel-note">
                    {orderProofs ? (
                      orderProofs.filter((p) => p.status === "pending").length ? (
                        orderProofs
                          .filter((p) => p.status === "pending")
                          .map((p) => (
                            <div key={p.id} className="order-reject-box">
                              <span>
                                Bukti: {p.payment_method}
                                {p.payment_proof_url && (
                                  <>
                                    {" — "}
                                    <ProofLink value={p.payment_proof_url} />
                                  </>
                                )}
                                {p.external_reference ? ` · ref ${p.external_reference}` : ""}
                              </span>
                              <button
                                className="btn-small btn-primary"
                                disabled={busyId === order.id}
                                onClick={() => verifyPayment(order, p.id, true)}
                              >
                                Setujui Pembayaran
                              </button>
                              <button
                                className="btn-small btn-danger"
                                disabled={busyId === order.id}
                                onClick={() => {
                                  setRejectTarget({ orderId: order.id, paymentId: p.id });
                                  setRejectReason("");
                                }}
                              >
                                Tolak Bukti
                              </button>
                            </div>
                          ))
                      ) : (
                        <span>Tidak ada bukti pending.</span>
                      )
                    ) : (
                      <>
                        <span>Memuat bukti pembayaran…</span>
                        <button className="btn-small btn-secondary" onClick={() => loadProofs(order.id)}>
                          Muat ulang bukti
                        </button>
                      </>
                    )}
                  </div>
                )}

                {order.status === TRANSACTION_STATUS.PAYMENT_VERIFY &&
                  rejectTarget?.orderId === order.id && (
                    <div className="order-reject-box">
                      <input
                        value={rejectReason}
                        onChange={(event) => setRejectReason(event.target.value)}
                        placeholder="Alasan penolakan (dilihat penyewa — wajib)"
                        className="search-box-small"
                      />
                      <button
                        className="btn-small btn-danger"
                        disabled={busyId === order.id || !rejectReason.trim()}
                        onClick={() =>
                          verifyPayment(order, rejectTarget.paymentId, false, rejectReason.trim())
                        }
                      >
                        Kirim penolakan
                      </button>
                      <button
                        className="btn-small btn-secondary"
                        onClick={() => setRejectTarget(null)}
                      >
                        Batal
                      </button>
                    </div>
                  )}

                {order.status === TRANSACTION_STATUS.OVERDUE && (
                  <p className="order-cancel-note">
                    Terlambat dikembalikan. Selesaikan dengan penilaian denda
                    (atau 0 bila diberi maaf).
                  </p>
                )}

                {order.late_fee_total > 0 && orderFee && orderFee.status === "unpaid" && (
                  <div className="order-cancel-note">
                    <span>
                      Denda belum dibayar: {orderFee.days_late} hari × {formatPrice(orderFee.daily_rate)} = {" "}
                      <strong>{formatPrice(orderFee.total)}</strong>
                    </span>
                    <button
                      className="btn-small btn-primary"
                      disabled={busyId === order.id}
                      onClick={() => markFeePaid(order, orderFee.id)}
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
                    {order.status === TRANSACTION_STATUS.PENDING && cancelTarget !== order.id && (
                      <button
                        className="btn-small btn-danger"
                        disabled={busyId === order.id}
                        onClick={() => {
                          setCancelTarget(order.id);
                          setCancelReason("");
                        }}
                      >
                        Batalkan
                      </button>
                    )}
                    {cancellable && cancelTarget === order.id && (
                      <div className="order-reject-box">
                        <input
                          value={cancelReason}
                          onChange={(event) => setCancelReason(event.target.value)}
                          placeholder="Alasan pembatalan (untuk penyewa)"
                          className="search-box-small"
                        />
                        <button
                          className="btn-small btn-danger"
                          disabled={busyId === order.id}
                          onClick={() => confirmCancel(order)}
                        >
                          Kirim pembatalan
                        </button>
                        <button
                          className="btn-small btn-secondary"
                          onClick={() => setCancelTarget(null)}
                        >
                          Batal
                        </button>
                      </div>
                    )}
                    {order.status === TRANSACTION_STATUS.PAYMENT_VERIFY && (
                      <button
                        className="btn-small btn-secondary"
                        disabled={busyId === order.id}
                        onClick={() => loadProofs(order.id)}
                      >
                        Periksa ulang bukti
                      </button>
                    )}
                    {order.status === TRANSACTION_STATUS.CONFIRMED && (
                      <button
                        className="btn-small btn-primary"
                        disabled={busyId === order.id}
                        onClick={() => {
                          setBusyId(order.id);
                          run(() => startRental(order.id), "Sewa dimulai.");
                        }}
                      >
                        Mulai sewa
                      </button>
                    )}
                    {order.status === TRANSACTION_STATUS.ONGOING && (
                      <>
                        <button
                          className="btn-small btn-success"
                          disabled={busyId === order.id}
                          onClick={() => {
                            setBusyId(order.id);
                            run(() => recordReturn(order.id), "Barang dikembalikan — transaksi selesai.");
                          }}
                        >
                          Selesaikan (kembali)
                        </button>
                        <button
                          className="btn-small btn-danger"
                          disabled={busyId === order.id}
                          onClick={() => {
                            setBusyId(order.id);
                            run(() => markOverdue(order.id), "Ditandai terlambat.");
                          }}
                        >
                          Tandai terlambat
                        </button>
                      </>
                    )}
                    {order.status === TRANSACTION_STATUS.OVERDUE && feeTarget !== order.id && (
                      <button
                        className="btn-small btn-primary"
                        onClick={() => {
                          setFeeTarget(order.id);
                          setFeeRate("");
                        }}
                      >
                        Nilai denda
                      </button>
                    )}
                    {order.status === TRANSACTION_STATUS.OVERDUE && feeTarget === order.id && (
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
                          disabled={busyId === order.id || !Number(feeRate)}
                          onClick={() => {
                            setBusyId(order.id);
                            run(async () => {
                              await applyLateFee(order.id, Number(feeRate));
                              await recordReturn(order.id);
                            }, "Denda dicatat — transaksi selesai.").then(() => {
                              setFeeTarget(null);
                              setFeeRate("");
                            });
                          }}
                        >
                          Simpan denda & selesaikan
                        </button>
                        <button
                          className="btn-small btn-secondary"
                          onClick={() => setFeeTarget(null)}
                        >
                          Batal
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        {state === "ready" && !visibleOrders.length && (
          <p className="empty-state">
            {orders.length
              ? "Tidak ada pesanan yang sesuai filter."
              : "Belum ada permintaan rental."}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Catatan: denda dibayar (decide_late_fee 'paid') diimpor langsung di atas;
 * waived admin-only — hanya tersedia di SysControl (admin).
 */
