#!/usr/bin/env node
/*
 * Hapus aturan CSS yang selector-nya hanya menunjuk kelas tak terpakai
 * (audit §9 langkah 3). Selector gabungan (`.dead, .alive`) hanya kehilangan
 * bagian `.dead`.
 *
 * Daftar kelas mati berasal dari scripts/css-dead-classes.mjs.
 * Jalankan: node scripts/css-prune-dead.mjs [--write]
 * Tanpa --write hanya melaporkan jumlah aturan yang akan dihapus.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { execFileSync } from "node:child_process";

const WRITE = process.argv.includes("--write");
const { dead } = JSON.parse(
  execFileSync(process.execPath, ["scripts/css-dead-classes.mjs", "--json"], {
    encoding: "utf8",
  }),
);
const deadSet = new Set(dead);

/* Pecah berkas menjadi node { prelude, body } dengan pencocokan kurawal. */
function parseNodes(text) {
  const nodes = [];
  let i = 0;
  let prelude = "";
  while (i < text.length) {
    const ch = text[i];
    if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end === -1 ? text.length : end + 2;
      prelude += text.slice(i, stop);
      i = stop;
      continue;
    }
    if (ch === "{") {
      let depth = 1;
      let j = i + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === "/" && text[j + 1] === "*") {
          const end = text.indexOf("*/", j + 2);
          j = end === -1 ? text.length : end + 2;
          continue;
        }
        if (text[j] === "{") depth += 1;
        else if (text[j] === "}") depth -= 1;
        j += 1;
      }
      nodes.push({ prelude, body: text.slice(i + 1, j - 1) });
      prelude = "";
      i = j;
      continue;
    }
    prelude += ch;
    i += 1;
  }
  if (prelude.trim()) nodes.push({ prelude, body: null });
  return nodes;
}

/* Pisahkan komentar/whitespace di depan dari teks selector (komentar bisa berisi koma). */
function splitPrelude(prelude) {
  let cursor = 0;
  let lastCommentEnd = -1;
  while ((cursor = prelude.indexOf("/*", cursor)) !== -1) {
    const end = prelude.indexOf("*/", cursor + 2);
    if (end === -1) break;
    lastCommentEnd = end + 2;
    cursor = end + 2;
  }
  if (lastCommentEnd === -1) return { prefix: "", selectors: prelude };
  return {
    prefix: prelude.slice(0, lastCommentEnd),
    selectors: prelude.slice(lastCommentEnd),
  };
}

/* Split daftar selector pada koma level atas (abaikan koma di dalam kurung). */
function splitSelectors(prelude) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of prelude) {
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

const classesIn = (selector) =>
  [...selector.matchAll(/\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g)].map((m) => m[1]);

let removedRules = 0;
let removedSelectors = 0;

function prune(nodes) {
  const kept = [];
  for (const node of nodes) {
    if (node.body === null) {
      kept.push(node);
      continue;
    }
    const { prefix, selectors: selectorText } = splitPrelude(node.prelude);
    // Komentar di depan at-rule tidak boleh dianggap bagian selector.
    if (selectorText.trim().startsWith("@")) {
      // Blok aturan bersarang (@media/@supports) diolah rekursif.
      if (node.body.includes("{")) {
        node.body = prune(parseNodes(node.body))
          .map((n) => n.prelude + (n.body === null ? "" : `{${n.body}}`))
          .join("");
      }
      kept.push(node);
      continue;
    }
    const selectors = splitSelectors(selectorText);
    const alive = selectors.filter(
      (selector) => !classesIn(selector).some((cls) => deadSet.has(cls)),
    );
    removedSelectors += selectors.length - alive.length;
    if (!alive.length) {
      removedRules += 1;
      // Komentar dipertahankan agar tidak ada blok komentar yang menggantung.
      if (prefix.trim()) kept.push({ prelude: prefix, body: null });
      continue;
    }
    kept.push({ prelude: prefix + alive.join(","), body: node.body });
  }
  return kept;
}

const files = readdirSync("src/styles").filter((f) => extname(f) === ".css");
let before = 0;
let after = 0;

for (const name of files) {
  const path = join("src/styles", name);
  const css = readFileSync(path, "utf8");
  const output = prune(parseNodes(css))
    .map((n) => n.prelude + (n.body === null ? "" : `{${n.body}}`))
    .join("");
  before += css.length;
  after += output.length;
  if (WRITE) writeFileSync(path, output);
}

console.log(
  `Kelas mati: ${deadSet.size} · rule dihapus: ${removedRules} · selector dihapus: ${removedSelectors} · ${before} → ${after} byte (${Math.round(
    (1 - after / before) * 100,
  )}% lebih kecil)${WRITE ? "" : " [dry-run]"}`,
);
