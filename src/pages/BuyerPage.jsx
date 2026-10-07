import { useCallback, useEffect, useMemo, useState } from "react";
import SimpleNavbar from "../components/SimpleNavbar";
import Footer from "../components/Footer";
import { useAuth } from "../auth/AuthContext";
import {
  getRentals,
  getWishlist,
  getPaymentsForRental,
  getMyReviewedRentalIds,
  cancelRental,
  submitPayment,
  toggleWishlist,
  openDispute,
  createReview,
  translateRentalError,
} from "../lib/userData";
import { fetchListings } from "../lib/listings";
import { formatPrice } from "../lib/format";
import { TRANSACTION_STATUS, TRANSACTION_STATUS_META, PAYMENT_METHODS } from "../lib/constants";
import { uploadPaymentProof, validateImageFile, IMAGE_ALLOWED_TYPES } from "../lib/uploads";

/*
 * Dashboard penyewa (Buyer) — ERD v2.
 * Data rental/wishlist milik user login (RLS-scoped). Aksi buyer:
 *   - Kirim bukti pembayaran (pending → payment_verify via RPC submit_payment)
 *   - Batalkan permintaan (pending/payment_verify via RPC cancel_rental)
 *   - Buka sengketa (ongoing/overdue/completed) & ulasan (completed, sekali)
 * Pembayaran manual transfer + bukti — tanpa gateway (PRD §6).
 *
 * PENTING (CATATAN-K): bukti ditolak ≠ transaksi batal. Server mengembalikan
 * tx ke `pending` (payment berstatus `failed`) agar buyer dapat mengirim
 * ulang bukti — UI menampilkan alasan penolakan dari payment terakhir.
 */
