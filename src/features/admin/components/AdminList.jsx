/*
 * Panel daftar admin (list-detail): status muat, error, kosong, dan baris.
 * `renderRow(row)` mengembalikan { avatar, name, sub, meta, status }.
 */
export default function AdminList({
  ariaLabel,
  state,
  error,
  loadingText,
  emptyText,
  rows,
  selectedId,
  onReload,
  onSelect,
  renderRow,
}) {
  return (
    <section className="sys-list" aria-label={ariaLabel}>
      {state === "loading" && (
        <div className="sys-empty">
          <p>{loadingText}</p>
        </div>
      )}
      {state === "error" && (
        <div className="sys-empty">
          <p>{error}</p>
          <button type="button" className="sys-btn sys-btn-ghost" onClick={onReload}>
            Coba lagi
          </button>
        </div>
      )}
      {state === "ready" && rows.length === 0 && (
        <div className="sys-empty">
          <p>{emptyText}</p>
        </div>
      )}
      {state === "ready" && rows.length > 0 && (
        <ul className="sys-list-items">
          {rows.map((row) => {
            const view = renderRow(row);
            const isActive = row.id === selectedId;
            return (
              <li key={row.id}>
                <button
                  type="button"
                  className={`sys-row ${isActive ? "is-active" : ""}`}
                  onClick={() => onSelect(row)}
                  aria-current={isActive ? "true" : undefined}
                >
                  <span className="sys-row-avatar" aria-hidden="true">
                    {view.avatar}
                  </span>
                  <span className="sys-row-main">
                    <span className="sys-row-name">{view.name}</span>
                    <span className="sys-row-store">{view.sub}</span>
                    <span className="sys-row-date">{view.meta}</span>
                  </span>
                  <span className="sys-row-side">
                    <span className={`sys-status-badge ${view.status.className}`}>
                      {view.status.label}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
