#!/usr/bin/env node
// ============================================================================
// AUDIT DATABASE — 100% READ-ONLY (JabSewa ERD v2)
// ============================================================================
// Semua query adalah SELECT terhadap pg_catalog / information_schema + COUNT
// katalog. TIDAK ada DDL/DML, TIDAK ada DO block yang menulis, TIDAK ada
// transaksi rental. Kredensial dari .env (DATABASE_URL), password tidak
// pernah dicetak.
// Pakai: node scripts/audit-db-readonly.mjs
// ============================================================================

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
if (!env.DATABASE_URL) {
  console.error('DATABASE_URL kosong — audit langsung tidak bisa dijalankan.')
  process.exit(1)
}

const EXPECTED_TABLES = [
  'users', 'categories', 'store_applications', 'stores', 'listings', 'listing_images',
  'rental_transactions', 'transaction_items', 'payments', 'late_fees', 'disputes',
  'reviews', 'wishlists', 'audit_logs',
]
const EXPECTED_ENUMS = [
  'user_role', 'user_status', 'application_status', 'store_status', 'rental_unit',
  'listing_status', 'transaction_status', 'payment_status', 'payment_method',
  'dispute_status', 'late_fee_status',
]
const RPC_30 = [
  'submit_store_application', 'get_my_applications', 'list_store_applications',
  'decide_store_application', 'get_my_stores', 'update_my_store',
  'set_my_store_status', 'admin_set_store_status', 'save_listing',
  'set_listing_availability', 'delete_listing', 'admin_set_listing_status',
  'get_wishlist', 'toggle_wishlist', 'quote_rental', 'create_rental',
  'cancel_rental', 'submit_payment', 'decide_payment', 'start_rental',
  'mark_overdue', 'record_return', 'apply_late_fee', 'decide_late_fee',
  'open_dispute', 'resolve_dispute', 'create_review',
  'admin_set_user_status', 'admin_set_user_role', 'list_audit_logs',
]
const HELPERS_9 = ['is_admin', 'is_active_user', 'my_store', 'owns_store_of_tx',
  'log_audit', 'occupied_units', 'rental_unit_days', 'refresh_late_fee_total', 'sync_is_seller']
const TRIGGERS_2 = ['handle_new_user', 'touch_updated_at']
const ANON_EXEC_ALLOWED = ['quote_rental', 'is_admin', 'is_active_user']
const TX_TABLES = ['rental_transactions', 'transaction_items', 'payments',
  'late_fees', 'disputes', 'audit_logs']

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: /sslmode=disable/.test(env.DATABASE_URL) ? false : { rejectUnauthorized: false },
})
await client.connect()
const S = (label, sql) => client.query(sql).then((r) => ({ label, rows: r.rows }))

