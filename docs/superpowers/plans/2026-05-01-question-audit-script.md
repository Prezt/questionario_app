# Question Audit Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js script that scans all 32 question JSON files and produces a structured report of every detectable quality issue, so the user can triage and fix problems systematically.

**Architecture:** A single standalone Node.js script (`scripts/audit-questions.js`) that reads `public/*.json` and `figuras/`, runs 6 checks per question, and writes both a machine-readable JSON report and a human-readable console summary. No server, no build step — just `node scripts/audit-questions.js`.

**Tech Stack:** Node.js (built-in `fs`, `path`), no external dependencies.

---

## Known facts about the data (read before coding)

- **32 JSON files** in `public/`: `{area}_enem_{year}.json` (area: math, nature, humanas, linguagens; years: 2018–2025)
- **Expected question counts:** linguagens = 50, all others = 45
- **Expected number ranges:** linguagens = 1–45 (but questions 1–5 appear TWICE — one per foreign language: ES + EN), humanas = 46–90, nature = 91–135, math = 136–180
- **Image paths** in questions: `"figuras/q137_infografico.png"` — relative to `public/`, resolved against `figuras/` directory at project root
- **Absolute image disk path:** `<projectRoot>/figuras/<filename>` (NOT `public/figuras/`)
- **Image marker patterns** in question text: `[Figura`, `[Imagem`, `[Infográfico`, `[Gráfico`, `[Esquema`, `[Tabela`, `[Mapa`, `[Quadro`
- **Alternative image markers**: alternative text like `[Projeções ortogonais - opção A]` means that alternative is an image, not text
- **Already-known issues:** humanas_enem_2021 has 31/45 questions, linguagens_enem_2021 has 36/50 questions, math_enem_2024 has 42/45 questions

---

## File structure

| File | Purpose |
|------|---------|
| `scripts/audit-questions.js` | Single script — all logic inline |
| `scripts/audit-report.json` | Output: machine-readable per-question issues |

---

## Task 1: Script skeleton and file loading

**Files:**
- Create: `scripts/audit-questions.js`

- [ ] **Step 1: Create the script with file loader**

```js
// scripts/audit-questions.js
const fs = require('fs');
const path = require('path');

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
```

- [ ] **Step 2: Run it to verify it loads**

```bash
node scripts/audit-questions.js
```

Expected output:
```
Loaded 32 datasets, 1447 total questions
Found 338 image files on disk
```

---

## Task 2: Per-question checks

**Files:**
- Modify: `scripts/audit-questions.js`

- [ ] **Step 3: Add the 6 check functions after the loading code**

```js
const IMAGE_MARKER_RE = /\[(Figura|Imagem|Infogr[aá]fico|Gr[aá]fico|Esquema|Tabela|Mapa|Quadro)/i;

function checkMissingImages(q, filename) {
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
  // Don't flag image-without-marker: some questions have images appended to end without a marker (valid)
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
  if (!q.answer || !['a','b','c','d','e'].includes(q.answer)) {
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
```

- [ ] **Step 4: Run to verify no syntax errors**

```bash
node -e "require('./scripts/audit-questions.js')" 2>&1 | head -5
```

Expected: no errors (the script will just print its load line).

---

## Task 3: Dataset-level checks and main runner

**Files:**
- Modify: `scripts/audit-questions.js`

- [ ] **Step 5: Add dataset-level checks and the main audit runner**

Append to the script after the check functions:

```js
function checkDataset(dataset) {
  const { filename, area, year, questions } = dataset;
  const datasetIssues = [];

  // Check total count
  const expectedCount = EXPECTED_COUNTS[area];
  if (questions.length !== expectedCount) {
    datasetIssues.push({
      type: 'WRONG_QUESTION_COUNT',
      detail: `Expected ${expectedCount}, found ${questions.length} (missing ${expectedCount - questions.length})`
    });
  }

  // Check for duplicate question numbers
  const seen = new Map();
  questions.forEach(q => {
    const key = q.number;
    seen.set(key, (seen.get(key) || 0) + 1);
  });
  seen.forEach((count, num) => {
    // linguagens questions 1-5 are expected duplicates (ES + EN foreign language)
    const isExpectedDuplicate = area === 'linguagens' && num >= 1 && num <= 5;
    if (count > 2 || (count > 1 && !isExpectedDuplicate)) {
      datasetIssues.push({
        type: 'DUPLICATE_QUESTION_NUMBER',
        detail: `Question number ${num} appears ${count} times`
      });
    }
  });

  // Check for out-of-range question numbers
  const range = EXPECTED_RANGES[area];
  questions.forEach(q => {
    if (q.number < range.min || q.number > range.max) {
      datasetIssues.push({
        type: 'OUT_OF_RANGE_NUMBER',
        detail: `Q${q.number} is outside expected range ${range.min}-${range.max}`
      });
    }
  });

  // Find missing numbers in range (gaps)
  const uniqueNums = new Set(questions.map(q => q.number));
  for (let n = range.min; n <= range.max; n++) {
    if (!uniqueNums.has(n)) {
      datasetIssues.push({
        type: 'MISSING_QUESTION_NUMBER',
        detail: `Q${n} is missing`
      });
    }
  }

  return datasetIssues;
}

function runAudit() {
  const report = {
    summary: { totalQuestions: 0, totalIssues: 0, filesWithIssues: 0 },
    byFile: {}
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
    report.summary.totalIssues += fileReport.datasetIssues.length + fileReport.questionIssues.reduce((s, qi) => s + qi.issues.length, 0);
    if (totalFileIssues > 0) report.summary.filesWithIssues++;
  });

  return report;
}

const report = runAudit();
```

