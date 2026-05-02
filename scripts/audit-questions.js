// scripts/audit-questions.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

const datasets = loadDatasets();
const diskImages = getImageFilesOnDisk();

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
    issues.push({ type: 'SHORT_TEXT', detail: `Text is only ${text.length} chars: "${text}"` });
  }
  return issues;
}

function checkAlternatives(q) {
  const issues = [];
  const alts = q.alternatives || {};
  ['a', 'b', 'c', 'd', 'e'].forEach(letter => {
    const val = (alts[letter] || '').trim();
    if (val.length === 0) {
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
  if (!q.answer || !['a', 'b', 'c', 'd', 'e'].includes(q.answer)) {
    issues.push({ type: 'INVALID_ANSWER', detail: `answer="${q.answer}" is not a valid option (a-e)` });
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
        ...checkMissingImages(q),
        ...checkMarkerImageMismatch(q),
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
  'WRONG_QUESTION_COUNT', 'MISSING_QUESTION_NUMBER', 'DUPLICATE_QUESTION_NUMBER',
  'OUT_OF_RANGE_NUMBER', 'MISSING_FIELD', 'EMPTY_TEXT', 'SHORT_TEXT',
  'EMPTY_ALTERNATIVE', 'MISSING_ALTERNATIVE', 'INVALID_ANSWER',
  'MISSING_IMAGE_FILE', 'MARKER_WITHOUT_IMAGE',
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
