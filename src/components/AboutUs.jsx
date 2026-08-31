export default function AboutUs() {
  return (
    <section className="about-section" id="about">
      <div className="about-page-card">

        {/* Intro */}
        <div className="about-intro">
          <div>
            <p className="about-intro-kicker">Tentang JabSewa</p>
            <h1>Sewa barang, bukan beli cuma buat sekali pakai.</h1>
            <p className="about-lede">
              JabSewa lahir dari hal sederhana: banyak barang di rumah yang cuma
              dipakai sesekali, sementara orang lain sedang butuh barang itu.
              Kami menghubungkan keduanya.
            </p>
          </div>
        </div>

        {/* Small visual strip */}
        <div className="about-photo-strip" aria-hidden="true">
          <div className="about-photo blue">📷</div>
          <div className="about-photo yellow">⛺</div>
          <div className="about-photo">🎮</div>
        </div>

        {/* Why */}
        <div className="about-section-block">
          <p className="about-kicker">Kenapa Ada</p>
          <h2 className="about-block-title">Kenapa JabSewa ada?</h2>
          <p className="about-block-text">
            Pemilik barang dapat penghasilan tambahan dari barang yang jarang
            dipakai. Penyewa tidak perlu beli barang mahal yang hanya dipakai
            sekali. Dua-duanya untung, barang tetap terpakai.
          </p>
        </div>

        {/* Problem */}
        <div className="about-section-block">
          <p className="about-kicker">Masalahnya</p>
          <h2 className="about-block-title">Yang mau kami selesaikan</h2>
          <p className="about-block-text">
            Di Jabodetabek, sewa barang masih sering lewat grup chat dan tanpa
            kejelasan: harga nggak jelas, barang kurang terawat, deposit susah
            ditarik. JabSewa bikin semuanya jelas dari awal.
          </p>
        </div>

        {/* Beliefs */}
        <div className="about-section-block">
          <p className="about-kicker">Prinsip Kami</p>
          <h2 className="about-block-title">Yang kami percaya</h2>
          <div className="about-beliefs-grid">
            <div className="about-belief-item">
              <span className="accent-mark" aria-hidden="true"></span>
              <div>
                <strong>Transparan sejak awal</strong>
                <p>Harga, deposit, dan aturan sewa tertulis jelas di setiap listing.</p>
              </div>
            </div>
            <div className="about-belief-item">
              <span className="accent-mark" aria-hidden="true"></span>
              <div>
                <strong>Barang wajib layak pakai</strong>
                <p>Setiap barang dicek sebelum disewakan. Nggak ada barang seadanya.</p>
              </div>
            </div>
            <div className="about-belief-item">
              <span className="accent-mark" aria-hidden="true"></span>
              <div>
                <strong>Deposit itu amanah</strong>
                <p>Deposit dikembalikan penuh setelah barang dicek ulang.</p>
              </div>
            </div>
            <div className="about-belief-item">
              <span className="accent-mark" aria-hidden="true"></span>
              <div>
                <strong>Sewa itu opsional</strong>
                <p>Nggak semua barang harus dimiliki. Nyoba dulu juga boleh.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Founders */}
        <div className="about-section-block">
          <p className="about-kicker">Siapa di Baliknya</p>
          <h2 className="about-block-title">Founder JabSewa.id</h2>
          <p className="about-block-text">
            JabSewa mulai dari dua orang yang sering kebingungan cari barang
            buat event sekampus — dan akhirnya bikin sendiri.
          </p>
          <div className="about-founders">
            <div className="about-founder-card">
              <div className="about-founder-avatar">H</div>
              <div className="about-founder-info">
                <strong>Hakan Shabran Hutagaol</strong>
                <span>Co-Founder</span>
              </div>
            </div>
            <div className="about-founder-card">
              <div className="about-founder-avatar">A</div>
              <div className="about-founder-info">
                <strong>Ahnaf Samih Al-farisi</strong>
                <span>Co-Founder</span>
              </div>
            </div>
          </div>
          <p className="about-founder-note">
            "Kami bikin JabSewa karena butuh. Kalau kalian juga butuh —
            sewa aja."
          </p>
        </div>

        {/* Closing */}
        <div className="about-closing">
          <p>Barang untuk nyoba atau event. Sewa aja.</p>
          <span>— Tim JabSewa.id</span>
        </div>

      </div>
    </section>
  );
}