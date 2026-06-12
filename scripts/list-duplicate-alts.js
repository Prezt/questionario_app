// scripts/list-duplicate-alts.js
//
// Lê o relatório de audit e produz um markdown com cada questão que tem
// alternativas duplicadas, mostrando texto da questão + as alternativas
// agrupadas pelas que batem. Não toca os JSONs — só facilita a triagem
// manual.
//
// Saída: scripts/duplicate-alts-triage.md

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const REPORT_PATH = path.join(__dirname, 'audit-report.json');
const OUT_PATH = path.join(__dirname, 'duplicate-alts-triage.md');

if (!fs.existsSync(REPORT_PATH)) {
  console.error('audit-report.json não encontrado. Rode `npm run audit` primeiro.');
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
const datasets = {};
for (const file of fs.readdirSync(PUBLIC_DIR)) {
  if (!/^(math|nature|humanas|linguagens)_enem_\d{4}\.json$/.test(file)) continue;
  datasets[file] = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8'));
}

function normalize(s) {
  return (s || '').toLowerCase()
    .replace(/[""'']/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function groupDuplicates(alternatives) {
  // Returns map of normalized text → array of letters sharing that text.
  const map = new Map();
  for (const [letter, raw] of Object.entries(alternatives || {})) {
    const key = normalize(raw);
    if (key.length < 5) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(letter);
  }
  // Keep only groups with 2+ letters.
  const out = [];
  for (const [key, letters] of map.entries()) {
    if (letters.length >= 2) out.push({ key, letters });
  }
  return out;
}

function truncate(s, max = 200) {
  s = (s || '').replace(/\s+/g, ' ').trim();
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

const lines = [];
lines.push('# Triagem de DUPLICATE_ALTERNATIVES');
lines.push('');
lines.push('Cada bloco abaixo mostra uma questão com 2+ alternativas idênticas (após normalização case-insensitive + whitespace). Confira contra a fonte original (PDF do INEP em `ENEMs/`) e decida:');
lines.push('');
lines.push('- **Bug real do parser** → editar o JSON, restaurar a alternativa correta.');
lines.push('- **Legítimo** (raro) → ignorar.');
lines.push('');

let totalQuestions = 0;
let totalGroups = 0;

for (const [file, fr] of Object.entries(report.byFile)) {
  const dupes = fr.questionIssues
    .map((qi) => ({
      number: qi.number,
      hits: qi.issues.filter((i) => i.type === 'DUPLICATE_ALTERNATIVES'),
    }))
    .filter((qi) => qi.hits.length > 0);

  if (dupes.length === 0) continue;

  lines.push(`## ${file}`);
  lines.push('');

  for (const { number } of dupes) {
    const q = datasets[file]?.find((x) => x.number === number);
    if (!q) {
      lines.push(`### Q${number}`);
      lines.push('(não encontrado no JSON — pode ter sido alterado depois do audit)');
      lines.push('');
      continue;
    }

    const groups = groupDuplicates(q.alternatives);
    totalQuestions++;
    totalGroups += groups.length;

    lines.push(`### Q${number}`);
    lines.push('');
    lines.push(`**Texto:** ${truncate(q.text, 200)}`);
    lines.push('');
    lines.push(`**Gabarito declarado:** ${q.answer ?? '—'}`);
    lines.push('');
    lines.push('**Alternativas:**');
    lines.push('');
    lines.push('| Letra | Texto |');
    lines.push('|---|---|');
    for (const [letter, raw] of Object.entries(q.alternatives || {})) {
      lines.push(`| **${letter.toUpperCase()}** | ${truncate(raw, 140)} |`);
    }
    lines.push('');
    lines.push(`**Grupos duplicados:** ${groups.map((g) => `(${g.letters.map((l) => l.toUpperCase()).join(' = ')})`).join(' · ')}`);
    lines.push('');
    lines.push('---');
    lines.push('');
  }
}

lines.push(`## Resumo`);
lines.push('');
lines.push(`- Questões com duplicatas: **${totalQuestions}**`);
lines.push(`- Grupos de letras duplicadas: **${totalGroups}**`);
lines.push('');

fs.writeFileSync(OUT_PATH, lines.join('\n'));
console.log(`\nEscrito ${OUT_PATH}`);
console.log(`  questões com duplicatas: ${totalQuestions}`);
console.log(`  grupos de letras duplicadas: ${totalGroups}`);
