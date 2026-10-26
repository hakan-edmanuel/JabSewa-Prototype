import { useEffect, useState } from "react";
import { PAYMENT_METHODS } from "../../domain/constants";
import { validateImageFile, IMAGE_ALLOWED_TYPES } from "../../data/uploads";

/*
 * Form bukti pembayaran manual (transfer) — tanpa gateway (PRD §6).
 * File diprioritaskan; URL manual tetap tersedia untuk kompatibilitas.
 */
export default function PaymentProofForm({ rentalId, busy, onSubmit, onCancel }) {
  const [method, setMethod] = useState("bank_transfer");
  const [proofUrl, setProofUrl] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [fileError, setFileError] = useState("");
  const [reference, setReference] = useState("");

  /* Object URL pratinjau selalu dilepas saat berganti / unmount. */
  useEffect(() => {
    if (!preview) return undefined;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const handleFileChange = (next) => {
    setFile(null);
    setPreview("");
    const invalid = validateImageFile(next);
    if (invalid) {
      setFileError(invalid);
      return;
    }
    setFileError("");
    setFile(next);
    setPreview(URL.createObjectURL(next));
  };

  const handleSubmit = async () => {
    const ok = await onSubmit({
      method,
      file,
      proofUrl,
      externalReference: reference.trim(),
    });
    if (ok) onCancel();
  };

  return (
    <div className="order-reject-box" style={{ marginTop: 8 }}>
      <select
        value={method}
        onChange={(e) => setMethod(e.target.value)}
        className="filter-select"
      >
        {PAYMENT_METHODS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <div className="proof-upload">
        <input
          id={`proof-file-${rentalId}`}
          type="file"
          accept={IMAGE_ALLOWED_TYPES.join(",")}
          className="upload-input-hidden"
          disabled={busy}
          onChange={(event) => {
            handleFileChange(event.target.files?.[0] || null);
            event.target.value = ""; // izinkan pilih file yang sama lagi
          }}
        />
        <label htmlFor={`proof-file-${rentalId}`} className="proof-upload-label">
          {preview ? (
            <img src={preview} alt="Pratinjau bukti transfer" className="proof-preview" />
          ) : (
            <span>📷 Pilih foto bukti (JPG/PNG/WebP · maks 3 MB)</span>
          )}
        </label>
        {fileError && <p className="rental-note is-error">{fileError}</p>}
        {file && proofUrl.trim() && (
          <p className="rental-note">Foto terpilih dipakai — URL manual diabaikan.</p>
        )}
      </div>
      <input
        value={proofUrl}
        onChange={(e) => setProofUrl(e.target.value)}
        placeholder="Atau tempel URL bukti (opsional)"
        className="search-box-small"
      />
      <input
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        placeholder="Nomor referensi (opsional)"
        className="search-box-small"
      />
      <button
        className="btn-small btn-primary"
        disabled={busy || (!file && !proofUrl.trim())}
        onClick={handleSubmit}
      >
        {busy && file ? "Mengunggah…" : "Kirim"}
      </button>
      <button className="btn-small btn-secondary" onClick={onCancel}>
        Batal
      </button>
    </div>
  );
}
