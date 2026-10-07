/*
 * ============================================================================
 * PRIVACY CONTENT — Kebijakan Privasi JabSewa
 * ============================================================================
 * Isi mengikuti implementasi aktual aplikasi:
 *   - Autentikasi & database: Supabase (email + password).
 *   - Sesi login disimpan di localStorage browser (key: jabsewa:auth:v1).
 *   - Role/akses diverifikasi server-side (RLS), bukan di perangkat pengguna.
 *   - Hosting: Vercel; metrik kinerja halaman via Speed Insights.
 * JANGAN menambahkan pihak ketiga, analytics, atau payment provider yang
 * belum benar-benar dipakai di aplikasi.
 * ============================================================================
 */

export default function PrivacyContent() {
  return (
    <>
      <section id="pendahuluan" className="legal-section">
        <h2>1. Pendahuluan</h2>
        <p>
          Kebijakan Privasi ini menjelaskan bagaimana platform JabSewa mengumpulkan,
          menggunakan, menyimpan, dan membagikan informasi Pengguna dalam rangka
          penyelenggaraan layanan penyewaan barang antar pengguna.
        </p>
        <p>
          Mohon membaca kebijakan ini dengan seksama. Dengan menggunakan platform,
          Anda dianggap telah memahami dan menyetujui praktik pengolahan data yang
          dijelaskan di sini.
        </p>
      </section>

      <section id="informasi-dikumpulkan" className="legal-section">
        <h2>2. Informasi yang Kami Kumpulkan</h2>
        <p>
          Secara umum, informasi yang kami kumpulkan meliputi:
        </p>
        <ul>
          <li>informasi akun yang Anda berikan saat mendaftar;</li>
          <li>informasi toko dan listing yang Anda buat sebagai Pemilik Barang;</li>
          <li>informasi transaksi sewa yang terjadi melalui platform;</li>
          <li>
            informasi teknis yang diperlukan agar aplikasi dapat berjalan, seperti
            sesi login perangkat Anda.
          </li>
        </ul>
        <p>
          Kami tidak mengumpulkan data melalui pelacakan iklan atau perangkat
          pelacak pihak ketiga pada platform.
        </p>
      </section>

      <section id="informasi-akun" className="legal-section">
        <h2>3. Informasi Akun</h2>
        <p>
          Saat mendaftar dan masuk ke akun, kami memproses alamat email dan kata
          sandi Anda melalui layanan autentikasi Supabase. Kata sandi Anda
          disimpan oleh layanan tersebut dalam bentuk terenkripsi dan tidak dapat
          dibaca oleh kami maupun pengelola platform.
        </p>
        <p>
          Informasi profil dasar yang Anda lengkapi — seperti nama dan nomor
          kontak — ditampilkan sebagaimana diperlukan untuk menjalankan fitur
          platform, misalnya pada halaman profil Anda.
        </p>
      </section>

      <section id="informasi-toko-listing" className="legal-section">
        <h2>4. Informasi Toko dan Listing</h2>
        <p>
          Untuk Pengguna yang mendaftar sebagai Pemilik Barang, kami memproses
          informasi pengajuan toko dan isi listing yang Anda buat — termasuk
          nama toko, deskripsi barang, foto, harga sewa, deposit, dan aturan sewa.
        </p>
        <p>
          Informasi listing ditampilkan di platform agar dapat ditemukan dan
          disewa oleh Pengguna lain. Anda bertanggung jawab memastikan tidak
          memasukkan informasi pribadi yang tidak perlu ke dalam isi listing.
        </p>
      </section>

      <section id="informasi-transaksi" className="legal-section">
        <h2>5. Informasi Transaksi dan Rental</h2>
        <p>
          Ketika Anda melakukan penyewaan, kami memproses data yang diperlukan
          untuk menjalankan transaksi: barang yang disewa, periode sewa, status
          sewa (permintaan, konfirmasi, pengambilan, pengembalian, hingga
          selesai), serta catatan yang Anda dan pihak lainnya buat pada sewa
          tersebut.
        </p>
        <p>
          Data transaksi terkait pembayaran diproses sesuai fitur pembayaran yang
          tersedia pada platform. Apabila di kemudian hari fitur pembayaran
          terintegrasi dengan penyedia pembayaran pihak ketiga, kebijakan ini
          akan diperbarui sesuai implementasinya.
        </p>
      </section>

      <section id="informasi-teknis" className="legal-section">
        <h2>6. Informasi Teknis</h2>
        <p>
          Agar sesi tetap aman, platform menyimpan token sesi login di penyimpanan
          lokal (localStorage) peramban perangkat Anda. Data ini diperlukan agar
          Anda tetap masuk dan tidak perlu login berulang.
        </p>
        <p>
          Platform dijalankan melalui layanan hosting pihak ketiga. Sebagaimana
          lazimnya layanan hosting, informasi teknis standar seperti alamat IP
          dan data permintaan dapat terproses oleh penyedia tersebut untuk
          keperluan penyajian dan keamanan layanan. Platform juga dapat
          mengumpulkan metrik kinerja halaman secara agregat untuk membantu
          perbaikan layanan.
        </p>
      </section>

      <section id="penggunaan-informasi" className="legal-section">
        <h2>7. Bagaimana Informasi Digunakan</h2>
        <p>Informasi yang kami kumpulkan digunakan untuk:</p>
        <ul>
          <li>membuat dan mengelola akun Anda serta menjaga keamanan sesi login;</li>
          <li>menampilkan listing dan memfasilitasi transaksi sewa;</li>
          <li>mengelola status sewa dari permintaan hingga pengembalian barang;</li>
          <li>mempersediasi verifikasi akses Pemilik Barang dan peran pengguna;</li>
          <li>menangani pertanyaan, laporan, dan penyelesaian perselisihan;</li>
          <li>memperbaiki kualitas dan kinerja platform.</li>
        </ul>
        <p>
          Kami tidak menjual data pribadi Anda, dan tidak menggunakannya untuk
          iklan yang ditayangkan oleh pihak ketiga.
        </p>
      </section>

      <section id="penyimpanan-keamanan" className="legal-section">
        <h2>8. Penyimpanan dan Keamanan Data</h2>
        <p>
          Data aplikasi tersimpan pada layanan Supabase. Akses data diatur dengan
          pengaturan keamanan bawaan layanan tersebut, termasuk kebijakan Row
          Level Security, sehingga setiap Pengguna hanya dapat mengakses data
          yang memang diperuntukkan baginya.
        </p>
        <p>
          Koneksi ke platform menggunakan protokol terenkripsi sesuai standar
          penyedia layanan. Meskipun demikian, tidak ada sistem yang sepenuhnya
          bebas risiko, dan kami menganjurkan Anda menjaga kerahasiaan kredensial
          akun Anda.
        </p>
      </section>

      <section id="berbagi-informasi" className="legal-section">
        <h2>9. Berbagi Informasi</h2>
        <p>Kami hanya membagikan informasi sebatas yang diperlukan, kepada:</p>
        <ul>
          <li>
            <strong>Pengguna lain</strong> — sebatas informasi yang memang
            diperlukan untuk jalannya sewa, misalnya nama dan kontak yang
            ditampilkan pada transaksi;
          </li>
          <li>
            <strong>penyedia layanan infrastruktur</strong> yang kami gunakan untuk
            menjalankan platform (autentikasi dan basis data melalui Supabase,
            hosting melalui Vercel);
          </li>
          <li>
            <strong>otoritas berwenang</strong> apabila diwajibkan oleh hukum yang
            berlaku.
          </li>
        </ul>
        <p>
          Kami tidak membagikan data Anda kepada pihak lain untuk tujuan
          pemasaran.
        </p>
      </section>

      <section id="hak-pengguna" className="legal-section">
        <h2>10. Hak dan Pilihan Pengguna</h2>
        <p>
          Sejauh fitur tersedia dan sesuai hukum yang berlaku, Anda dapat:
        </p>
        <ul>
          <li>mengakses dan memperbarui informasi profil melalui halaman profil;</li>
          <li>mengubah isi atau menonaktifkan listing milik Anda;</li>
          <li>keluar dari akun, yang akan menghapus sesi login dari perangkat Anda;</li>
          <li>menghubungi kami untuk permintaan terkait data pribadi Anda.</li>
        </ul>
        <p>
          Salinan data transaksi sewa dapat tetap tersimpan sebatas diperlukan
          untuk menyelesaikan transaksi yang sudah berjalan atau kewajiban lain
          yang berlaku.
        </p>
      </section>

      <section id="cookie-localstorage" className="legal-section">
        <h2>11. Cookie / Local Storage</h2>
        <p>
          Platform tidak menggunakan cookie pelacak atau cookie iklan. Penyimpanan
          lokal peramban (localStorage) digunakan untuk menyimpan sesi login Anda
          sehingga status masuk tetap terjaga antar kunjungan.
        </p>
        <p>
          Anda dapat menghapus data situs — termasuk localStorage — dari
          pengaturan peramban Anda. Perlu diperhatikan bahwa hal itu akan
          mengakhiri sesi login Anda di perangkat tersebut.
        </p>
      </section>

      <section id="retensi" className="legal-section">
        <h2>12. Retensi Data</h2>
        <p>
          Kami menyimpan data sebatas diperlukan untuk menyediakan layanan,
          memenuhi tujuan yang dijelaskan dalam kebijakan ini, serta memenuhi
          kewajiban yang berlaku.
        </p>
        <p>
          Data transaksi sewa disimpan sebagai catatan transaksi antar para pihak.
          Apabila Anda meminta penghapusan data, kami akan memproses sejauh tidak
          bertentangan dengan penyelesaian transaksi yang masih berjalan dan
          ketentuan yang berlaku.
        </p>
      </section>

      <section id="perubahan-kebijakan" className="legal-section">
        <h2>13. Perubahan Kebijakan Privasi</h2>
        <p>
          Kebijakan Privasi ini dapat diperbarui dari waktu ke waktu mengikuti
          perkembangan fitur platform, misalnya ketika fitur pembayaran atau
          layanan pihak ketiga baru diaktifkan.
        </p>
        <p>
          Versi terbaru akan dipublikasikan pada halaman ini beserta tanggal
          pembaruannya. Perubahan penting akan kami usahakan untuk
          diinformasikan melalui platform.
        </p>
      </section>

      <section id="kontak" className="legal-section">
        <h2>14. Kontak</h2>
        <p>
          Pertanyaan atau permintaan terkait kebijakan privasi ini dapat
          disampaikan melalui:
        </p>
        <ul>
          <li>
            Email: <span className="legal-placeholder">JabsewaOfficial@gmail.com</span>
          </li>
          <li>
            Consumer Help: <span className="legal-placeholder">Jabsewa_com</span>
          </li>
        </ul>
      </section>
    </>
  )
}
