import { useMemo, useState } from 'react'

const formatPrice = (price) => `Rp ${price.toLocaleString('id-ID')}`

export default function ProductDetail({ item, onBack }) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [requestSent, setRequestSent] = useState(false)
  const totalDays = useMemo(() => startDate && endDate ? Math.max(0, Math.ceil((new Date(endDate) - new Date(startDate)) / 86400000)) : 0, [endDate, startDate])
  const canRent = item.available && totalDays > 0 && !requestSent

  return <main className="product-detail container">
    <button className="back-button" onClick={onBack}>← Kembali ke marketplace</button>
    <div className="product-detail-grid">
      <section className="product-gallery"><div className="product-main-image">{item.image}</div><div className="product-thumbnails"><span>{item.image}</span><span>📦</span><span>✓</span></div></section>
      <section className="product-information"><p className="listing-category">{item.category}</p><h1>{item.name}</h1><p className="detail-rating">★ {item.rating} <span>({item.reviews} ulasan)</span> · {item.location}</p><p className="detail-description">{item.description}</p><div className="seller-summary"><div className="seller-avatar">{item.seller.charAt(0)}</div><div><strong>{item.seller}</strong><p>Seller terverifikasi · Respons cepat</p></div><button className="btn-small">Lihat profil</button></div><div className="detail-rules"><h3>Aturan sewa</h3><p>Identitas diperlukan saat pickup. Kembalikan barang sesuai waktu dan kondisi semula.</p></div></section>
      <aside className="rental-panel"><p>Harga sewa</p><strong>{formatPrice(item.price)} <small>/hari</small></strong><div className="date-grid"><label>Mulai<input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setRequestSent(false) }} /></label><label>Selesai<input type="date" min={startDate} value={endDate} onChange={(event) => { setEndDate(event.target.value); setRequestSent(false) }} /></label></div><div className="price-summary"><span>{totalDays} hari sewa</span><strong>{formatPrice(totalDays * item.price)}</strong><span>Deposit keamanan</span><strong>{formatPrice(item.deposit)}</strong></div><button className="primary-button" disabled={!canRent} onClick={() => setRequestSent(true)}>{requestSent ? 'Permintaan sewa terkirim' : item.available ? 'Sewa sekarang' : 'Sedang tidak tersedia'}</button>{requestSent && <p className="request-success">Permintaan Anda telah dikirim ke {item.seller}.</p>}<p className="rental-note">Pembayaran aman setelah permintaan sewa disetujui.</p></aside>
    </div>
  </main>
}
