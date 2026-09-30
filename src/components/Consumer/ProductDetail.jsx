import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { addRental, quoteRental, translateRentalError } from '../../lib/userData'
import { formatPrice } from '../../lib/format'
import { CATEGORY_LABELS, RENTAL_UNIT_LABELS } from '../../lib/constants'

/*
 * Detail barang + panel sewa (mode penyewa) — ERD v2.
 *   belum login → tombol "Sewa sekarang" meminta masuk dulu (onRequireAuth).
 *   sudah login → permintaan sewa dikirim via RPC create_rental (server-side
 *                 validation & pricing) dengan status `pending`, muncul di
 *                 Buyer Dashboard.
 *
 * Prinsip (sesuai kontrak backend):
 *   - Harga/deposit/durasi/total yang ditampilkan berasal dari SERVER
 *     (quote_rental) — bukan perhitungan client.
 *   - Quantity dikirim ke server (1..stok); ketersediaan & harga tetap
 *     divalidasi/dihitung server (insufficient_stock).
 *   - MVP single-item per pemesanan dari detail barang (cart multi-item
 *     menyusul di halaman toko); server menerima multi-item dan menolak
 *     lintas toko.
 *   - Cegah double-submit: guard inFlight + submitting (kontrak tanpa
 *     idempotency-key).
 */
