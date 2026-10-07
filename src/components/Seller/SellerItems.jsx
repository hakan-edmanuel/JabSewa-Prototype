import { useEffect, useMemo, useState } from "react";
import {
  fetchCategories,
  fetchListingsByStore,
  removeListing,
  saveListing,
  updateListingAvailability,
} from "../../lib/listings";
import { translateRentalError } from "../../lib/userData";
import { formatPrice } from "../../lib/format";
import { CATEGORY_LABELS, RENTAL_UNITS, RENTAL_UNIT_LABELS } from "../../lib/constants";
import {
  uploadListingImage,
  validateImageFile,
  IMAGE_ALLOWED_TYPES,
  MAX_LISTING_IMAGES,
} from "../../lib/uploads";

const DEFAULT_IMG =
  "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80";

/*
 * Barang Saya (seller) — ERD v2.
 * Data dari direct SELECT listings (RLS-scoped: hanya listing toko milik
 * sesi yang terlihat). Tambah/edit via RPC save_listing (validasi server;
 * harga/stok tidak dipercaya dari client). Kategori dari tabel categories.
 * Gambar: unggah file ke Supabase Storage (bucket listing-images, path
 * listings/{listing_id}/ — ownership dipatuahkan storage policy) ATAU URL
 * manual (kompatibilitas). Multi-gambar diurutkan; foto pertama jadi thumbnail.
 * Listing disimpan dulu (butuh listing_id untuk namespace path), lalu file
 * diunggah, lalu URL hasil unggahan disimpan via save_listing kedua.
 */
