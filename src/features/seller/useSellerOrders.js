import { useCallback, useEffect, useState } from "react";
import {
  listRentals,
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
} from "../../data/rentals";
import { TRANSACTION_STATUS } from "../../domain/constants";

/*
 * Data & aksi pesanan seller.
 *
 * Pembayaran ditolak TIDAK membatalkan transaksi — tx kembali `pending`
 * (CATATAN-K) agar buyer dapat mengirim ulang bukti; bukti gagal tetap
 * tampil sebagai riwayat payment `failed`.
 */
export function useSellerOrders() {
  const [orders, setOrders] = useState([]);
  const [state, setState] = useState("loading");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [proofs, setProofs] = useState({}); // rental_id → payments[]
  const [fees, setFees] = useState({}); // rental_id → late_fee row | null

  const load = useCallback(() => {
    Promise.resolve().then(() => setState("loading"));
    listRentals()
      .then((data) => {
        setOrders(data);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

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

  const run = useCallback(
    async (fn, okMessage) => {
      setActionError("");
      setNotice("");
      try {
        await fn();
        if (okMessage) setNotice(okMessage);
        load();
      } catch (err) {
        setActionError(translateRentalError(err?.message));
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const verifyPayment = useCallback(
    (orderId, paymentId, approve, note = "") => {
      setBusyId(orderId);
      return run(
        () => decidePayment(paymentId, approve, approve ? "" : note),
        approve
          ? "Pembayaran disetujui — menunggu serah terima."
          : "Bukti ditolak — transaksi kembali menunggu pembayaran.",
      ).then(() => loadProofs(orderId));
    },
    [run, loadProofs],
  );

  const markFeePaid = useCallback(
    (orderId, feeId) => {
      setBusyId(orderId);
      return run(() => decideLateFee(feeId, "paid"), "Denda ditandai dibayar.").then(() =>
        loadFee(orderId),
      );
    },
    [run, loadFee],
  );

  const cancel = useCallback(
    (orderId, reason) => {
      if (!reason.trim()) return Promise.resolve(); // alasan wajib (server: reason_required)
      setBusyId(orderId);
      return run(
        () => cancelRental(orderId, reason.trim()),
        "Pesanan dibatalkan.",
      );
    },
    [run],
  );

  const start = useCallback(
    (orderId) => {
      setBusyId(orderId);
      return run(() => startRental(orderId), "Sewa dimulai.");
    },
    [run],
  );

  const recordReturned = useCallback(
    (orderId) => {
      setBusyId(orderId);
      return run(
        () => recordReturn(orderId),
        "Barang dikembalikan — transaksi selesai.",
      );
    },
    [run],
  );

  const markLate = useCallback(
    (orderId) => {
      setBusyId(orderId);
      return run(() => markOverdue(orderId), "Ditandai terlambat.");
    },
    [run],
  );

  const rateAndReturn = useCallback(
    (orderId, rate) => {
      setBusyId(orderId);
      return run(async () => {
        await applyLateFee(orderId, rate);
        await recordReturn(orderId);
      }, "Denda dicatat — transaksi selesai.");
    },
    [run],
  );

  return {
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
  };
}
