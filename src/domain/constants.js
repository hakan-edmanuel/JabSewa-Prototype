/*
 * ============================================================================
 * CONSTANTS — JabSewa (ERD v2)
 * ============================================================================
 * Konstanta tampilan. Status mengikuti enum DB (03-database-design.md):
 * transaction_status 8 nilai, application_status 3 nilai, dst.
 * Kategori TIDAK lagi hardcode — diambil dari tabel `categories` via
 * fetchCategories() (lib/listings). Konstanta di bawah hanya fallback label.
 * ============================================================================
 */

/** Pilihan kota untuk onboarding seller (statis, sementara sebelum data wilayah DB). */
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
 * STATUS TRANSAKSI RENTAL — enum transaction_status (8 nilai, ERD).
 * Matriks transisi: docs/db-rebuild/02-final-prd.md §5.2 (server-enforced).
 */
export const TRANSACTION_STATUS = {
  PENDING: "pending", // dibuat, menunggu pembayaran
  PAYMENT_VERIFY: "payment_verify", // bukti terkirim, menunggu verifikasi
  CONFIRMED: "confirmed", // dibayar, menunggu serah terima
  ONGOING: "ongoing", // barang sedang disewa
  OVERDUE: "overdue", // terlambat dikembalikan
  COMPLETED: "completed", // selesai & barang kembali
  CANCELLED: "cancelled", // dibatalkan buyer/owner/verifikator
  DISPUTED: "disputed", // sengketa berjalan
};

/** Label + kelas badge status transaksi (dipakai Buyer & Seller Orders). */
export const TRANSACTION_STATUS_META = {
  [TRANSACTION_STATUS.PENDING]: { label: "Menunggu Pembayaran", className: "status-pending" },
  [TRANSACTION_STATUS.PAYMENT_VERIFY]: { label: "Verifikasi Pembayaran", className: "status-pending" },
  [TRANSACTION_STATUS.CONFIRMED]: { label: "Dikonfirmasi", className: "status-accepted" },
  [TRANSACTION_STATUS.ONGOING]: { label: "Sedang Sewa", className: "status-active" },
  [TRANSACTION_STATUS.OVERDUE]: { label: "Terlambat", className: "status-rejected" },
  [TRANSACTION_STATUS.COMPLETED]: { label: "Selesai", className: "status-completed" },
  [TRANSACTION_STATUS.CANCELLED]: { label: "Dibatalkan", className: "status-cancelled" },
  [TRANSACTION_STATUS.DISPUTED]: { label: "Sengketa", className: "status-rejected" },
};

/** Status ajuan toko (enum application_status). */
export const APPLICATION_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
};

/** Label + kelas badge status ajuan toko — kunci PERSIS enum DB (tanpa alias). */
export const APPLICATION_STATUS_META = {
  [APPLICATION_STATUS.PENDING]: { label: "Menunggu Review", className: "is-review" },
  [APPLICATION_STATUS.APPROVED]: { label: "Disetujui", className: "is-approved" },
  [APPLICATION_STATUS.REJECTED]: { label: "Ditolak", className: "is-rejected" },
};

/** Status toko (enum store_status). */
export const STORE_STATUS_META = {
  active: { label: "Aktif", className: "is-approved" },
  inactive: { label: "Nonaktif", className: "is-review" },
  suspended: { label: "Suspended", className: "is-rejected" },
};

/** Status listing (enum listing_status). */
export const LISTING_STATUS_META = {
  active: { label: "Aktif", className: "is-approved" },
  inactive: { label: "Nonaktif", className: "is-review" },
  out_of_stock: { label: "Stok habis", className: "is-review" },
  suspended: { label: "Suspended", className: "is-rejected" },
};

/** Status akun (enum user_status). */
export const USER_STATUS_META = {
  active: { label: "Aktif", className: "is-approved" },
  inactive: { label: "Nonaktif", className: "is-review" },
  suspended: { label: "Suspended", className: "is-rejected" },
};

/**
 * Batas atas slider harga di halaman jelajah (rupiah per satuan sewa).
 * Dipakai bersama oleh ConsumerPage (state awal) dan ConsumerFilters (slider)
 * supaya tidak ada dua angka berbeda yang menyembunyikan listing mahal.
 */
export const PRICE_FILTER_MAX = 5_000_000;
export const PRICE_FILTER_STEP = 50_000;

/** Metode pembayaran (enum payment_method). */
export const PAYMENT_METHODS = [
  { id: "bank_transfer", label: "Transfer Bank" },
  { id: "e_wallet", label: "E-Wallet" },
  { id: "credit_card", label: "Kartu Kredit" },
  { id: "qris", label: "QRIS" },
];

