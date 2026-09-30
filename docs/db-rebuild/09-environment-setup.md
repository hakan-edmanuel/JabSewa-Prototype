# JabSewa — Phase 9: Environment Setup

> Kontrak environment sesuai `04-rpc-security-contract.md` §5.7.
> Dokumen ini adalah satu-satunya referensi variabel lingkungan JabSewa.

## 1. Frontend (Vite, prefix `VITE_`)

| Variabel | Wajib | Isi | Sifat |
|---|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | Origin project Supabase, cth `https://abcdefghijklm.supabase.co` | Publik-safe (terbundle) |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Anon / publishable key dari Dashboard → Settings → API | Publik-safe (terbundle) |

- Salin `.env.example` → `.env.local` (di-gitignore) dan isi keduanya.
- Bila salah satu kosong: `isSupabaseConfigured = false` — seluruh service layer
  melempar error konfigurasi yang jelas. **Tidak ada fallback demo LocalStorage.**
- URL yang ditempel lengkap dengan path (`…/rest/v1/`) dinormalisasi ke origin
  oleh `src/lib/supabaseClient.js` (mencegah error PGRST125).
- Cara memastikan mengarah ke project benar: bandingkan `VITE_SUPABASE_URL`
  dengan dashboard, atau jalankan `npm run verify:supabase` (mencetak URL).

## 2. Variabel yang TIDAK boleh ada di frontend

| Variabel | Kegunaan | Aturan |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | bypass RLS | Hanya tooling server-side tepercaya; tidak pernah di-commit, tidak pernah di-bundle |
| `DATABASE_URL` | koneksi Postgres langsung | Idem; hanya untuk `psql`/tooling lokal operator |

Tidak ada variabel lain yang dibaca aplikasi frontend.

## 3. Bootstrap admin (sekali, manual oleh operator)

Enum role hanya `consumer | admin` (D1) dan tidak ada jalur registrasi admin —
sesuai desain, bootstrap dilakukan via SQL:

1. Jalankan baseline migration di project baru (lihat `06-migration-plan.md`).
2. Daftar akun operator lewat aplikasi (trigger `handle_new_user` membuat
   profil `consumer`).
3. Di SQL Editor:
   ```sql
   UPDATE public.users SET role = 'admin' WHERE email = '<email-operator>';
   ```

Tanpa langkah ini tidak ada admin; sistem default-deny untuk semua fitur admin
(RPC admin mengembalikan `forbidden`).

## 4. Checklist kebocoran secret

- `.env`, `.env.local` ada di `.gitignore` ✅
- `.env.example` hanya berisi nama variabel publik + placeholder ✅
- Tidak ada service-role key / password di `src/` ✅
- Seed data TIDAK berisi password (seed dev hanya kategori produk) ✅
- Tidak ada password fixture di source code: `scripts/test-rental-fixture.mjs`
  membaca env `JABSEWA_FIXTURE_PASSWORD` (shell lokal / `.env.local` — di-gitignore)
  dan menyimpannya hanya di `scripts/.rental-fixture.json` (di-gitignore) ✅
- State fixture & output sementara (`scripts/.rental-fixture.json`,
  `scripts/.audit-out.json`, `scripts/.audit-err.txt`, `scripts/.frontend-e2e-out.txt`,
  `supabase/.temp/`) ter-ignore dan tidak masuk staging ✅
