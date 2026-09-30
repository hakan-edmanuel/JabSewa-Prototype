#!/usr/bin/env node
// Diagnostik DATABASE_URL — tidak pernah mencetak password.
import { readFileSync, existsSync } from 'node:fs'
import pg from 'pg'

const env = {}
for (const file of ['.env', '.env.local']) {
  if (!existsSync(file)) continue
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
}

const raw = env.DATABASE_URL
if (!raw) {
  console.log('DATABASE_URL: KOSONG')
  process.exit(0)
}

let parsed
try {
  parsed = new URL(raw)
} catch (e) {
  console.log('DATABASE_URL: bukan URL valid —', e.message)
  process.exit(0)
}

const pw = parsed.password || ''
const specials = (pw.match(/[^A-Za-z0-9._~-]/g) || []).length
console.log('host     :', parsed.hostname)
console.log('port     :', parsed.port || '(default)')
console.log('database :', parsed.pathname)
console.log('user     :', parsed.username)
console.log('password :', pw ? `ada (${pw.length} karakter, ${specials} karakter spesial)` : 'TIDAK ADA')
console.log('protokol :', parsed.protocol.replace(':', ''))

const variants = [
  ['apa-adanya (sebagaimana tertulis di .env)', raw],
  ['password di-URL-encode ulang', buildEncoded(raw)],
]

function buildEncoded(cs) {
  // Encode ulang komponen password dengan encodeURIComponent agar %xx ganda tidak terjadi.
  const re = /^(postgresql:\/\/[^:]+):([^@]*)@(.*)$/s
  const m = cs.match(re)
  if (!m) return null
  let decoded = m[2]
  try { decoded = decodeURIComponent(m[2]) } catch { /* pakai apa adanya */ }
  return `${m[1]}:${encodeURIComponent(decoded)}@${m[3]}`
}

let winner = null
for (const [label, cs] of variants) {
  if (!cs) continue
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

if (winner && winner !== raw) {
  let content = readFileSync('.env', 'utf8')
  const re = /^(\s*DATABASE_URL\s*=\s*).*$/m
  if (re.test(content)) {
    content = content.replace(re, `$1${winner}`)
    readFileSync // noop guard
    await import('node:fs').then((fs) => fs.writeFileSync('.env', content))
    console.log('.env   : baris DATABASE_URL diperbarui dengan versi ter-encode.')
  }
} else if (!winner) {
  console.log('KESIMPULAN: password ditolak kedua varian → reset password DB di Dashboard Supabase.')
}
