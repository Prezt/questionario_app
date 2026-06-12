// scripts/extract-gabarito.js
//
// Parses INEP's official gabarito PDFs (ENEMs/*_GB_impresso_*.pdf) into a
// flat lookup keyed by year+question(+language). Used by audit-questions.js
// to flag answer keys that diverge from the official source.
//
// Output: public/gabarito-oficial.json
//   {
//     "2023:1:en": "b",
//     "2023:1:es": "a",
//     "2023:6":    "d",
//     "2023:164":  "annulled",
//     ...
//   }

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ENEMS_DIR = path.join(ROOT, 'ENEMs');
const OUT_PATH = path.join(ROOT, 'public', 'gabarito-oficial.json');

// On a single layout line, find every "<num> <letter|Anulado>" pair.
// Day 1 q1-5 lines carry two letters (English + Spanish); everything else
// carries one. Captures preserve that distinction.
const PAIR_RX = /(\d{1,3})\s+(Anulado|[A-E*])(?:\s+(Anulado|[A-E*]))?/g;

function normLetter(raw) {
  if (!raw) return null;
  if (raw === 'Anulado' || raw === '*') return 'annulled';
  return raw.toLowerCase();
}

function parseGabaritoText(text) {
  // Returns array of { num, letters: [first, second?] }
  const lines = text.split('\n');
  const pairs = [];
  for (const line of lines) {
    // Reset lastIndex because we re-use the same regex.
    PAIR_RX.lastIndex = 0;
    let m;
    while ((m = PAIR_RX.exec(line)) !== null) {
      const num = parseInt(m[1], 10);
      if (!Number.isFinite(num) || num < 1 || num > 200) continue;
      const first = normLetter(m[2]);
      const second = normLetter(m[3]);
      pairs.push({ num, letters: second ? [first, second] : [first] });
    }
  }
  return pairs;
}

function loadGabarito(pdfPath) {
  const text = execSync(`pdftotext -layout "${pdfPath}" -`, {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  return parseGabaritoText(text);
}

function inferYear(filename) {
  const m = filename.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

function inferDay(filename) {
  if (/_D1_/.test(filename)) return 1;
  if (/_D2_/.test(filename)) return 2;
  return null;
}

const out = {};

const files = fs.readdirSync(ENEMS_DIR)
  .filter((f) => /_GB_impresso_/.test(f))
  .sort();

let totalAnswers = 0;
let conflicts = 0;
const perYear = {};

for (const file of files) {
  const year = inferYear(file);
  const day = inferDay(file);
  if (!year || !day) continue;
  const pdfPath = path.join(ENEMS_DIR, file);
  const pairs = loadGabarito(pdfPath);
  const yKey = perYear[year] || (perYear[year] = { d1: 0, d2: 0 });

  for (const { num, letters } of pairs) {
    // Day 1 covers q1-90, Day 2 covers q91-180. Anything outside the day's
    // expected range is suspect and skipped to avoid cross-bleed.
    if (day === 1 && (num < 1 || num > 90)) continue;
    if (day === 2 && (num < 91 || num > 180)) continue;

    // q1-5 (Day 1) — first letter = INGLÊS, second = ESPANHOL.
    if (day === 1 && num >= 1 && num <= 5 && letters.length === 2) {
      const enKey = `${year}:${num}:en`;
      const esKey = `${year}:${num}:es`;
      if (out[enKey] && out[enKey] !== letters[0]) conflicts++;
      if (out[esKey] && out[esKey] !== letters[1]) conflicts++;
      out[enKey] = letters[0];
      out[esKey] = letters[1];
      totalAnswers += 2;
    } else {
      const key = `${year}:${num}`;
      if (out[key] && out[key] !== letters[0]) conflicts++;
      out[key] = letters[0];
      totalAnswers++;
    }
    if (day === 1) yKey.d1++; else yKey.d2++;
  }
}

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));

console.log(`\nWrote ${OUT_PATH}`);
console.log(`  files parsed:    ${files.length}`);
console.log(`  total answers:   ${totalAnswers}`);
console.log(`  unique keys:     ${Object.keys(out).length}`);
console.log(`  parse conflicts: ${conflicts}`);
console.log('');
console.log('Per-year coverage:');
Object.keys(perYear).sort().forEach((y) => {
  const v = perYear[y];
  console.log(`  ${y}: D1=${v.d1}  D2=${v.d2}`);
});
