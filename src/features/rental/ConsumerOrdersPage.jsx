import SimpleNavbar from "../../ui/SimpleNavbar";
import Footer from "../../ui/Footer";
import { useConsumerRentals } from "./useConsumerRentals";
import { useWishlistItems } from "./useWishlistItems";
import RentalCard from "./RentalCard";
import WishlistSection from "./WishlistSection";

/*
 * Dashboard penyewa (Buyer) — ERD v2.
 * Data rental/wishlist milik user login (RLS-scoped). Aksi buyer:
 *   - Kirim bukti pembayaran (pending → payment_verify via RPC submit_payment)
 *   - Batalkan permintaan (pending/payment_verify via RPC cancel_rental)
 *   - Buka sengketa (ongoing/overdue/completed) & ulasan (completed, sekali)
 * Pembayaran manual transfer + bukti — tanpa gateway (PRD §6).
 *
 * Logika data ada di useConsumerRentals/useWishlistItems, kartu di RentalCard.
 */
export default function ConsumerOrdersPage({ onNavigate, onSellerIntent }) {
  const {
    user,
    rentals,
    rentalsState,
    paymentRows,
    reviewedIds,
    actionError,
    busyRentalId,
    loadRentals,
    refreshPayments,
    cancel,
    submitProof,
    dispute,
    review,
  } = useConsumerRentals();
  const wishlist = useWishlistItems();

  const firstName = (user?.name || "Penyewa").split(" ")[0];
  const error = actionError || wishlist.error;

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
          <button className="primary-button" onClick={() => onNavigate("consumer")}>
            Cari Barang
          </button>
        </header>

        {error && <p className="rental-note is-error">{error}</p>}

        <section className="buyer-section">
          <div className="buyer-section-head">
            <h2>Pesanan sewa</h2>
            <span className="buyer-count">{rentals.length}</span>
          </div>

          {rentalsState === "loading" ? (
            <div className="buyer-empty">
              <p>Memuat pesanan sewa…</p>
            </div>
          ) : rentalsState === "error" ? (
            <div className="buyer-empty">
              <p>Gagal memuat pesanan. Periksa koneksi lalu coba lagi.</p>
              <button className="btn-small btn-primary" onClick={loadRentals}>
                Muat ulang
              </button>
            </div>
          ) : rentals.length ? (
            <div className="buyer-rental-list">
              {rentals.map((rental) => (
                <RentalCard
                  key={rental.id}
                  rental={rental}
                  paymentRows={paymentRows}
                  reviewedIds={reviewedIds}
                  busy={busyRentalId === rental.id}
                  onCancelRequest={cancel}
                  onSubmitProof={submitProof}
                  onDispute={dispute}
                  onSubmitReview={review}
                  onRefreshPayments={refreshPayments}
                />
              ))}
            </div>
          ) : (
            <div className="buyer-empty">
              <p>Belum ada transaksi rental.</p>
              <p className="buyer-empty-sub">
                Cari barang yang kamu butuhkan, lalu kirim permintaan sewa.
              </p>
              <button className="primary-button" onClick={() => onNavigate("consumer")}>
                Mulai Cari Barang
              </button>
            </div>
          )}
        </section>

        <WishlistSection
          wishItems={wishlist.wishItems}
          wishlistState={wishlist.wishlistState}
          busyWishId={wishlist.busyWishId}
          onReload={wishlist.loadWishlist}
          onRemove={wishlist.remove}
          onNavigate={onNavigate}
        />

        <section className="buyer-cta-strip">
          <div>
            <h2>Punya barang yang jarang dipakai?</h2>
            <p>Daftarkan barangmu dan mulai terima pesanan sewa.</p>
          </div>
          <button className="primary-button buyer-cta-btn" onClick={onSellerIntent}>
            Mulai Jadi Seller
          </button>
        </section>
      </main>

      <Footer onNavigate={onNavigate} />
    </div>
  );
}
