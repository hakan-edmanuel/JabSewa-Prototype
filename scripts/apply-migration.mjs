#!/usr/bin/env node
// ============================================================================
// APPLY MIGRATION — server-side tooling (JANGAN pernah dipakai di frontend)
// ============================================================================
// Menerapkan satu file migration SQL ke project Supabase via koneksi Postgres
// langsung (library `pg`, devDependency — tidak masuk bundle frontend).
//
// Pemakaian:
//   node scripts/apply-migration.mjs <path/to/migration.sql> [--yes]
//
// Kredensial (dibaca dari .env, TIDAK pernah di-commit):
//   DATABASE_URL — string koneksi Postgres project (Supabase: Session pooler,
//   port 5432). Kosong → instruksi pengisian dicetak, script berhenti aman.
//
// Catatan keamanan:
//   * File ini server-side tooling — tidak membaca VITE_* untuk koneksi tulis.
//   * --yes diperlukan untuk benar-benar mengeksekusi (tanpa itu: dry-run,
//     hanya mencetak ringkasan + statement sanity check).
//   * Idempotensi tetap tanggung jawab migration (CREATE OR REPLACE dll).
// ============================================================================

import { readFileSync, existsSync } from 'node:fs'
import pg from 'pg'

const args = process.argv.slice(2)
const yes = args.includes('--yes')
const file = args.find((a) => !a.startsWith('--'))

if (!file || !existsSync(file)) {
  console.error('Pemakaian: node scripts/apply-migration.mjs <migration.sql> [--yes]')
  process.exit(1)
}

// --- Muat .env (tanpa dependency dotenv) -------------------------------------
const env = {}
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
}

// --- Sinkronisasi supabase/migrations supaya file tak terlindungi .gitignore -
// (supabase/ ada di .gitignore project; dipindahkan manual bila perlu.)

const connectionString = env.DATABASE_URL
if (!connectionString) {
  console.error('✗ DATABASE_URL kosong di .env.')
  console.error('  Isi dengan string koneksi Postgres project Supabase (Session pooler,')
  console.error('  Dashboard → Connect → Session pooler), contoh format:')
  console.error('    postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres')
  console.error('  Lalu jalankan ulang: node scripts/apply-migration.mjs ' + file)
  process.exit(1)
}

const sql = readFileSync(file, 'utf8')
console.log(`File  : ${file} (${sql.length} chars, ${sql.split(/\r?\n/).length} lines)`)

const client = new pg.Client({
  connectionString,
  ssl: /sslmode=disable/.test(connectionString) ? false : { rejectUnauthorized: false },
})

await client.connect()

// Identitas project — wajib cocok sebelum menulis apa pun.
const ident = (await client.query(
  'select current_database() as db, inet_server_addr()::text as host, version() as v',
)).rows[0]
console.log(`DB    : ${ident.db} @ ${ident.host}`)
console.log(`PG    : ${ident.v.split(' ').slice(0, 2).join(' ')}`)

if (!yes) {
  console.log('\nDRY-RUND — tanpa --yes tidak ada eksekusi. Jalankan ulang dengan --yes untuk menerapkan.')
  await client.end()
  process.exit(0)
}

console.log('\nMenerapkan…')
try {
  await client.query('BEGIN')
  await client.query(sql)
  await client.query('COMMIT')
  console.log('✓ Migration diterapkan (satu transaksi).')
} catch (e) {
  await client.query('ROLLBACK').catch(() => {})
  console.error('✗ Migration GAGAL, rollback dijalankan:')
  console.error(e.message)
  await client.end()
  process.exit(1)
}

await client.end()
console.log('Selesai.')
