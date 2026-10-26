import { formatPrice } from "../../domain/format";
import { RENTAL_UNIT_LABELS } from "../../domain/constants";

/* Informasi barang: kategori, harga, deskripsi, fakta sewa. */
export default function ProductSummary({ item }) {
  const unitLabel = RENTAL_UNIT_LABELS[item.rental_unit] || "hari";

  return (
    <>
      <p className="listing-category">{item.category_name || item.category || "—"}</p>
      <h1>{item.name}</h1>
      <p className="detail-availability">
        <span
          className={`availability-dot ${item.available ? "is-available" : "is-rented"}`}
        />
        {item.available
          ? `Tersedia · stok ${item.stock} · ${item.location}`
          : `Tidak tersedia · ${item.location}`}
      </p>

      <div className="detail-price-row">
        <strong>{formatPrice(item.price)}</strong>
        <span>/{unitLabel}</span>
      </div>

      <p className="detail-description">{item.description}</p>

      <dl className="detail-facts">
        <div className="detail-fact">
          <dt>Pemilik</dt>
          <dd>{item.seller}</dd>
        </div>
        <div className="detail-fact">
          <dt>Lokasi</dt>
          <dd>{item.location}</dd>
        </div>
        <div className="detail-fact">
          <dt>Deposit</dt>
          <dd>{formatPrice(item.deposit)}</dd>
        </div>
        {item.min_rental_duration != null && (
          <div className="detail-fact">
            <dt>Durasi minimum</dt>
            <dd>
              {item.min_rental_duration} {unitLabel}
            </dd>
          </div>
        )}
      </dl>
    </>
  );
}