const results = []
for (const [label, sql] of [
  ['identity', `select current_user, session_user, current_database() as db,
      inet_server_addr()::text as host, current_setting('server_version_num') as ver_num,
      current_setting('server_version') as ver`],
  ['migration_tracking', `select table_schema, table_name from information_schema.tables
      where table_name ilike '%migration%' and table_type='BASE TABLE'`],
  ['tables', `select c.relname as table_name, c.relrowsecurity as rls,
      c.relforcerowsecurity as force_rls,
      (select count(*) from information_schema.columns col
        where col.table_schema='public' and col.table_name=c.relname) as column_count
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' order by c.relname`],
  ['columns', `select table_name, column_name, data_type, udt_name, is_nullable, column_default
    from information_schema.columns where table_schema='public'
    order by table_name, ordinal_position`],
  ['constraints', `select conrelid::regclass::text as tbl, conname, contype,
      pg_get_constraintdef(oid) as def
    from pg_constraint
    where connamespace='public'::regnamespace and conrelid <> 0
    order by conrelid::regclass::text, contype, conname`],
  ['enums', `select t.typname as enum, array_agg(e.enumlabel order by e.enumsortorder) as labels
    from pg_type t join pg_enum e on e.enumtypid=t.oid
    join pg_namespace n on n.oid=t.typnamespace
    where n.nspname='public' group by t.typname order by t.typname`],
  ['functions', `select p.proname as name,
      pg_get_function_identity_arguments(p.oid) as args,
      pg_get_function_result(p.oid) as returns,
      l.lanname as language, p.prosecdef as secdef, p.proconfig as config
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    join pg_language l on l.oid=p.prolang
    where n.nspname='public' order by p.proname, args`],
  ['exec_grants', `select p.proname as name, a.grantee::regrole::text as grantee
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    join aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a on true
    where n.nspname='public' order by 1, 2`],
  ['table_grants', `select table_name, grantee,
      string_agg(privilege_type, ',' order by privilege_type) as privs
    from information_schema.role_table_grants
    where table_schema='public' and grantee in ('anon','authenticated','service_role','PUBLIC')
    group by table_name, grantee order by table_name, grantee`],
  ['policies', `select tablename, policyname, cmd, roles::text as roles, permissive
    from pg_policies where schemaname='public' order by tablename, policyname`],
  ['rpc_version_probe', `select p.proname as name,
      regexp_replace(pg_get_functiondef(p.oid), '\\s+', ' ', 'g') like '%RETURN NEXT; RETURN;%' as guard_stop,
      regexp_replace(pg_get_functiondef(p.oid), '\\s+', ' ', 'g') like '%RETURN NEXT;%' as has_return_next
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in
      ('quote_rental','create_rental','toggle_wishlist','submit_store_application','decide_payment')`],
  ['overloads', `select p.proname as name, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in
      ('toggle_wishlist','create_rental','list_audit_logs','get_my_stores','get_wishlist')
    order by 1, 2`],
  ['categories_seed', `select slug from public.categories order by slug`],
  ['counts', `select (select count(*) from public.users) as users,
      (select count(*) from public.stores) as stores,
      (select count(*) from public.listings) as listings,
      (select count(*) from public.rental_transactions) as rentals`],
  ['default_acls', `select d.defaclrole::regrole::text as owner_role, d.defaclobjtype,
      d.defaclacl::text as acl
    from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace
    where n.nspname='public'`],
  ['extensions', `select extname from pg_extension where extname in ('pgcrypto','pgjwt','uuid-ossp')`],
  ['views_in_public', `select table_name as view_name from information_schema.views where table_schema='public'`],
]) {
  const r = await client.query(sql)
  results.push({ label, rows: r.rows })
}

await client.end()

const by = Object.fromEntries(results.map((r) => [r.label, r.rows]))
const out = { generated_at: new Date().toISOString(), read_only: true }

// ── Identitas ────────────────────────────────────────────────────────────────
const id = by.identity[0] || {}
out.identity = {
  current_user: id.current_user, session_user: id.session_user,
  db: id.db, host: id.host,
  pg_version: id.ver,
  project_ref_evidence: [id.current_user, id.session_user]
    .filter(Boolean).find((v) => v.includes('yjwlqqigbzvjbvpwybup')) || null,
}

// ── Migration tracking ───────────────────────────────────────────────────────
out.migration_tracking = {
  tables_found: by.migration_tracking,
  note: 'kosong berarti DB tidak dikelola supabase CLI — status migration disimpulkan dari objek.',
}

// ── Tabel ────────────────────────────────────────────────────────────────────
const tables = by.tables
const have = tables.map((t) => t.table_name)
out.tables = {
  total: tables.length,
  expected_present: EXPECTED_TABLES.filter((t) => have.includes(t)),
  expected_missing: EXPECTED_TABLES.filter((t) => !have.includes(t)),
  unexpected_legacy: tables.filter((t) => !EXPECTED_TABLES.includes(t.table_name)),
  rls_enabled: tables.filter((t) => t.rls).map((t) => t.table_name),
  rls_missing: tables.filter((t) => !t.rls).map((t) => t.table_name),
  force_rls: tables.filter((t) => t.force_rls).map((t) => t.table_name),
}

