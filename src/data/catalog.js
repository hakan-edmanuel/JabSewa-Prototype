/*
 * ============================================================================
 * KATALOG BARANG (mock) — JabSewa
 * ============================================================================
 * Data sementara untuk pengembangan front-end. Saat backend tersedia,
 * ganti sumber data ini dengan panggilan API, contohnya:
 *
 *   fetch('/api/items?category=...&q=...&maxPrice=...')
 *
 * Barang direferensikan lewat `id` oleh wishlist dan pesanan sewa,
 * jadi bentuk item di sini adalah "kontrak" yang harus dijaga.
 * ============================================================================
 */

const IMG = 'https://images.unsplash.com'

export const ITEMS = [
  {
    id: 1,
    name: 'Sony Alpha A7 III',
    category: 'photography',
    price: 150000,
    rating: 4.9,
    reviews: 128,
    image: `${IMG}/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1000&q=80`,
    seller: 'Adit Studio',
    location: 'Jakarta Utara',
    available: true,
    deposit: 500000,
    description: 'Kamera full-frame untuk foto, video, dan kebutuhan event.',
  },
  {
    id: 2,
    name: 'PlayStation 5',
    category: 'gadget',
    price: 100000,
    rating: 4.8,
    reviews: 203,
    image: `${IMG}/photo-1606144042614-b2417e99c4e3?auto=format&fit=crop&w=1000&q=80`,
    seller: 'GameNest',
    location: 'Jakarta Utara',
    available: true,
    deposit: 750000,
    description: 'Konsol lengkap dengan dua controller dan koleksi game pilihan.',
  },
  {
    id: 3,
    name: 'Camping Tent 4 Orang',
    category: 'sports',
    price: 75000,
    rating: 4.7,
    reviews: 92,
    image: `${IMG}/photo-1522163182402-834f871fd851?auto=format&fit=crop&w=1000&q=80`,
    seller: 'TrailBase',
    location: 'Jakarta Selatan',
    available: true,
    deposit: 300000,
    description: 'Tenda waterproof yang nyaman untuk camping akhir pekan.',
  },
  {
    id: 4,
    name: 'DJI Mini Drone',
    category: 'photography',
    price: 220000,
    rating: 4.9,
    reviews: 74,
    image: `${IMG}/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=1000&q=80`,
    seller: 'Skyframe',
    location: 'Depok',
    available: false,
    deposit: 1000000,
    description: 'Drone ringan dengan video 4K dan baterai cadangan.',
  },
  {
    id: 5,
    name: 'Mountain Bike',
    category: 'sports',
    price: 90000,
    rating: 4.6,
    reviews: 58,
    image: `${IMG}/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=1000&q=80`,
    seller: 'Pedal Jakarta',
    location: 'Jakarta Pusat',
    available: true,
    deposit: 400000,
    description: 'Sepeda gunung untuk jalur kota dan trail ringan.',
  },
  {
    id: 6,
    name: 'Projector Epson',
    category: 'event',
    price: 180000,
    rating: 4.8,
    reviews: 81,
    image: `${IMG}/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1000&q=80`,
    seller: 'EventHub',
    location: 'Tangerang',
    available: true,
    deposit: 600000,
    description: 'Projector terang untuk presentasi dan acara.',
  },
]