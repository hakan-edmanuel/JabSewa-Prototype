/* ============================================================================
 * LOCAL STORAGE STORE — JabSewa (MODE MOCK / OFFLINE)
 * ============================================================================
 * Sumber data TUNGGAL aplikasi — 100% lokal, tanpa Supabase / internet.
 *
 * Semua koleksi disimpan di bawah kunci `jabsewa_db_v1`:
 *   users       — akun (termasuk 1 SUPERADMIN default + tenant + store owner)
 *   stores      — toko mitra (nama, rating, verifikasi, pemilik, …)
 *   items       — barang sewaan (judul, kategori, harga, rating, store_id, …)
 *   audit_logs  — jejak aksi superadmin
 *
 * Saat LocalStorage masih kosong (atau versi lama), seed data di bawah
 * dituliskan otomatis saat modul dimuat — aplikasi langsung siap demo.
 *
 * Helper publik:
 *   getDb() / setDb()            — baca/tulis seluruh "database" lokal
 *   getUsers/getStores/getItems  — koleksi (array)
 *   saveUser / upsertStore / upsertItem
 *   logAudit / getAuditLogs
 *   getCurrentUser / setCurrentUser / clearCurrentUser  (sesi login)
 *   resetDemoData()              — bersihkan & seed ulang (tombol dev)
 * ============================================================================
 */

/* ------------------------------ Kunci storage ----------------------------- */

const DB_KEY = 'jabsewa_db_v1'
const SESSION_KEY = 'jabsewa_current_user'

/* ------------------------------- Seed data -------------------------------- */

const SEED_USERS = [
  {
    id: 'u-superadmin',
    name: 'Super Admin',
    email: 'admin@jabsewa.id',
    password: 'admin123', // mock saja — JANGAN pakai kredensial riil di sini
    role: 'SUPERADMIN',
    status: 'active',
    sellerApplication: null,
    sellerProfile: null,
  },
  {
    id: 'u-tenant',
    name: 'Budi Penyewa',
    email: 'tenant@jabsewa.id',
    password: 'tenant123',
    role: 'TENANT',
    status: 'active',
    sellerApplication: null,
    sellerProfile: null,
  },
  {
    id: 'u-owner',
    name: 'Rina Pemilik Toko',
    email: 'owner@jabsewa.id',
    password: 'owner123',
    role: 'STORE_OWNER',
    status: 'active',
    sellerApplication: {
      status: 'approved',
      storeName: 'Sewa Kamera Jakarta',
      description: 'Rental kamera & perlengkapan foto profesional.',
      contact: '081200000001',
      city: 'Jakarta Selatan',
      address: 'Jl. Kebayoran Lama No. 12',
      submittedAt: '2026-08-01T03:00:00.000Z',
      reviewedAt: '2026-08-02T03:00:00.000Z',
    },
    sellerProfile: {
      storeName: 'Sewa Kamera Jakarta',
      description: 'Rental kamera & perlengkapan foto profesional.',
      contact: '081200000001',
      city: 'Jakarta Selatan',
      address: 'Jl. Kebayoran Lama No. 12',
    },
  },
]

const SEED_STORES = [
  {
    id: 's-1',
    name: 'Sewa Kamera Jakarta',
    owner_id: 'u-owner',
    owner_name: 'Rina Pemilik Toko',
    city: 'Jakarta Selatan',
    address: 'Jl. Kebayoran Lama No. 12',
    description: 'Rental kamera & perlengkapan foto profesional.',
    rating: 4.9,
    total_transactions: 214,
    is_verified: true,
    status: 'active',
    created_at: '2026-08-02T03:00:00.000Z',
  },
  {
    id: 's-2',
    name: 'Gading Rental Tools',
    owner_id: null,
    owner_name: 'Pak Gading',
    city: 'Jakarta Utara',
    address: 'Jl. Kelapa Gading Boulevard No. 5',
    description: 'Peralatan event, projector, dan sound system siap antar.',
    rating: 4.7,
    total_transactions: 158,
    is_verified: true,
    status: 'active',
    created_at: '2026-08-05T03:00:00.000Z',
  },
  {
    id: 's-3',
    name: 'GameNest',
    owner_id: null,
    owner_name: 'Dimas Pratama',
    city: 'Jakarta Barat',
    address: 'Jl. Tomang Raya No. 40',
    description: 'Konsol game, VR, dan koleksi judul terbaru.',
    rating: 4.8,
    total_transactions: 302,
    is_verified: true,
    status: 'active',
    created_at: '2026-08-07T03:00:00.000Z',
  },
  {
    id: 's-4',
    name: 'TrailBase Outdoor',
    owner_id: null,
    owner_name: 'Sari Wulandari',
    city: 'Depok',
    address: 'Jl. Margonda Raya No. 88',
    description: 'Tenda, carrier, dan perlengkapan camping lengkap.',
    rating: 4.6,
    total_transactions: 96,
    is_verified: false,
    status: 'active',
    created_at: '2026-08-10T03:00:00.000Z',
  },
]

