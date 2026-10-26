import { useState } from "react";
import { saveListing, listMyListings } from "../../data/listings";
import { translateRentalError } from "../../data/rentals";
import { RENTAL_UNITS } from "../../domain/constants";
import {
  uploadListingImage,
  validateImageFile,
  IMAGE_ALLOWED_TYPES,
  MAX_LISTING_IMAGES,
} from "../../data/uploads";
import { DEFAULT_IMG } from "./listingDefaultImage";

/*
 * Form tambah/edit listing.
 * Listing disimpan dulu (butuh listing_id untuk namespace path), lalu file
 * diunggah ke listings/{listing_id}/, lalu URL hasil unggahan disimpan via
 * save_listing kedua. Bila sebagian unggahan gagal, form tetap terbuka dalam
 * mode draft edit agar submit ulang tidak membuat listing duplikat.
 */
export default function ListingForm({ store, categories, editing, onSaved, onClose }) {
  const [draft, setDraft] = useState(editing);
  const [formError, setFormError] = useState("");
  const [pendingImageUrls, setPendingImageUrls] = useState([]); // URL storage draft (sudah terunggah)
  const [newFiles, setNewFiles] = useState([]); // file terpilih — diunggah saat submit
  const [previews, setPreviews] = useState([]); // objectURL pratinjau newFiles
  const [uploading, setUploading] = useState(false); // simpan+unggah berlangsung
  const [uploadError, setUploadError] = useState(""); // validasi file terpilih

  const close = () => {
    previews.forEach((url) => URL.revokeObjectURL(url));
    onClose();
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

  const handleSubmit = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setFormError("");
    const manualUrls = String(data.get("images") || "")
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const baseImages = [...pendingImageUrls, ...manualUrls];
    const images = baseImages.length ? baseImages : draft?.images || [DEFAULT_IMG];
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
      available: data.get("status") !== "inactive",
    };
    setUploading(true);
    const uploadedUrls = [];
    const uploadFailures = [];
    let listingId = null;
    try {
      // 1) Simpan listing dulu — namespace path Storage butuh listing_id.
      listingId = await saveListing({ ...payload, id: draft?.id ?? null, images });
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
      const next = await listMyListings();
      onSaved(next);
      if (uploadFailures.length) {
        // Listing tersimpan, sebagian foto gagal — form tetap terbuka mode edit
        // draft agar coba ulang tidak membuat listing duplikat.
        setDraft({ ...payload, id: listingId, images: [...uploadedUrls, ...images] });
        setPendingImageUrls((cur) => [...cur, ...uploadedUrls]);
        setNewFiles([]);
        setPreviews([]);
        setFormError(
          `Barang tersimpan, tetapi ${uploadFailures.length} foto gagal diunggah: ${uploadFailures[0]}${
            uploadFailures.length > 1 ? " · dst." : ""
          }`,
        );
      } else {
        close();
      }
    } catch (err) {
      if (listingId) {
        // RPC pertama sukses tapi langkah berikutnya gagal — jadikan draft edit
        // agar submit ulang memperbarui, bukan membuat listing baru.
        setDraft({ ...payload, id: listingId, images: [...uploadedUrls, ...images] });
        setPendingImageUrls((cur) => [...cur, ...uploadedUrls]);
        setNewFiles([]);
        setPreviews([]);
      }
      setFormError(translateRentalError(err?.message));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="seller-form-container">
      <div className="form-header-simple">
        <h2>{draft ? "Edit Barang" : "Tambah Barang"}</h2>
        <button
          type="button"
          className="btn-secondary-solid"
          disabled={uploading}
          onClick={close}
        >
          Batal
        </button>
      </div>

      {formError && <p className="rental-note is-error">{formError}</p>}

      <form className="structured-listing-form" onSubmit={handleSubmit}>
        <section className="form-section">
          <h3 className="form-section-title">Informasi Dasar</h3>
          <div className="form-group-grid">
            <label>
              Nama Barang <span className="required-star">*</span>
              <input
                required
                name="name"
                defaultValue={draft?.name}
                placeholder="Masukkan nama barang"
              />
            </label>
            <label>
              Kategori <span className="required-star">*</span>
              <select
                name="category"
                defaultValue={draft?.category_id || categories[0]?.id || ""}
                required
              >
                {(categories.length
                  ? categories
                  : [
                      {
                        id: draft?.category_id || "",
                        name: draft?.category_name || "— pilih —",
                      },
                    ]
                ).map((cat) => (
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
              defaultValue={draft?.description}
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
                  defaultValue={draft?.price}
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
                  defaultValue={draft?.deposit || ""}
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
                defaultValue={draft?.stock ?? 1}
              />
            </label>
            <label>
              Satuan Sewa
              <select name="rental_unit" defaultValue={draft?.rental_unit || "day"}>
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
                defaultValue={draft?.min_rental_duration || ""}
              />
            </label>
            <label>
              Status
              <select
                name="status"
                defaultValue={draft && !draft.available ? "inactive" : "active"}
              >
                <option value="active">Aktif</option>
                <option value="inactive">Nonaktif</option>
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
                <span className="upload-icon" aria-hidden="true">
                  🖼️
                </span>
                <span>
                  Pilih foto (
                  {IMAGE_ALLOWED_TYPES.map((t) =>
                    t.replace("image/", "").toUpperCase(),
                  ).join(" / ")}{" "}
                  · maks 3 MB · hingga {MAX_LISTING_IMAGES} foto)
                </span>
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
              defaultValue={(draft?.images || []).join("\n")}
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
  );
}
