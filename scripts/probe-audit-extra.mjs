#!/usr/bin/env node
// Probe read-only tambahan: trigger, event trigger, tipe kolom kunci, FK kunci.
import { readFileSync, existsSync } from 'node:fs'
import pg from 'pg'

const env = {}
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
}

const c = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: /sslmode=disable/.test(env.DATABASE_URL) ? false : { rejectUnauthorized: false },
})
await c.connect()

const trg = await c.query(`select event_object_schema, event_object_table, trigger_name
  from information_schema.triggers where trigger_schema in ('public','auth') order by 2,3`)
console.log('=== TRIGGERS ===')
for (const t of trg.rows) console.log(`${t.event_object_schema}.${t.event_object_table} → ${t.trigger_name}`)

const ev = await c.query('select evtname as name from pg_event_trigger')
console.log('=== EVENT TRIGGERS ===', ev.rows.map((r) => r.name).join(', '))

const col = await c.query(`select table_name, column_name, udt_name
  from information_schema.columns
  where table_schema='public' and (
    (table_name='users' and column_name in ('role','status','is_seller','id')) or
    (table_name='rental_transactions' and column_name in ('status','start_date','end_date','total','total_days','late_fee_total')) or
    (table_name='listings' and column_name in ('price','deposit','stock','rental_unit','status')))`)
console.log('=== TIPE KOLOM KUNCI ===')
for (const r of col.rows) console.log(`${r.table_name}.${r.column_name} = ${r.udt_name}`)

const fk = await c.query(`select conname, pg_get_constraintdef(oid) as def
  from pg_constraint
  where conrelid='public.rental_transactions'::regclass
     or conrelid='public.users'::regclass
  order by conrelid::regclass::text, conname`)
console.log('=== CONSTRAINT rental_transactions & users ===')
for (const r of fk.rows) console.log(r.conname, ':', r.def)

await c.end()
