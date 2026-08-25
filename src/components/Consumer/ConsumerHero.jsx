export default function ConsumerHero({ onSearch }) {
  const handleSearch = (e) => {
    onSearch(e.target.value);
  };

  return (
    <section style={{ 
      padding: '80px 20px', 
      background: '#ffffff', 
      borderBottom: '1px solid #e5ebf4'
    }}>
      <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
        <h1 style={{ fontSize: '3rem', fontWeight: '800', color: '#0f172a', marginBottom: '20px', lineHeight: '1.2', letterSpacing: '-0.03em' }}>
          Sewa Barang Berkualitas, <br />
          <span style={{ color: '#fbbf24' }}>Lebih Hemat & Praktis.</span>
        </h1>
        
        <p style={{ fontSize: '1.1rem', color: '#475569', marginBottom: '40px', maxWidth: '600px', margin: '0 auto 40px auto', lineHeight: '1.6' }}>
          Dari perlengkapan kamera untuk project akhir pekan hingga tenda untuk camping, temukan semuanya di JabSewa.
        </p>
        
        <div style={{ display: 'flex', gap: '12px', background: 'white', padding: '10px', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '16px', color: '#94a3b8', fontSize: '1.2rem' }}>🔍</div>
          <input
            type="text"
            placeholder="Ketik nama barang, kategori, atau nama penjual..."
            onChange={handleSearch}
            style={{ flex: 1, padding: '14px 16px', border: 'none', background: 'transparent', fontSize: '1.05rem', color: '#334155', outline: 'none' }}
          />
          <button style={{ background: '#fbbf24', color: '#0f172a', border: 'none', padding: '0 40px', borderRadius: '14px', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer', transition: 'transform 0.2s' }}>
            Cari
          </button>
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '24px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Pencarian populer:</span>
          <span style={{ fontSize: '0.85rem', color: '#d97706', background: '#fffbeb', padding: '4px 12px', borderRadius: '999px', cursor: 'pointer', fontWeight: '600' }}>Kamera & Lensa</span>
          <span style={{ fontSize: '0.85rem', color: '#d97706', background: '#fffbeb', padding: '4px 12px', borderRadius: '999px', cursor: 'pointer', fontWeight: '600' }}>Peralatan Camping</span>
          <span style={{ fontSize: '0.85rem', color: '#d97706', background: '#fffbeb', padding: '4px 12px', borderRadius: '999px', cursor: 'pointer', fontWeight: '600' }}>Konsol Game</span>
        </div>
      </div>
    </section>
  );
}