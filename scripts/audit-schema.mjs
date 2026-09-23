#!/usr/bin/env node
// ============================================================================
// JabSewa MVP V1 — Database Audit Script (READ-ONLY)
// ============================================================================
// Uses native fetch (Node 18+) to query the Supabase REST API.
// Discovers tables, columns, and basic schema via OpenAPI introspection.
//
// Usage:
//   1. Create .env in project root with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
//   2. Run: node scripts/audit-schema.mjs
//   3. For full audit: also run audit-schema.sql in Supabase SQL Editor
//
// This script is READ-ONLY. It does not modify any data or schema.
// ============================================================================

import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Load .env manually (no dotenv dependency) ──────────────────────────────
function loadEnv() {
  const envPath = resolve(process.cwd(), '.env');
  try {
    const lines = readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env not found — rely on shell env vars
  }
}

loadEnv();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(`
╔══════════════════════════════════════════════════════════════╗
║  Missing environment variables                              ║
║                                                              ║
║  Create .env in project root with:                           ║
║    VITE_SUPABASE_URL=https://YOUR_REF.supabase.co            ║
║    VITE_SUPABASE_ANON_KEY=your-anon-key                      ║
║                                                              ║
║  Or export them in your shell before running this script.    ║
╚══════════════════════════════════════════════════════════════╝
`);
  process.exit(1);
}

// ── REST helpers ───────────────────────────────────────────────────────────

async function supabaseGet(path, headers = {}) {
  const url = `${SUPABASE_URL}${path}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      ...headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} for ${path}: ${text}`);
  }
  return res.json();
}

// ── Discover tables via PostgREST schema introspection ─────────────────────

async function discoverViaOpenAPI() {
  console.log('\n🔍 Querying Supabase OpenAPI schema...\n');

  try {
    const spec = await supabaseGet('/rest/v1/', {
      Accept: 'application/openapi+json',
    });

    const tables = {};
    const paths = spec.paths || {};

    for (const [pathKey, pathObj] of Object.entries(paths)) {
      // PostgREST paths look like /rest/v1/{table_name}
      const match = pathKey.match(/^\/rest\/v1\/([^/]+)$/);
      if (!match) continue;
      const tableName = match[1];

      // Skip system tables
      if (tableName.startsWith('rpc/')) continue;

      const getOp = pathObj.get;
      if (!getOp) continue;

      const schema = getOp.parameters?.find(
        (p) => p.name === 'select' || p.in === 'header'
      );

      // Try to discover columns by querying with select=*
      try {
        const data = await supabaseGet(`/rest/v1/${tableName}?select=*&limit=0`, {
          Prefer: 'count=exact',
        });

        // Even with limit=0, headers may contain count
        tables[tableName] = { discovered: true, sampleData: data };
      } catch (e) {
        // Table might have RLS blocking access
        tables[tableName] = { discovered: true, rlsBlocked: true, error: e.message };
      }
    }

    return { spec, tables };
  } catch (e) {
    console.error(`  ⚠️  OpenAPI introspection failed: ${e.message}`);
    return { spec: null, tables: {} };
  }
}

// ── Discover tables by probing known table names ───────────────────────────

async function probeTable(tableName) {
  try {
    const data = await supabaseGet(`/rest/v1/${tableName}?select=*&limit=1`);
    return { exists: true, accessible: true, rowCount: data.length, sample: data[0] || null };
  } catch (e) {
    if (e.message.includes('404') || e.message.includes('Not Found')) {
      return { exists: false, accessible: false };
    }
    if (e.message.includes('403') || e.message.includes('Forbidden')) {
      return { exists: true, accessible: false, rlsBlocked: true };
    }
    return { exists: false, accessible: false, error: e.message };
  }
}

// ── Expected tables based on frontend code analysis ────────────────────────

const EXPECTED_TABLES = [
  'users',
  'stores',
  'store_applications',
  'listings',
  'categories',
  'rental_transactions',
  'wishlists',
  'reviews',
  'payments',
  'notifications',
];

