/*
 * RentalStatusTimeline — progres status transaksi sewa (buyer).
 * Data murni dari backend: derivasi via deriveRentalTimeline (rentalTimeline.js).
 * Tanpa langkah dummy: status yang bukan bagian progres normal (overdue,
 * disputed) ditampilkan sebagai badge meta — bukan langkah palsu.
 * Cancelled: hanya langkah pertama diberi tanda tercapai; sisanya diredupkan.
 */
import { deriveRentalTimeline } from "../../domain/rentalTimeline";

export default function RentalStatusTimeline({ rental }) {
  const timeline = deriveRentalTimeline(rental);
  if (!timeline) return null;
  const { steps, cancelled, currentKey, meta } = timeline;
  return (
    <div
      className={`rental-timeline ${cancelled ? "is-cancelled" : ""}`}
      role="list"
      aria-label="Progres status pesanan sewa"
    >
      <ol className="rental-timeline-steps">
        {steps.map((s) => (
          <li
            key={s.key}
            role="listitem"
            className={[
              "rental-timeline-step",
              s.reached ? "is-reached" : "",
              s.current ? "is-current" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span className="rental-timeline-dot" aria-hidden="true" />
            <span className="rental-timeline-label">{s.label}</span>
          </li>
        ))}
      </ol>
      {currentKey && meta && currentKey !== steps.find((s) => s.current)?.key && (
        <span className={`status-badge ${meta.className}`}>{meta.label}</span>
      )}
    </div>
  );
}
