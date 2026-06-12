// scripts/normalize-image-objects.js
//
// Memory rule do projeto: "Image array format — plain string paths like
// figuras/qNNN_YYYY_figN.png, NOT objects with file/label".
//
// Algumas questões antigas foram salvas com `images: [{file, description}]`.
// Este script percorre todos os public/{area}_enem_YYYY.json e converte
// objetos no array `images` em strings (usa o campo .file).
//
// Imprime as mudanças e salva os arquivos in-place.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

const files = fs.readdirSync(PUBLIC_DIR)
  .filter((f) => /^(math|nature|humanas|linguagens)_enem_\d{4}\.json$/.test(f))
  .sort();

let totalQuestionsChanged = 0;
let totalEntriesChanged = 0;
const changesByFile = {};

for (const file of files) {
  const fullPath = path.join(PUBLIC_DIR, file);
  const json = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  let fileChanged = false;
  const fileChanges = [];

  for (const q of json) {
    const imgs = q.images;
    if (!Array.isArray(imgs) || imgs.length === 0) continue;
    if (imgs.every((i) => typeof i === 'string')) continue;

    const original = JSON.parse(JSON.stringify(imgs));
    const normalized = imgs.map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry === 'object') {
        // Prefer .file, fall back to .path or .src — surface a warning if none.
        const candidate = entry.file || entry.path || entry.src;
        if (typeof candidate === 'string' && candidate.length > 0) return candidate;
        console.warn(`  ⚠ ${file} Q${q.number}: object lacks .file/.path/.src — keeping as-is`);
        return entry;
      }
      return entry;
    });

    if (JSON.stringify(normalized) !== JSON.stringify(original)) {
      q.images = normalized;
      fileChanged = true;
      totalQuestionsChanged++;
      totalEntriesChanged += original.length;
      fileChanges.push({ q: q.number, before: original, after: normalized });
    }
  }

  if (fileChanged) {
    // Pretty-print with 2-space indent to keep diff readable.
    fs.writeFileSync(fullPath, JSON.stringify(json, null, 2) + '\n');
    changesByFile[file] = fileChanges;
  }
}

console.log(`\nNormalized ${totalQuestionsChanged} questions across ${Object.keys(changesByFile).length} files`);
console.log(`Total image entries rewritten: ${totalEntriesChanged}\n`);

for (const [file, changes] of Object.entries(changesByFile)) {
  console.log(`── ${file} ──`);
  for (const c of changes) {
    console.log(`  Q${c.q}:`);
    c.before.forEach((b, i) => {
      const a = c.after[i];
      if (typeof b === 'object') {
        console.log(`    [${i}] {file: "${b.file || b.path || b.src}", ...} → "${a}"`);
      }
    });
  }
}
