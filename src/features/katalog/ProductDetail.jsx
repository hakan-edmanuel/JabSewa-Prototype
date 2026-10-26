import ProductSummary from "./ProductSummary";
import RentalPanel from "./RentalPanel";

/*
 * Detail barang + panel sewa (mode penyewa) — ERD v2.
 *   belum login → tombol "Sewa sekarang" meminta masuk dulu (onRequireAuth).
 *   sudah login → permintaan sewa dikirim via RPC create_rental (server-side
 *                 validation & pricing) dengan status `pending`, muncul di
 *                 Consumer Orders.
 *
 * Prinsip (sesuai kontrak backend):
 *   - Harga/deposit/durasi/total berasal dari SERVER (quote_rental).
 *   - MVP single-item per pemesanan (cart multi-item menyusul di halaman toko).
 */
export default function ProductDetail({ item, onBack, onNavigate, onRequireAuth }) {
  return (
    <main className="product-detail container">
      <button className="back-button" onClick={onBack}>
        ← Kembali ke marketplace
      </button>

      <div className="product-detail-grid">
        <section className="product-gallery">
          <img src={item.image} alt={item.name} className="product-main-image" />
        </section>

        <section className="product-information">
          <ProductSummary item={item} />
          <RentalPanel
            item={item}
            onNavigate={onNavigate}
            onRequireAuth={onRequireAuth}
          />
        </section>
      </div>

      <div className="product-detail-sections">
        <section className="product-info-block">
          <h2>Aturan sewa</h2>
          <p>
            Identitas diperlukan saat pengambilan. Kembalikan barang sesuai waktu dan kondisi
            semula; deposit dikembalikan penuh setelah barang dicek ulang. Periode sewa dihitung
            dengan tanggal selesai termasuk (sewa 1–3 Okt = 3 hari). Keterlambatan dapat dikenakan
            denda sesuai ketentuan toko.
          </p>
        </section>
      </div>
    </main>
  );
}
