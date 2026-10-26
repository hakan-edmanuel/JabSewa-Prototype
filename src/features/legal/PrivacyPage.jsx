import InfoPageLayout from './InfoPageLayout'
import PrivacyContent from './PrivacyContent'

const TOC = [
  { id: 'pendahuluan', label: 'Pendahuluan' },
  { id: 'informasi-dikumpulkan', label: 'Informasi yang Kami Kumpulkan' },
  { id: 'informasi-akun', label: 'Informasi Akun' },
  { id: 'informasi-toko-listing', label: 'Informasi Toko dan Listing' },
  { id: 'informasi-transaksi', label: 'Informasi Transaksi dan Rental' },
  { id: 'informasi-teknis', label: 'Informasi Teknis' },
  { id: 'penggunaan-informasi', label: 'Bagaimana Informasi Digunakan' },
  { id: 'penyimpanan-keamanan', label: 'Penyimpanan dan Keamanan Data' },
  { id: 'berbagi-informasi', label: 'Berbagi Informasi' },
  { id: 'hak-pengguna', label: 'Hak dan Pilihan Pengguna' },
  { id: 'cookie-localstorage', label: 'Cookie / Local Storage' },
  { id: 'retensi', label: 'Retensi Data' },
  { id: 'perubahan-kebijakan', label: 'Perubahan Kebijakan Privasi' },
  { id: 'kontak', label: 'Kontak' },
]

export default function PrivacyPage({ onNavigate }) {
  return (
    <InfoPageLayout
      kicker="Legal"
      title="Kebijakan Privasi"
      updated="1 Oktober 2026"
      toc={TOC}
      onNavigate={onNavigate}
    >
      <PrivacyContent />
    </InfoPageLayout>
  )
}
