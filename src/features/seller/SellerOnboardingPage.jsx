import { useState } from "react";
import SimpleNavbar from "../../ui/SimpleNavbar";
import Footer from "../../ui/Footer";
import { useAuth } from "../auth/AuthContext";
import OnboardingWizard from "./onboarding/OnboardingWizard";
import ApplicationStatusScreen from "./onboarding/ApplicationStatusScreen";

/*
 * ============================================================================
 * SELLER ONBOARDING — alur ajuan jadi seller (lifecycle, bukan switch role).
 * ============================================================================
 * ERD v2: ajuan tersimpan di tabel store_applications via RPC
 *         submit_store_application(p_store_name, p_description, p_address).
 * STORE   = tercipta HANYA setelah admin menyetujui ajuan
 *         (RPC decide_store_application membuat baris stores aktif).
 *
 * Kontrak kolom ajuan (03-database-design.md §4.3):
 *   store_name, description, address (+ logo_url). Kontak applicant = email
 *   akun (users.email) — tidak dikumpulkan terpisah; kota digabung ke address
 *   (format "Kota, Alamat") agar tampil di kartu toko.
 *
 * Alur:
 *   belum ada ajuan / ditolak  → wizard 3 langkah (Info → Perjanjian → Review)
 *   pending                    → layar status "Sedang Ditinjau"
 *   rejected                   → layar status dengan alasan + tombol ajukan ulang
 *   approved (store aktif)     → kartu "Disetujui" dengan pintu ke seller dashboard
 * ============================================================================
 */
export default function SellerOnboardingPage({ onNavigate }) {
  const { user, storeApplication, hasSellerAccess, submitStoreApplication } = useAuth();

  // true = pengguna menekan "Ajukan Ulang" dari layar ditolak; tampilkan
  // wizard lagi dengan data lama sebagai titik awal (bisa diedit dulu).
  const [reapplying, setReapplying] = useState(false);

  const hasApplication = Boolean(storeApplication);

  if (!reapplying && (hasSellerAccess || hasApplication)) {
    return (
      <ApplicationStatusScreen
        application={storeApplication}
        onNavigate={onNavigate}
        onReapply={() => setReapplying(true)}
      />
    );
  }

  return (
    <div className="page-shell page-auth-shell">
      <SimpleNavbar onNavigate={onNavigate} currentPage="seller-onboarding" />

      <main className="onboarding-main">
        <OnboardingWizard
          userName={user?.name}
          initialForm={{
            storeName: storeApplication?.storeName || "",
            description: storeApplication?.description || "",
            city: (storeApplication?.address || "").split(",")[0]?.trim() || "",
            address: (storeApplication?.address || "")
              .split(",")
              .slice(1)
              .join(",")
              .trim(),
            agreement: false,
          }}
          submitStoreApplication={submitStoreApplication}
          onSubmitted={() => setReapplying(false)}
          onNavigate={onNavigate}
        />
      </main>

      <Footer onNavigate={onNavigate} />
    </div>
  );
}
