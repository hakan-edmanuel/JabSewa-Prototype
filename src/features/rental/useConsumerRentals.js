import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  listRentals,
  getPaymentsForRental,
  getMyReviewedRentalIds,
  cancelRental,
  submitPayment,
  openDispute,
  createReview,
  translateRentalError,
} from "../../data/rentals";
import { uploadPaymentProof } from "../../data/uploads";
import { TRANSACTION_STATUS } from "../../domain/constants";

/*
 * Data & aksi dashboard penyewa.
 *
 * PENTING (CATATAN-K): bukti ditolak ≠ transaksi batal. Server mengembalikan
 * tx ke `pending` (payment berstatus `failed`) agar buyer dapat mengirim
 * ulang bukti — UI menampilkan alasan penolakan dari payment terakhir.
 */
export function useConsumerRentals() {
  const { user } = useAuth();
  const [rentals, setRentals] = useState([]);
  const [rentalsState, setRentalsState] = useState("loading");
  const [paymentRows, setPaymentRows] = useState({}); // rental_id → payments[]
  const [reviewedIds, setReviewedIds] = useState([]); // transaction_id yang sudah direview
  const [actionError, setActionError] = useState("");
  const [busyRentalId, setBusyRentalId] = useState(null);

  /* --- Muat rentals milik user login (RLS-scoped) --- */
  const loadRentals = useCallback(() => {
    setRentalsState("loading");
    listRentals()
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

  const refreshPayments = useCallback((rentalId) => {
    setPaymentRows((cur) => ({ ...cur, [rentalId]: undefined }));
  }, []);

  /* Satu jalur untuk semua aksi: error diterjemahkan, id sibuk dilacak. */
  const runAction = useCallback(async (rentalId, action) => {
    setActionError("");
    setBusyRentalId(rentalId);
    try {
      await action();
      return true;
    } catch (err) {
      setActionError(translateRentalError(err?.message));
      return false;
    } finally {
      setBusyRentalId(null);
    }
  }, []);

  /* --- Aksi: batalkan (buyer: pending/payment_verify — divalidasi server) --- */
  const cancel = useCallback(
    (rentalId) =>
      runAction(rentalId, async () => {
        await cancelRental(rentalId);
        loadRentals();
      }),
    [runAction, loadRentals],
  );

  /* --- Aksi: kirim bukti pembayaran (pending → payment_verify) ---
     File diprioritaskan: diunggah ke bucket private payment-proofs (policy
     storage mengikat path proofs/{rental_id}/ ke buyer transaksi), lalu PATH
     storage disimpan ke payment_proof_url via RPC submit_payment. Bila tidak
     ada file, URL manual dipakai (kompatibilitas alur lama). */
  const submitProof = useCallback(
    (rentalId, { method, file, proofUrl, externalReference }) =>
      runAction(rentalId, async () => {
        let proofValue = (proofUrl || "").trim();
        if (file) {
          const { path } = await uploadPaymentProof(rentalId, file);
          proofValue = path;
        }
        await submitPayment(rentalId, {
          method,
          proofUrl: proofValue,
          externalReference: externalReference || null,
        });
        refreshPayments(rentalId);
        loadRentals();
      }),
    [runAction, refreshPayments, loadRentals],
  );

  /* --- Aksi: buka sengketa (ongoing/overdue/completed — divalidasi server) --- */
  const dispute = useCallback(
    (rentalId, reason) =>
      runAction(rentalId, async () => {
        await openDispute(rentalId, reason.trim(), "");
        loadRentals();
      }),
    [runAction, loadRentals],
  );

  /* --- Aksi: review transaksi selesai (satu per transaksi — server) --- */
  const review = useCallback(
    (rentalId, rating, comment) =>
      runAction(rentalId, async () => {
        await createReview(rentalId, rating, comment.trim());
        setReviewedIds((cur) => [...cur, rentalId]);
        loadRentals();
      }),
    [runAction, loadRentals],
  );

  return {
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
  };
}
