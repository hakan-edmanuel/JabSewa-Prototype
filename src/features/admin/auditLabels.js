/*
 * ============================================================================
 * AUDIT LABELS — kosakata tampilan untuk audit_logs
 * ============================================================================
 * Nilai `action` dan `entity_type` di audit_logs dibatasi CHECK constraint di
 * database (lihat migration baseline §3.14). Peta di bawah hanya menerjemahkan
 * nilai itu untuk operator — tidak menambah aksi, tidak menulis audit, dan
 * tidak menyimpulkan sesuatu yang tidak tercatat.
 *
 * Aksi di luar peta (mis. registry baru yang belum diterjemahkan) ditampilkan
 * apa adanya lewat fallback, bukan disembunyikan.
 * ============================================================================
 */

export const AUDIT_GROUP_LABELS = {
  all: 'Semua',
  applications: 'Ajuan seller',
  catalog: 'Toko & katalog',
  transactions: 'Transaksi',
  accounts: 'Akun',
}

/** tone: 'ok' | 'danger' | 'neutral' — hanya warna badge, bukan keputusan. */
export const AUDIT_ACTION_META = {
  application_submit: { label: 'Ajuan toko dikirim', group: 'applications', tone: 'neutral' },
  application_approve: { label: 'Ajuan toko disetujui', group: 'applications', tone: 'ok' },
  application_reject: { label: 'Ajuan toko ditolak', group: 'applications', tone: 'danger' },

  store_activate: { label: 'Toko diaktifkan', group: 'catalog', tone: 'ok' },
  store_deactivate: { label: 'Toko dinonaktifkan', group: 'catalog', tone: 'danger' },
  store_suspend: { label: 'Toko disuspend', group: 'catalog', tone: 'danger' },
  store_unsuspend: { label: 'Suspend toko dicabut', group: 'catalog', tone: 'ok' },

  listing_create: { label: 'Listing dibuat', group: 'catalog', tone: 'neutral' },
  listing_update: { label: 'Listing diperbarui', group: 'catalog', tone: 'neutral' },
  listing_delete: { label: 'Listing dihapus', group: 'catalog', tone: 'danger' },
  listing_suspend: { label: 'Listing disuspend', group: 'catalog', tone: 'danger' },

  rental_create: { label: 'Transaksi dibuat', group: 'transactions', tone: 'neutral' },
  rental_cancel: { label: 'Transaksi dibatalkan', group: 'transactions', tone: 'danger' },
  payment_submit: { label: 'Bukti bayar dikirim', group: 'transactions', tone: 'neutral' },
  payment_verify: { label: 'Pembayaran diverifikasi', group: 'transactions', tone: 'ok' },
  payment_reject: { label: 'Bukti bayar ditolak', group: 'transactions', tone: 'danger' },
  return_record: { label: 'Pengembalian dicatat', group: 'transactions', tone: 'neutral' },
  latefee_apply: { label: 'Denda diterapkan', group: 'transactions', tone: 'neutral' },
  latefee_waive: { label: 'Denda dihapus', group: 'transactions', tone: 'danger' },
  dispute_open: { label: 'Sengketa dibuka', group: 'transactions', tone: 'neutral' },
  dispute_resolve: { label: 'Sengketa diputus', group: 'transactions', tone: 'ok' },
  review_create: { label: 'Ulasan dibuat', group: 'transactions', tone: 'neutral' },

  role_change: { label: 'Role akun diubah', group: 'accounts', tone: 'neutral' },
  user_suspend: { label: 'Akun disuspend', group: 'accounts', tone: 'danger' },
  user_activate: { label: 'Akun diaktifkan', group: 'accounts', tone: 'ok' },
}

export const AUDIT_ENTITY_LABELS = {
  user: 'Akun',
  store_application: 'Ajuan toko',
  store: 'Toko',
  category: 'Kategori',
  listing: 'Listing',
  listing_image: 'Foto listing',
  rental_transaction: 'Transaksi rental',
  payment: 'Pembayaran',
  late_fee: 'Denda',
  dispute: 'Sengketa',
  review: 'Ulasan',
}

/** Fallback aman: kode asli tetap terlihat bila belum ada terjemahan. */
export function auditActionMeta(action) {
  return (
    AUDIT_ACTION_META[action] || {
      label: String(action || '—'),
      group: 'other',
      tone: 'neutral',
    }
  )
}

/** Label entitas target (fallback: nilai mentah). */
export function auditEntityLabel(entityType) {
  return AUDIT_ENTITY_LABELS[entityType] || entityType || '—'
}
