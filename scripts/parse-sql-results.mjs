#!/usr/bin/env node
// ============================================================================
// JabSewa MVP V1 — SQL Results Parser
// ============================================================================
// Paste the results from Supabase SQL Editor into a file, then run:
//   node scripts/parse-sql-results.mjs scripts/sql-results.txt
//
// Or pipe directly:
//   cat sql-results.txt | node scripts/parse-sql-results.mjs
//
// The file should contain the results of running audit-schema.sql
// in the Supabase SQL Editor, one query result after another.
// ============================================================================

import { readFileSync } from 'fs';
import { resolve } from 'path';

function parseMarkdownTable(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  // Find header row (contains |)
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('|') && lines[i].trim().startsWith('|')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const headers = lines[headerIdx]
    .split('|')
    .map((h) => h.trim())
    .filter(Boolean);

  // Skip separator row
  const dataStart = headerIdx + 2;
  const rows = [];
  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('|')) break;
    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter((_, idx) => idx > 0 && idx <= headers.length);
    if (cells.length === headers.length) {
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = cells[idx];
      });
      rows.push(row);
    }
  }
  return rows;
}

function main() {
  const inputPath = process.argv[2];
  let text;

  if (inputPath) {
    text = readFileSync(resolve(process.cwd(), inputPath), 'utf-8');
  } else {
    // Read from stdin
    const chunks = [];
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => {
      text = chunks.join('');
      processInput(text);
    });
    return;
  }

  processInput(text);
}

function processInput(text) {
  // Split by query markers (query results are separated by blank lines or headers)
  const sections = text.split(/\n(?=(?:-[─]+\n|={3,}\n))/);

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  JabSewa MVP V1 — Parsed Audit Results                     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const tables = new Map();
  let currentSection = '';

  for (const section of sections) {
    const lines = section.trim().split('\n');
    if (!lines.length) continue;

    // Detect section header
    const headerLine = lines[0];
    if (headerLine.includes('table_name') || headerLine.includes('TABLE')) {
      // Parse as table data
      const rows = parseMarkdownTable(section);
      if (rows.length > 0) {
        processSection(currentSection || 'unknown', rows, tables);
      }
    }

    // Track section names
    if (section.includes('ALL TABLES')) currentSection = 'tables';
    else if (section.includes('ALL COLUMNS')) currentSection = 'columns';
    else if (section.includes('PRIMARY KEY')) currentSection = 'primary_keys';
    else if (section.includes('FOREIGN KEY')) currentSection = 'foreign_keys';
    else if (section.includes('UNIQUE')) currentSection = 'unique_constraints';
    else if (section.includes('CHECK')) currentSection = 'check_constraints';
    else if (section.includes('INDEX')) currentSection = 'indexes';
    else if (section.includes('ENUM')) currentSection = 'enums';
    else if (section.includes('TRIGGER')) currentSection = 'triggers';
    else if (section.includes('ROW LEVEL SECURITY')) currentSection = 'rls_status';
    else if (section.includes('RLS POLICIES')) currentSection = 'rls_policies';
  }

  // Print summary
  console.log('═'.repeat(60));
  console.log('AUDIT SUMMARY');
  console.log('═'.repeat(60));

  if (tables.has('tables')) {
    const t = tables.get('tables');
    console.log(`\n  Tables found: ${t.length}`);
    for (const row of t) {
      console.log(`    - ${row.table_name} (${row.table_type})`);
    }
  }

  if (tables.has('columns')) {
    const grouped = {};
    for (const row of tables.get('columns')) {
      if (!grouped[row.table_name]) grouped[row.table_name] = [];
      grouped[row.table_name].push(row);
    }
    console.log('\n  Columns per table:');
    for (const [table, cols] of Object.entries(grouped)) {
      console.log(`    ${table}: ${cols.length} columns`);
      for (const col of cols) {
        const type = col.character_maximum_length
          ? `${col.data_type}(${col.character_maximum_length})`
          : col.data_type;
        const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        const def = col.column_default ? ` DEFAULT ${col.column_default}` : '';
        console.log(`      - ${col.column_name}: ${type} ${nullable}${def}`);
      }
    }
  }

  if (tables.has('primary_keys')) {
    console.log('\n  Primary Keys:');
    for (const row of tables.get('primary_keys')) {
      console.log(`    ${row.table_name}: ${row.column_name}`);
    }
  }

  if (tables.has('foreign_keys')) {
    console.log('\n  Foreign Keys:');
    for (const row of tables.get('foreign_keys')) {
      console.log(`    ${row.source_table}.${row.source_column} → ${row.target_table}.${row.target_column}`);
    }
  }

  if (tables.has('rls_status')) {
    console.log('\n  RLS Status:');
    for (const row of tables.get('rls_status')) {
      const enabled = row.rls_enabled === 't' || row.rls_enabled === true;
      const forced = row.rls_forced === 't' || row.rls_forced === true;
      console.log(`    ${row.table_name}: enabled=${enabled} forced=${forced}`);
    }
  }

  if (tables.has('rls_policies')) {
    console.log('\n  RLS Policies:');
    for (const row of tables.get('rls_policies')) {
      console.log(`    ${row.tablename}.${row.policyname} (${row.operation})`);
    }
  }
}

function processSection(section, rows, tables) {
  tables.set(section, rows);
}

main();
