/*
 * ============================================================================
 * ADMIN LISTINGS — JabSewa (ERD v2)
 * ============================================================================
 * Moderasi katalog lintas toko. Data: direct SELECT public.listings (+ join
 * stores/categories) — policy listings_read membuka semua baris untuk
 * public.is_admin(); scope dari sesi.
 *
 * Aksi status HANYA via RPC admin_set_listing_status (SECDEF, is_admin guard,
 * audit server-side listing_suspend / listing_update). Seller tidak punya RPC
 * status 'suspended' — perubahan status oleh seller terbatas ke listing milik
 * toko mereka sendiri (set_listing_availability), bukan moderasi lintas toko.
 * ============================================================================
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminListListings, setListingStatus } from "../../../data/admin";
import { formatPrice, formatDate, initialOf } from "../../../domain/format";
import {
  translateServerError,
  RENTAL_UNIT_LABELS,
  LISTING_STATUS_META,
} from "../../../domain/constants";
import AdminPageHead from "../components/AdminPageHead";
import AdminFilters from "../components/AdminFilters";
import AdminList from "../components/AdminList";
import AdminConfirm from "../components/AdminConfirm";

const FILTERS = [
  { key: "all", label: "Semua" },
  { key: "active", label: "Aktif" },
  { key: "suspended", label: "Suspended" },
  { key: "inactive", label: "Nonaktif" },
  { key: "out_of_stock", label: "Stok habis" },
];

export default function AdminListings() {
  const [rows, setRows] = useState([]);
  const [state, setState] = useState("loading");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState(null); // { value, label, danger }
  // Ref (bukan state) agar dua klik pada tick yang sama tidak mengirim dua RPC.
  const busyRef = useRef(false);

  const load = useCallback(() => {
    setState("loading");
    setError("");
    adminListListings()
      .then((data) => {
        setRows(data);
        setState("ready");
      })
      .catch(() => {
        setError("Gagal memuat daftar listing. Periksa koneksi, lalu coba lagi.");
        setState("error");
      });
  }, []);

  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      active: rows.filter((l) => l.status === "active").length,
      suspended: rows.filter((l) => l.status === "suspended").length,
      inactive: rows.filter((l) => l.status === "inactive").length,
      out_of_stock: rows.filter((l) => l.status === "out_of_stock").length,
    }),
    [rows],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((l) => (filter === "all" ? true : l.status === filter))
      .filter((l) => (q ? String(l.name || "").toLowerCase().includes(q) : true));
  }, [rows, filter, query]);

  const selected = rows.find((l) => l.id === selectedId) || null;

  const runAction = async (fn, okMessage) => {
    if (!selected || busyRef.current) return;
    busyRef.current = true;
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
      busyRef.current = false;
      setBusyId(null);
    }
  };

  const statusMeta = (s) => LISTING_STATUS_META[s] || { label: s, className: "is-review" };
  const unitLabel = (l) => RENTAL_UNIT_LABELS[l.rentalUnit] || l.rentalUnit;

  const nextActions = (listing) => {
    const list = [];
    if (listing.status !== "active") {
      list.push({ value: "active", label: "Setujui (aktif)", danger: false });
    }
    if (listing.status !== "suspended") {
      list.push({ value: "suspended", label: "Suspend listing", danger: true });
    }
    return list;
  };

  return (
    <div className="sys-page">
      <AdminPageHead
        title="Listing"
        subtitle="Moderasi katalog lintas toko — listing ter-suspend otomatis hilang dari katalog publik."
        pendingCount={state === "ready" ? counts.suspended : "—"}
        pendingLabel="listing di-suspend"
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
        ariaLabel="Filter status listing"
        filters={FILTERS}
        counts={counts}
        countsReady={state === "ready"}
        value={filter}
        onChange={setFilter}
        search={{
          placeholder: "Cari nama barang…",
          value: query,
          onChange: setQuery,
          ariaLabel: "Cari listing",
        }}
      />

      <div className="sys-content-cols">
        <AdminList
          ariaLabel="Daftar listing"
          state={state}
          error={error}
          loadingText="Memuat listing…"
          emptyText={
            filter === "all"
              ? "Belum ada listing."
              : "Tidak ada listing pada filter ini."
          }
          rows={visible}
          selectedId={selectedId}
          onReload={load}
          onSelect={(l) => {
            setSelectedId(l.id);
            setActionError("");
            setNotice("");
            setConfirm(null);
          }}
          renderRow={(l) => ({
            avatar: initialOf(l.name),
            name: l.name,
            sub: `${l.store?.name || "—"} · ${formatPrice(l.price)}/${unitLabel(l)}`,
            meta: `${l.categoryName || "Tanpa kategori"} · stok ${l.stock}`,
            status: statusMeta(l.status),
          })}
        />

        <section className="sys-detail" aria-label="Detail listing">
          {selected ? (
            <article className="sys-card">
              <header className="sys-detail-head">
                <div>
                  <h2>{selected.name}</h2>
                  <p className="sys-detail-store">
                    {selected.store?.name || "—"} · {formatPrice(selected.price)}/
                    {unitLabel(selected)}
                  </p>
                </div>
                <span className={`sys-status-badge ${statusMeta(selected.status).className}`}>
                  {statusMeta(selected.status).label}
                </span>
              </header>

              <dl className="sys-kv">
                <div className="sys-kv-row">
                  <dt>Kategori</dt>
                  <dd>{selected.categoryName || "—"}</dd>
                </div>
                <div className="sys-kv-row">
                  <dt>Harga</dt>
                  <dd>
                    {formatPrice(selected.price)} / {unitLabel(selected)}
                  </dd>
                </div>
                <div className="sys-kv-row">
                  <dt>Deposit</dt>
                  <dd>{formatPrice(selected.deposit)}</dd>
                </div>
                <div className="sys-kv-row">
                  <dt>Stok</dt>
                  <dd>{selected.stock}</dd>
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
                      <strong>{statusMeta(confirm.value).label}</strong>?
                    </>
                  }
                  hint={`Dieksekusi via RPC admin_set_listing_status dan tercatat di audit log.${
                    confirm.value === "suspended"
                      ? " Listing langsung hilang dari katalog publik (RLS listings_read)."
                      : ""
                  }`}
                  busy={busyId === selected.id}
                  confirmLabel={`Ya, ${confirm.label.toLowerCase()}`}
                  onCancel={() => setConfirm(null)}
                  onConfirm={() =>
                    runAction(
                      () => setListingStatus(selected.id, confirm.value),
                      `Status listing diubah ke ${statusMeta(confirm.value).label}.`,
                    )
                  }
                />
              )}
            </article>
          ) : (
            <div className="sys-empty">
              <p>Pilih listing dari daftar untuk melihat detail dan aksi moderasi.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
