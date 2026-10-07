/*
 * ============================================================================
 * SYS LISTINGS — JabSewa (ERD v2)
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

import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminListListings, setListingStatus } from '../../lib/superadmin'
import { formatPrice, formatDate, initialOf } from '../../lib/format'
import { translateServerError } from '../../lib/constants'
import { RENTAL_UNIT_LABELS } from '../../lib/constants'

const FILTERS = [
  { key: 'all', label: 'Semua' },
  { key: 'active', label: 'Aktif' },
  { key: 'suspended', label: 'Suspended' },
  { key: 'inactive', label: 'Nonaktif' },
  { key: 'out_of_stock', label: 'Stok habis' },
]

const STATUS_META = {
  active: { label: 'Aktif', className: 'is-approved' },
  inactive: { label: 'Nonaktif', className: 'is-review' },
  out_of_stock: { label: 'Stok habis', className: 'is-review' },
  suspended: { label: 'Suspended', className: 'is-rejected' },
}

export default function SysListings() {
  const [rows, setRows] = useState([])
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirm, setConfirm] = useState(null) // { value, label, danger }

  const load = useCallback(() => {
    setState('loading')
    setError('')
    adminListListings()
      .then((data) => {
        setRows(data)
        setState('ready')
      })
      .catch((err) => {
        setError(err?.message || 'Gagal memuat listing.')
        setState('error')
      })
  }, [])

  useEffect(() => {
    Promise.resolve().then(load)
  }, [load])

  const counts = useMemo(
    () => ({
      all: rows.length,
      active: rows.filter((l) => l.status === 'active').length,
      suspended: rows.filter((l) => l.status === 'suspended').length,
      inactive: rows.filter((l) => l.status === 'inactive').length,
      out_of_stock: rows.filter((l) => l.status === 'out_of_stock').length,
    }),
    [rows],
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows
      .filter((l) => (filter === 'all' ? true : l.status === filter))
      .filter((l) => (q ? String(l.name || '').toLowerCase().includes(q) : true))
  }, [rows, filter, query])

  const selected = rows.find((l) => l.id === selectedId) || null

  const runAction = async (fn, okMessage) => {
    if (!selected) return
    setBusyId(selected.id)
    setActionError('')
    setNotice('')
    try {
      await fn()
      setNotice(okMessage)
      setConfirm(null)
      load()
    } catch (err) {
      setActionError(translateServerError(err?.message))
    } finally {
      setBusyId(null)
    }
  }

  const statusMeta = (s) => STATUS_META[s] || { label: s, className: 'is-review' }

  const nextActions = (listing) => {
    const list = []
    if (listing.status !== 'active') {
      list.push({ value: 'active', label: 'Setujui (aktif)', danger: false })
    }
    if (listing.status !== 'suspended') {
      list.push({ value: 'suspended', label: 'Suspend listing', danger: true })
    }
    return list
  }

  return (
    <div className="sys-page">
      <header className="sys-page-head">
        <div>
          <h1>Listings</h1>
          <p className="sys-page-sub">
            Moderasi katalog lintas toko — listing ter-suspend otomatis hilang dari katalog
            publik.
          </p>
          <button type="button" className="sys-btn sys-btn-ghost" onClick={load}>
            Muat ulang
          </button>
        </div>
        <div className="sys-pending" aria-live="polite">
          <span className="sys-pending-num">{counts.suspended}</span>
          <span className="sys-pending-label">listing di-suspend</span>
        </div>
      </header>

      {notice && <p className="sys-note sys-note-ok">{notice}</p>}
      {actionError && <p className="sys-note sys-note-err">⚠ {actionError}</p>}

      <nav className="sys-filters" aria-label="Filter status listing">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`sys-filter ${filter === f.key ? 'is-active' : ''}`}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
            <span className="sys-filter-count">{counts[f.key] ?? 0}</span>
          </button>
        ))}
        <input
          type="search"
          className="sys-search"
          placeholder="Cari nama barang…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Cari listing"
        />
      </nav>

      <div className="sys-content-cols">
        <section className="sys-list" aria-label="Daftar listing">
          {state === 'loading' && (
            <div className="sys-empty">
              <p>Memuat listing…</p>
            </div>
          )}
          {state === 'error' && (
            <div className="sys-empty">
              <p>{error}</p>
              <button type="button" className="sys-btn sys-btn-ghost" onClick={load}>
                Coba lagi
              </button>
            </div>
          )}
          {state === 'ready' && visible.length === 0 && (
            <div className="sys-empty">
              <p>{filter === 'all' ? 'Belum ada listing.' : 'Tidak ada listing pada filter ini.'}</p>
            </div>
          )}
          {state === 'ready' && visible.length > 0 && (
            <ul className="sys-list-items">
              {visible.map((l) => {
                const meta = statusMeta(l.status)
                const isActive = l.id === selectedId
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      className={`sys-row ${isActive ? 'is-active' : ''}`}
                      onClick={() => {
                        setSelectedId(l.id)
                        setActionError('')
                        setNotice('')
                        setConfirm(null)
                      }}
                      aria-current={isActive ? 'true' : undefined}
                    >
                      <span className="sys-row-avatar" aria-hidden="true">
                        {initialOf(l.name)}
                      </span>
                      <span className="sys-row-main">
                        <span className="sys-row-name">{l.name}</span>
                        <span className="sys-row-store">
                          {l.store?.name || '—'} · {formatPrice(l.price)}/{RENTAL_UNIT_LABELS[l.rentalUnit] || l.rentalUnit}
                        </span>
                        <span className="sys-row-date">
                          {l.categoryName || 'Tanpa kategori'} · stok {l.stock}
                        </span>
                      </span>
                      <span className="sys-row-side">
                        <span className={`sys-status-badge ${meta.className}`}>{meta.label}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="sys-detail" aria-label="Detail listing">
          {selected ? (
            <article className="sys-card">
              <header className="sys-detail-head">
                <div>
                  <h2>{selected.name}</h2>
                  <p className="sys-detail-store">
                    {selected.store?.name || '—'} · {formatPrice(selected.price)}/
                    {RENTAL_UNIT_LABELS[selected.rentalUnit] || selected.rentalUnit}
                  </p>
                </div>
                <span className={`sys-status-badge ${statusMeta(selected.status).className}`}>
                  {statusMeta(selected.status).label}
                </span>
              </header>

              <dl className="sys-kv">
                <div className="sys-kv-row">
                  <dt>Kategori</dt>
                  <dd>{selected.categoryName || '—'}</dd>
                </div>
                <div className="sys-kv-row">
                  <dt>Harga</dt>
                  <dd>
                    {formatPrice(selected.price)} / {RENTAL_UNIT_LABELS[selected.rentalUnit] || selected.rentalUnit}
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
                    className={`sys-btn ${a.danger ? 'is-danger' : 'is-approve'}`}
                    disabled={busyId === selected.id}
                    onClick={() => setConfirm(a)}
                  >
                    {a.label}
                  </button>
                ))}
              </div>

              {confirm && (
                <div className={`sys-confirm ${confirm.danger ? 'is-reject' : 'is-approve'}`}>
                  <p>
                    Ubah status <strong>{selected.name}</strong> menjadi{' '}
                    <strong>{confirm.value}</strong>?
                  </p>
                  <p className="sys-confirm-hint">
                    Dieksekusi via RPC admin_set_listing_status dan tercatat di audit log.
                    {confirm.value === 'suspended' &&
                      ' Listing langsung hilang dari katalog publik (RLS listings_read).'}
                  </p>
                  <div className="sys-confirm-actions">
                    <button
                      type="button"
                      className="sys-btn-ghost"
                      disabled={busyId === selected.id}
                      onClick={() => setConfirm(null)}
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      className={`sys-btn ${confirm.danger ? 'is-danger' : 'is-approve'}`}
                      disabled={busyId === selected.id}
                      onClick={() =>
                        runAction(
                          () => setListingStatus(selected.id, confirm.value),
                          `Status listing diubah ke ${confirm.value}.`,
                        )
                      }
                    >
                      {busyId === selected.id ? 'Menyimpan…' : 'Ya, ubah status'}
                    </button>
                  </div>
                </div>
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
  )
}