export default function ProductDetail({ item, onBack, onNavigate, onRequireAuth }) {
  const { user } = useAuth()
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [dateError, setDateError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null) // { id, total }
  const inFlight = useRef(false)

  const unitLabel = RENTAL_UNIT_LABELS[item.rental_unit] || 'hari'

  const today = useMemo(() => {
    const now = new Date()
    const tz = now.getTimezoneOffset() * 60000
    return new Date(now - tz).toISOString().slice(0, 10)
  }, [])

  /* --- Kutipan harga server-side --- */
  const [quote, setQuote] = useState(null)
  const [quoteState, setQuoteState] = useState('idle') // idle|loading|error
  const quoteSeq = useRef(0)

  useEffect(() => {
    if (!startDate || !endDate) {
      Promise.resolve().then(() => {
        setQuote(null)
        setQuoteState('idle')
      })
      return undefined
    }
    const seq = ++quoteSeq.current
    Promise.resolve().then(() => setQuoteState('loading'))
    quoteRental({
      startDate,
      endDate,
      items: [{ listing_id: item.id, quantity }],
    })
      .then((res) => {
        if (quoteSeq.current !== seq) return
        setQuote(res)
        setQuoteState(res?.ok ? 'ready' : 'error')
      })
      .catch(() => {
        if (quoteSeq.current !== seq) return
        setQuote(null)
        setQuoteState('error')
      })
    return undefined
  }, [item.id, startDate, endDate, quantity])

  /* --- Validasi tanggal (pesan Indonesia) --- */
  const validate = () => {
    if (!startDate) return 'Pilih tanggal mulai sewa.'
    if (!endDate) return 'Pilih tanggal selesai sewa.'
    if (endDate < startDate) return 'Tanggal selesai tidak boleh sebelum tanggal mulai.'
    if (startDate < today) return 'Tanggal mulai tidak boleh di masa lalu.'
    return ''
  }

  const totalDays = quote?.ok ? quote.total_days : null
  const subtotal = quote?.ok ? quote.subtotal : null
  const deposit = quote?.ok ? quote.deposit_total : null
  const total = quote?.ok ? quote.total : null
  const quoteProblem = quote && !quote.ok ? quote.error : null

  const canRent =
    Boolean(user) &&
    item.available !== false &&
    Boolean(startDate && endDate) &&
    !dateError &&
    quote?.ok === true &&
    !submitting &&
    !result

  const handleStartDate = (value) => {
    setStartDate(value)
    setResult(null)
    setSubmitError('')
    if (endDate && value && endDate < value) {
      setEndDate('')
      setDateError('Tanggal selesai sudah diatur ulang.')
    } else {
      setDateError('')
    }
  }

  const handleEndDate = (value) => {
    setEndDate(value)
    setResult(null)
    setSubmitError('')
    if (startDate && value && value < startDate) {
      setDateError('Tanggal selesai tidak boleh sebelum tanggal mulai.')
    } else {
      setDateError('')
    }
  }

  const handleRent = async () => {
    if (!user) {
      onRequireAuth(item)
      return
    }
    if (inFlight.current) return // cegah double-submit (tanpa idempotency-key)
    const problem = validate()
    if (problem) {
      setDateError(problem)
      return
    }
    inFlight.current = true
    setSubmitting(true)
    setSubmitError('')
    try {
      const rental = await addRental({
        startDate,
        endDate,
        items: [{ listing_id: item.id, quantity }],
      })
      setResult({ id: rental.id, total: rental.total })
    } catch (err) {
      setSubmitError(translateRentalError(err?.message))
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  return (
    <main className="product-detail container">
      <button className="back-button" onClick={onBack}>← Kembali ke marketplace</button>

      <div className="product-detail-grid">
        <section className="product-gallery">
          <img src={item.image} alt={item.name} className="product-main-image" />
        </section>

        <section className="product-information">
          <p className="listing-category">
            {item.category_name || CATEGORY_LABELS[item.category] || item.category || '—'}
          </p>
          <h1>{item.name}</h1>
          <p className="detail-availability">
            <span className={`availability-dot ${item.available ? 'is-available' : 'is-rented'}`} />
            {item.available
              ? `Tersedia · stok ${item.stock} · ${item.location}`
              : `Tidak tersedia · ${item.location}`}
          </p>

          <div className="detail-price-row">
            <strong>{formatPrice(item.price)}</strong>
            <span>/{unitLabel}</span>
          </div>

          <p className="detail-description">{item.description}</p>

          <dl className="detail-facts">
            <div className="detail-fact">
              <dt>Pemilik</dt>
              <dd>{item.seller}</dd>
            </div>
            <div className="detail-fact">
              <dt>Lokasi</dt>
              <dd>{item.location}</dd>
            </div>
            <div className="detail-fact">
              <dt>Deposit</dt>
              <dd>{formatPrice(item.deposit)}</dd>
            </div>
            {item.min_rental_duration != null && (
              <div className="detail-fact">
                <dt>Durasi minimum</dt>
                <dd>{item.min_rental_duration} {unitLabel}</dd>
              </div>
            )}
          </dl>

          <aside className="rental-panel">
            <div className="date-grid">
              <label>Mulai
                <input
                  type="date"
                  min={today}
                  value={startDate}
                  onChange={(event) => handleStartDate(event.target.value)}
                />
              </label>
              <label>Selesai
                <input
                  type="date"
                  min={startDate || today}
                  value={endDate}
                  onChange={(event) => handleEndDate(event.target.value)}
                />
              </label>
            </div>

            {dateError && <p className="rental-note is-error">{dateError}</p>}

            <label className="rental-quantity">
              Jumlah
              <select
                value={quantity}
                onChange={(event) => {
                  setResult(null)
                  setQuantity(Number(event.target.value) || 1)
                }}
                disabled={item.available === false || (item.stock ?? 1) <= 1}
              >
                {Array.from({ length: Math.max(1, Math.min(item.stock ?? 1, 10)) }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n} unit
                  </option>
                ))}
              </select>
            </label>

            <div className="price-summary">
              <span>
                {quoteState === 'loading' && 'Menghitung…'}
                {quoteState === 'error' && 'Gagal menghitung biaya.'}
                {quoteState === 'idle' && 'Pilih tanggal sewa'}
                {quote?.ok && `${totalDays} hari sewa (tanggal selesai termasuk)`}
              </span>
              <strong>{subtotal == null ? '—' : formatPrice(subtotal)}</strong>
              <span>Deposit keamanan</span>
              <strong>{deposit == null ? '—' : formatPrice(deposit)}</strong>
              <span>Total</span>
              <strong>{total == null ? '—' : formatPrice(total)}</strong>
            </div>

            {quoteProblem && (
              <p className="rental-note is-error">
                {quoteProblem === 'start_date_in_past' && 'Tanggal mulai tidak boleh di masa lalu.'}
                {quoteProblem === 'invalid_date_range' && 'Rentang tanggal tidak valid.'}
                {quoteProblem === 'listing_unavailable' && 'Barang sedang tidak tersedia.'}
                {quoteProblem === 'store_inactive' && 'Toko sedang tidak aktif.'}
                {quoteProblem === 'insufficient_stock' && 'Stok tidak cukup untuk jumlah/rentang tanggal itu.'}
                {quoteProblem === 'min_duration' && `Durasi sewa di bawah minimum (${item.min_rental_duration} ${unitLabel}).`}
                {!['start_date_in_past', 'invalid_date_range', 'listing_unavailable', 'store_inactive', 'insufficient_stock', 'min_duration'].includes(quoteProblem) &&
                  'Tanggal tidak dapat dikutip. Coba rentang lain.'}
              </p>
            )}

            <button
              className="primary-button"
              disabled={!canRent}
              onClick={handleRent}
            >
              {submitting
                ? 'Mengirim…'
                : result
                  ? 'Permintaan terkirim'
                  : item.available === false
                    ? 'Sedang tidak tersedia'
                    : user
                      ? 'Sewa sekarang'
                      : 'Masuk untuk sewa'}
            </button>

            {submitError && <p className="rental-note is-error">{submitError}</p>}

            {result && (
              <div className="request-success">
                <p>
                  Permintaan sewa dikirim ke {item.seller}. Total {formatPrice(result.total)}.
                  Selanjutnya kirim bukti pembayaran dari dashboard penyewa.
                </p>
                <button className="btn-small btn-primary" onClick={() => onNavigate('buyer')}>
                  Lihat pesanan saya
                </button>
              </div>
            )}
            {!user && !result && (
              <p className="rental-note">Kamu perlu masuk dulu sebelum mengirim permintaan sewa.</p>
            )}
          </aside>
        </section>
      </div>

      <div className="product-detail-sections">
        <section className="product-info-block">
          <h2>Aturan sewa</h2>
          <p>
            Identitas diperlukan saat pengambilan. Kembalikan barang sesuai waktu dan kondisi
            semula; deposit dikembalikan penuh setelah barang dicek ulang. Periode sewa dihitung
            dengan tanggal selesai termasuk (sewa 1–3 Okt = 3 hari). Keterlambatan dapat dikenakan
            denda sesuai ketentuan toko.
          </p>
        </section>
      </div>
    </main>
  )
}
