/*
 * ============================================================================
 * ADMIN STORES — JabSewa (ERD v2)
 * ============================================================================
 * Moderasi toko. Data: direct SELECT public.stores (+ join owner) — policy
 * stores_read membuka semua baris untuk public.is_admin(); scope dari sesi.
 *
 * Aksi status HANYA via RPC admin_set_store_status (SECDEF): sync is_seller
 * owner + audit server-side (store_suspend / store_unsuspend /
 * store_deactivate). Frontend tidak pernah UPDATE stores langsung.
 * ============================================================================
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { listStores, setStoreStatus } from "../../../data/admin";
import { formatDate, initialOf } from "../../../domain/format";
import { translateServerError, STORE_STATUS_META } from "../../../domain/constants";
import AdminPageHead from "../components/AdminPageHead";
import AdminFilters from "../components/AdminFilters";
import AdminList from "../components/AdminList";
import AdminConfirm from "../components/AdminConfirm";

const FILTERS = [
  { key: "all", label: "Semua" },
  { key: "active", label: "Aktif" },
  { key: "inactive", label: "Nonaktif" },
  { key: "suspended", label: "Suspended" },
];

export default function AdminStores() {
  const [rows, setRows] = useState([]);
  const [state, setState] = useState("loading");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState(null); // { value, label, danger }

  const load = useCallback(() => {
    setState("loading");
    setError("");
    listStores()
      .then((data) => {
        setRows(data);
        setState("ready");
      })
      .catch((err) => {
        setError(err?.message || "Gagal memuat toko.");
        setState("error");
      });
  }, []);

  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      active: rows.filter((s) => s.status === "active").length,
      inactive: rows.filter((s) => s.status === "inactive").length,
      suspended: rows.filter((s) => s.status === "suspended").length,
    }),
    [rows],
  );

  const visible = useMemo(
    () => (filter === "all" ? rows : rows.filter((s) => s.status === filter)),
    [rows, filter],
  );

  const selected = rows.find((s) => s.id === selectedId) || null;

  const runAction = async (fn, okMessage) => {
    if (!selected) return;
    setBusyId(selected.id);
    setActionError("");
    setNotice("");
    try {
      await fn();
      setNotice(okMessage);
      setConfirm(null);
      load();
    } catch (err) {
      setActionError(translateServerError(err?.message));
    } finally {
      setBusyId(null);
    }
  };

  const statusMeta = (s) => STORE_STATUS_META[s] || { label: s, className: "is-review" };

  /** Opsi status berikutnya yang bermakna untuk admin. */
  const nextActions = (store) => {
    const list = [];
    if (store.status !== "active") {
      list.push({ value: "active", label: "Aktifkan toko", danger: false });
    }
    if (store.status !== "suspended") {
      list.push({ value: "suspended", label: "Suspend toko", danger: true });
    }
    if (store.status !== "inactive") {
      list.push({ value: "inactive", label: "Nonaktifkan toko", danger: true });
    }
    return list;
  };

  return (
    <div className="sys-page">
      <AdminPageHead
        title="Stores"
        subtitle="Semua toko terdaftar — perubahan status menyinkronkan akses seller (is_seller) dan tercatat di audit log."
        pendingCount={counts.suspended}
        pendingLabel="toko di-suspend"
        onReload={load}
      />

      {notice && <p className="sys-note sys-note-ok">{notice}</p>}
      {actionError && <p className="sys-note sys-note-err">⚠ {actionError}</p>}

      <AdminFilters
        ariaLabel="Filter status toko"
        filters={FILTERS}
        counts={counts}
        value={filter}
        onChange={setFilter}
      />

      <div className="sys-content-cols">
        <AdminList
          ariaLabel="Daftar toko"
          state={state}
          error={error}
          loadingText="Memuat toko…"
          emptyText={
            filter === "all"
              ? "Belum ada toko terdaftar."
              : "Tidak ada toko pada filter ini."
          }
          rows={visible}
          selectedId={selectedId}
          onReload={load}
          onSelect={(store) => {
            setSelectedId(store.id);
            setActionError("");
            setNotice("");
            setConfirm(null);
          }}
          renderRow={(store) => ({
            avatar: initialOf(store.name),
            name: store.name,
            sub: store.owner?.email || "owner —",
            meta: `Sejak ${formatDate(store.createdAt)}`,
            status: statusMeta(store.status),
          })}
        />

        <section className="sys-detail" aria-label="Detail toko">
          {selected ? (
            <article className="sys-card">
              <header className="sys-detail-head">
                <div>
                  <h2>{selected.name}</h2>
                  <p className="sys-detail-email">{selected.owner?.email || "—"}</p>
                </div>
                <span className={`sys-status-badge ${statusMeta(selected.status).className}`}>
                  {statusMeta(selected.status).label}
                </span>
              </header>

              <dl className="sys-kv">
                <div className="sys-kv-row">
                  <dt>Owner</dt>
                  <dd>{selected.owner?.name || selected.owner?.email || "—"}</dd>
                </div>
                <div className="sys-kv-row">
                  <dt>Alamat</dt>
                  <dd>{selected.address || "—"}</dd>
                </div>
                {selected.description && (
                  <div className="sys-kv-row">
                    <dt>Deskripsi</dt>
                    <dd>{selected.description}</dd>
                  </div>
                )}
                <div className="sys-kv-row">
                  <dt>Dibuat</dt>
                  <dd>{formatDate(selected.createdAt)}</dd>
                </div>
                <div className="sys-kv-row">
                  <dt>ID</dt>
                  <dd>
                    <code>{selected.id}</code>
                  </dd>
                </div>
              </dl>

              <div className="sys-decision-actions">
                {nextActions(selected).map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    className={`sys-btn ${a.danger ? "is-danger" : "is-approve"}`}
                    disabled={busyId === selected.id}
                    onClick={() => setConfirm(a)}
                  >
                    {a.label}
                  </button>
                ))}
              </div>

              {confirm && (
                <AdminConfirm
                  danger={confirm.danger}
                  message={
                    <>
                      Ubah status <strong>{selected.name}</strong> menjadi{" "}
                      <strong>{confirm.value}</strong>?
                    </>
                  }
                  hint="Dieksekusi via RPC admin_set_store_status; akses seller owner ikut disinkronkan server, dan aksi ini tercatat di audit log."
                  busy={busyId === selected.id}
                  onCancel={() => setConfirm(null)}
                  onConfirm={() =>
                    runAction(
                      () => setStoreStatus(selected.id, confirm.value),
                      `Status toko diubah ke ${confirm.value}.`,
                    )
                  }
                />
              )}
            </article>
          ) : (
            <div className="sys-empty">
              <p>Pilih toko dari daftar untuk melihat detail dan aksi status.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
