import { useState } from "react";
import { formatPrice } from "../../domain/format";
import { RENTAL_UNIT_LABELS } from "../../domain/constants";
import { DEFAULT_IMG } from "./listingDefaultImage";

/* Kartu listing milik seller: ringkasan + aksi edit/aktifkan/hapus. */
export default function SellerListingCard({ item, onEdit, onToggle, onRemove }) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const unitLabel = RENTAL_UNIT_LABELS[item.rental_unit] || item.rental_unit;

  return (
    <article className={`item-card-solid ${item.available ? "" : "is-inactive"}`}>
      <div className="item-image-box">
        <img src={item.image || DEFAULT_IMG} alt={item.name} />
        <span
          className={`item-status-chip status-${item.available ? "aktif" : "nonaktif"}`}
        >
          <span className="status-dot-small" aria-hidden="true"></span>
          {item.available ? "Tersedia" : "Nonaktif"}
        </span>
      </div>
      <div className="item-details-box">
        <p className="item-category-label">{item.category_name || item.category}</p>
        <h3 className="item-title-solid">{item.name}</h3>
        <div className="item-price-row">
          <strong className="item-price-solid">{formatPrice(item.price)}</strong>
          <span className="item-price-unit">/{unitLabel}</span>
        </div>
        <p className="item-rented-note">
          Deposit {formatPrice(item.deposit)} · Stok {item.stock}
        </p>
      </div>
      <div className="item-actions-row">
        {confirmRemove ? (
          <>
            <span className="item-rented-note">Hapus permanen?</span>
            <button
              className="btn-text-action danger"
              onClick={() => {
                setConfirmRemove(false);
                onRemove(item);
              }}
            >
              Ya, hapus
            </button>
            <button className="btn-text-action" onClick={() => setConfirmRemove(false)}>
              Batal
            </button>
          </>
        ) : (
          <>
            <button className="btn-text-action" onClick={() => onEdit(item)}>
              Edit
            </button>
            <button className="btn-text-action" onClick={() => onToggle(item)}>
              {item.available ? "Nonaktifkan" : "Aktifkan"}
            </button>
            <button
              className="btn-text-action danger"
              onClick={() => setConfirmRemove(true)}
            >
              Hapus
            </button>
          </>
        )}
      </div>
    </article>
  );
}
