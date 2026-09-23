/*
 * Info Toko (seller): ringkasan identitas toko dari koleksi `stores`.
 * Sengaja read-only — pengubahan profil toko adalah fitur backend
 * (UPDATE stores …) jadi tidak disimulasikan di sini.
 */
export default function SellerStoreInfo({ store }) {
  if (!store) {
    return (
      <div className="seller-store-info">
        <div className="items-header">
          <div>
            <h1 className="seller-page-title">Info Toko</h1>
            <p className="seller-page-desc">Profil toko kamu.</p>
          </div>
        </div>
        <p className="dashboard-empty-note">
          Toko belum terhubung ke akun ini. Hubungi admin bila data toko belum muncul.
        </p>
      </div>
    )
  }

  return (
    <div className="seller-store-info">
      <div className="items-header">
        <div>
          <h1 className="seller-page-title">Info Toko</h1>
          <p className="seller-page-desc">Data toko yang tampil di marketplace.</p>
        </div>
        {store.is_verified && <span className="store-verified">✓ Terverifikasi</span>}
      </div>

      <div className="dashboard-section">
        <dl className="detail-facts store-facts">
          <div className="detail-fact">
            <dt>Nama toko</dt>
            <dd>{store.name}</dd>
          </div>
          <div className="detail-fact">
            <dt>Pemilik</dt>
            <dd>{store.owner_name || '—'}</dd>
          </div>
          <div className="detail-fact">
            <dt>Kota</dt>
            <dd>{store.city || '—'}</dd>
          </div>
        </dl>

        <div className="store-description">
          <h2>Deskripsi</h2>
          <p>{store.description || 'Belum ada deskripsi toko.'}</p>
        </div>

        <div className="store-address">
          <h2>Alamat pengambilan</h2>
          <p>{store.address || '—'}</p>
        </div>

        <dl className="detail-facts store-facts">
          <div className="detail-fact">
            <dt>Rating</dt>
            <dd>{store.rating ? `★ ${Number(store.rating).toFixed(1)}` : 'Belum ada'}</dd>
          </div>
          <div className="detail-fact">
            <dt>Total transaksi</dt>
            <dd>{store.total_transactions ?? 0}</dd>
          </div>
          <div className="detail-fact">
            <dt>Status</dt>
            <dd>{store.status === 'active' ? 'Aktif' : 'Nonaktif'}</dd>
          </div>
        </dl>

        <p className="dashboard-empty-note">
          Perubahan profil toko (nama, alamat, deskripsi) akan tersedia setelah backend terpasang.
        </p>
      </div>
    </div>
  )
}
