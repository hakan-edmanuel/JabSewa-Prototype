/*
 * ============================================================================
 * RENTAL TIMELINE — JabSewa (murni dari data backend, tanpa aturan baru)
 * ============================================================================
 * Derivasi langkah timeline status transaksi sewa berbasis status dari DB
 * (transaction_status). Fungsi murni — tidak melakukan RPC/apapun; label
 * konsisten diambil dari TRANSACTION_STATUS_META (constants.js).
 *
 * Urutan progres normal (kontrak lifecycle server):
 *   pending → payment_verify → confirmed → ongoing → completed
 * Status khusus dari data backend:
 *   - overdue : masih di fase "ongoing" (hanya reached), ditandai current.
 *   - disputed: sengketa berjalan — progres minimal ongoing, ditandai current.
 *   - cancelled: terminal; hanya pending yang tercapai, sisa diredupkan.
 * Unknown / data kosong → null (pemanggil boleh tidak render timeline).
 */

import { TRANSACTION_STATUS, TRANSACTION_STATUS_META } from "./constants";

/** Langkah progres normal, sesuai urutan transition server. */
export const RENTAL_TIMELINE_STEPS = [
  { key: TRANSACTION_STATUS.PENDING, label: "Permintaan" },
  { key: TRANSACTION_STATUS.PAYMENT_VERIFY, label: "Verifikasi" },
  { key: TRANSACTION_STATUS.CONFIRMED, label: "Dikonfirmasi" },
  { key: TRANSACTION_STATUS.ONGOING, label: "Berjalan" },
  { key: TRANSACTION_STATUS.COMPLETED, label: "Selesai" },
];

/**
 * Derivasi langkah timeline dari sebuah rental (bentuk kontrak userData):
 * @param {{ status: string, start_date?, end_date? }|null} rental
 * @returns {{ steps: Array<{key,label,reached,current}>, cancelled: boolean,
 *             currentKey: string, meta: {label,className} }|null}
 */
export function deriveRentalTimeline(rental) {
  const status = rental?.status;
  if (!status) return null;
  const meta = TRANSACTION_STATUS_META[status];
  if (!meta) return null; // status di luar kontrak — don't render timeline

  const currentKey =
    status === TRANSACTION_STATUS.OVERDUE || status === TRANSACTION_STATUS.DISPUTED
      ? status
      : status;

  // Index progres teringgi yang SUDAH TERCAPI pada urutan progres normal.
  let reachedIndex = RENTAL_TIMELINE_STEPS.findIndex((s) => s.key === status);
  if (status === TRANSACTION_STATUS.COMPLETED) {
    reachedIndex = RENTAL_TIMELINE_STEPS.length - 1;
  } else if (reachedIndex === -1) {
    // overdue/disputed: bukan langkah progres normal.
    // - overdue: selalu sudah ongoing.
    // - disputed: open_dispute berlaku untuk ongoing/overdue/completed (CATATAN-O):
    //   progress past bergantung actual_return_date dari data backend — rental
    //   dengan tanggal kembali aktual telah mencapai completed.
    reachedIndex = RENTAL_TIMELINE_STEPS.findIndex(
      (s) => s.key === TRANSACTION_STATUS.ONGOING,
    );
    if (
      status === TRANSACTION_STATUS.DISPUTED &&
      typeof rental?.actual_return_date === "string" &&
      rental.actual_return_date
    ) {
      const idx = RENTAL_TIMELINE_STEPS.findIndex(
        (s) => s.key === TRANSACTION_STATUS.COMPLETED,
      );
      if (idx !== -1) reachedIndex = idx;
    }
  }

  const cancelled = status === TRANSACTION_STATUS.CANCELLED;

  const steps = RENTAL_TIMELINE_STEPS.map((s, i) => ({
    key: s.key,
    label: s.label,
    reached: cancelled ? i === 0 : i <= reachedIndex,
    current: false,
  }));
  // Current: penanda status dari data backend (termasuk overdue/disputed, yang
  // tidak ada di daftar langkah — langkah terakhir yang tercapai ditandai
  // current, label asli tetap tampil via meta).
  if (!cancelled) {
    const cur = steps.find((s) => s.key === status);
    if (cur) {
      cur.current = true;
    } else {
      const last = steps[Math.min(reachedIndex, steps.length - 1)];
      if (last) last.current = true;
    }
  }

  return { steps, cancelled, currentKey, meta };
}