// ── Main audit ─────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  JabSewa MVP V1 — Database Audit (READ-ONLY)               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\n  Project: ${SUPABASE_URL}`);

  // Step 1: OpenAPI introspection
  const { spec, tables: discoveredTables } = await discoverViaOpenAPI();

  if (spec) {
    console.log('\n📋 OpenAPI Schema Info:');
    console.log(`   Title: ${spec.info?.title || 'N/A'}`);
    console.log(`   Version: ${spec.info?.version || 'N/A'}`);
    console.log(`   Paths found: ${Object.keys(spec.paths || {}).length}`);
  }

  // Step 2: Display discovered tables
  const tableNames = Object.keys(discoveredTables);
  console.log(`\n📊 Tables discovered via REST API: ${tableNames.length}`);
  for (const name of tableNames.sort()) {
    const info = discoveredTables[name];
    const status = info.rlsBlocked ? '🔒 RLS blocked' : info.accessible !== false ? '✅ Accessible' : '❌ Not found';
    console.log(`   ${status}  ${name}`);
  }

  // Step 3: Probe expected tables
  console.log('\n🔍 Probing expected tables from frontend analysis...');
  for (const tableName of EXPECTED_TABLES) {
    if (!discoveredTables[tableName]) {
      const result = await probeTable(tableName);
      discoveredTables[tableName] = result;
      const status = result.rlsBlocked ? '🔒 Exists (RLS blocked)' : result.exists ? '✅ Exists' : '❌ Not found';
      console.log(`   ${status}  ${tableName}`);
    }
  }

  // Step 4: Discover columns from sample data
  console.log('\n📐 Column discovery from accessible tables...');
  const columnsReport = {};
  for (const [name, info] of Object.entries(discoveredTables)) {
    if (info.sample) {
      const cols = Object.keys(info.sample);
      columnsReport[name] = cols;
      console.log(`   ${name}: ${cols.join(', ')}`);
    } else if (info.rlsBlocked) {
      console.log(`   ${name}: [RLS blocked — run SQL audit for column details]`);
    } else if (!info.exists) {
      console.log(`   ${name}: [does not exist]`);
    }
  }

  // Step 5: Generate summary
  console.log('\n' + '═'.repeat(60));
  console.log('SUMMARY');
  console.log('═'.repeat(60));

  const existing = Object.entries(discoveredTables).filter(([, i]) => i.exists !== false);
  const missing = EXPECTED_TABLES.filter((t) => !discoveredTables[t] || discoveredTables[t].exists === false);
  const rlsBlocked = Object.entries(discoveredTables).filter(([, i]) => i.rlsBlocked);

  console.log(`\n  Tables discovered (REST): ${tableNames.length}`);
  console.log(`  Tables accessible:        ${existing.filter(([, i]) => i.accessible !== false).length}`);
  console.log(`  Tables RLS-blocked:       ${rlsBlocked.length}`);
  console.log(`  Expected but missing:     ${missing.length}`);
  if (missing.length) {
    console.log(`    → ${missing.join(', ')}`);
  }

  console.log('\n⚠️  REST API can only discover EXPOSED tables (public schema, no RLS restriction).');
  console.log('   For a COMPLETE audit, run audit-schema.sql in Supabase SQL Editor.\n');

  // Output JSON for programmatic use
  const report = {
    timestamp: new Date().toISOString(),
    project: SUPABASE_URL,
    discoveredTables: Object.fromEntries(
      Object.entries(discoveredTables).map(([k, v]) => [
        k,
        { exists: v.exists, accessible: v.accessible, rlsBlocked: !!v.rlsBlocked, columns: columnsReport[k] || [] },
      ])
    ),
    expectedTables: EXPECTED_TABLES,
    missingTables: missing,
  };

  const reportPath = resolve(process.cwd(), 'scripts', 'audit-report.json');
  const { writeFileSync } = await import('fs');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`📄 JSON report saved to: ${reportPath}`);
}

main().catch((e) => {
  console.error('\n❌ Audit failed:', e.message);
  process.exit(1);
});
