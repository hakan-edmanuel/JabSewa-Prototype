import { useMemo, useState } from 'react'

const INITIAL_ITEMS = [
  { id: 1, name: 'Sony Alpha Camera', category: 'Kamera', price: 150000, status: 'Aktif', image: '📷', rented: 24 },
  { id: 2, name: 'PlayStation 5', category: 'Gaming', price: 100000, status: 'Aktif', image: '🎮', rented: 18 },
  { id: 3, name: 'Camping Tent', category: 'Outdoor', price: 75000, status: 'Tersewa', image: '⛺', rented: 12 },
  { id: 4, name: 'DJI Mini Drone', category: 'Kamera', price: 220000, status: 'Aktif', image: '🚁', rented: 9 },
  { id: 5, name: 'Mountain Bike', category: 'Olahraga', price: 90000, status: 'Nonaktif', image: '🚲', rented: 7 },
]

const STATUS_LABELS = {
  'Aktif': 'Tersedia',
  'Tersewa': 'Sedang Disewa',
  'Nonaktif': 'Nonaktif',
}

export default function SellerItems() {
  const [items, setItems] = useState(INITIAL_ITEMS)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('Semua Status')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const visibleItems = useMemo(() => items.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()) && (status === 'Semua Status' || item.status === status)), [items, query, status])
  const saveListing = (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const listing = { id: editing?.id || Date.now(), name: data.get('name'), category: data.get('category'), price: Number(data.get('price')), status: data.get('status'), image: '📦', rented: editing?.rented || 0 }; setItems((current) => editing ? current.map((item) => item.id === editing.id ? listing : item) : [listing, ...current]); setEditing(null); setShowForm(false) }
  return (
    <div className="seller-items">
      <div className="items-header">
        <div>
          <h1 className="seller-page-title">Barang Saya</h1>
          <p className="seller-page-desc">Kelola barang sewaan Anda di sini.</p>
        </div>
        <button className="btn-primary-solid" onClick={() => { setEditing(null); setShowForm(true) }}>+ Tambah Barang</button>
      </div>

      {showForm && (
        <div className="seller-form-container">
          <div className="form-header-simple">
            <h2>{editing ? 'Edit Barang' : 'Tambah Barang'}</h2>
            <button type="button" className="btn-secondary-solid" onClick={() => setShowForm(false)}>Batal</button>
          </div>

          <form className="structured-listing-form" onSubmit={saveListing}>
            <section className="form-section">
              <h3 className="form-section-title">Informasi Dasar</h3>
              <div className="form-group-grid">
                <label>
                  Nama Barang <span className="required-star">*</span>
                  <input required name="name" defaultValue={editing?.name} placeholder="Masukkan nama barang" />
                </label>
                <label>
                  Kategori <span className="required-star">*</span>
                  <select name="category" defaultValue={editing?.category || 'Kamera'}>
                    <option>Kamera</option>
                    <option>Gaming</option>
                    <option>Outdoor</option>
                    <option>Olahraga</option>
                    <option>Elektronik</option>
                  </select>
                </label>
              </div>
              <label className="form-wide">
                Deskripsi Barang
                <textarea placeholder="Jelaskan kondisi dan kelengkapan barang..." rows="4" />
              </label>
            </section>

            <div className="form-divider"></div>

            <section className="form-section">
              <h3 className="form-section-title">Detail Sewa</h3>
              <div className="form-group-grid">
                <label>
                  Harga Sewa (per hari) <span className="required-star">*</span>
                  <div className="input-prefix">
                    <span className="prefix">Rp</span>
                    <input required name="price" type="number" min="0" defaultValue={editing?.price} />
                  </div>
                </label>
                <label>
                  Deposit Keamanan
                  <div className="input-prefix">
                    <span className="prefix">Rp</span>
                    <input type="number" min="0" placeholder="0" />
                  </div>
                </label>
                <label>
                  Status
                  <select name="status" defaultValue={editing?.status || 'Aktif'}>
                    <option>Aktif</option>
                    <option>Nonaktif</option>
                  </select>
                </label>
              </div>
            </section>

            <div className="form-divider"></div>

            <section className="form-section">
              <h3 className="form-section-title">Foto Barang</h3>
              <div className="simple-image-upload">
                <div className="upload-placeholder">
                  <span className="upload-icon">📷</span>
                  <span className="upload-text">Klik untuk tambah foto</span>
                </div>
              </div>
            </section>

            <div className="form-actions-footer">
              <button type="submit" className="btn-primary-solid form-submit-btn">Simpan Barang</button>
            </div>
          </form>
        </div>
      )}

      {!showForm && (
        <>
          <div className="items-filters">
            <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Cari barang..." className="search-box-solid" />
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="filter-select-solid">
              <option>Semua Status</option>
              <option>Aktif</option>
              <option>Tersewa</option>
              <option>Nonaktif</option>
            </select>
          </div>
          <div className="items-grid-solid">
            {visibleItems.map((item) => (
              <article key={item.id} className={`item-card-solid ${item.status === 'Nonaktif' ? 'is-inactive' : ''}`}>
                <div className="item-image-box">
                  <span aria-hidden="true">{item.image}</span>
                  <span className={`item-status-chip status-${item.status.toLowerCase()}`}>
                    <span className="status-dot-small" aria-hidden="true"></span>
                    {STATUS_LABELS[item.status] || item.status}
                  </span>
                </div>
                <div className="item-details-box">
                  <p className="item-category-label">{item.category}</p>
                  <h3 className="item-title-solid">{item.name}</h3>
                  <div className="item-price-row">
                    <strong className="item-price-solid">Rp {item.price.toLocaleString('id-ID')}</strong>
                    <span className="item-price-unit">/hari</span>
                  </div>
                  <p className="item-rented-note">Disewa {item.rented}x</p>
                </div>
                <div className="item-actions-row">
                  <button className="btn-text-action" onClick={() => { setEditing(item); setShowForm(true) }}>Edit</button>
                  <button className="btn-text-action" onClick={() => setItems((current) => current.map((listing) => listing.id === item.id ? { ...listing, status: listing.status === 'Nonaktif' ? 'Aktif' : 'Nonaktif' } : listing))}>
                    {item.status === 'Nonaktif' ? 'Aktifkan' : 'Nonaktifkan'}
                  </button>
                  <button className="btn-text-action danger" onClick={() => setItems((current) => current.filter((listing) => listing.id !== item.id))}>Hapus</button>
                </div>
              </article>
            ))}
            {!visibleItems.length && (
              <div className="empty-state-solid">
                <span className="empty-state-icon" aria-hidden="true">📦</span>
                <p className="empty-state-title">Belum ada barang di sini</p>
                <p className="empty-state-desc">Coba ubah kata kunci atau filter status, atau tambahkan barang baru.</p>
                <button className="btn-primary-solid" onClick={() => { setEditing(null); setShowForm(true) }}>+ Tambah Barang</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}