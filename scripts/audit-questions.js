// scripts/audit-questions.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DISCIPLINA_AREA } from '../src/data/disciplinas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const FIGURAS_DIR = path.join(ROOT, 'figuras');

const EXPECTED_COUNTS = { linguagens: 50, humanas: 45, nature: 45, math: 45 };
const EXPECTED_RANGES = {
  linguagens: { min: 1, max: 45 },
  humanas:    { min: 46, max: 90 },
  nature:     { min: 91, max: 135 },
  math:       { min: 136, max: 180 },
};

function loadDatasets() {
  const files = fs.readdirSync(PUBLIC_DIR)
    .filter(f => /^(math|nature|humanas|linguagens)_enem_\d{4}\.json$/.test(f))
    .sort();

  return files.map(filename => {
    const [area, , yearStr] = filename.replace('.json', '').split('_');
    const year = parseInt(yearStr, 10);
    const questions = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, filename), 'utf8'));
    return { filename, area, year, questions };
  });
}

function getImageFilesOnDisk() {
  return new Set(fs.readdirSync(FIGURAS_DIR).map(f => `figuras/${f}`));
}

function loadOptionalJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

const datasets = loadDatasets();
const diskImages = getImageFilesOnDisk();
const contexts = loadOptionalJson(path.join(PUBLIC_DIR, 'contexts.json')) || {};
const officialGabarito = loadOptionalJson(path.join(PUBLIC_DIR, 'gabarito-oficial.json')) || {};

console.log(`Loaded ${datasets.length} datasets, ${datasets.reduce((s, d) => s + d.questions.length, 0)} total questions`);
console.log(`Found ${diskImages.size} image files on disk`);

// ── Per-question check functions ──────────────────────────────────

