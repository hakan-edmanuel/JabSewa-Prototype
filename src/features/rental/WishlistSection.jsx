import { formatPrice } from "../../domain/format";
import { RENTAL_UNIT_LABELS } from "../../domain/constants";

/* Grid wishlist penyewa — data katalog + id wishlist berasal dari server. */
export default function WishlistSection({
  wishItems,
  wishlistState,
  busyWishId,
  onReload,
  onRemove,
  onNavigate,
}) {
  return (
    <section className="buyer-section">
      <div className="buyer-section-head">
        <h2>Wishlist</h2>
        <span className="buyer-count">{wishItems.length}</span>
      </div>

      {wishlistState === "loading" ? (
        <p className="buyer-empty-sub">Memuat wishlist…</p>
      ) : wishlistState === "error" ? (
        <div className="buyer-empty">
          <p>Gagal memuat wishlist. Coba lagi.</p>
          <button className="btn-small btn-primary" onClick={onReload}>
            Muat ulang
          </button>
        </div>
      ) : wishItems.length ? (
        <div className="buyer-wish-grid">
          {wishItems.map((item) => (
            <article key={item.id} className="buyer-wish-card">
              <img src={item.image} alt={item.name} className="buyer-wish-thumb" />
              <div className="buyer-wish-info">
                <h3>{item.name}</h3>
                <p>{item.seller}</p>
                <p className="buyer-wish-price">
                  {formatPrice(item.price)}{" "}
                  <small>/{RENTAL_UNIT_LABELS[item.rental_unit] || "hari"}</small>
                </p>
                <div className="buyer-wish-actions">
                  <button
                    className="btn-small btn-primary"
                    onClick={() => onNavigate("consumer", { itemId: item.id })}
                  >
                    Sewa
                  </button>
                  <button
                    className="btn-text-action danger"
                    disabled={busyWishId === item.id}
                    onClick={() => onRemove(item.id)}
                    aria-label={`Hapus ${item.name} dari wishlist`}
                  >
                    Hapus
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="buyer-empty">
          <p>Wishlist masih kosong.</p>
          <p className="buyer-empty-sub">
            Simpan barang favorit dengan ikon ♡ saat menjelajah marketplace.
          </p>
        </div>
      )}
    </section>
  );
}
