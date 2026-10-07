import InfoPageLayout from '../components/legal/InfoPageLayout'
import TermsContent from '../components/legal/TermsContent'

const TOC = [
  { id: 'pendahuluan', label: 'Pendahuluan' },
  { id: 'definisi', label: 'Definisi' },
  { id: 'akun', label: 'Akun Pengguna' },
  { id: 'penggunaan-platform', label: 'Penggunaan Platform' },
  { id: 'listing', label: 'Listing / Barang yang Disewakan' },
  { id: 'proses-penyewaan', label: 'Proses Penyewaan' },
  { id: 'pembayaran', label: 'Pembayaran' },
  { id: 'pengambilan-pengembalian', label: 'Pengambilan dan Pengembalian Barang' },
  { id: 'keterlambatan', label: 'Keterlambatan dan Biaya Tambahan' },
  { id: 'pembatalan', label: 'Pembatalan' },
  { id: 'perselisihan', label: 'Perselisihan / Dispute' },
  { id: 'tanggung-jawab', label: 'Tanggung Jawab Pengguna' },
  { id: 'aktivitas-dilarang', label: 'Aktivitas yang Dilarang' },
  { id: 'penangguhan-akun', label: 'Penangguhan atau Penghentian Akun' },
  { id: 'batasan-tanggung-jawab', label: 'Batasan Tanggung Jawab' },
  { id: 'perubahan', label: 'Perubahan Syarat & Ketentuan' },
  { id: 'kontak', label: 'Kontak' },
]

export default function TermsPage({ onNavigate }) {
  return (
    <InfoPageLayout
      kicker="Legal"
      title="Syarat & Ketentuan"
      updated="1 Oktober 2026"
      toc={TOC}
      onNavigate={onNavigate}
    >
      <TermsContent />
    </InfoPageLayout>
  )
}
