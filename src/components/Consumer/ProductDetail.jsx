import { useMemo, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { addRental } from '../../lib/userData'
import { formatPrice } from '../../lib/format'
import { CATEGORY_LABELS } from '../../lib/constants'

/*
 * Detail barang + panel sewa (mode penyewa).
 *   belum login → tombol "Sewa sekarang" meminta masuk dulu (onRequireAuth),
 *                 setelah login user dikembalikan ke barang ini.
 *   sudah login → permintaan sewa tersimpan via lapisan data (addRental)
 *                 dengan status `pending`, muncul di Buyer Dashboard.
 *
 * Kontrak rental yang dikirim: listing_id, store_id, start_date, end_date,
 * total_days, price_per_day, deposit, subtotal, total (dihitung di data layer).
 * Tidak ada simulasi pembayaran / konfirmasi otomatis — status awal selalu
 * "Menunggu Konfirmasi" sampai seller benar-benar memutuskan.
 */
export default function ProductDetail({ item, onBack, onNavigate, onRequireAuth }) {
  const { user } = useAuth()
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [requestSent, setRequestSent] = useState(false)
  const [dateError, setDateError] = useState('')

  const today = new Date().toISOString().slice(0, 10)

  const totalDays = useMemo(() => {
    if (!startDate || !endDate) return 0
    const diff = Math.ceil((new Date(endDate) - new Date(startDate)) / 86400000)
    return diff > 0 ? diff : 0
  }, [endDate, startDate])

  const subtotal = totalDays * item.price
  const canRent = item.available && totalDays > 0 && !requestSent

  const handleStartDate = (value) => {
    setStartDate(value)
    setRequestSent(false)
    // Tanggal selesai sebelum mulai → reset, jangan diam-diam invalid.
    if (endDate && value && endDate < value) {
      setEndDate('')
      setDateError('Tanggal selesai sudah diatur ulang.')
    } else {
      setDateError('')
    }
  }

  const handleRent = () => {
    if (!user) {
      onRequireAuth(item)
      return
    }
    addRental({
      listingId: item.id,
      storeId: item.store_id,
      startDate,
      endDate,
      totalDays,
      pricePerDay: item.price,
      deposit: item.deposit,
    })
    setRequestSent(true)
  }

  return (
    <main className="product-detail container">
      <button className="back-button" onClick={onBack}>← Kembali ke marketplace</button>

      <div className="product-detail-grid">
        <section className="product-gallery">
          <img src={item.image} alt={item.name} className="product-main-image" />
        </section>

        <section className="product-information">
          <p className="listing-category">{CATEGORY_LABELS[item.category] || item.category}</p>
          <h1>{item.name}</h1>
          <p className="detail-availability">
            <span className={`availability-dot ${item.available ? 'is-available' : 'is-rented'}`} />
            {item.available ? 'Tersedia' : 'Sedang disewa'} · {item.location}
          </p>

          <div className="detail-price-row">
            <strong>{formatPrice(item.price)}</strong>
            <span>/ hari</span>
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
                  onChange={(event) => { setEndDate(event.target.value); setRequestSent(false); setDateError('') }}
                />
              </label>
            </div>

            {dateError && <p className="rental-note is-error">{dateError}</p>}

            <div className="price-summary">
              <span>{totalDays > 0 ? `${totalDays} hari sewa` : 'Pilih tanggal sewa'}</span>
              <strong>{formatPrice(subtotal)}</strong>
              <span>Deposit keamanan</span>
              <strong>{formatPrice(item.deposit)}</strong>
              <span>Total</span>
              <strong>{formatPrice(subtotal + item.deposit)}</strong>
            </div>

            <button
              className="primary-button"
              disabled={!canRent}
              onClick={handleRent}
            >
              {requestSent
                ? 'Permintaan terkirim'
                : item.available
                  ? user
                    ? 'Sewa sekarang'
                    : 'Masuk untuk sewa'
                  : 'Sedang tidak tersedia'}
            </button>

            {requestSent && (
              <div className="request-success">
                <p>Permintaan sewa dikirim ke {item.seller}. Tunggu konfirmasi pemilik.</p>
                <button className="btn-small btn-primary" onClick={() => onNavigate('buyer')}>
                  Lihat pesanan saya
                </button>
              </div>
            )}
            {!user && !requestSent && (
              <p className="rental-note">Kamu perlu masuk dulu sebelum mengirim permintaan sewa.</p>
            )}
          </aside>
        </section>
      </div>

      <div className="product-detail-sections">
        <section className="product-info-block">
          <h2>Aturan sewa</h2>
          <p>Identitas diperlukan saat pengambilan. Kembalikan barang sesuai waktu dan kondisi semula; deposit dikembalikan penuh setelah barang dicek ulang.</p>
        </section>
      </div>
    </main>
  )
}
