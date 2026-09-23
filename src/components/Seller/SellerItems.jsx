import { useEffect, useMemo, useState } from "react";
import {
  fetchListingsByStore,
  removeListing,
  saveListing,
  updateListingAvailability,
} from "../../lib/listings";
import { formatPrice } from "../../lib/format";
import { CATEGORIES, CATEGORY_LABELS } from "../../lib/constants";

const DEFAULT_IMG =
  "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80";

/*
 * Barang Saya (seller): daftar barang milik TOKO seller aktif.
 * Tambah/edit/nonaktifkan/hapus menulis ke koleksi `items` di LocalStorage
 * store (src/lib/storage.js) — sumber yang sama dengan marketplace, jadi
 * barang yang dibuat seller langsung muncul di halaman penyewa.
 *
 * CATATAN (frontend-only): unggah foto nyata & stok per tanggal menunggu
 * backend (Supabase Storage / validasi ketersediaan).
 */
export default function SellerItems({ store }) {
  const [items, setItems] = useState(null); // null = masih memuat
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Semua Status");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    let active = true;
    if (!store) return undefined;
    fetchListingsByStore(store.id)
      .then((data) => {
        if (active) {
          setItems(data);
          setLoadError("");
        }
      })
      .catch(() => {
        if (active) {
          setItems([]);
          setLoadError("Gagal memuat barang toko. Coba muat ulang.");
        }
      });
    return () => {
      active = false;
    };
  }, [store]);

  const isLoading = items === null;

  const visibleItems = useMemo(
    () =>
      (items || []).filter(
        (item) =>
          item.name.toLowerCase().includes(query.toLowerCase()) &&
          (status === "Semua Status" ||
            (status === "Aktif" && item.available) ||
            (status === "Nonaktif" && !item.available)),
      ),
    [items, query, status],
  );

  const handleSaveListing = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    saveListing({
      id: editing?.id,
      store_id: store?.id ?? null,
      name: String(data.get("name") || "").trim(),
      description: String(data.get("description") || "").trim(),
      category: data.get("category"),
      price_per_day: Number(data.get("price") || 0),
      deposit: Number(data.get("deposit") || 0),
      available: data.get("status") === "Aktif",
      image_url: editing?.image || DEFAULT_IMG,
    });
    fetchListingsByStore(store.id).then((next) => setItems(next));
    setEditing(null);
    setShowForm(false);
  };

  const toggleAvailability = (item) => {
    updateListingAvailability(item.id, !item.available);
    setItems((current) =>
      current.map((listing) =>
        listing.id === item.id
          ? { ...listing, available: !listing.available }
          : listing,
      ),
    );
  };

  const removeItem = (item) => {
    removeListing(item.id);
    setItems((current) => current.filter((listing) => listing.id !== item.id));
  };

  return (
    <div className="seller-items">
      <div className="items-header">
        <div>
          <h1 className="seller-page-title">Barang Saya</h1>
          <p className="seller-page-desc">Kelola barang sewaan Anda di sini.</p>
        </div>
        <button
          className="btn-primary-solid"
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
        >
          + Tambah Barang
        </button>
      </div>

      {showForm && (
        <div className="seller-form-container">
          <div className="form-header-simple">
            <h2>{editing ? "Edit Barang" : "Tambah Barang"}</h2>
            <button
              type="button"
              className="btn-secondary-solid"
              onClick={() => setShowForm(false)}
            >
              Batal
            </button>
          </div>

          <form
            className="structured-listing-form"
            onSubmit={handleSaveListing}
          >
            <section className="form-section">
              <h3 className="form-section-title">Informasi Dasar</h3>
              <div className="form-group-grid">
                <label>
                  Nama Barang <span className="required-star">*</span>
                  <input
                    required
                    name="name"
                    defaultValue={editing?.name}
                    placeholder="Masukkan nama barang"
                  />
                </label>
                <label>
                  Kategori <span className="required-star">*</span>
                  <select
                    name="category"
                    defaultValue={editing?.category || CATEGORIES[0].id}
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="form-wide">
                Deskripsi Barang
                <textarea
                  name="description"
                  defaultValue={editing?.description}
                  placeholder="Jelaskan kondisi dan kelengkapan barang..."
                  rows="4"
                />
              </label>
            </section>

            <div className="form-divider"></div>

            <section className="form-section">
              <h3 className="form-section-title">Detail Sewa</h3>
              <div className="form-group-grid">
                <label>
                  Harga Sewa (per hari) <span className="required-star">*</span>
                  <div className="input-prefix">
                    <span className="prefix">Rp</span>
                    <input
                      required
                      name="price"
                      type="number"
                      min="0"
                      defaultValue={editing?.price}
                    />
                  </div>
                </label>
                <label>
                  Deposit Keamanan
                  <div className="input-prefix">
                    <span className="prefix">Rp</span>
                    <input
                      name="deposit"
                      type="number"
                      min="0"
                      placeholder="0"
                      defaultValue={editing?.deposit || ""}
                    />
                  </div>
                </label>
                <label>
                  Status
                  <select
                    name="status"
                    defaultValue={
                      editing
                        ? editing.available
                          ? "Aktif"
                          : "Nonaktif"
                        : "Aktif"
                    }
                  >
                    <option>Aktif</option>
                    <option>Nonaktif</option>
                  </select>
                </label>
              </div>
            </section>

            <div className="form-divider"></div>

            <section className="form-section">
              <h3 className="form-section-title">Foto Barang</h3>
              <div className="simple-image-upload">
                <div className="upload-placeholder">
                  <span className="upload-icon">📷</span>
                  <span className="upload-text">
                    {editing
                      ? "Foto saat ini dipakai — unggah nyata menunggu backend"
                      : "Klik untuk tambah foto (menunggu backend)"}
                  </span>
                </div>
              </div>
            </section>

            <div className="form-actions-footer">
              <button
                type="submit"
                className="btn-primary-solid form-submit-btn"
              >
                Simpan Barang
              </button>
            </div>
          </form>
        </div>
      )}

      {!showForm && (
        <>
          <div className="items-filters">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              type="search"
              placeholder="Cari barang..."
              className="search-box-solid"
            />
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="filter-select-solid"
            >
              <option>Semua Status</option>
              <option>Aktif</option>
              <option>Nonaktif</option>
            </select>
          </div>

          {isLoading ? (
            <p className="dashboard-empty-note">Memuat barang…</p>
          ) : loadError ? (
            <p className="dashboard-empty-note">{loadError}</p>
          ) : (
            <div className="items-grid-solid">
              {visibleItems.map((item) => (
                <article
                  key={item.id}
                  className={`item-card-solid ${item.available ? "" : "is-inactive"}`}
                >
                  <div className="item-image-box">
                    <img src={item.image} alt={item.name} />
                    <span
                      className={`item-status-chip status-${item.available ? "aktif" : "nonaktif"}`}
                    >
                      <span
                        className="status-dot-small"
                        aria-hidden="true"
                      ></span>
                      {item.available ? "Tersedia" : "Nonaktif"}
                    </span>
                  </div>
                  <div className="item-details-box">
                    <p className="item-category-label">
                      {CATEGORY_LABELS[item.category] || item.category}
                    </p>
                    <h3 className="item-title-solid">{item.name}</h3>
                    <div className="item-price-row">
                      <strong className="item-price-solid">
                        {formatPrice(item.price)}
                      </strong>
                      <span className="item-price-unit">/hari</span>
                    </div>
                    <p className="item-rented-note">
                      Deposit {formatPrice(item.deposit)}
                    </p>
                  </div>
                  <div className="item-actions-row">
                    <button
                      className="btn-text-action"
                      onClick={() => {
                        setEditing(item);
                        setShowForm(true);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="btn-text-action"
                      onClick={() => toggleAvailability(item)}
                    >
                      {item.available ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                    <button
                      className="btn-text-action danger"
                      onClick={() => removeItem(item)}
                    >
                      Hapus
                    </button>
                  </div>
                </article>
              ))}
              {!visibleItems.length && (
                <div className="empty-state-solid">
                  <span className="empty-state-icon" aria-hidden="true">
                    📦
                  </span>
                  <p className="empty-state-title">Belum ada barang di sini</p>
                  <p className="empty-state-desc">
                    Coba ubah kata kunci atau filter status, atau tambahkan
                    barang baru.
                  </p>
                  <button
                    className="btn-primary-solid"
                    onClick={() => {
                      setEditing(null);
                      setShowForm(true);
                    }}
                  >
                    + Tambah Barang
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