const SEED_ITEMS = [
  {
    id: 1,
    store_id: 's-1',
    title: 'Sony Alpha A7 III',
    description: 'Kamera full-frame untuk foto, video, dan kebutuhan event.',
    category: 'photography',
    tags: ['kamera', 'mirrorless', 'sony', 'full-frame'],
    price_per_day: 150000,
    deposit: 500000,
    image_url: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1000&q=80',
    location: 'Jakarta Selatan',
    available: true,
    rating: 4.9,
    total_transactions: 128,
  },
  {
    id: 2,
    store_id: 's-3',
    title: 'PlayStation 5',
    description: 'Konsol lengkap dengan dua controller dan koleksi game pilihan.',
    category: 'gadget',
    tags: ['ps5', 'konsol', 'game', 'playstation'],
    price_per_day: 100000,
    deposit: 750000,
    image_url: 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?auto=format&fit=crop&w=1000&q=80',
    location: 'Jakarta Barat',
    available: true,
    rating: 4.8,
    total_transactions: 203,
  },
  {
    id: 3,
    store_id: 's-4',
    title: 'Camping Tent 4 Orang',
    description: 'Tenda waterproof yang nyaman untuk camping akhir pekan.',
    category: 'sports',
    tags: ['tenda', 'camping', 'outdoor'],
    price_per_day: 75000,
    deposit: 300000,
    image_url: 'https://images.unsplash.com/photo-1522163182402-834f871fd851?auto=format&fit=crop&w=1000&q=80',
    location: 'Depok',
    available: true,
    rating: 4.7,
    total_transactions: 92,
  },
  {
    id: 4,
    store_id: 's-1',
    title: 'DJI Mini Drone',
    description: 'Drone ringan dengan video 4K dan baterai cadangan.',
    category: 'photography',
    tags: ['drone', 'dji', 'aerial', '4k'],
    price_per_day: 220000,
    deposit: 1000000,
    image_url: 'https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=1000&q=80',
    location: 'Jakarta Selatan',
    available: false,
    rating: 4.9,
    total_transactions: 74,
  },
  {
    id: 5,
    store_id: 's-4',
    title: 'Mountain Bike',
    description: 'Sepeda gunung untuk jalur kota dan trail ringan.',
    category: 'sports',
    tags: ['sepeda', 'gunung', 'bike', 'mtb'],
    price_per_day: 90000,
    deposit: 400000,
    image_url: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=1000&q=80',
    location: 'Depok',
    available: true,
    rating: 4.6,
    total_transactions: 58,
  },
  {
    id: 6,
    store_id: 's-2',
    title: 'Projector Epson',
    description: 'Projector terang untuk presentasi dan acara.',
    category: 'event',
    tags: ['projector', 'proyektor', 'epson', 'presentasi'],
    price_per_day: 180000,
    deposit: 600000,
    image_url: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1000&q=80',
    location: 'Jakarta Utara',
    available: true,
    rating: 4.8,
    total_transactions: 81,
  },
  {
    id: 7,
    store_id: 's-2',
    title: 'Sound System Portable',
    description: 'Speaker aktif + mic wireless untuk acara 200 orang.',
    category: 'event',
    tags: ['sound', 'speaker', 'mic', 'audio'],
    price_per_day: 250000,
    deposit: 800000,
    image_url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1000&q=80',
    location: 'Jakarta Utara',
    available: true,
    rating: 4.7,
    total_transactions: 66,
  },
  {
    id: 8,
    store_id: 's-3',
    title: 'Nintendo Switch OLED',
    description: 'Konsol hybrid dengan layar OLED dan Joy-Con neon.',
    category: 'gadget',
    tags: ['switch', 'nintendo', 'konsol', 'game'],
    price_per_day: 85000,
    deposit: 500000,
    image_url: 'https://images.unsplash.com/photo-1578303512597-81e6cc155b3e?auto=format&fit=crop&w=1000&q=80',
    location: 'Jakarta Barat',
    available: true,
    rating: 4.7,
    total_transactions: 119,
  },
]

const SEED_AUDIT_LOGS = [
  {
    id: 'log-1',
    action: 'seed_demo_data',
    target_type: 'system',
    target_id: 'storage.js',
    actor_email: 'system@jabsewa.id',
    payload: { note: 'Inisialisasi data demo awal' },
    ip_address: '127.0.0.1',
    created_at: new Date().toISOString(),
  },
]

/* ------------------------------ Util dasar -------------------------------- */

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage penuh / tidak tersedia — biarkan app tetap jalan (in-memory)
  }
}

/* --------------------------- Inisialisasi seed ---------------------------- */