/** Satuan sewa (enum rental_unit) + jumlah hari kalender per satuan (server mirror). */
export const RENTAL_UNITS = [
  { id: "day", label: "hari", days: 1 },
  { id: "week", label: "minggu", days: 7 },
  { id: "month", label: "bulan", days: 30 },
];

export const RENTAL_UNIT_LABELS = Object.fromEntries(
  RENTAL_UNITS.map((u) => [u.id, u.label]),
);

/**
 * Pesan error Indonesia untuk kode server (semua RPC mengembalikan `error`
 * berupa kode string — lihat 04-rpc-security-contract.md).
 */
const SERVER_ERROR_MESSAGES = {
  unauthenticated: "Sesi berakhir. Silakan masuk kembali.",
  user_inactive: "Akun tidak aktif. Hubungi admin.",
  forbidden: "Kamu tidak punya izin untuk aksi ini.",
  not_found: "Data tidak ditemukan.",
  illegal_transition: "Perubahan status tidak diizinkan.",
  mixed_stores: "Semua barang dalam satu transaksi harus dari toko yang sama.",
  duplicate_item: "Barang yang sama muncul lebih dari sekali.",
  too_many_items: "Maksimal 20 barang per transaksi.",
  invalid_quantity: "Jumlah barang tidak valid.",
  insufficient_stock: "Stok tidak cukup untuk periode itu. Coba kurangi jumlah atau ubah tanggal.",
  min_duration: "Durasi sewa di bawah minimum barang ini.",
  start_date_in_past: "Tanggal mulai tidak boleh di masa lalu.",
  invalid_date_range: "Rentang tanggal tidak valid.",
  empty_items: "Tidak ada barang yang disewa.",
  invalid_items: "Daftar barang tidak valid.",
  listing_not_found: "Barang tidak ditemukan.",
  listing_unavailable: "Barang sedang tidak tersedia.",
  store_inactive: "Toko sedang tidak aktif.",
  proof_required: "Bukti pembayaran wajib dilampirkan.",
  reason_required: "Alasan wajib diisi.",
  payment_not_pending: "Pembayaran ini sudah diproses.",
  payment_not_found: "Pembayaran tidak ditemukan.",
  already_seller: "Kamu sudah memiliki toko aktif.",
  application_pending: "Kamu masih punya ajuan toko yang sedang diproses.",
  application_not_pending: "Ajuan ini sudah diputus.",
  application_not_found: "Ajuan tidak ditemukan.",
  self_review_forbidden: "Kamu tidak dapat memutus ajuanmu sendiri.",
  rejection_reason_required: "Alasan penolakan wajib diisi.",
  category_not_found: "Kategori tidak ditemukan.",
  name_required: "Nama wajib diisi.",
  store_name_required: "Nama toko wajib diisi.",
  invalid_amount: "Harga/deposit tidak boleh negatif.",
  invalid_stock: "Stok tidak boleh negatif.",
  invalid_min_duration: "Durasi minimum tidak valid.",
  no_active_store: "Toko belum aktif. Selesaikan onboarding seller dulu.",
  not_found_or_forbidden: "Data tidak ditemukan atau bukan milikmu.",
  admin_only_status: "Perubahan status ini hanya oleh admin.",
  has_rentals: "Barang punya riwayat transaksi — nonaktifkan saja, jangan dihapus.",
  dispute_exists: "Transaksi ini sudah punya sengketa aktif.",
  dispute_closed: "Sengketa ini sudah selesai.",
  invalid_outcome: "Keputusan sengketa tidak valid.",
  resolution_required: "Resolusi wajib diisi.",
  rental_not_completed: "Review hanya untuk transaksi yang selesai.",
  invalid_rating: "Rating harus 1–5.",
  already_reviewed: "Kamu sudah memberi ulasan untuk transaksi ini.",
  not_late: "Belum terlambat — denda tidak dapat dibuat.",
  invalid_rate: "Tarif denda tidak valid.",
  invalid_decision: "Keputusan tidak valid.",
  self_action_forbidden: "Kamu tidak dapat mengubah akunmu sendiri.",
};

/** Terjemahkan kode error server → teks Indonesia untuk pengguna. */
export function translateServerError(message) {
  const key = String(message || "").trim();
  return (
    SERVER_ERROR_MESSAGES[key] ||
    (key ? `Terjadi kesalahan: ${key}` : "Terjadi kesalahan. Coba lagi.")
  );
}
