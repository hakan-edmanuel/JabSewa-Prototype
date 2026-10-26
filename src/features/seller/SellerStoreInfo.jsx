/*
 * Info Toko (seller) — ERD v2: data dari RPC get_my_stores (kolom ERD).
 * Read-only di MVP; pengubahan profil toko tersedia via RPC update_my_store
 * (UI edit menyusul).
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
        {store.status === 'active' && (
          <span className="store-verified">Toko Aktif</span>
        )}
      </div>

      <div className="dashboard-section">
        <dl className="detail-facts store-facts">
          <div className="detail-fact">
            <dt>Nama toko</dt>
            <dd>{store.name}</dd>
          </div>
          <div className="detail-fact">
            <dt>Pemilik</dt>
            <dd>Kamu</dd>
          </div>
          <div className="detail-fact">
            <dt>Satuan sewa default</dt>
            <dd>per {store.rental_unit === 'week' ? 'minggu' : store.rental_unit === 'month' ? 'bulan' : 'hari'}</dd>
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
            <dt>Status</dt>
            <dd>
              {store.status === 'active'
                ? 'Aktif'
                : store.status === 'suspended'
                  ? 'Ditangguhkan admin'
                  : 'Nonaktif'}
            </dd>
          </div>
        </dl>

        <p className="dashboard-empty-note">
          Perubahan profil toko (nama, alamat, deskripsi) tersedia via layanan
          update_my_store — UI edit menyusul.
        </p>
      </div>
    </div>
  )
}
