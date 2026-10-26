#!/usr/bin/env node
/*
 * Laporkan kelas CSS yang tidak pernah dipakai (audit §9 langkah 3).
 *
 * "Dipakai" = nama kelas muncul sebagai substring di src/**\/*.{js,jsx} atau
 * index.html, ATAU cocok dengan prefiks dinamis (`status-${...}` → status-*).
 * Substring dipakai supaya aman: kelas yang hanya disebut di komentar dianggap
 * terpakai (false negative lebih baik daripada menghapus aturan yang dipakai).
 *
 * Jalankan: node scripts/css-dead-classes.mjs [--json]
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const SRC = "src";

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const codeFiles = walk(SRC).filter((f) => [".js", ".jsx"].includes(extname(f)));
const htmlFiles = walk(".").filter((f) => extname(f) === ".html" && !f.includes("node_modules"));
const sourceText = [...codeFiles, ...htmlFiles]
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

/* Prefiks dinamis: teks yang berakhir "-" tepat sebelum interpolasi. */
const dynamicPrefixes = new Set();
for (const match of sourceText.matchAll(/([a-zA-Z0-9_-]+-)\$\{/g)) {
  dynamicPrefixes.add(match[1]);
}

const isUsed = (cls) =>
  sourceText.includes(cls) ||
  [...dynamicPrefixes].some((prefix) => cls.startsWith(prefix));

/* --- Kelas dari CSS --- */
const cssFiles = walk("src/styles").filter((f) => extname(f) === ".css");

function classesInSelector(selector) {
  return [...selector.matchAll(/\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g)].map((m) => m[1]);
}

const all = new Set();
for (const file of cssFiles) {
  const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const selectorRe = /([^{}]+)\{/g;
  let match;
  while ((match = selectorRe.exec(text))) {
    const selector = match[1].trim();
    if (!selector || selector.startsWith("@")) continue;
    for (const cls of classesInSelector(selector)) all.add(cls);
  }
}

const dead = [...all].filter((cls) => !isUsed(cls)).sort();

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ dead, dynamicPrefixes: [...dynamicPrefixes] }, null, 2));
} else {
  console.log(`Kelas CSS: ${all.size} · tidak terpakai: ${dead.length}`);
  console.log(`Prefiks dinamis: ${[...dynamicPrefixes].join(", ") || "—"}`);
  console.log(dead.join("\n"));
}
