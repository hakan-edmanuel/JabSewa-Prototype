#!/usr/bin/env node
// Perbaiki DATABASE_URL: uji varian koneksi, tulis kembali varian yang SUKSES.
// Tidak pernah mencetak password.
import { readFileSync, writeFileSync } from 'node:fs'
import pg from 'pg'

const content = readFileSync('.env', 'utf8')
const lineRe = /^(\s*DATABASE_URL\s*=\s*)(.*)$/m
const m = content.match(lineRe)
if (!m) {
  console.log('DATABASE_URL tidak ditemukan di .env')
  process.exit(1)
}
const raw = m[2].replace(/^["']|["']$/g, '').trim()

// Parse longgar: scheme://user:password@host:port/db (host boleh hilang @)
const loose = raw.match(/^(postgresql:\/\/)([^:@/]+):([^@]*)(@?)(.*)$/)
if (!loose) {
  console.log('Format tidak dikenali — tidak bisa menyusun varian.')
  process.exit(1)
}

const [, scheme, user, passPart, , restPart] = loose
// Password: buang kurung siku pembungkus bila ada
let pw = passPart
if (pw.startsWith('[') && pw.endsWith(']')) {
  console.log('Varian: kurung siku pembungkus password dibuang.')
  pw = pw.slice(1, -1)
}
// Host: restPart bisa "aws-...com:5432/postgres" (@ hilang) atau "/aws-..." bila @ ada
let hostPortDb = restPart
if (restPart.startsWith('/')) hostPortDb = restPart.slice(1)

const candidates = [
  ['tanpa kurung siku', `${scheme}${user}:${encodeURIComponent(pw)}@${hostPortDb}`],
  ['password apa adanya (tanpa encode)', `${scheme}${user}:${pw}@${hostPortDb}`],
  ['dengan kurung siku + @', `${scheme}${user}:${encodeURIComponent(passPart)}@${hostPortDb}`],
]

let winner = null
for (const [label, cs] of candidates) {
  const c = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } })
  try {
    await c.connect()
    await c.query('select 1')
    console.log('SUKSES :', label)
    if (!winner) winner = cs
    await c.end()
  } catch (e) {
    console.log('GAGAL  :', label, '—', e.message)
    try { await c.end() } catch { /* noop */ }
  }
}

if (!winner) {
  console.log('\nTidak ada varian yang berhasil → password benar-benar salah.')
  console.log('Reset password DB: Dashboard Supabase → Settings → Database → Reset database password,')
  console.log('lalu perbarui DATABASE_URL dengan string Session pooler yang baru.')
  process.exit(1)
}

// Masked preview tanpa password
console.log('\nString yang dipakai (password disamarkan):')
console.log(winner.replace(/(\/\/[^:]+:)([^@]*)@/, '$1***@'))

const newContent = content.replace(lineRe, `$1${winner}`)
writeFileSync('.env', newContent)
console.log('.env : DATABASE_URL diperbarui dengan varian yang berhasil.')
