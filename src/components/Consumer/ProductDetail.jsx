import { useMemo, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { addRental } from '../../lib/userData'

const formatPrice = (price) => `Rp ${price.toLocaleString('id-ID')}`

const CATEGORY_LABELS = {
  photography: 'Fotografi & Video',
  gadget: 'Gadget',
  sports: 'Olahraga',
  event: 'Event',
}

/*
 * Detail barang + panel sewa.
 *   belum login → tombol "Sewa sekarang" meminta masuk dulu (onRequireAuth),
 *                 setelah login user dikembalikan ke barang ini.
 *   sudah login → permintaan sewa tersimpan (addRental) dan muncul di
 *                 Buyer Dashboard sebagai pesanan "Menunggu konfirmasi".
 */
export default function ProductDetail({ item, onBack, onNavigate, onRequireAuth }) {
  const { user } = useAuth()
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [requestSent, setRequestSent] = useState(false)
  const totalDays = useMemo(
    () =>
      startDate && endDate
        ? Math.max(0, Math.ceil((new Date(endDate) - new Date(startDate)) / 86400000))
        : 0,
    [endDate, startDate],
  )
  const canRent = item.available && totalDays > 0 && !requestSent

  const handleRent = () => {
    if (!user) {
      onRequireAuth(item)
      return
    }
    addRental({
      itemId: item.id,
      itemName: item.name,
      seller: item.seller,
      pricePerDay: item.price,
      deposit: item.deposit,
      startDate,
      endDate,
      totalDays,
      total: totalDays * item.price,
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
                <input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setRequestSent(false) }} />
              </label>
              <label>Selesai
                <input type="date" min={startDate} value={endDate} onChange={(event) => { setEndDate(event.target.value); setRequestSent(false) }} />
              </label>
            </div>

            <div className="price-summary">
              <span>{totalDays > 0 ? `${totalDays} hari sewa` : 'Pilih tanggal sewa'}</span>
              <strong>{formatPrice(totalDays * item.price)}</strong>
              <span>Deposit keamanan</span>
              <strong>{formatPrice(item.deposit)}</strong>
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