// ── Enums ────────────────────────────────────────────────────────────────────
const enumNames = by.enums.map((e) => e.enum)
out.enums = {
  found: enumNames, missing: EXPECTED_ENUMS.filter((e) => !enumNames.includes(e)),
  unexpected: enumNames.filter((e) => !EXPECTED_ENUMS.includes(e)),
  detail: by.enums,
}

// ── Constraints (ringkas: PK/FK/UNIQUE/CHECK per tabel) ─────────────────────
const contypeMap = { p: 'PK', f: 'FK', u: 'UNIQUE', c: 'CHECK' }
out.constraints = {}
for (const row of by.constraints) {
  (out.constraints[row.tbl] ??= { PK: [], FK: [], UNIQUE: [], CHECK: [] })
  out.constraints[row.tbl][contypeMap[row.contype]]?.push({ name: row.conname, def: row.def })
}

// ── Fungsi / RPC ─────────────────────────────────────────────────────────────
const fns = by.functions
const fnNames = [...new Set(fns.map((f) => f.name))]
out.functions = {
  total_distinct: fnNames.length,
  rpc30_missing: RPC_30.filter((f) => !fnNames.includes(f)),
  helpers_missing: HELPERS_9.filter((f) => !fnNames.includes(f)),
  trigger_fns_missing: TRIGGERS_2.filter((f) => !fnNames.includes(f)),
  unexpected: fnNames.filter((f) =>
    !RPC_30.includes(f) && !HELPERS_9.includes(f) && !TRIGGERS_2.includes(f)),
  overloads_legacy: by.overloads,
  secdef_without_search_path: fns
    .filter((f) => f.secdef && !(f.config || []).some((c) => c.includes('search_path')))
    .map((f) => `${f.name}(${f.args})`),
  detail: fns,
}

// ── Versi live tiap RPC (deteksi migration guard fix) ───────────────────────
out.rpc_version_probe = by.rpc_version_probe

// ── Grants EXECUTE ───────────────────────────────────────────────────────────
const execBy = {}
for (const g of by.exec_grants) (execBy[g.name] ??= []).push(g.grantee)
out.execute_grants = {
  anon_executes: Object.fromEntries(
    Object.entries(execBy).map(([k, v]) => [k, v.filter((x) => x === 'anon').length && 'anon']).filter(([, v]) => v)),
  anon_outside_contract: Object.keys(execBy)
    .filter((k) => execBy[k].includes('anon') && !ANON_EXEC_ALLOWED.includes(k)),
  detail: execBy,
}

// ── Grants tabel ─────────────────────────────────────────────────────────────
out.table_grants = by.table_grants

// ── Policies ─────────────────────────────────────────────────────────────────
const polBy = {}
for (const p of by.policies) (polBy[p.tablename] ??= []).push(
  { policy: p.policyname, cmd: p.cmd, roles: p.roles, permissive: p.permissive })
const writePoliciesOnTx = by.policies.filter((p) =>
  TX_TABLES.includes(p.tablename) && ['INSERT', 'UPDATE', 'DELETE'].includes(p.cmd))
out.policies = {
  per_table: polBy,
  tables_without_any_policy: have.filter((t) => !polBy[t]),
  write_policies_on_tx_tables: writePoliciesOnTx,
}

// ── Seed & data ringan (COUNT saja) ─────────────────────────────────────────
out.seed_and_counts = {
  categories: by.categories_seed.map((c) => c.slug),
  counts: by.counts[0],
  extensions: by.extensions.map((e) => e.extname),
  views_in_public: by.views_in_public.map((v) => v.view_name),
  default_acls: by.default_acls,
}

console.log(JSON.stringify(out, null, 2))
