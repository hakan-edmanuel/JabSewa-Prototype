import SimpleNavbar from "../../../ui/SimpleNavbar";
import Footer from "../../../ui/Footer";
import { useAuth } from "../../auth/AuthContext";
import { formatDate } from "../../../domain/format";

/* Shell layar status — navbar/footer/kartu sama untuk ketiga status. */
function StatusShell({ onNavigate, children }) {
  return (
    <div className="page-shell page-auth-shell">
      <SimpleNavbar onNavigate={onNavigate} currentPage="seller-onboarding" />
      <main className="onboarding-main">
        <div className="onboarding-card seller-app-status">{children}</div>
      </main>
      <Footer onNavigate={onNavigate} />
    </div>
  );
}

/* --- Layar status ajuan: under_review / rejected / approved --- */
export default function ApplicationStatusScreen({ application, onNavigate, onReapply }) {
  const { user, hasSellerAccess } = useAuth();
  const status = application?.status;

  if (hasSellerAccess || status === "approved") {
    return (
      <StatusShell onNavigate={onNavigate}>
        <span className="seller-app-status-badge is-approved">Disetujui</span>
        <h1>Selamat, tokomu aktif!</h1>
        <p className="onboarding-lede">
          Profil seller <strong>{application?.storeName || "kamu"}</strong> sudah
          dibuat. Lanjutkan ke dashboard seller untuk mengelola barang dan
          permintaan sewa.
        </p>
        <button className="auth-submit-btn" onClick={() => onNavigate("seller")}>
          Buka Seller Dashboard
        </button>
      </StatusShell>
    );
  }

  if (status === "rejected") {
    return (
      <StatusShell onNavigate={onNavigate}>
        <span className="seller-app-status-badge is-rejected">Ditolak</span>
        <h1>Ajuanmu belum disetujui</h1>
        <div className="seller-app-reject-reason">
          <span className="profile-row-label">Alasan reviewer</span>
          <p>{application?.rejectionReason || "Tidak ada alasan yang dicantumkan."}</p>
        </div>
        <p className="onboarding-lede">
          Kamu bisa memperbaiki data dan mengajukan ulang kapan saja.
        </p>
        <div className="seller-app-btn-row">
          <button className="auth-switch-link" onClick={() => onNavigate("buyer")}>
            Kembali ke dashboard penyewa
          </button>
          <button className="auth-submit-btn" onClick={onReapply}>
            Ajukan Ulang
          </button>
        </div>
      </StatusShell>
    );
  }

  // under_review (atau submitted)
  return (
    <StatusShell onNavigate={onNavigate}>
      <span className="seller-app-status-badge is-review">
        <span className="seller-app-pulse" aria-hidden="true"></span>
        Sedang Ditinjau
      </span>
      <h1>Ajuan seller diterima</h1>
      <p className="onboarding-lede">
        Terima kasih, {user?.name?.split(" ")[0] || "kamu"}. Ajuan tokomu{" "}
        <strong>{application?.storeName || "—"}</strong> sudah kami terima dan sedang
        ditinjau tim JabSewa. Kamu akan diberi tahu setelah ada keputusan —
        selama menunggu, kamu tetap bisa menyewa barang seperti biasa.
      </p>
      <div className="seller-app-review">
        {[
          ["Nama toko", application?.storeName || "—"],
          ["Alamat", application?.address || "—"],
          ["Dikirim", formatDate(application?.submittedAt)],
        ].map(([label, value]) => (
          <div key={label} className="seller-app-review-row">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <button className="auth-switch-link" onClick={() => onNavigate("buyer")}>
        Kembali ke dashboard penyewa
      </button>
    </StatusShell>
  );
}