export default function SellerItems({ store }) {
  const [items, setItems] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [actionError, setActionError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Semua Status");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  // Upload foto (Supabase Storage — lib/uploads):
  const [pendingImageUrls, setPendingImageUrls] = useState([]); // URL storage draft (sudah terunggah)
  const [newFiles, setNewFiles] = useState([]); // file terpilih — diunggah saat submit
  const [previews, setPreviews] = useState([]); // objectURL pratinjau newFiles
  const [uploading, setUploading] = useState(false); // simpan+unggah berlangsung
  const [uploadError, setUploadError] = useState(""); // validasi file terpilih

  useEffect(() => {
    let active = true;
    fetchCategories()
      .then((cats) => {
        if (active) setCategories(cats);
      })
      .catch(() => {
        if (active) setCategories([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetchListingsByStore(store?.id ?? null)
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
  const effectiveCategories = categories.length ? categories : [];

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

  /* Buka form dengan state upload bersih (dipakai tombol Tambah & Edit). */
  const openForm = (item) => {
    previews.forEach((url) => URL.revokeObjectURL(url));
    setEditing(item);
    setShowForm(true);
    setPendingImageUrls([]);
    setNewFiles([]);
    setPreviews([]);
    setUploadError("");
  };

  const resetFormAndClose = () => {
    previews.forEach((url) => URL.revokeObjectURL(url));
    setEditing(null);
    setShowForm(false);
    setPendingImageUrls([]);
    setNewFiles([]);
    setPreviews([]);
    setUploadError("");
  };

  /* Pilih file: validasi client-side (UX) — unggah terjadi saat submit
     (namespace path butuh listing_id dari hasil simpan). */
  const handleFilesChange = (fileList) => {
    const files = Array.from(fileList || []).slice(0, MAX_LISTING_IMAGES);
    const errors = [];
    const ok = [];
    for (const file of files) {
      const invalid = validateImageFile(file);
      if (invalid) errors.push(invalid);
      else ok.push(file);
    }
    previews.forEach((url) => URL.revokeObjectURL(url));
    setNewFiles(ok);
    setPreviews(ok.map((file) => URL.createObjectURL(file)));
    setUploadError(errors.join(" · "));
  };

  const handleSaveListing = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setFormError("");
    const manualUrls = String(data.get("images") || "")
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const baseImages = [...pendingImageUrls, ...manualUrls];
    const images = baseImages.length ? baseImages : editing?.images || [DEFAULT_IMG];
    const payload = {
      store_id: store?.id ?? null,
      category_id: data.get("category"),
      name: String(data.get("name") || "").trim(),
      description: String(data.get("description") || "").trim(),
      price: Number(data.get("price") || 0),
      deposit: Number(data.get("deposit") || 0),
      stock: Number(data.get("stock") || 1),
      rental_unit: data.get("rental_unit") || "day",
      min_rental_duration: data.get("min_duration")
        ? Number(data.get("min_duration"))
        : null,
      available: data.get("status") === "Aktif",
    };
    setUploading(true);
    let uploadedUrls = [];
    const uploadFailures = [];
    let listingId = null;
    try {
      // 1) Simpan listing dulu — namespace path Storage butuh listing_id.
      listingId = await saveListing({ ...payload, id: editing?.id ?? null, images });
      // 2) Unggah file baru ke listings/{listing_id}/ (policy: owner toko).
      for (const file of newFiles) {
        try {
          const { publicUrl } = await uploadListingImage(listingId, file);
          uploadedUrls.push(publicUrl);
        } catch (err) {
          uploadFailures.push(err?.message || "gagal mengunggah");
        }
      }
      // 3) URL hasil unggahan masuk listing_images (urut: upload dulu → thumbnail).
      if (uploadedUrls.length) {
        await saveListing({ ...payload, id: listingId, images: [...uploadedUrls, ...images] });
      }
      const next = await fetchListingsByStore(store?.id ?? null);
      setItems(next);
      if (uploadFailures.length) {
        // Listing tersimpan, sebagian foto gagal — form tetap terbuka mode edit
        // draft agar coba ulang tidak membuat listing duplikat.
        setEditing({ ...payload, id: listingId, images: [...uploadedUrls, ...images] });
        setPendingImageUrls((cur) => [...cur, ...uploadedUrls]);
        setNewFiles([]);
        setPreviews([]);
        setFormError(
          `Barang tersimpan, tetapi ${uploadFailures.length} foto gagal diunggah: ${uploadFailures[0]}${
            uploadFailures.length > 1 ? " · dst." : ""
          }`,
        );
      } else {
        resetFormAndClose();
      }
    } catch (err) {
      if (listingId) {
        // RPC pertama sukses tapi langkah berikutnya gagal — jadikan draft edit
        // agar submit ulang memperbarui, bukan membuat listing baru.
        setEditing({ ...payload, id: listingId, images: [...uploadedUrls, ...images] });
        setPendingImageUrls((cur) => [...cur, ...uploadedUrls]);
        setNewFiles([]);
        setPreviews([]);
      }
      setFormError(translateRentalError(err?.message));
    } finally {
      setUploading(false);
    }
  };

  const toggleAvailability = async (item) => {
    setActionError("");
    try {
      await updateListingAvailability(item.id, !item.available);
      setItems((current) =>
        current.map((listing) =>
          listing.id === item.id
            ? { ...listing, available: !listing.available }
            : listing,
        ),
      );
    } catch (err) {
      setActionError(translateRentalError(err?.message));
    }
  };

  const removeItem = async (item) => {
    setActionError("");
    try {
      await removeListing(item.id);
      setItems((current) => current.filter((listing) => listing.id !== item.id));
    } catch (err) {
      setActionError(translateRentalError(err?.message));
    }
  };

  const unitLabel = (u) => RENTAL_UNIT_LABELS[u] || u;

  return (
    <div className="seller-items">
      <div className="items-header">
        <div>
          <h1 className="seller-page-title">Barang Saya</h1>
          <p className="seller-page-desc">Kelola barang sewaan Anda di sini.</p>
        </div>
        <button
          className="btn-primary-solid"
          onClick={() => openForm(null)}
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
              disabled={uploading}
              onClick={resetFormAndClose}
            >
              Batal
            </button>
          </div>

          {formError && <p className="rental-note is-error">{formError}</p>}

          <form className="structured-listing-form" onSubmit={handleSaveListing}>
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
                    defaultValue={editing?.category_id || effectiveCategories[0]?.id || ""}
                    required
                  >
                    {(effectiveCategories.length ? effectiveCategories : [
                      { id: editing?.category_id || "", name: editing?.category_name || "— pilih —" },
                    ]).map((cat) => (
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
                  Harga Sewa <span className="required-star">*</span>
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
                  Stok (unit) <span className="required-star">*</span>
                  <input
                    required
                    name="stock"
                    type="number"
                    min="0"
                    defaultValue={editing?.stock ?? 1}
                  />
                </label>
                <label>
                  Satuan Sewa
                  <select
                    name="rental_unit"
                    defaultValue={editing?.rental_unit || "day"}
                  >
                    {RENTAL_UNITS.map((u) => (
                      <option key={u.id} value={u.id}>
                        per {u.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Durasi Minimum (opsional)
                  <input
                    name="min_duration"
                    type="number"
                    min="1"
                    placeholder="cth: 2"
                    defaultValue={editing?.min_rental_duration || ""}
                  />
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
              <div className="upload-block">
                <input
                  id="listing-image-input"
                  type="file"
                  accept={IMAGE_ALLOWED_TYPES.join(",")}
                  multiple
                  className="upload-input-hidden"
                  disabled={uploading}
                  onChange={(event) => {
                    handleFilesChange(event.target.files);
                    event.target.value = ""; // izinkan pilih file yang sama lagi
                  }}
                />
                <label
                  htmlFor="listing-image-input"
                  className="simple-image-upload upload-label-solid"
                >
                  <span className="upload-placeholder">
                    <span className="upload-icon" aria-hidden="true">🖼️</span>
                    <span>Pilih foto ({IMAGE_ALLOWED_TYPES.map((t) => t.replace("image/", "").toUpperCase()).join(" / ")} · maks 3 MB · hingga {MAX_LISTING_IMAGES} foto)</span>
                    <span className="upload-hint">
                      Foto diunggah saat kamu menekan Simpan Barang — foto pertama jadi thumbnail
                    </span>
                  </span>
                </label>
                {uploadError && <p className="rental-note is-error">{uploadError}</p>}
                {previews.length > 0 && (
                  <div className="upload-previews">
                    {previews.map((url) => (
                      <img
                        key={url}
                        src={url}
                        alt="Pratinjau foto barang"
                        className="upload-preview-thumb"
                      />
                    ))}
                  </div>
                )}
                {uploading && <p className="rental-note">Menyimpan &amp; mengunggah foto…</p>}
              </div>
              <label className="form-wide">
                URL gambar manual (opsional — satu per baris)
                <textarea
                  name="images"
                  rows="3"
                  placeholder={DEFAULT_IMG}
                  defaultValue={(editing?.images || []).join("\n")}
                />
              </label>
            </section>

            <div className="form-actions-footer">
              <button
                type="submit"
                className="btn-primary-solid form-submit-btn"
                disabled={uploading}
              >
                {uploading ? "Menyimpan…" : "Simpan Barang"}
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

          {actionError && <p className="rental-note is-error">{actionError}</p>}

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
                    <img src={item.image || DEFAULT_IMG} alt={item.name} />
                    <span
                      className={`item-status-chip status-${item.available ? "aktif" : "nonaktif"}`}
                    >
                      <span className="status-dot-small" aria-hidden="true"></span>
                      {item.available ? "Tersedia" : "Nonaktif"}
                    </span>
                  </div>
                  <div className="item-details-box">
                    <p className="item-category-label">
                      {item.category_name || CATEGORY_LABELS[item.category] || item.category}
                    </p>
                    <h3 className="item-title-solid">{item.name}</h3>
                    <div className="item-price-row">
                      <strong className="item-price-solid">
                        {formatPrice(item.price)}
                      </strong>
                      <span className="item-price-unit">/{unitLabel(item.rental_unit)}</span>
                    </div>
                    <p className="item-rented-note">
                      Deposit {formatPrice(item.deposit)} · Stok {item.stock}
                    </p>
                  </div>
                  <div className="item-actions-row">
                    <button
                      className="btn-text-action"
                      onClick={() => openForm(item)}
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
                    onClick={() => openForm(null)}
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