---

## Task 4: Output — console summary + JSON report

**Files:**
- Modify: `scripts/audit-questions.js`

- [ ] **Step 6: Add output section**

Append after `const report = runAudit();`:

```js
// ── Console output ────────────────────────────────────────────────
const ISSUE_ORDER = [
  'WRONG_QUESTION_COUNT', 'MISSING_QUESTION_NUMBER', 'DUPLICATE_QUESTION_NUMBER',
  'OUT_OF_RANGE_NUMBER', 'MISSING_FIELD', 'EMPTY_TEXT', 'SHORT_TEXT',
  'EMPTY_ALTERNATIVE', 'MISSING_ALTERNATIVE', 'INVALID_ANSWER',
  'MISSING_IMAGE_FILE', 'MARKER_WITHOUT_IMAGE',
];

console.log('\n══════════════════════════════════════════════');
console.log(' QUESTION AUDIT REPORT');
console.log('══════════════════════════════════════════════');
console.log(`Total questions: ${report.summary.totalQuestions}`);
console.log(`Total issues:    ${report.summary.totalIssues}`);
console.log(`Files affected:  ${report.summary.filesWithIssues} / ${datasets.length}`);
console.log('');

// Issue type breakdown across all files
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

// ── JSON report ───────────────────────────────────────────────────
const reportPath = path.join(__dirname, 'audit-report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`Full report saved to scripts/audit-report.json`);
```

- [ ] **Step 7: Run the full audit**

```bash
node scripts/audit-questions.js 2>&1
```

Expected: console table with issue counts per type and per file, then `Full report saved to scripts/audit-report.json`.

- [ ] **Step 8: Verify JSON report was created**

```bash
node -e "const r = require('./scripts/audit-report.json'); console.log('Files in report:', Object.keys(r.byFile).length); console.log('Summary:', JSON.stringify(r.summary));"
```

Expected: `Files in report: 32`, summary with total counts.

- [ ] **Step 9: Commit**

```bash
git add scripts/audit-questions.js
git commit -m "feat: add question audit script to detect quality issues"
```

---

## Task 5: Quick wins — check orphaned images

**Files:**
- Modify: `scripts/audit-questions.js`

- [ ] **Step 10: Add orphaned image check after `diskImages` is defined**

Insert this function and call it in `runAudit()`:

```js
// Add this function before runAudit()
function findOrphanedImages() {
  const referencedImages = new Set();
  datasets.forEach(({ questions }) => {
    questions.forEach(q => {
      (q.images || []).forEach(img => referencedImages.add(img));
    });
  });
  const orphaned = [];
  diskImages.forEach(img => {
    // skip the logos/ subdirectory
    if (img.startsWith('figuras/logos/')) return;
    if (!referencedImages.has(img)) orphaned.push(img);
  });
  return orphaned;
}
```

In `runAudit()`, before `return report;`, add:

```js
  report.orphanedImages = findOrphanedImages();
  report.summary.orphanedImages = report.orphanedImages.length;
```

In the console output section, after the issue type breakdown, add:

```js
if (report.orphanedImages.length > 0) {
  console.log(`Orphaned images (on disk but not referenced): ${report.orphanedImages.length}`);
  report.orphanedImages.forEach(img => console.log(`  ${img}`));
  console.log('');
}
```

- [ ] **Step 11: Run again to see orphaned images**

```bash
node scripts/audit-questions.js 2>&1 | head -60
```

- [ ] **Step 12: Commit final version**

```bash
git add scripts/audit-questions.js
git commit -m "feat: add orphaned image detection to audit script"
```

---

## Self-review

**Spec coverage:**
- Missing questions (gaps in number range) → Task 3, `MISSING_QUESTION_NUMBER` ✓
- Miscut images (can't detect automatically, but `MISSING_IMAGE_FILE` flags broken refs) ✓
- Missing text → `EMPTY_TEXT`, `SHORT_TEXT` ✓
- Missing/empty alternatives → `EMPTY_ALTERNATIVE`, `MISSING_ALTERNATIVE` ✓
- Marker without image → `MARKER_WITHOUT_IMAGE` ✓
- Orphaned images on disk → Task 5 ✓
- Duplicate question numbers → Task 3 ✓

**Not detectable automatically (manual review required):**
- Miscut images (wrong crop/content)
- Text truncated mid-sentence (ambiguous length threshold)
- Wrong correct answer

**Placeholder scan:** None found.

**Type consistency:** All check functions return `Array<{type: string, detail: string}>`. `runAudit()` consumes them consistently. ✓
