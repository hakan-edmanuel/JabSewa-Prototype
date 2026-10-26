import { formatPrice } from "../../domain/format";

/* Pesan error kutipan — kunci persis nilai dari server (quote_rental). */
const QUOTE_PROBLEM_LABELS = {
  start_date_in_past: "Tanggal mulai tidak boleh di masa lalu.",
  invalid_date_range: "Rentang tanggal tidak valid.",
  listing_unavailable: "Barang sedang tidak tersedia.",
  store_inactive: "Toko sedang tidak aktif.",
  insufficient_stock: "Stok tidak cukup untuk jumlah/rentang tanggal itu.",
};

/* Ringkasan biaya dari kutipan server + alasan bila kutipan gagal. */
export default function QuoteSummary({ quote, quoteState, item, unitLabel }) {
  const problem = quote && !quote.ok ? quote.error : null;

  return (
    <>
      <div className="price-summary">
        <span>
          {quoteState === "loading" && "Menghitung…"}
          {quoteState === "error" && "Gagal menghitung biaya."}
          {quoteState === "idle" && "Pilih tanggal sewa"}
          {quote?.ok && `${quote.total_days} hari sewa (tanggal selesai termasuk)`}
        </span>
        <strong>{quote?.ok ? formatPrice(quote.subtotal) : "—"}</strong>
        <span>Deposit keamanan</span>
        <strong>{quote?.ok ? formatPrice(quote.deposit_total) : "—"}</strong>
        <span>Total</span>
        <strong>{quote?.ok ? formatPrice(quote.total) : "—"}</strong>
      </div>

      {problem && (
        <p className="rental-note is-error">
          {problem === "min_duration"
            ? `Durasi sewa di bawah minimum (${item.min_rental_duration} ${unitLabel}).`
            : QUOTE_PROBLEM_LABELS[problem] ||
              "Tanggal tidak dapat dikutip. Coba rentang lain."}
        </p>
      )}
    </>
  );
}
