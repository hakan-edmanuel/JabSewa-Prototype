import { useMemo, useState } from "react";
import { TRANSACTION_STATUS, TRANSACTION_STATUS_META } from "../../domain/constants";
import { useSellerOrders } from "./useSellerOrders";
import SellerOrderCard from "./SellerOrderCard";

/*
 * Pesanan Saya (seller) — ERD v2.
 * Data rental yang masuk ke toko milik seller login (RLS-scoped).
 * Aksi owner divalidasi server (lihat SellerOrderCard & domain/rentalActions).
 */
export default function SellerOrders() {
  const {
    orders,
    state,
    notice,
    actionError,
    busyId,
    proofs,
    fees,
    load,
    loadProofs,
    verifyPayment,
    markFeePaid,
    cancel,
    start,
    recordReturned,
    markLate,
    rateAndReturn,
  } = useSellerOrders();
  const [query, setQuery] = useState("");
  // 'all' | nilai enum transaction_status
  const [filter, setFilter] = useState("all");

  const pendingCount = orders.filter((o) => o.status === TRANSACTION_STATUS.PENDING).length;
  const verifyCount = orders.filter(
    (o) => o.status === TRANSACTION_STATUS.PAYMENT_VERIFY,
  ).length;
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
          (filter === "all" || order.status === filter),
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
          <option value="all">Semua Status</option>
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
          visibleOrders.map((order) => (
            <SellerOrderCard
              key={order.id}
              order={order}
              proofs={proofs[order.id]}
              orderFee={fees[order.id]}
              busy={busyId === order.id}
              onApprovePayment={(paymentId) =>
                verifyPayment(order.id, paymentId, true)
              }
              onRejectPayment={(paymentId, reason) =>
                verifyPayment(order.id, paymentId, false, reason)
              }
              onReloadProofs={() => loadProofs(order.id)}
              onMarkFeePaid={(feeId) => markFeePaid(order.id, feeId)}
              onCancel={(reason) => cancel(order.id, reason)}
              onStart={() => start(order.id)}
              onRecordReturned={() => recordReturned(order.id)}
              onMarkLate={() => markLate(order.id)}
              onRateReturn={(rate) => rateAndReturn(order.id, rate)}
            />
          ))}
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
