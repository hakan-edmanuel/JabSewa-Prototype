/*
 * ============================================================================
 * CONSTANTS — JabSewa
 * ============================================================================
 * Konstanta tampilan bersama. Kategori harus sinkron dengan seed data
 * (src/lib/storage.js SEED_ITEMS.category) sampai kategori jadi tabel DB.
 * ============================================================================
 */

/** Kategori katalog (id = nilai `category` pada listing). */
export const CATEGORIES = [
  { id: "photography", name: "Fotografi" },
  { id: "gadget", name: "Gadget" },
  { id: "sports", name: "Olahraga" },
  { id: "event", name: "Event" },
];

/** Label tampilan kategori → dipakai kartu, detail, dan form seller. */
export const CATEGORY_LABELS = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.name]),
);

/** Pilihan kota untuk onboarding seller (sementara, sebelum data wilayah DB). */
export const CITIES = [
  "Jakarta Selatan",
  "Jakarta Pusat",
  "Jakarta Utara",
  "Bandung",
  "Bogor",
  "Depok",
  "Tangerang",
  "Bekasi",
];

/*
 * STATUS RENTAL — kontrak frontend (frontend-only, menunggu backend).
 * Nilai disimpan apa adanya di data layer; label tampilan dipetakan di sini.
 * JANGAN menambah state yang mensimulasikan backend (mis. pembayaran).
 */
export const RENTAL_STATUS = {
  PENDING: "pending", // permintaan dikirim, menunggu keputusan seller
  ACCEPTED: "accepted", // seller setuju, menunggu serah terima
  REJECTED: "rejected", // seller menolak permintaan
  ACTIVE: "active", // barang sedang disewa
  COMPLETED: "completed", // selesai & barang kembali
  CANCELLED: "cancelled", // dibatalkan seller atau tenant
};

/** Label + kelas badge status rental (dipakai Buyer & Seller Orders). */
export const RENTAL_STATUS_META = {
  [RENTAL_STATUS.PENDING]: {
    label: "Menunggu Konfirmasi",
    className: "status-pending",
  },
  [RENTAL_STATUS.ACCEPTED]: { label: "Diterima", className: "status-accepted" },
  [RENTAL_STATUS.REJECTED]: { label: "Ditolak", className: "status-rejected" },
  [RENTAL_STATUS.ACTIVE]: { label: "Aktif", className: "status-active" },
  [RENTAL_STATUS.COMPLETED]: {
    label: "Selesai",
    className: "status-completed",
  },
  [RENTAL_STATUS.CANCELLED]: {
    label: "Dibatalkan",
    className: "status-cancelled",
  },
};