const IMAGE_MARKER_RE = /\[(Figura|Imagem|Infogr[aá]fico|Gr[aá]fico|Esquema|Tabela|Mapa|Quadro)/i;

function checkMissingImages(q) {
  const issues = [];
  (q.images || []).forEach(imgPath => {
    if (!diskImages.has(imgPath)) {
      issues.push({ type: 'MISSING_IMAGE_FILE', detail: `${imgPath} not found on disk` });
    }
  });
  return issues;
}

function checkMarkerImageMismatch(q) {
  const issues = [];
  const textHasMarker = IMAGE_MARKER_RE.test(q.text || '');
  const hasImages = (q.images || []).length > 0;

  if (textHasMarker && !hasImages) {
    issues.push({ type: 'MARKER_WITHOUT_IMAGE', detail: 'Text has [image marker] but images array is empty' });
  }
  return issues;
}

function checkEmptyText(q) {
  const issues = [];
  const text = (q.text || '').trim();
  if (text.length === 0) {
    issues.push({ type: 'EMPTY_TEXT', detail: 'Question text is empty' });
  } else if (text.length < 40) {
    const hasContext = (q.contextIds || []).length > 0;
    const hasImages = (q.images || []).length > 0;
    if (!hasContext && !hasImages) {
      issues.push({ type: 'SHORT_TEXT', detail: `Text is only ${text.length} chars: "${text}"` });
    }
  }
  return issues;
}

function checkAlternatives(q) {
  const issues = [];
  const alts = q.alternatives || {};
  const hasImages = (q.images || []).length > 0;
  ['a', 'b', 'c', 'd', 'e'].forEach(letter => {
    const val = (alts[letter] || '').trim();
    if (val.length === 0 && !hasImages) {
      issues.push({ type: 'EMPTY_ALTERNATIVE', detail: `Alternative (${letter}) is empty` });
    }
  });
  if (Object.keys(alts).length < 5) {
    issues.push({ type: 'MISSING_ALTERNATIVE', detail: `Only ${Object.keys(alts).length} alternatives (expected 5)` });
  }
  return issues;
}

function checkAnswer(q) {
  const issues = [];
  if (!q.answer || !['a', 'b', 'c', 'd', 'e', 'annulled'].includes(q.answer)) {
    issues.push({ type: 'INVALID_ANSWER', detail: `answer="${q.answer}" is not a valid option (a-e or annulled)` });
  }
  return issues;
}

function checkRequiredFields(q) {
  const issues = [];
  ['number', 'text', 'alternatives', 'answer', 'area', 'year'].forEach(field => {
    if (q[field] === undefined || q[field] === null) {
      issues.push({ type: 'MISSING_FIELD', detail: `Field "${field}" is missing` });
    }
  });
  return issues;
}

// ── Layer A extensions: semantic / cross-field checks ─────────────

function normalizeText(s) {
  return (s || '').toLowerCase()
    .replace(/[""'']/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function getContextIds(q) {
  if (Array.isArray(q.contextIds) && q.contextIds.length) return q.contextIds;
  if (q.contextId) return [q.contextId];
  return [];
}

function checkAnswerInAlternatives(q) {
  const issues = [];
  if (!q.answer || q.answer === 'annulled') return issues;
  const altKeys = Object.keys(q.alternatives || {});
  if (altKeys.length === 0) return issues;
  if (!altKeys.includes(q.answer)) {
    issues.push({
      type: 'ANSWER_NOT_IN_ALTERNATIVES',
      detail: `answer="${q.answer}" not among alternative keys [${altKeys.join(',')}]`,
    });
  }
  return issues;
}

function checkDisciplinaArea(q) {
  const issues = [];
  for (const slug of (q.disciplinas || [])) {
    const expectedArea = DISCIPLINA_AREA[slug];
    if (!expectedArea) {
      issues.push({ type: 'UNKNOWN_DISCIPLINA',
        detail: `disciplina "${slug}" not in taxonomy` });
      continue;
    }
    if (expectedArea !== q.area) {
      issues.push({
        type: 'DISCIPLINA_AREA_MISMATCH',
        detail: `disciplina "${slug}" belongs to "${expectedArea}" but question.area="${q.area}"`,
      });
    }
  }
  return issues;
}

function checkLanguageTagConsistency(q) {
  // Foreign-language questions only exist in linguagens at numbers 1-5.
  // Everything else must NOT carry a language tag.
  const issues = [];
  const shouldHaveLang = q.area === 'linguagens' && q.number >= 1 && q.number <= 5;
  if (shouldHaveLang && !q.language) {
    issues.push({ type: 'MISSING_LANGUAGE_TAG',
      detail: `linguagens Q${q.number} must carry a language ("en" or "es")` });
  }
  if (!shouldHaveLang && q.language) {
    issues.push({ type: 'UNEXPECTED_LANGUAGE_TAG',
      detail: `language="${q.language}" set outside the q1-5 foreign-language band` });
  }
  if (q.language && q.language !== 'en' && q.language !== 'es') {
    issues.push({ type: 'INVALID_LANGUAGE_TAG',
      detail: `language="${q.language}" — expected "en" or "es"` });
  }
  return issues;
}

function checkContextRefs(q) {
  const issues = [];
  for (const cid of getContextIds(q)) {
    if (!Object.prototype.hasOwnProperty.call(contexts, cid)) {
      issues.push({ type: 'MISSING_CONTEXT', detail: `contextId "${cid}" not found in contexts.json` });
    }
  }
  return issues;
}

function checkDuplicateAlternatives(q) {
  const issues = [];
  const alts = q.alternatives || {};
  const seen = new Map(); // normalized text → letter
  for (const [letter, raw] of Object.entries(alts)) {
    const norm = normalizeText(raw);
    if (norm.length < 5) continue; // skip near-empty alternatives
    if (seen.has(norm)) {
      issues.push({
        type: 'DUPLICATE_ALTERNATIVES',
        detail: `alternatives (${seen.get(norm)}) and (${letter}) have identical text`,
      });
    } else {
      seen.set(norm, letter);
    }
  }
  return issues;
}

function checkBracketBalance(q) {
  const issues = [];
  const fields = [
    ['text', q.text || ''],
    ...Object.entries(q.alternatives || {}).map(([l, v]) => [`alt(${l})`, v || '']),
  ];
  for (const [name, s] of fields) {
    // LaTeX math delimiters
    const open  = (s.match(/\\\(/g) || []).length;
    const close = (s.match(/\\\)/g) || []).length;
    if (open !== close) {
      issues.push({ type: 'UNBALANCED_MATH',
        detail: `${name}: ${open} \\( vs ${close} \\)` });
    }
    // Curly braces (LaTeX commands) — count outside of math-only contexts is noisy,
    // but a stark imbalance is still a smoke signal.
    const ob = (s.match(/\{/g) || []).length;
    const cb = (s.match(/\}/g) || []).length;
    if (Math.abs(ob - cb) >= 2) {
      issues.push({ type: 'UNBALANCED_BRACES',
        detail: `${name}: ${ob} { vs ${cb} }` });
    }
  }
  return issues;
}

const OCR_GARBAGE_RX = /(Ã[-ÿ]|â€™|â€œ|â€|ï¬|�)/;
const LIGATURE_RX = /[ﬁﬂﬀﬃﬄ]/;

function checkOcrGarbage(q) {
  const issues = [];
  const fields = [['text', q.text || ''], ...Object.entries(q.alternatives || {}).map(([l, v]) => [`alt(${l})`, v || ''])];
  for (const [name, s] of fields) {
    if (OCR_GARBAGE_RX.test(s)) {
      issues.push({ type: 'OCR_MOJIBAKE', detail: `${name} contains mojibake characters` });
    } else if (LIGATURE_RX.test(s)) {
      issues.push({ type: 'OCR_LIGATURE', detail: `${name} contains unconverted ligature (ﬁ ﬂ ...)` });
    }
  }
  return issues;
}

function checkAltLengthOutlier(q) {
  const issues = [];
  const alts = q.alternatives || {};
  const entries = Object.entries(alts).map(([k, v]) => [k, normalizeText(v).length]);
  if (entries.length < 3) return issues;
  const lens = entries.map(([, n]) => n);
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  const variance = lens.reduce((s, n) => s + (n - mean) ** 2, 0) / lens.length;
  const std = Math.sqrt(variance);
  if (std === 0 || mean < 20) return issues;
  for (const [letter, len] of entries) {
    const z = Math.abs(len - mean) / std;
    if (z > 2.5 && (len < mean * 0.35 || len > mean * 2.5)) {
      issues.push({
        type: 'ALT_LENGTH_OUTLIER',
        detail: `alt(${letter}) is ${len} chars vs mean ${mean.toFixed(0)} (z=${z.toFixed(1)})`,
      });
    }
  }
  return issues;
}

const TRUNCATION_RX = /[a-záéíóúâêôãõç]-\s*$|[a-záéíóúâêôãõç]{4,}…\s*$|…\s*$|[a-záéíóúâêôãõç]{6,}\s*$/i;
const END_PUNCT_RX = /[.?!:)"'\]…]\s*$/;

function checkTruncatedText(q) {
  const issues = [];
  const text = (q.text || '').trim();
  if (text.length < 30) return issues;
  // ENEM often ends stems mid-sentence on purpose (the alternatives complete
  // the phrase), so absence of terminal punctuation is NOT a smell. We only
  // flag the unambiguous mid-word hyphen case.
  if (text.endsWith('-') && TRUNCATION_RX.test(text)) {
    issues.push({ type: 'STEM_HYPHEN_TRUNCATED',
      detail: `text ends mid-word with hyphen: "${text.slice(-40)}"` });
  }
  // Alternatives ending with a hyphen are almost certainly truncated.
  for (const [letter, raw] of Object.entries(q.alternatives || {})) {
    const s = (raw || '').trim();
    if (s.endsWith('-') && s.length > 4) {
      issues.push({ type: 'ALT_HYPHEN_TRUNCATED',
        detail: `alt(${letter}) ends with hyphen: "${s.slice(-30)}"` });
    }
  }
  return issues;
}

// Context ↔ stem bleed detection -------------------------------------------------

const REFERENCE_RX = [
  /Dispon[íi]vel em\s*:/i,
  /Acesso em\s*:/i,
  /Fonte\s*:/i,
  /Adaptado de/i,
  /https?:\/\/|www\./i,
];

function ngrams(text, n = 8) {
  const words = normalizeText(text).split(' ').filter(Boolean);
  const set = new Set();
  for (let i = 0; i + n <= words.length; i++) set.add(words.slice(i, i + n).join(' '));
  return set;
}

function checkContextBleed(q) {
  const issues = [];
  const qText = normalizeText(q.text);
  if (!qText) return issues;
  for (const cid of getContextIds(q)) {
    const ctx = contexts[cid];
    if (!ctx || typeof ctx !== 'object') continue;
    const cText = normalizeText(ctx.text || '');
    const cRef  = normalizeText(ctx.reference || '');

    if (cText.length > 60) {
      const probe = cText.slice(0, Math.min(180, cText.length));
      if (qText.includes(probe)) {
        issues.push({ type: 'CTX_TEXT_IN_STEM',
          detail: `context "${cid}" text appears verbatim inside question.text` });
      }
    }
    if (qText.length > 60) {
      const probe = qText.slice(0, Math.min(180, qText.length));
      if (cText.includes(probe)) {
        issues.push({ type: 'STEM_IN_CTX_TEXT',
          detail: `question.text appears verbatim inside context "${cid}"` });
      }
    }
    if (cRef.length > 30 && qText.includes(cRef.slice(0, 100))) {
      issues.push({ type: 'CTX_REF_IN_STEM',
        detail: `context "${cid}" reference appears inside question.text` });
    }

    const qGrams = ngrams(q.text || '', 8);
    if (qGrams.size > 0) {
      const ctxGrams = ngrams(ctx.text || '', 8);
      const shared = [];
      for (const g of qGrams) if (ctxGrams.has(g)) shared.push(g);
      if (shared.length >= 1) {
        issues.push({
          type: 'CTX_STEM_SHARED_PHRASE',
          detail: `8-word phrase shared with context "${cid}": "${shared[0].slice(0, 80)}"`,
        });
      }
    }

    for (const rx of REFERENCE_RX) {
      if (rx.test(ctx.text || '')) {
        issues.push({
          type: 'REFERENCE_IN_CTX_TEXT',
          detail: `context "${cid}".text matches "${rx.source}" — likely belongs in .reference`,
        });
        break;
      }
    }
  }
  for (const rx of REFERENCE_RX) {
    if (rx.test(q.text || '')) {
      issues.push({ type: 'REFERENCE_PATTERN_IN_STEM',
        detail: `question.text contains "${rx.source}" — citation may have leaked in` });
      break;
    }
  }
  return issues;
}

// ── Layer B: cross-check against the official INEP gabarito ───────

function officialAnswerFor(q) {
  const key = q.language ? `${q.year}:${q.number}:${q.language}` : `${q.year}:${q.number}`;
  return officialGabarito[key] ?? null;
}

function checkOfficialGabarito(q) {
  if (!officialGabarito || Object.keys(officialGabarito).length === 0) return [];
  const expected = officialAnswerFor(q);
  if (expected == null) return []; // gabarito doesn't cover this question
  if (!q.answer) return [];
  if (expected !== q.answer) {
    return [{
      type: 'ANSWER_MISMATCH_VS_OFFICIAL',
      detail: `JSON=${q.answer}, INEP=${expected}`,
    }];
  }
  return [];
}

// ── Dataset-level checks ──────────────────────────────────────────

function checkDataset(dataset) {
  const { area, questions } = dataset;
  const datasetIssues = [];

  // Check total count
  const expectedCount = EXPECTED_COUNTS[area];
  if (questions.length !== expectedCount) {
    datasetIssues.push({
      type: 'WRONG_QUESTION_COUNT',
      detail: `Expected ${expectedCount}, found ${questions.length} (missing ${expectedCount - questions.length})`,
    });
  }

  // Check for duplicate question numbers
  const seen = new Map();
  questions.forEach(q => seen.set(q.number, (seen.get(q.number) || 0) + 1));
  seen.forEach((count, num) => {
    // linguagens questions 1-5 appear twice (ES + EN foreign language) — expected
    const isExpectedDuplicate = area === 'linguagens' && num >= 1 && num <= 5;
    if (count > 2 || (count > 1 && !isExpectedDuplicate)) {
      datasetIssues.push({
        type: 'DUPLICATE_QUESTION_NUMBER',
        detail: `Question number ${num} appears ${count} times`,
      });
    }
  });

  // Check for out-of-range question numbers
  const range = EXPECTED_RANGES[area];
  questions.forEach(q => {
    if (q.number < range.min || q.number > range.max) {
      datasetIssues.push({
        type: 'OUT_OF_RANGE_NUMBER',
        detail: `Q${q.number} is outside expected range ${range.min}-${range.max}`,
      });
    }
  });

  // Find gaps in expected number range
  const uniqueNums = new Set(questions.map(q => q.number));
  for (let n = range.min; n <= range.max; n++) {
    if (!uniqueNums.has(n)) {
      datasetIssues.push({
        type: 'MISSING_QUESTION_NUMBER',
        detail: `Q${n} is missing`,
      });
    }
  }

  return datasetIssues;
}

// ── Orphaned image detection ──────────────────────────────────────

function findOrphanedImages() {
  const referencedImages = new Set();
  datasets.forEach(({ questions }) => {
    questions.forEach(q => (q.images || []).forEach(img => referencedImages.add(img)));
  });
  const orphaned = [];
  diskImages.forEach(img => {
    if (img.startsWith('figuras/logos/')) return;
    if (!referencedImages.has(img)) orphaned.push(img);
  });
  return orphaned;
}

// ── Main audit runner ─────────────────────────────────────────────

function runAudit() {
  const report = {
    summary: { totalQuestions: 0, totalIssues: 0, filesWithIssues: 0, orphanedImages: 0 },
    byFile: {},
    orphanedImages: [],
  };

  datasets.forEach(dataset => {
    const { filename, questions } = dataset;
    const fileReport = { datasetIssues: [], questionIssues: [] };

    fileReport.datasetIssues = checkDataset(dataset);

    questions.forEach(q => {
      const qIssues = [
        ...checkRequiredFields(q),
        ...checkEmptyText(q),
        ...checkAlternatives(q),
        ...checkAnswer(q),
        ...checkAnswerInAlternatives(q),
        ...checkMissingImages(q),
        ...checkMarkerImageMismatch(q),
        ...checkDisciplinaArea(q),
        ...checkLanguageTagConsistency(q),
        ...checkContextRefs(q),
        ...checkDuplicateAlternatives(q),
        ...checkBracketBalance(q),
        ...checkOcrGarbage(q),
        ...checkAltLengthOutlier(q),
        ...checkTruncatedText(q),
        ...checkContextBleed(q),
        ...checkOfficialGabarito(q),
      ];
      if (qIssues.length > 0) {
        fileReport.questionIssues.push({ number: q.number, issues: qIssues });
      }
    });

    const totalFileIssues = fileReport.datasetIssues.length + fileReport.questionIssues.length;
    report.byFile[filename] = fileReport;
    report.summary.totalQuestions += questions.length;
    report.summary.totalIssues +=
      fileReport.datasetIssues.length +
      fileReport.questionIssues.reduce((s, qi) => s + qi.issues.length, 0);
    if (totalFileIssues > 0) report.summary.filesWithIssues++;
  });

  report.orphanedImages = findOrphanedImages();
  report.summary.orphanedImages = report.orphanedImages.length;

  return report;
}

// ── Output ────────────────────────────────────────────────────────

const ISSUE_ORDER = [
  // Cross-source / highest-value
  'ANSWER_MISMATCH_VS_OFFICIAL',
  // Structural
  'WRONG_QUESTION_COUNT', 'MISSING_QUESTION_NUMBER', 'DUPLICATE_QUESTION_NUMBER',
  'OUT_OF_RANGE_NUMBER', 'MISSING_FIELD', 'EMPTY_TEXT', 'SHORT_TEXT',
  'EMPTY_ALTERNATIVE', 'MISSING_ALTERNATIVE', 'INVALID_ANSWER',
  'ANSWER_NOT_IN_ALTERNATIVES',
  // Image / figure
  'MISSING_IMAGE_FILE', 'MARKER_WITHOUT_IMAGE',
  // Taxonomy
  'UNKNOWN_DISCIPLINA', 'DISCIPLINA_AREA_MISMATCH',
  'MISSING_LANGUAGE_TAG', 'UNEXPECTED_LANGUAGE_TAG', 'INVALID_LANGUAGE_TAG',
  'MISSING_CONTEXT',
  // Content quality
  'DUPLICATE_ALTERNATIVES', 'UNBALANCED_MATH', 'UNBALANCED_BRACES',
  'OCR_MOJIBAKE', 'OCR_LIGATURE',
  'ALT_LENGTH_OUTLIER',
  'STEM_HYPHEN_TRUNCATED', 'ALT_HYPHEN_TRUNCATED',
  // Context bleed
  'CTX_TEXT_IN_STEM', 'STEM_IN_CTX_TEXT', 'CTX_REF_IN_STEM',
  'CTX_STEM_SHARED_PHRASE', 'REFERENCE_IN_CTX_TEXT',
  'REFERENCE_PATTERN_IN_STEM',
];

const report = runAudit();

console.log('\n══════════════════════════════════════════════');
console.log(' QUESTION AUDIT REPORT');
console.log('══════════════════════════════════════════════');
console.log(`Total questions: ${report.summary.totalQuestions}`);
console.log(`Total issues:    ${report.summary.totalIssues}`);
console.log(`Files affected:  ${report.summary.filesWithIssues} / ${datasets.length}`);
console.log('');

// Issue type breakdown
const byType = {};
Object.values(report.byFile).forEach(fr => {
  fr.datasetIssues.forEach(i => { byType[i.type] = (byType[i.type] || 0) + 1; });
  fr.questionIssues.forEach(qi => qi.issues.forEach(i => { byType[i.type] = (byType[i.type] || 0) + 1; }));
});

console.log('Issue type breakdown:');
ISSUE_ORDER.filter(t => byType[t]).forEach(t => {
  console.log(`  ${t.padEnd(30)} ${byType[t]}`);
});
console.log('');

// Orphaned images
if (report.orphanedImages.length > 0) {
  console.log(`Orphaned images (on disk, not referenced): ${report.orphanedImages.length}`);
  report.orphanedImages.forEach(img => console.log(`  ${img}`));
  console.log('');
}

// Per-file detail
Object.entries(report.byFile).forEach(([filename, fr]) => {
  const totalIssues = fr.datasetIssues.length + fr.questionIssues.length;
  if (totalIssues === 0) return;

  console.log(`── ${filename} (${totalIssues} issues) ──`);
  fr.datasetIssues.forEach(i => console.log(`   [DATASET] ${i.type}: ${i.detail}`));
  fr.questionIssues.forEach(qi => {
    qi.issues.forEach(i => console.log(`   Q${String(qi.number).padEnd(4)} ${i.type}: ${i.detail}`));
  });
  console.log('');
});

// JSON report
const reportPath = path.join(__dirname, 'audit-report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`Full report saved to scripts/audit-report.json`);
