/*
 * Bar filter status (+ pencarian opsional) dengan jumlah per filter.
 * `countsReady=false` menampilkan "—" alih-alih 0 saat daftar belum siap
 * dimuat — angka nol palsu membuat filter tampak kosong padahal gagal.
 */
export default function AdminFilters({
  ariaLabel,
  filters,
  counts,
  countsReady = true,
  value,
  onChange,
  search,
}) {
  return (
    <nav className="sys-filters" aria-label={ariaLabel}>
      {filters.map((f) => (
        <button
          key={f.key}
          type="button"
          className={`sys-filter ${value === f.key ? "is-active" : ""}`}
          aria-pressed={value === f.key}
          onClick={() => onChange(f.key)}
        >
          {f.label}
          <span className="sys-filter-count">
            {countsReady ? counts[f.key] ?? 0 : "—"}
          </span>
        </button>
      ))}
      {search && (
        <input
          type="search"
          className="sys-search"
          placeholder={search.placeholder}
          value={search.value}
          onChange={(e) => search.onChange(e.target.value)}
          aria-label={search.ariaLabel}
        />
      )}
    </nav>
  );
}