export default function BuyerPage({ onNavigate, onSellerIntent }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [rentalsState, setRentalsState] = useState("loading");
  const [wishlist, setWishlist] = useState([]);
  const [wishlistState, setWishlistState] = useState("loading");
  const [actionError, setActionError] = useState("");
  const [busyRentalId, setBusyRentalId] = useState(null);
  const [busyWishId, setBusyWishId] = useState(null);
  const [payTarget, setPayTarget] = useState(null); // rental yang sedang kirim bukti
  const [payMethod, setPayMethod] = useState("bank_transfer");
  const [payProof, setPayProof] = useState(""); // URL manual (opsional — kompatibilitas)
  const [payFile, setPayFile] = useState(null); // file bukti — diunggah ke Storage saat kirim
  const [payPreview, setPayPreview] = useState(""); // objectURL pratinjau payFile
  const [payFileError, setPayFileError] = useState("");
  const [payRef, setPayRef] = useState("");
  // Pembayaran & review per rental (RLS-scoped):
  const [paymentRows, setPaymentRows] = useState({}); // rental_id → payments[]
  const [reviewedIds, setReviewedIds] = useState([]); // transaction_id yang sudah direview
  const [disputeTarget, setDisputeTarget] = useState(null); // rental yang sedang buka sengketa
  const [disputeReason, setDisputeReason] = useState("");
  const [reviewTarget, setReviewTarget] = useState(null); // rental yang sedang direview
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");

  /* --- Muat katalog (untuk kartu wishlist) --- */
  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => fetchListings())
      .then((data) => {
        if (active) setItems(data);
      })
      .catch(() => {
        if (active) setItems([]);
      });
    return () => {
      active = false;
    };
  }, []);

  /* --- Muat rentals milik user login (RLS-scoped) --- */
  const loadRentals = useCallback(() => {
    setRentalsState("loading");
    getRentals()
      .then((data) => {
        setRentals(data);
        setRentalsState("ready");
      })
      .catch(() => setRentalsState("error"));
  }, []);

  useEffect(() => {
    if (!user?.id) {
      Promise.resolve().then(() => {
        setRentals([]);
        setRentalsState("ready");
      });
      return;
    }
    Promise.resolve().then(() => loadRentals());
  }, [user?.id, loadRentals]);

  /* --- Muat wishlist user login (persist di server) --- */
  const loadWishlist = useCallback(() => {
    if (!user?.id) {
      Promise.resolve().then(() => {
        setWishlist([]);
        setWishlistState("ready");
      });
      return;
    }
    Promise.resolve().then(() => setWishlistState("loading"));
    getWishlist()
      .then((ids) => {
        setWishlist(ids);
        setWishlistState("ready");
      })
      .catch(() => setWishlistState("error"));
  }, [user?.id]);

  useEffect(() => {
    loadWishlist();
  }, [loadWishlist]);

  /* --- Review milik sesi: sembunyikan tombol ulasan untuk tx yang sudah direview --- */
  useEffect(() => {
    let active = true;
    if (!user?.id) {
      Promise.resolve().then(() => {
        if (active) setReviewedIds([]);
      });
      return;
    }
    getMyReviewedRentalIds()
      .then((ids) => {
        if (active) setReviewedIds(ids);
      })
      .catch(() => {
        if (active) setReviewedIds([]);
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  /* --- Bukti pembayaran rental pending: lihat alasan penolakan (tx kembali pending, bukan cancelled) --- */
  useEffect(() => {
    if (rentalsState !== "ready") return;
    rentals.forEach((rental) => {
      if (rental.status === TRANSACTION_STATUS.PENDING && paymentRows[rental.id] === undefined) {
        getPaymentsForRental(rental.id)
          .then((rows) => setPaymentRows((cur) => ({ ...cur, [rental.id]: rows })))
          .catch(() => setPaymentRows((cur) => ({ ...cur, [rental.id]: [] })));
      }
    });
  }, [rentalsState, rentals, paymentRows]);

  /* --- Aksi: batalkan (buyer: pending/payment_verify — divalidasi server) --- */
  const handleCancel = async (rentalId) => {
    setActionError("");
    setBusyRentalId(rentalId);
    try {
      await cancelRental(rentalId);
      loadRentals();
    } catch (err) {
      setActionError(translateRentalError(err?.message));
    } finally {
      setBusyRentalId(null);
    }
  };

  /* --- Lampiran bukti: file + pratinjau + validasi client-side (UX) --- */
  const resetPayAttachment = () => {
    if (payPreview) URL.revokeObjectURL(payPreview);
    setPayFile(null);
    setPayPreview("");
    setPayFileError("");
  };

  const handlePayFileChange = (file) => {
    if (payPreview) URL.revokeObjectURL(payPreview);
    setPayPreview("");
    setPayFile(null);
    const invalid = validateImageFile(file);
    if (invalid) {
      setPayFileError(invalid);
      return;
    }
    setPayFileError("");
    setPayFile(file);
    setPayPreview(URL.createObjectURL(file));
  };

  /* --- Aksi: kirim bukti pembayaran (pending → payment_verify) ---
     File diprioritaskan: diunggah ke bucket private payment-proofs (policy
     storage mengikat path proofs/{rental_id}/ ke buyer transaksi), lalu PATH
     storage disimpan ke payment_proof_url via RPC submit_payment. Bila tidak
     ada file, URL manual dipakai (kompatibilitas alur lama). */
  const handleSubmitProof = async (rentalId) => {
    setActionError("");
    setPayFileError("");
    setBusyRentalId(rentalId);
    try {
      let proofValue = payProof.trim();
      if (payFile) {
        const { path } = await uploadPaymentProof(rentalId, payFile);
        proofValue = path;
      }
      await submitPayment(rentalId, {
        method: payMethod,
        proofUrl: proofValue,
        externalReference: payRef.trim() || null,
      });
      setPayTarget(null);
      resetPayAttachment();
      setPayProof("");
      setPayRef("");
      setPaymentRows((cur) => ({ ...cur, [rentalId]: undefined })); // muat ulang bukti
      loadRentals();
    } catch (err) {
      setActionError(translateRentalError(err?.message));
    } finally {
      setBusyRentalId(null);
    }
  };

  const handleRemoveWish = async (itemId) => {
    setActionError("");
    setBusyWishId(itemId);
    try {
      await toggleWishlist(user.id, itemId);
      loadWishlist();
    } catch (err) {
      setActionError(translateRentalError(err?.message));
    } finally {
      setBusyWishId(null);
    }
  };

  /* --- Aksi: buka sengketa (ongoing/overdue/completed — divalidasi server) --- */
  const handleOpenDispute = async (rentalId) => {
    setActionError("");
    setBusyRentalId(rentalId);
    try {
      await openDispute(rentalId, disputeReason.trim(), "");
      setDisputeTarget(null);
      setDisputeReason("");
      loadRentals();
    } catch (err) {
      setActionError(translateRentalError(err?.message));
    } finally {
      setBusyRentalId(null);
    }
  };

  /* --- Aksi: review transaksi selesai (satu per transaksi — server) --- */
  const handleSubmitReview = async (rentalId) => {
    setActionError("");
    setBusyRentalId(rentalId);
    try {
      await createReview(rentalId, reviewRating, reviewComment.trim());
      setReviewTarget(null);
      setReviewComment("");
      setReviewedIds((cur) => [...cur, rentalId]);
      loadRentals();
    } catch (err) {
      setActionError(translateRentalError(err?.message));
    } finally {
      setBusyRentalId(null);
    }
  };

  const wishItems = useMemo(
    () => items.filter((item) => wishlist.includes(item.id)),
    [items, wishlist],
  );

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
          <button className="primary-button" onClick={() => onNavigate("consumer")}>
            Cari Barang
          </button>
        </header>

        {actionError && <p className="rental-note is-error">{actionError}</p>}

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
              {rentals.map((rental) => {
                const meta = TRANSACTION_STATUS_META[rental.status] || {
                  label: rental.status,
                  className: "status-pending",
                };
                const cancellable = [
                  TRANSACTION_STATUS.PENDING,
                  TRANSACTION_STATUS.PAYMENT_VERIFY,
                ].includes(rental.status);
                const payable = rental.status === TRANSACTION_STATUS.PENDING;
                const disputable = [
                  TRANSACTION_STATUS.ONGOING,
                  TRANSACTION_STATUS.OVERDUE,
                  TRANSACTION_STATUS.COMPLETED,
                ].includes(rental.status);
                const reviewable =
                  rental.status === TRANSACTION_STATUS.COMPLETED &&
                  !reviewedIds.includes(rental.id);
                const reviewing = reviewTarget === rental.id;
                const paying = payTarget === rental.id;
                // Bukti terakhir yang DITOLAK — alasan verifikator ditampilkan
                // (tx kembali pending, bukan cancelled — CATATAN-K).
                const rejectedProof = (paymentRows[rental.id] || []).find(
                  (p) => p.status === "failed",
                );
                return (
                  <article key={rental.id} className="buyer-rental-card">
                    <div className="buyer-rental-top">
                      <div>
                        <h3>
                          {rental.items.map((i) => i.name).join(", ") || "Transaksi sewa"}
                        </h3>
                        <p>Pemilik: {rental.store_name}</p>
                      </div>
                      <span className={`status-badge ${meta.className}`}>{meta.label}</span>
                    </div>
                    <div className="buyer-rental-meta">
                      <span>
                        {rental.start_date} → {rental.end_date} · {rental.total_days} hari ·{" "}
                        {rental.items.length} barang
                      </span>
                      <strong>{formatPrice(rental.total)}</strong>
                    </div>
                    {rental.status === TRANSACTION_STATUS.OVERDUE && (
                      <p className="buyer-rental-payment">
                        Denda keterlambatan: {formatPrice(rental.late_fee_total)}
                      </p>
                    )}
                    {rental.cancel_reason && (
                      <p className="buyer-rental-reject">Alasan: {rental.cancel_reason}</p>
                    )}
                    {payable && rejectedProof && (
                      <p className="buyer-rental-reject">
                        Bukti pembayaran sebelumnya ditolak
                        {rejectedProof.external_reference
                          ? ` (ref ${rejectedProof.external_reference})`
                          : "."}{" "}
                        Silakan kirim ulang bukti yang benar.
                      </p>
                    )}
                    {(cancellable || payable || disputable) && (
                      <div className="buyer-rental-actions">
                        {payable && !paying && !reviewing && (
                          <button
                            type="button"
                            className="btn-small btn-primary"
                            disabled={busyRentalId === rental.id}
                            onClick={() => {
                              setPayTarget(rental.id);
                              setPayMethod("bank_transfer");
                              setPayProof("");
                              setPayRef("");
                              resetPayAttachment();
                            }}
                          >
                            Kirim bukti pembayaran
                          </button>
                        )}
                        {cancellable && !paying && !reviewing && (
                          <button
                            type="button"
                            className="btn-small btn-danger"
                            disabled={busyRentalId === rental.id}
                            onClick={() => handleCancel(rental.id)}
                          >
                            {busyRentalId === rental.id ? "Membatalkan…" : "Batalkan permintaan"}
                          </button>
                        )}
                        {disputable && !paying && !reviewing && disputeTarget !== rental.id && (
                          <button
                            type="button"
                            className="btn-small btn-secondary"
                            disabled={busyRentalId === rental.id}
                            onClick={() => {
                              setDisputeTarget(rental.id);
                              setDisputeReason("");
                            }}
                          >
                            Buka sengketa
                          </button>
                        )}
                        {reviewable && !reviewing && disputeTarget !== rental.id && (
                          <button
                            type="button"
                            className="btn-small btn-success"
                            disabled={busyRentalId === rental.id}
                            onClick={() => {
                              setReviewTarget(rental.id);
                              setReviewRating(5);
                              setReviewComment("");
                            }}
                          >
                            Beri ulasan
                          </button>
                        )}
                      </div>
                    )}
                    {payable && !paying && !reviewing && rejectedProof && (
                      <button
                        type="button"
                        className="btn-small btn-secondary"
                        disabled={busyRentalId === rental.id}
                        onClick={() =>
                          setPaymentRows((cur) => ({ ...cur, [rental.id]: undefined }))
                        }
                      >
                        Perbarui status bukti
                      </button>
                    )}
                    {disputeTarget === rental.id && (
                      <div className="order-reject-box" style={{ marginTop: 8 }}>
                        <input
                          value={disputeReason}
                          onChange={(e) => setDisputeReason(e.target.value)}
                          placeholder="Jelaskan masalahnya (wajib)"
                          className="search-box-small"
                        />
                        <button
                          className="btn-small btn-primary"
                          disabled={busyRentalId === rental.id || !disputeReason.trim()}
                          onClick={() => handleOpenDispute(rental.id)}
                        >
                          Kirim sengketa
                        </button>
                        <button
                          className="btn-small btn-secondary"
                          onClick={() => setDisputeTarget(null)}
                        >
                          Batal
                        </button>
                      </div>
                    )}
                    {reviewing && (
                      <div className="order-reject-box" style={{ marginTop: 8 }}>
                        <select
                          value={reviewRating}
                          onChange={(e) => setReviewRating(Number(e.target.value))}
                          className="filter-select"
                        >
                          {[5, 4, 3, 2, 1].map((n) => (
                            <option key={n} value={n}>
                              {"★".repeat(n)} ({n}/5)
                            </option>
                          ))}
                        </select>
                        <input
                          value={reviewComment}
                          onChange={(e) => setReviewComment(e.target.value)}
                          placeholder="Ulasan kamu (wajib)"
                          className="search-box-small"
                        />
                        <button
                          className="btn-small btn-primary"
                          disabled={busyRentalId === rental.id || !reviewComment.trim()}
                          onClick={() => handleSubmitReview(rental.id)}
                        >
                          Kirim ulasan
                        </button>
                        <button
                          className="btn-small btn-secondary"
                          onClick={() => setReviewTarget(null)}
                        >
                          Batal
                        </button>
                      </div>
                    )}
                    {paying && (
                      <div className="order-reject-box" style={{ marginTop: 8 }}>
                        <select
                          value={payMethod}
                          onChange={(e) => setPayMethod(e.target.value)}
                          className="filter-select"
                        >
                          {PAYMENT_METHODS.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                        <div className="proof-upload">
                          <input
                            id={`proof-file-${rental.id}`}
                            type="file"
                            accept={IMAGE_ALLOWED_TYPES.join(",")}
                            className="upload-input-hidden"
                            disabled={busyRentalId === rental.id}
                            onChange={(event) => {
                              handlePayFileChange(event.target.files?.[0] || null);
                              event.target.value = ""; // izinkan pilih file yang sama lagi
                            }}
                          />
                          <label
                            htmlFor={`proof-file-${rental.id}`}
                            className="proof-upload-label"
                          >
                            {payPreview ? (
                              <img
                                src={payPreview}
                                alt="Pratinjau bukti transfer"
                                className="proof-preview"
                              />
                            ) : (
                              <span>📷 Pilih foto bukti (JPG/PNG/WebP · maks 3 MB)</span>
                            )}
                          </label>
                          {payFileError && <p className="rental-note is-error">{payFileError}</p>}
                          {payFile && payProof.trim() && (
                            <p className="rental-note">Foto terpilih dipakai — URL manual diabaikan.</p>
                          )}
                        </div>
                        <input
                          value={payProof}
                          onChange={(e) => setPayProof(e.target.value)}
                          placeholder="Atau tempel URL bukti (opsional)"
                          className="search-box-small"
                        />
                        <input
                          value={payRef}
                          onChange={(e) => setPayRef(e.target.value)}
                          placeholder="Nomor referensi (opsional)"
                          className="search-box-small"
                        />
                        <button
                          className="btn-small btn-primary"
                          disabled={busyRentalId === rental.id || (!payFile && !payProof.trim())}
                          onClick={() => handleSubmitProof(rental.id)}
                        >
                          {busyRentalId === rental.id && payFile ? "Mengunggah…" : "Kirim"}
                        </button>
                        <button
                          className="btn-small btn-secondary"
                          onClick={() => {
                            setPayTarget(null);
                            resetPayAttachment();
                          }}
                        >
                          Batal
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
              <button className="primary-button" onClick={() => onNavigate("consumer")}>
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

          {wishlistState === "loading" ? (
            <p className="buyer-empty-sub">Memuat wishlist…</p>
          ) : wishlistState === "error" ? (
            <div className="buyer-empty">
              <p>Gagal memuat wishlist. Coba lagi.</p>
              <button className="btn-small btn-primary" onClick={loadWishlist}>
                Muat ulang
              </button>
            </div>
          ) : wishItems.length ? (
            <div className="buyer-wish-grid">
              {wishItems.map((item) => (
                <article key={item.id} className="buyer-wish-card">
                  <img src={item.image} alt={item.name} className="buyer-wish-thumb" />
                  <div className="buyer-wish-info">
                    <h3>{item.name}</h3>
                    <p>{item.seller}</p>
                    <p className="buyer-wish-price">
                      {formatPrice(item.price)}{" "}
                      <small>/{item.rental_unit === "day" ? "hari" : item.rental_unit}</small>
                    </p>
                    <div className="buyer-wish-actions">
                      <button
                        className="btn-small btn-primary"
                        onClick={() => onNavigate("consumer", { itemId: item.id })}
                      >
                        Sewa
                      </button>
                      <button
                        className="btn-text-action danger"
                        disabled={busyWishId === item.id}
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
          <button className="primary-button buyer-cta-btn" onClick={onSellerIntent}>
            Mulai Jadi Seller
          </button>
        </section>
      </main>

      <Footer onNavigate={onNavigate} />
    </div>
  );
}
