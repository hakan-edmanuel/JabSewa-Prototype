/*
 * ============================================================================
 * ADMIN USERS — JabSewa (ERD v2)
 * ============================================================================
 * Moderasi akun. Data: direct SELECT public.users — RLS users_select_admin
 * hanya membuka baris untuk public.is_admin() (role `admin` + status active);
 * scope ditentukan server dari sesi.
 *
 * Aksi lewat RPC server-side (frontend tidak menulis users langsung):
 *   - admin_set_user_status  → user_suspend / user_activate (audit server)
 *   - admin_set_user_role    → role_change (audit server)
 * Guard server: is_admin() di dalam RPC + self_action_forbidden (admin tidak
 * bisa mengubah akunnya sendiri) — UI hanya menyembunyikan opsi tsb untuk UX.
 * ============================================================================
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listUsers, setUserStatus, setUserRole } from "../../../data/admin";
import { formatDate, initialOf } from "../../../domain/format";
import { translateServerError, USER_STATUS_META } from "../../../domain/constants";
import AdminPageHead from "../components/AdminPageHead";
import AdminFilters from "../components/AdminFilters";
import AdminList from "../components/AdminList";
import AdminConfirm from "../components/AdminConfirm";

const STATUS_FILTERS = [
  { key: "all", label: "Semua" },
  { key: "active", label: "Aktif" },
  { key: "suspended", label: "Suspended" },
];

const ROLE_LABELS = { consumer: "Consumer", admin: "Admin" };

export default function AdminUsers() {
  const [rows, setRows] = useState([]);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmAction, setConfirmAction] = useState(null); // { kind, value, label }
  // Ref (bukan state) agar dua klik pada tick yang sama tidak mengirim dua RPC.
  const busyRef = useRef(false);

  const load = useCallback(() => {
    setState("loading");
    setError("");
    listUsers()
      .then((data) => {
        setRows(data);
        setState("ready");
      })
      .catch(() => {
        setError("Gagal memuat daftar pengguna. Periksa koneksi, lalu coba lagi.");
        setState("error");
      });
  }, []);

  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      active: rows.filter((r) => r.status === "active").length,
      suspended: rows.filter((r) => r.status === "suspended").length,
      admins: rows.filter((r) => r.role === "admin").length,
      sellers: rows.filter((r) => r.is_seller).length,
    }),
    [rows],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => (filter === "all" ? true : r.status === filter))
      .filter((r) =>
        q
          ? String(r.email || "").toLowerCase().includes(q) ||
            String(r.full_name || "").toLowerCase().includes(q)
          : true,
      );
  }, [rows, filter, query]);

  const selected = rows.find((r) => r.id === selectedId) || null;

  /** Semua aksi via RPC — hasil dari backend, bukan state lokal. */
  const runAction = async (fn, okMessage) => {
    if (!selected || busyRef.current) return;
    busyRef.current = true;
    setBusyId(selected.id);
    setActionError("");
    setNotice("");
    try {
      await fn();
      setNotice(okMessage);
      setConfirmAction(null);
      load();
    } catch (err) {
      setActionError(translateServerError(err?.message));
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  };

  const statusMeta = (s) => USER_STATUS_META[s] || { label: s, className: "is-review" };
  const confirmIsApprove =
    confirmAction?.kind === "status" && confirmAction.value === "active";

  return (
    <div className="sys-page">
      <AdminPageHead
        title="Pengguna"
        subtitle={
          state === "ready"
            ? `${counts.all} akun · ${counts.sellers} seller · ${counts.admins} admin — scope dari RLS (is_admin).`
            : "Daftar akun terdaftar — scope dari RLS (is_admin)."
        }
        pendingCount={state === "ready" ? counts.suspended : "—"}
        pendingLabel="akun di-suspend"
        onReload={load}
        loading={state === "loading"}
      />

      {notice && (
        <p className="sys-note sys-note-ok" role="status">
          {notice}
        </p>
      )}
      {actionError && (
        <p className="sys-note sys-note-err" role="alert">
          {actionError}
        </p>
      )}

      <AdminFilters
        ariaLabel="Filter status akun"
        filters={STATUS_FILTERS}
        counts={counts}
        countsReady={state === "ready"}
        value={filter}
        onChange={setFilter}
        search={{
          placeholder: "Cari email / nama…",
          value: query,
          onChange: setQuery,
          ariaLabel: "Cari user",
        }}
      />

      <div className="sys-content-cols">
        <AdminList
          ariaLabel="Daftar user"
          state={state}
          error={error}
          loadingText="Memuat user…"
          emptyText="Tidak ada pengguna yang cocok."
          rows={visible}
          selectedId={selectedId}
          onReload={load}
          onSelect={(u) => {
            setSelectedId(u.id);
            setActionError("");
            setNotice("");
            setConfirmAction(null);
          }}
          renderRow={(u) => ({
            avatar: initialOf(u.full_name || u.email),
            name: u.full_name || u.email,
            sub: `${ROLE_LABELS[u.role] || u.role}${u.is_seller ? " · Seller" : ""}`,
            meta: `Daftar ${formatDate(u.created_at)}`,
            status: statusMeta(u.status),
          })}
        />

        <section className="sys-detail" aria-label="Detail user">
          {selected ? (
            <article className="sys-card">
              <header className="sys-detail-head">
                <div>
                  <h2>{selected.full_name || "—"}</h2>
                  <p className="sys-detail-email">{selected.email}</p>
                </div>
                <span className={`sys-status-badge ${statusMeta(selected.status).className}`}>
                  {statusMeta(selected.status).label}
                </span>
              </header>

              <dl className="sys-kv">
                <div className="sys-kv-row">
                  <dt>Role</dt>
                  <dd>{ROLE_LABELS[selected.role] || selected.role}</dd>
                </div>
                <div className="sys-kv-row">
                  <dt>Seller</dt>
                  <dd>{selected.is_seller ? "Ya" : "Tidak"}</dd>
                </div>
                <div className="sys-kv-row">
                  <dt>Status</dt>
                  <dd>{statusMeta(selected.status).label}</dd>
                </div>
                <div className="sys-kv-row">
                  <dt>Terdaftar</dt>
                  <dd>{formatDate(selected.created_at)}</dd>
                </div>
                <div className="sys-kv-row">
                  <dt>ID</dt>
                  <dd>
                    <code>{selected.id}</code>
                  </dd>
                </div>
              </dl>

              {selected.status !== "suspended" && selected.status !== "inactive" && (
                <div className="sys-decision-actions">
                  <button
                    type="button"
                    className="sys-btn is-danger"
                    disabled={busyId === selected.id}
                    onClick={() =>
                      setConfirmAction({ kind: "status", value: "suspended", label: "Suspend akun" })
                    }
                  >
                    Suspend akun
                  </button>
                  {selected.role !== "admin" && (
                    <button
                      type="button"
                      className="sys-btn"
                      disabled={busyId === selected.id}
                      onClick={() =>
                        setConfirmAction({ kind: "role", value: "admin", label: "Jadikan admin" })
                      }
                    >
                      Jadikan admin
                    </button>
                  )}
                </div>
              )}

              {selected.status === "suspended" && (
                <div className="sys-decision-actions">
                  <button
                    type="button"
                    className="sys-btn is-approve"
                    disabled={busyId === selected.id}
                    onClick={() =>
                      setConfirmAction({ kind: "status", value: "active", label: "Aktifkan akun" })
                    }
                  >
                    Aktifkan kembali
                  </button>
                </div>
              )}

              {confirmAction && (
                <AdminConfirm
                  danger={!confirmIsApprove}
                  message={
                    confirmAction.kind === "role"
                      ? `Ubah role ${selected.email} menjadi ${ROLE_LABELS[confirmAction.value]}?`
                      : `${confirmAction.label} untuk ${selected.email}?`
                  }
                  hint={`Dieksekusi server-side via RPC; setiap perubahan tercatat di audit log.${
                    confirmAction.kind === "role"
                      ? " Akun admin dapat mengakses seluruh modul kontrol."
                      : ""
                  }`}
                  busy={busyId === selected.id}
                  confirmLabel={`Ya, ${confirmAction.label.toLowerCase()}`}
                  onCancel={() => setConfirmAction(null)}
                  onConfirm={() =>
                    confirmAction.kind === "status"
                      ? runAction(
                          () => setUserStatus(selected.id, confirmAction.value),
                          `Status akun diubah ke ${statusMeta(confirmAction.value).label}.`,
                        )
                      : runAction(
                          () => setUserRole(selected.id, confirmAction.value),
                          `Role diubah menjadi ${ROLE_LABELS[confirmAction.value] || confirmAction.value}.`,
                        )
                  }
                />
              )}

              <p className="sys-note sys-note-block">
                Catatan: admin tidak dapat mengubah akunnya sendiri (server:
                <code> self_action_forbidden</code>).
              </p>
            </article>
          ) : (
            <div className="sys-empty">
              <p>Pilih user dari daftar untuk melihat detail dan aksi.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
