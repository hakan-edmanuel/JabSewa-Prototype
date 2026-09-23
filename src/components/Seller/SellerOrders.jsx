import { useMemo, useState } from "react";
import { getRentalsByStore, setRentalStatus } from "../../lib/userData";
import { formatPrice } from "../../lib/format";
import { RENTAL_STATUS, RENTAL_STATUS_META } from "../../lib/constants";

/*
 * Pesanan Saya (seller): permintaan sewa yang masuk ke TOKO seller aktif.
 * Status mengikuti kontrak frontend (pending/accepted/rejected/active/
 * completed/cancelled) dengan aksi seller: Terima / Tolak / Mulai / Selesaikan.
 * Tolak wajib alasan — disimpan ke rejection_reason (kontrak backend).
 * Tidak ada simulasi pembayaran atau pengiriman notifikasi.
 */
export default function SellerOrders({ store }) {
  // Orders dibaca saat render (localStorage sinkron); aksi status memicu
  // re-render lewat pencadangan snapshot — tanpa setState di dalam effect.
  const [dataTick, setDataTick] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- dataTick memicu pembacaan ulang setelah aksi
  const orders = useMemo(
    () => (store ? getRentalsByStore(store.id) : []),
    [store?.id, dataTick],
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Semua Status");
  const [notice, setNotice] = useState("");
  const [rejecting, setRejecting] = useState(null); // id order yang sedang ditolak
  const [rejectReason, setRejectReason] = useState("");

  const visibleOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          `${order.id} ${order.item_name} ${order.tenant_name || ""}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (filter === "Semua Status" || order.status === filter),
      ),
    [filter, orders, query],
  );

  const updateStatus = (id, status, extra = {}) => {
    setRentalStatus(id, status, extra);
    setDataTick((tick) => tick + 1);
    setNotice(
      `Pesanan diperbarui menjadi ${RENTAL_STATUS_META[status]?.label || status}.`,
    );
    setRejecting(null);
    setRejectReason("");
  };

  const pendingCount = orders.filter(
    (order) => order.status === RENTAL_STATUS.PENDING,
  ).length;
  const activeCount = orders.filter(
    (order) => order.status === RENTAL_STATUS.ACTIVE,
  ).length;

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
            <span className="summary-label">Menunggu</span>
            <span className="summary-value">{pendingCount}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Aktif</span>
            <span className="summary-value">{activeCount}</span>
          </div>
        </div>
      </div>

      {notice && <p className="request-success">{notice}</p>}

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
          {Object.entries(RENTAL_STATUS_META).map(([key, meta]) => (
            <option key={key} value={key}>
              {meta.label}
            </option>
          ))}
        </select>
      </div>

      <div className="orders-list">
        {visibleOrders.map((order) => {
          const meta = RENTAL_STATUS_META[order.status] || {
            label: order.status,
            className: "status-pending",
          };
          return (
            <article key={order.id} className="order-card">
              <div className="order-header">
                <div className="order-info">
                  <h3 className="order-id">{order.id}</h3>
                  <p className="order-item">{order.item_name}</p>
                </div>
                <span className={`status-badge ${meta.className}`}>
                  {meta.label}
                </span>
              </div>

              <div className="order-details-grid">
                <div className="detail-col">
                  <p className="detail-label">Penyewa</p>
                  <p className="detail-value">
                    {order.tenant_name || "Penyewa"}
                  </p>
                </div>
                <div className="detail-col">
                  <p className="detail-label">Periode sewa</p>
                  <p className="detail-value">
                    {order.start_date} → {order.end_date}
                  </p>
                </div>
                <div className="detail-col">
                  <p className="detail-label">Total</p>
                  <p className="detail-value detail-price">
                    {formatPrice(order.total)}
                  </p>
                </div>
              </div>

              {[RENTAL_STATUS.REJECTED, RENTAL_STATUS.CANCELLED].includes(
                order.status,
              ) &&
                order.rejection_reason && (
                  <p className="order-cancel-note">
                    Alasan: {order.rejection_reason}
                  </p>
                )}

              <div className="order-footer">
                <span className="order-period-note">
                  {order.total_days} hari · {formatPrice(order.price_per_day)}
                  /hari
                </span>
                <div className="order-actions">
                  {order.status === RENTAL_STATUS.PENDING &&
                    rejecting !== order.id && (
                      <>
                        <button
                          className="btn-small btn-primary"
                          onClick={() =>
                            updateStatus(order.id, RENTAL_STATUS.ACCEPTED)
                          }
                        >
                          Terima
                        </button>
                        <button
                          className="btn-small btn-danger"
                          onClick={() => {
                            setRejecting(order.id);
                            setRejectReason("");
                          }}
                        >
                          Tolak
                        </button>
                      </>
                    )}
                  {order.status === RENTAL_STATUS.PENDING &&
                    rejecting === order.id && (
                      <div className="order-reject-box">
                        <input
                          value={rejectReason}
                          onChange={(event) =>
                            setRejectReason(event.target.value)
                          }
                          placeholder="Alasan penolakan (untuk penyewa)"
                          className="search-box-small"
                        />
                        <button
                          className="btn-small btn-danger"
                          disabled={!rejectReason.trim()}
                          onClick={() =>
                            updateStatus(order.id, RENTAL_STATUS.REJECTED, {
                              rejection_reason: rejectReason.trim(),
                            })
                          }
                        >
                          Kirim penolakan
                        </button>
                        <button
                          className="btn-small btn-secondary"
                          onClick={() => setRejecting(null)}
                        >
                          Batal
                        </button>
                      </div>
                    )}
                  {order.status === RENTAL_STATUS.ACCEPTED && (
                    <button
                      className="btn-small btn-primary"
                      onClick={() =>
                        updateStatus(order.id, RENTAL_STATUS.ACTIVE)
                      }
                    >
                      Mulai sewa
                    </button>
                  )}
                  {order.status === RENTAL_STATUS.ACTIVE && (
                    <button
                      className="btn-small btn-success"
                      onClick={() =>
                        updateStatus(order.id, RENTAL_STATUS.COMPLETED)
                      }
                    >
                      Selesaikan
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {!visibleOrders.length && (
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
