import { useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { addRental, translateRentalError } from "../../data/rentals";
import { formatPrice } from "../../domain/format";
import { RENTAL_UNIT_LABELS } from "../../domain/constants";
import { resolveRentButton } from "../../domain/rentalActions";
import { useRentalQuote } from "./useRentalQuote";
import QuoteSummary from "./QuoteSummary";

/*
 * Panel sewa: tanggal, jumlah, kutipan harga server, dan pengiriman
 * permintaan (RPC create_rental, status `pending`).
 *   belum login → tombol meminta masuk dulu (onRequireAuth).
 *   sudah login → quantity dikirim (1..stok); harga tetap dihitung server.
 *   Cegah double-submit: guard inFlight + submitting (tanpa idempotency-key).
 */
export default function RentalPanel({ item, onNavigate, onRequireAuth }) {
  const { user } = useAuth();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [dateError, setDateError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { id, total }
  const inFlight = useRef(false);

  const unitLabel = RENTAL_UNIT_LABELS[item.rental_unit] || "hari";

  const today = useMemo(() => {
    const now = new Date();
    const tz = now.getTimezoneOffset() * 60000;
    return new Date(now - tz).toISOString().slice(0, 10);
  }, []);

  const { quote, quoteState } = useRentalQuote({
    listingId: item.id,
    startDate,
    endDate,
    quantity,
  });

  /* --- Validasi tanggal (pesan Indonesia) --- */
  const validate = () => {
    if (!startDate) return "Pilih tanggal mulai sewa.";
    if (!endDate) return "Pilih tanggal selesai sewa.";
    if (endDate < startDate) return "Tanggal selesai tidak boleh sebelum tanggal mulai.";
    if (startDate < today) return "Tanggal mulai tidak boleh di masa lalu.";
    return "";
  };

  // Tamu boleh menekan tombol untuk diarahkan masuk (onRequireAuth); user yang
  // sudah login baru menunggu kutipan server sukses. Tanpa ini, tamu terjebak
  // di halaman detail karena tombolnya disabled.
  const quoteReady =
    item.available !== false &&
    Boolean(startDate && endDate) &&
    !dateError &&
    quote?.ok === true;

  const canRent =
    !submitting && !result && (user ? quoteReady : item.available !== false);

  const rentButton = resolveRentButton({
    submitting,
    hasResult: Boolean(result),
    available: item.available !== false,
    isAuthenticated: Boolean(user),
  });

  const handleStartDate = (value) => {
    setStartDate(value);
    setResult(null);
    setSubmitError("");
    if (endDate && value && endDate < value) {
      setEndDate("");
      setDateError("Tanggal selesai sudah diatur ulang.");
    } else {
      setDateError("");
    }
  };

  const handleEndDate = (value) => {
    setEndDate(value);
    setResult(null);
    setSubmitError("");
    if (startDate && value && value < startDate) {
      setDateError("Tanggal selesai tidak boleh sebelum tanggal mulai.");
    } else {
      setDateError("");
    }
  };

  const handleRent = async () => {
    if (!user) {
      onRequireAuth(item);
      return;
    }
    if (inFlight.current) return; // cegah double-submit (tanpa idempotency-key)
    const problem = validate();
    if (problem) {
      setDateError(problem);
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setSubmitError("");
    try {
      const rental = await addRental({
        startDate,
        endDate,
        items: [{ listing_id: item.id, quantity }],
      });
      setResult({ id: rental.id, total: rental.total });
    } catch (err) {
      setSubmitError(translateRentalError(err?.message));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <aside className="rental-panel">
      <div className="date-grid">
        <label>
          Mulai
          <input
            type="date"
            min={today}
            value={startDate}
            onChange={(event) => handleStartDate(event.target.value)}
          />
        </label>
        <label>
          Selesai
          <input
            type="date"
            min={startDate || today}
            value={endDate}
            onChange={(event) => handleEndDate(event.target.value)}
          />
        </label>
      </div>

      {dateError && <p className="rental-note is-error">{dateError}</p>}

      <label className="rental-quantity">
        Jumlah
        <select
          value={quantity}
          onChange={(event) => {
            setResult(null);
            setQuantity(Number(event.target.value) || 1);
          }}
          disabled={item.available === false || (item.stock ?? 1) <= 1}
        >
          {Array.from(
            { length: Math.max(1, Math.min(item.stock ?? 1, 10)) },
            (_, i) => i + 1,
          ).map((n) => (
            <option key={n} value={n}>
              {n} unit
            </option>
          ))}
        </select>
      </label>

      <QuoteSummary
        quote={quote}
        quoteState={quoteState}
        item={item}
        unitLabel={unitLabel}
      />

      <button
        className="primary-button"
        disabled={!canRent || rentButton.disabled}
        onClick={handleRent}
      >
        {rentButton.label}
      </button>

      {submitError && <p className="rental-note is-error">{submitError}</p>}

      {result && (
        <div className="request-success">
          <p>
            Permintaan sewa dikirim ke {item.seller}. Total {formatPrice(result.total)}.
            Selanjutnya kirim bukti pembayaran dari dashboard penyewa.
          </p>
          <button className="btn-small btn-primary" onClick={() => onNavigate("buyer")}>
            Lihat pesanan saya
          </button>
        </div>
      )}
      {!user && !result && (
        <p className="rental-note">
          Kamu perlu masuk dulu sebelum mengirim permintaan sewa.
        </p>
      )}
    </aside>
  );
}
