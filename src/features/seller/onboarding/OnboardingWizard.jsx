import { useState } from "react";
import { CITIES } from "../../../domain/constants";
import AgreementText from "./AgreementText";

const WIZARD_STEPS = ["Info Seller", "Perjanjian", "Review & Kirim"];

/*
 * Wizard ajuan seller 3 langkah (Info → Perjanjian → Review).
 * Ajuan dikirim via submit_store_application(p_store_name, p_description,
 * p_address); kota digabung ke address (format "Kota, Alamat") agar tampil
 * di kartu toko.
 */
export default function OnboardingWizard({
  userName,
  initialForm,
  submitStoreApplication,
  onSubmitted,
  onNavigate,
}) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const setField = (name, value) => setForm((f) => ({ ...f, [name]: value }));

  const step1Valid =
    form.storeName.trim() && form.description.trim() && form.city && form.address.trim();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      await submitStoreApplication({
        storeName: form.storeName,
        description: form.description,
        address: [form.city, form.address].filter(Boolean).join(", "),
      });
      // Ajuan tersimpan → kembali ke layar status (bukan tetap di wizard).
      onSubmitted();
    } catch (err) {
      setSubmitError(err?.message || "Gagal mengirim ajuan. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="onboarding-card">
      <p className="about-intro-kicker">Jadi Seller</p>
      <h1>Ajukan dirimu jadi seller</h1>
      <p className="onboarding-lede">
        Halo, {userName?.split(" ")[0]}. Satu akun JabSewa-mu akan mendapat{" "}
        <strong>profil seller</strong> setelah ajuan ini disetujui tim kami.
        Tidak perlu akun baru.
      </p>

      {/* Stepper */}
      <ol className="seller-app-stepper" aria-label="Langkah ajuan seller">
        {WIZARD_STEPS.map((label, i) => {
          const n = i + 1;
          const state = n < step ? "done" : n === step ? "active" : "todo";
          return (
            <li key={label} className={`seller-app-step is-${state}`}>
              <span className="seller-app-step-dot">{n < step ? "✓" : n}</span>
              <span className="seller-app-step-label">{label}</span>
            </li>
          );
        })}
      </ol>

      {/* STEP 1 — Informasi seller */}
      {step === 1 && (
        <form
          className="onboarding-form"
          onSubmit={(e) => {
            e.preventDefault();
            setStep(2);
          }}
        >
          <div className="auth-field">
            <label className="auth-label" htmlFor="store-name">Nama toko / seller</label>
            <input
              id="store-name"
              type="text"
              required
              placeholder="cth: Rental Kamera Jaya"
              className="auth-input"
              value={form.storeName}
              onChange={(e) => setField("storeName", e.target.value)}
            />
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="seller-desc">Deskripsi seller</label>
            <textarea
              id="seller-desc"
              required
              rows={3}
              placeholder="Ceritakan singkat barang apa yang kamu sewakan."
              className="auth-input"
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
            />
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="seller-city">Kota</label>
            <select
              id="seller-city"
              required
              className="auth-input"
              value={form.city}
              onChange={(e) => setField("city", e.target.value)}
            >
              <option value="" disabled>Pilih kota</option>
              {CITIES.map((city) => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="seller-address">Alamat lengkap</label>
            <textarea
              id="seller-address"
              required
              rows={2}
              placeholder="Alamat pengambilan / pengembalian barang."
              className="auth-input"
              value={form.address}
              onChange={(e) => setField("address", e.target.value)}
            />
          </div>
          <button type="submit" className="auth-submit-btn" disabled={!step1Valid}>
            Lanjut ke Perjanjian
          </button>
          <p className="auth-switch">
            <button
              type="button"
              className="auth-switch-link"
              onClick={() => onNavigate("buyer")}
            >
              Nanti saja, kembali ke dashboard penyewa
            </button>
          </p>
        </form>
      )}

      {/* STEP 2 — Perjanjian */}
      {step === 2 && (
        <form
          className="onboarding-form"
          onSubmit={(e) => {
            e.preventDefault();
            setStep(3);
          }}
        >
          <AgreementText />
          <label className="seller-app-agreement-check">
            <input
              type="checkbox"
              required
              checked={form.agreement}
              onChange={(e) => setField("agreement", e.target.checked)}
            />
            <span>Saya telah membaca dan menyetujui Ketentuan Seller JabSewa.</span>
          </label>
          <div className="seller-app-btn-row">
            <button type="button" className="auth-switch-link" onClick={() => setStep(1)}>
              ← Kembali
            </button>
            <button type="submit" className="auth-submit-btn" disabled={!form.agreement}>
              Lanjut ke Review
            </button>
          </div>
        </form>
      )}

      {/* STEP 3 — Review & kirim */}
      {step === 3 && (
        <form className="onboarding-form" onSubmit={handleSubmit}>
          <div className="seller-app-review">
            {[
              ["Nama toko", form.storeName],
              ["Deskripsi", form.description],
              ["Kota", form.city],
              ["Alamat", form.address],
              ["Perjanjian", "Disetujui"],
            ].map(([label, value]) => (
              <div key={label} className="seller-app-review-row">
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <p className="seller-app-note">
            Ajuan akan ditinjau tim JabSewa. Kamu tetap bisa menyewa barang
            selama menunggu hasil review.
          </p>
          {submitError && <p className="auth-error">{submitError}</p>}
          <div className="seller-app-btn-row">
            <button type="button" className="auth-switch-link" onClick={() => setStep(2)}>
              ← Kembali
            </button>
            <button type="submit" className="auth-submit-btn" disabled={submitting}>
              {submitting ? "Mengirim…" : "Kirim Ajuan"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
