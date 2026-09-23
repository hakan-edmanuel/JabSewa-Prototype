import { useEffect, useMemo, useState } from "react";
import SimpleNavbar from "../components/SimpleNavbar";
import Footer from "../components/Footer";
import { useAuth } from "../auth/AuthContext";
import {
  getRentals,
  getWishlist,
  setRentalStatus,
  toggleWishlist,
} from "../lib/userData";
import { fetchListings } from "../lib/listings";
import { formatPrice } from "../lib/format";
import { RENTAL_STATUS, RENTAL_STATUS_META } from "../lib/constants";

/*
 * Dashboard penyewa (Buyer): pesanan sewa + wishlist.
 * Data rental/wishlist dari lapisan data mock (lib/userData) — per-user.
 *
 * Status yang ditampilkan adalah STATUS FRONTEND (pending → accepted →
 * active → completed / cancelled). Tidak ada simulasi pembayaran; aksi
 * tenant hanya "Batalkan" pada permintaan yang masih menunggu.
 */
export default function BuyerPage({ onNavigate, onSellerIntent }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  // Rental & wishlist dibaca saat render (baca localStorage sinkron) dan
  // di-refresh lewat counter setelah aksi lokal (batalkan / hapus wishlist).
  const [dataTick, setDataTick] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- dataTick memicu pembacaan ulang setelah aksi
  const rentals = useMemo(() => getRentals(), [dataTick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- idem: kunci user + tick
  const wishlist = useMemo(() => getWishlist(user?.id), [user?.id, dataTick]);

  useEffect(() => {
    let active = true;
    fetchListings().then((data) => {
      if (active) {
        setItems(data);
        setIsLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const wishItems = useMemo(
    () => items.filter((item) => wishlist.includes(item.id)),
    [items, wishlist],
  );

  const handleCancel = (rentalId) => {
    setRentalStatus(rentalId, RENTAL_STATUS.CANCELLED);
    setDataTick((tick) => tick + 1);
  };

  const handleRemoveWish = (itemId) => {
    toggleWishlist(user.id, itemId);
    setDataTick((tick) => tick + 1);
  };

  const firstName = (user?.name || "Penyewa").split(" ")[0];

  return (
    <div className="page-shell page-buyer-shell">
      <SimpleNavbar onNavigate={onNavigate} currentPage="buyer" />

      <main className="buyer-page">
        <header className="buyer-head">
          <div>
            <p className="buyer-kicker">Mode Penyewa</p>
            <h1>Halo, {firstName}</h1>
            <p>Kelola pesanan sewa dan barang yang kamu simpan.</p>
          </div>
          <button
            className="primary-button"
            onClick={() => onNavigate("consumer")}
          >
            Cari Barang
          </button>
        </header>

        <section className="buyer-section">
          <div className="buyer-section-head">
            <h2>Pesanan sewa</h2>
            <span className="buyer-count">{rentals.length}</span>
          </div>

          {rentals.length ? (
            <div className="buyer-rental-list">
              {rentals.map((rental) => {
                const meta = RENTAL_STATUS_META[rental.status] || {
                  label: rental.status,
                  className: "status-pending",
                };
                const cancellable = rental.status === RENTAL_STATUS.PENDING;
                return (
                  <article key={rental.id} className="buyer-rental-card">
                    <div className="buyer-rental-top">
                      <div>
                        <h3>{rental.item_name}</h3>
                        <p>Pemilik: {rental.seller_name}</p>
                      </div>
                      <span className={`status-badge ${meta.className}`}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="buyer-rental-meta">
                      <span>
                        {rental.start_date} → {rental.end_date} ·{" "}
                        {rental.total_days} hari
                      </span>
                      <strong>{formatPrice(rental.total)}</strong>
                    </div>
                    {[RENTAL_STATUS.REJECTED, RENTAL_STATUS.CANCELLED].includes(
                      rental.status,
                    ) &&
                      rental.rejection_reason && (
                        <p className="buyer-rental-reject">
                          Alasan: {rental.rejection_reason}
                        </p>
                      )}
                    {cancellable && (
                      <div className="buyer-rental-actions">
                        <button
                          type="button"
                          className="btn-small btn-danger"
                          onClick={() => handleCancel(rental.id)}
                        >
                          Batalkan permintaan
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="buyer-empty">
              <p>Belum ada transaksi rental.</p>
              <p className="buyer-empty-sub">
                Cari barang yang kamu butuhkan, lalu kirim permintaan sewa.
              </p>
              <button
                className="primary-button"
                onClick={() => onNavigate("consumer")}
              >
                Mulai Cari Barang
              </button>
            </div>
          )}
        </section>

        <section className="buyer-section">
          <div className="buyer-section-head">
            <h2>Wishlist</h2>
            <span className="buyer-count">{wishItems.length}</span>
          </div>

          {isLoading ? (
            <p className="buyer-empty-sub">Memuat wishlist…</p>
          ) : wishItems.length ? (
            <div className="buyer-wish-grid">
              {wishItems.map((item) => (
                <article key={item.id} className="buyer-wish-card">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="buyer-wish-thumb"
                  />
                  <div className="buyer-wish-info">
                    <h3>{item.name}</h3>
                    <p>
                      {item.seller} · {item.location}
                    </p>
                    <p className="buyer-wish-price">
                      {formatPrice(item.price)} <small>/hari</small>
                    </p>
                    <div className="buyer-wish-actions">
                      <button
                        className="btn-small btn-primary"
                        onClick={() =>
                          onNavigate("consumer", { itemId: item.id })
                        }
                      >
                        Sewa
                      </button>
                      <button
                        className="btn-text-action danger"
                        onClick={() => handleRemoveWish(item.id)}
                        aria-label={`Hapus ${item.name} dari wishlist`}
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="buyer-empty">
              <p>Wishlist masih kosong.</p>
              <p className="buyer-empty-sub">
                Simpan barang favorit dengan ikon ♡ saat menjelajah marketplace.
              </p>
            </div>
          )}
        </section>

        <section className="buyer-cta-strip">
          <div>
            <h2>Punya barang yang jarang dipakai?</h2>
            <p>Daftarkan barangmu dan mulai terima pesanan sewa.</p>
          </div>
          <button
            className="primary-button buyer-cta-btn"
            onClick={onSellerIntent}
          >
            Mulai Jadi Seller
          </button>
        </section>
      </main>

      <Footer onNavigate={onNavigate} />
    </div>
  );
}