function seedIfEmpty() {
  const db = readJson(DB_KEY, null)
  if (db && typeof db === 'object' && Array.isArray(db.users) && Array.isArray(db.items)) return db
  const fresh = {
    users: SEED_USERS.map((u) => ({ ...u })),
    stores: SEED_STORES.map((s) => ({ ...s })),
    items: SEED_ITEMS.map((i) => ({ ...i })),
    audit_logs: SEED_AUDIT_LOGS.map((l) => ({ ...l })),
  }
  writeJson(DB_KEY, fresh)
  return fresh
}

// Seed otomatis saat modul dimuat — app tidak pernah kehabisan data.
seedIfEmpty()

/* ------------------------------ Akses "DB" -------------------------------- */

/** Baca seluruh database lokal (selalu berisi users/stores/items/audit_logs). */
export function getDb() {
  return seedIfEmpty()
}

/** Tulis (replace) seluruh database lokal. */
export function setDb(db) {
  writeJson(DB_KEY, db)
}

export function getUsers() {
  return getDb().users || []
}

export function getStores() {
  return getDb().stores || []
}

export function getItems() {
  return getDb().items || []
}

function saveCollection(name, list) {
  const db = getDb()
  db[name] = list
  setDb(db)
}

/** Tambah / perbarui satu user (dicocokkan lewat id, fallback email). */
export function saveUser(user) {
  const users = getUsers()
  const idx = users.findIndex((u) => u.id === user.id || (user.email && u.email === user.email))
  if (idx >= 0) users[idx] = { ...users[idx], ...user }
  else users.push({ id: user.id || `u-${Date.now()}`, ...user })
  saveCollection('users', users)
  return users[idx >= 0 ? idx : users.length - 1]
}

export function upsertStore(store) {
  const stores = getStores()
  const idx = stores.findIndex((s) => s.id === store.id)
  if (idx >= 0) stores[idx] = { ...stores[idx], ...store }
  else stores.push({ id: store.id || `s-${Date.now()}`, ...store })
  saveCollection('stores', stores)
  return stores[idx >= 0 ? idx : stores.length - 1]
}

export function upsertItem(item) {
  const items = getItems()
  const idx = items.findIndex((i) => i.id === item.id)
  if (idx >= 0) items[idx] = { ...items[idx], ...item }
  else items.push({ id: item.id || `i-${Date.now()}`, ...item })
  saveCollection('items', items)
  return items[idx >= 0 ? idx : items.length - 1]
}

export function findStoreById(storeId) {
  return getStores().find((s) => s.id === storeId) || null
}

/** Toko milik seorang user (seller) — dicocokkan lewat owner_id. */
export function findStoreByOwner(userId) {
  if (!userId) return null
  return getStores().find((s) => s.owner_id === userId) || null
}

/** Hapus satu barang dari koleksi items. */
export function deleteItem(itemId) {
  saveCollection(
    'items',
    getItems().filter((i) => i.id !== itemId),
  )
}

/* ------------------------------ Audit log --------------------------------- */

/** Tambah catatan aksi superadmin (maks 200 entri terakhir disimpan). */
export function logAudit({ action, targetType = '', targetId = '', actorEmail = '', payload = {} }) {
  const db = getDb()
  const logs = Array.isArray(db.audit_logs) ? db.audit_logs : []
  logs.unshift({
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action,
    target_type: targetType,
    target_id: String(targetId),
    actor_email: actorEmail,
    payload,
    ip_address: '127.0.0.1',
    created_at: new Date().toISOString(),
  })
  db.audit_logs = logs.slice(0, 200)
  setDb(db)
}

export function getAuditLogs(limit = 100) {
  const logs = getDb().audit_logs || []
  return logs.slice(0, limit)
}

/* --------------------------- Sesi user aktif ------------------------------ */

/** User yang sedang login (null bila guest). */
export function getCurrentUser() {
  return readJson(SESSION_KEY, null)
}

/** Simpan sesi user aktif ke LocalStorage (persist antar refresh). */
export function setCurrentUser(user) {
  if (!user) {
    clearCurrentUser()
    return
  }
  writeJson(SESSION_KEY, user)
}

export function clearCurrentUser() {
  try {
    window.localStorage.removeItem(SESSION_KEY)
  } catch {
    // storage tidak tersedia — abaikan
  }
}

/* ------------------------------ Demo reset -------------------------------- */

/** Hapus seluruh DB lokal + sesi, lalu seed ulang — untuk tombol dev. */
export function resetDemoData() {
  try {
    window.localStorage.removeItem(DB_KEY)
    window.localStorage.removeItem(SESSION_KEY)
    window.localStorage.removeItem('jabsewa:wishlist:v2')
    window.localStorage.removeItem('jabsewa:rentals:v2')
  } catch {
    // abaikan
  }
  seedIfEmpty()
}
