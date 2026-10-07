/*
 * ============================================================================
 * TERMS CONTENT — Syarat & Ketentuan JabSewa
 * ============================================================================
 * Konten dipisah dari layout agar mudah dirawat. Semua ketentuan bisnis yang
 * BELUM diputuskan (metode pembayaran aktif, nominal denda, kebijakan refund)
 * sengaja ditulis dengan wording aman — JANGAN menambahkan angka/klaim yang
 * belum didukung keputusan bisnis.
 * ============================================================================
 */

export default function TermsContent() {
  return (
    <>
      <section id="pendahuluan" className="legal-section">
        <h2>1. Pendahuluan</h2>
        <p>
          Selamat datang di JabSewa. Syarat &amp; Ketentuan ini mengatur penggunaan
          platform JabSewa — layanan yang menghubungkan pemilik barang dengan
          penyewa barang di area Jabodetabek dan sekitarnya.
        </p>
        <p>
          Dengan mendaftar, mengakses, atau menggunakan platform JabSewa, Anda
          dianggap telah membaca, memahami, dan menyetujui Syarat &amp; Ketentuan
          ini. Jika Anda tidak menyetujui ketentuan manapun di dalamnya, mohon
          untuk tidak menggunakan platform ini.
        </p>
        <p>
          Dokumen ini merupakan ketentuan penggunaan platform versi awal dan dapat
          diperbarui dari waktu ke waktu sebagaimana diatur pada bagian
          Perubahan Syarat &amp; Ketentuan.
        </p>
      </section>

      <section id="definisi" className="legal-section">
        <h2>2. Definisi</h2>
        <ul>
          <li>
            <strong>Platform</strong> berarti aplikasi dan situs web JabSewa beserta
            seluruh fitur yang tersedia di dalamnya.
          </li>
          <li>
            <strong>Kami</strong> berarti pihak yang mengelola dan mengoperasikan
            platform JabSewa.
          </li>
          <li>
            <strong>Pengguna</strong> berarti setiap orang yang mengakses atau
            menggunakan platform, baik sebagai Penyewa, Pemilik Barang, maupun
            pengunjung.
          </li>
          <li>
            <strong>Penyewa</strong> berarti pengguna yang menyewa barang melalui
            platform.
          </li>
          <li>
            <strong>Pemilik Barang (Seller)</strong> berarti pengguna yang menawarkan
            barang untuk disewakan melalui platform.
          </li>
          <li>
            <strong>Listing</strong> berarti tampilan informasi sebuah barang yang
            disewakan, mencakup deskripsi, foto, harga sewa, deposit, dan aturan
            sewa yang ditetapkan Pemilik Barang.
          </li>
          <li>
            <strong>Transaksi Sewa</strong> berarti kesepakatan penyewaan barang
            antara Penyewa dan Pemilik Barang yang difasilitasi melalui platform.
          </li>
        </ul>
      </section>

      <section id="akun" className="legal-section">
        <h2>3. Akun Pengguna</h2>
        <p>
          Untuk melakukan penyewaan atau menawarkan barang, Anda perlu membuat akun
          pada platform. Saat membuat akun, Anda wajib memberikan informasi yang
          benar, akurat, dan terkini.
        </p>
        <p>
          Anda bertanggung jawab untuk menjaga kerahasiaan kredensial akun Anda
          dan untuk seluruh aktivitas yang terjadi melalui akun tersebut.
          Segera hubungi kami apabila Anda menduga terjadi penggunaan akun tanpa
          izin.
        </p>
        <p>
          Satu orang hanya diperbolehkan memiliki satu akun pengguna. Akun tidak
          boleh dipindahtangankan kepada pihak lain.
        </p>
      </section>

      <section id="penggunaan-platform" className="legal-section">
        <h2>4. Penggunaan Platform</h2>
        <p>
          Platform hanya boleh digunakan untuk tujuan yang sah sesuai dengan
          fungsi dan fitur yang tersedia, yaitu mencari, menawarkan, dan
          mengelola penyewaan barang.
        </p>
        <p>
          Anda setuju untuk tidak menggunakan platform dengan cara yang dapat
          mengganggu, membebani, atau merusak layanan, serta tidak melakukan
          aktivitas yang dilarang sebagaimana diatur pada bagian Aktivitas yang
          Dilarang.
        </p>
        <p>
          Sebagian fitur mungkin memerlukan verifikasi atau persetujuan tertentu
          sebelum dapat digunakan, misalnya akses sebagai Pemilik Barang yang
          diberikan setelah pengajuan disetujui.
        </p>
      </section>

      <section id="listing" className="legal-section">
        <h2>5. Listing / Barang yang Disewakan</h2>
        <p>
          Pemilik Barang bertanggung jawab penuh atas keakuratan informasi pada
          listing yang dibuatnya, termasuk deskripsi, kondisi barang, foto, harga
          sewa, deposit, dan aturan sewa yang ditetapkan.
        </p>
        <p>
          Barang yang ditawarkan harus layak pakai, dimiliki secara sah oleh
          Pemilik Barang, dan bukan barang yang dilarang untuk disewakan berdasarkan
          hukum yang berlaku. Kami dapat menonaktifkan listing yang tidak sesuai
          dengan ketentuan platform.
        </p>
        <p>
          Daftar kategori dan jenis barang yang diperbolehkan mengikuti ketentuan
          yang berlaku pada platform dan dapat diperbarui dari waktu ke waktu.
        </p>
      </section>

      <section id="proses-penyewaan" className="legal-section">
        <h2>6. Proses Penyewaan</h2>
        <p>
          Penyewaan dimulai ketika Penyewa memilih barang dan periode sewa pada
          sebuah listing, kemudian mengajukan permintaan sewa kepada Pemilik
          Barang.
        </p>
        <p>
          Penyewaan baru berlaku setelah permintaan disetujui dan status sewa
          dikonfirmasi melalui platform. Alur status sewa (permintaan,
          konfirmasi, pengambilan, pengembalian, hingga selesai) mengikuti fitur
          yang tersedia pada platform.
        </p>
        <p>
          Penyewa dan Pemilik Barang wajib menindaklanjuti setiap tahap sewa
          melalui platform agar status transaksi selalu tercatat dengan benar.
        </p>
      </section>

      <section id="pembayaran" className="legal-section">
        <h2>7. Pembayaran</h2>
        <p>
          Total biaya sewa beserta komponen biaya lainnya ditampilkan pada detail
          listing dan ringkasan sewa sebelum transaksi dilanjutkan, sesuai fitur
          yang tersedia pada saat transaksi.
        </p>
        <p>
          Metode pembayaran yang dapat digunakan mengikuti pilihan yang tersedia
          pada platform pada saat transaksi dilakukan. Apabila fitur pembayaran
          tertentu belum tersedia, penyelesaian pembayaran mengikuti kesepakatan
          antara Penyewa dan Pemilik Barang sejauh tidak melanggar ketentuan
          platform dan hukum yang berlaku.
        </p>
        <p>
          Kebijakan mengenai deposit, penahanan dana, dan pencairan hasil sewa
          mengikuti ketentuan yang berlaku pada platform dan akan diinformasikan
          kepada Pengguna melalui platform.
        </p>
      </section>

      <section id="pengambilan-pengembalian" className="legal-section">
        <h2>8. Pengambilan dan Pengembalian Barang</h2>
        <p>
          Penyewa dan Pemilik Barang wajib menyepakati serta melaksanakan
          pengambilan dan pengembalian barang sesuai periode sewa yang tercatat
          pada platform.
        </p>
        <p>
          Pada saat serah terima, kedua pihak dianjurkan memeriksa kondisi barang
          bersama-sama. Catatan kondisi barang, apabila tersedia fiturnya, dapat
          dilampirkan melalui platform.
        </p>
        <p>
          Penyewa bertanggung jawab menjaga barang selama masa sewa dan
          mengembalikannya dalam kondisi yang sama seperti saat diterima, kecuali
          keausan wajar akibat pemakaian sesuai peruntukan.
        </p>
      </section>

      <section id="keterlambatan" className="legal-section">
        <h2>9. Keterlambatan dan Biaya Tambahan</h2>
        <p>
          Apabila Penyewa mengembalikan barang melewati periode sewa yang
          disepakati, Pemilik Barang berhak mengajukan penyelesaian keterlambatan
          melalui platform.
        </p>
        <p>
          Biaya keterlambatan, apabila ditetapkan, mengikuti ketentuan yang
          tertulis pada listing terkait atau kesepakatan kedua belah pihak, dan
          besarnya mengikuti ketentuan yang berlaku pada platform — bukan dari
          kesepakatan di luar pengetahuan platform.
        </p>
      </section>

      <section id="pembatalan" className="legal-section">
        <h2>10. Pembatalan</h2>
        <p>
          Pembatalan sewa oleh Penyewa atau Pemilik Barang mengikuti fitur
          pembatalan yang tersedia pada platform beserta alasan yang diminta.
        </p>
        <p>
          Konsekuensi pembatalan — termasuk kemungkinan pengembalian dana —
          mengikuti ketentuan yang berlaku pada platform dan status sewa pada
          saat pembatalan dilakukan. Kami belum menetapkan kebijakan pengembalian
          dana yang seragam untuk seluruh kasus, sehingga penyelesaiannya
          mengikuti kesepakatan para pihak dan ketentuan yang berlaku pada saat
          kejadian.
        </p>
      </section>

      <section id="perselisihan" className="legal-section">
        <h2>11. Perselisihan / Dispute</h2>
        <p>
          Apabila terjadi perselisihan antara Penyewa dan Pemilik Barang, kedua
          pihak terlebih dahulu wajib mengupayakan penyelesaian secara musyawarah
          dan beritikad baik.
        </p>
        <p>
          Apabila penyelesaian tidak tercapai, para pihak dapat melaporkan
          perselisihan kepada kami melalui saluran kontak yang tersedia pada
          platform. Kami dapat membantu memfasilitasi komunikasi berdasarkan
          catatan transaksi yang tersedia pada platform, tanpa menggantikan
          kesepakatan yang telah dibuat para pihak.
        </p>
      </section>

      <section id="tanggung-jawab" className="legal-section">
        <h2>12. Tanggung Jawab Pengguna</h2>
        <p>
          Setiap Pengguna bertanggung jawab atas seluruh aktivitas yang dilakukan
          melalui akunnya, termasuk kebenaran informasi yang diberikan dan
          pemenuhan kewajiban yang timbul dari transaksi sewa.
        </p>
        <p>
          Pemilik Barang bertanggung jawab atas kelaikan dan keabsahan barang
          yang disewakan. Penyewa bertanggung jawab atas pemakaian barang sesuai
          peruntukan dan pengembalian barang tepat waktu.
        </p>
        <p>
          Setiap Pengguna bertanggung jawab mematuhi hukum yang berlaku, termasuk
          kewajiban perpajakan yang mungkin timbul dari pendapatan sewa.
        </p>
      </section>

      <section id="aktivitas-dilarang" className="legal-section">
        <h2>13. Aktivitas yang Dilarang</h2>
        <p>Dalam menggunakan platform, Pengguna dilarang:</p>
        <ul>
          <li>menawarkan barang yang tidak dimiliki secara sah atau dilarang oleh hukum;</li>
          <li>memberikan informasi palsu, menyesatkan, atau menyalahgunakan identitas pihak lain;</li>
          <li>mengalihkan transaksi sewa keluar platform dengan tujuan menghindari ketentuan platform;</li>
          <li>mengganggu, menguji, atau mencoba mengakses sistem platform secara tidak sah;</li>
          <li>menggunakan platform untuk kegiatan penipuan, penggelapan, atau hal yang melanggar hukum;</li>
          <li>melakukan tindakan yang merugikan Pengguna lain atau mencemarkan nama baik platform.</li>
        </ul>
      </section>

      <section id="penangguhan-akun" className="legal-section">
        <h2>14. Penangguhan atau Penghentian Akun</h2>
        <p>
          Kami dapat menonaktifkan, menangguhkan, atau menghentikan akses akun
          Pengguna yang diduga melanggar Syarat &amp; Ketentuan ini, membahayakan
          Pengguna lain, atau digunakan untuk tujuan yang melanggar hukum.
        </p>
        <p>
          Sejauh memungkinkan, kami akan memberikan pemberitahuan mengenai
          tindakan tersebut beserta alasannya melalui saluran yang tersedia.
          Ketentuan yang secara sifatnya seharusnya berlaku setelah akun
          dihentikan akan tetap berlaku, termasuk kewajiban yang timbul dari
          transaksi yang sudah berjalan.
        </p>
      </section>

      <section id="batasan-tanggung-jawab" className="legal-section">
        <h2>15. Batasan Tanggung Jawab</h2>
        <p>
          Platform berfungsi sebagai penghubung antara Penyewa dan Pemilik
          Barang. Kami tidak menjadi pihak yang menguasai barang yang disewakan,
          dan barang itu sendiri tetap merupakan tanggung jawab Pemilik Barang
          selama listing aktif serta tanggung jawab bersama para pihak selama
          masa sewa.
        </p>
        <p>
          Platform disediakan sebagaimana adanya, sesuai fitur yang tersedia.
          Sejauh diizinkan oleh hukum yang berlaku, kami tidak bertanggung jawab
          atas kerugian tidak langsung yang timbul dari penggunaan platform,
          termasuk keterlambatan atau kegagalan layanan akibat hal di luar
          kendali kami.
        </p>
        <p>
          Batasan tanggung jawab ini tidak mengurangi hak-hak Pengguna yang
          dijamin oleh hukum yang berlaku.
        </p>
      </section>

      <section id="perubahan" className="legal-section">
        <h2>16. Perubahan Syarat &amp; Ketentuan</h2>
        <p>
          Kami dapat memperbarui Syarat &amp; Ketentuan ini dari waktu ke waktu
          seiring dengan perkembangan fitur dan ketentuan platform.
        </p>
        <p>
          Versi terbaru akan dipublikasikan pada halaman ini beserta tanggal
          pembaruannya. Penggunaan platform secara berkelanjutan setelah perubahan
          dipublikasikan dianggap sebagai persetujuan terhadap versi terbaru.
        </p>
      </section>

      <section id="kontak" className="legal-section">
        <h2>17. Kontak</h2>
        <p>
          Pertanyaan mengenai Syarat &amp; Ketentuan ini dapat disampaikan melalui:
        </p>
        <ul>
          <li>
            Email: <span className="legal-placeholder">[EMAIL KONTAK JABSEWA]</span>
          </li>
        </ul>
      </section>
    </>
  )
}
