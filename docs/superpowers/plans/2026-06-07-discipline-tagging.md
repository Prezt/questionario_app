# Discipline Tagging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `disciplinas` layer between `area` and `tags` so users can practice/simulado by Química, Física, História, etc., including a "Multidisciplinar" filter for cross-disciplina questions.

**Architecture:** Two new pure-JS data modules (`src/data/disciplinas.js` for taxonomy, `src/data/disciplinaFromTag.js` for the `(area, tag) → disciplina[]` mapping and the `disciplinasForQuestion(question)` helper). A one-shot Node backfill script writes `disciplinas: string[]` onto every question in `public/*_enem_*.json`. The home picker UI gains a disciplina-first grid (with a Multidisciplinar entry) that calls a new `startDisciplinaQuiz()` action; Dia 1 / Dia 2 prova completa stays untouched. Summary screen gets a disciplina-level grouping above the existing tag stats.

**Tech Stack:** React 19, Vite 8, Vitest 4, plain JS ESM (`"type": "module"`), no TypeScript. Tests co-located as `*.test.js` next to the source file.

**Spec:** [`docs/superpowers/specs/2026-06-07-discipline-tagging-design.md`](../specs/2026-06-07-discipline-tagging-design.md)

---

## File Structure

**New files:**
- `src/data/disciplinas.js` — `DISCIPLINAS_BY_AREA`, `ALL_DISCIPLINAS`, `DISCIPLINA_LABELS`, `DISCIPLINA_AREA` (reverse lookup).
- `src/data/disciplinas.test.js` — unit tests for the constants and helpers.
- `src/data/disciplinaFromTag.js` — `TAG_TO_DISCIPLINA` map keyed by `${area}::${tag}`, `disciplinasForQuestion(question)` helper.
- `src/data/disciplinaFromTag.test.js` — tag-mapping unit tests including cross-cutting tags, language-derived, math auto-tag, empty cases.
- `scripts/backfill-disciplinas.js` — Node ESM script that writes `disciplinas` onto every question JSON file.

**Modified files:**
- `public/*_enem_*.json` (32 files) — each question gets a new `disciplinas: string[]` field (backfill).
- `src/App.jsx` — adds disciplina-multiselect state, `startDisciplinaQuiz`, the home picker UI swap, and a disciplina-level grouping in the summary breakdown. Also bumps `APP_VERSION`/`APP_VERSION_DATE` and adds a `CHANGELOG` entry per the user's standing rule.
- `NOTES.MD` — adds a `[x] Disciplinas` checkbox under the relevant feature section.

**Files explicitly NOT touched:**
- The `area` field on every question (keeps Dia 1 / Dia 2 prova completa working).
- The existing `tags` field on every question (becomes "subtags" by convention only).
- The contexts file (`public/contexts.json`) — disciplinas are a per-question concept.
- User attempt storage in `localStorage` — keyed by question number, unaffected.

---

## Task 1: Disciplina taxonomy constants

**Files:**
- Create: `src/data/disciplinas.js`
- Create: `src/data/disciplinas.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/data/disciplinas.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  DISCIPLINAS_BY_AREA,
  ALL_DISCIPLINAS,
  DISCIPLINA_LABELS,
  DISCIPLINA_AREA,
  disciplinaLabel,
  areaForDisciplina,
} from './disciplinas.js'

describe('DISCIPLINAS_BY_AREA', () => {
  it('covers the four ENEM areas', () => {
    expect(Object.keys(DISCIPLINAS_BY_AREA).sort()).toEqual(
      ['humanas', 'linguagens', 'math', 'nature']
    )
  })

  it('linguagens has five disciplinas (Português, Literatura, Língua Estrangeira, Artes, Educação Física)', () => {
    expect(DISCIPLINAS_BY_AREA.linguagens).toEqual([
      'portugues', 'literatura', 'lingua_estrangeira', 'artes', 'educacao_fisica',
    ])
  })

  it('humanas has four disciplinas', () => {
    expect(DISCIPLINAS_BY_AREA.humanas).toEqual([
      'historia', 'geografia', 'filosofia', 'sociologia',
    ])
  })

  it('nature has three disciplinas', () => {
    expect(DISCIPLINAS_BY_AREA.nature).toEqual(['fisica', 'quimica', 'biologia'])
  })

  it('math has one disciplina', () => {
    expect(DISCIPLINAS_BY_AREA.math).toEqual(['matematica'])
  })
})

describe('ALL_DISCIPLINAS', () => {
  it('is the flat 13-entry slug list', () => {
    expect(ALL_DISCIPLINAS).toHaveLength(13)
    expect(new Set(ALL_DISCIPLINAS).size).toBe(13)
  })
})

describe('DISCIPLINA_LABELS', () => {
  it('has display label for every slug', () => {
    for (const slug of ALL_DISCIPLINAS) {
      expect(DISCIPLINA_LABELS[slug]).toBeTypeOf('string')
      expect(DISCIPLINA_LABELS[slug].length).toBeGreaterThan(0)
    }
  })

  it('keeps accents in labels', () => {
    expect(DISCIPLINA_LABELS.portugues).toBe('Português')
    expect(DISCIPLINA_LABELS.matematica).toBe('Matemática')
    expect(DISCIPLINA_LABELS.educacao_fisica).toBe('Educação Física')
    expect(DISCIPLINA_LABELS.lingua_estrangeira).toBe('Língua Estrangeira')
  })
})

describe('DISCIPLINA_AREA reverse lookup', () => {
  it('maps each disciplina back to its area', () => {
    expect(DISCIPLINA_AREA.quimica).toBe('nature')
    expect(DISCIPLINA_AREA.historia).toBe('humanas')
    expect(DISCIPLINA_AREA.portugues).toBe('linguagens')
    expect(DISCIPLINA_AREA.matematica).toBe('math')
  })
})

describe('helpers', () => {
  it('disciplinaLabel returns label or the slug if unknown', () => {
    expect(disciplinaLabel('quimica')).toBe('Química')
    expect(disciplinaLabel('zzz')).toBe('zzz')
    expect(disciplinaLabel(null)).toBe(null)
  })

  it('areaForDisciplina returns the area', () => {
    expect(areaForDisciplina('biologia')).toBe('nature')
    expect(areaForDisciplina('zzz')).toBe(null)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/data/disciplinas.test.js`
Expected: FAIL with `Cannot find module './disciplinas.js'`.

- [ ] **Step 3: Create the module**

Create `src/data/disciplinas.js`:

```js
// Discipline taxonomy. See docs/superpowers/specs/2026-06-07-discipline-tagging-design.md
// Slugs are ascii lowercase; labels keep accents for display.

export const DISCIPLINAS_BY_AREA = {
  linguagens: ['portugues', 'literatura', 'lingua_estrangeira', 'artes', 'educacao_fisica'],
  humanas:    ['historia', 'geografia', 'filosofia', 'sociologia'],
  nature:     ['fisica', 'quimica', 'biologia'],
  math:       ['matematica'],
}

export const DISCIPLINA_LABELS = {
  portugues:          'Português',
  literatura:         'Literatura',
  lingua_estrangeira: 'Língua Estrangeira',
  artes:              'Artes',
  educacao_fisica:    'Educação Física',
  historia:           'História',
  geografia:          'Geografia',
  filosofia:          'Filosofia',
  sociologia:         'Sociologia',
  fisica:             'Física',
  quimica:            'Química',
  biologia:           'Biologia',
  matematica:         'Matemática',
}

export const ALL_DISCIPLINAS = Object.values(DISCIPLINAS_BY_AREA).flat()

export const DISCIPLINA_AREA = Object.fromEntries(
  Object.entries(DISCIPLINAS_BY_AREA).flatMap(
    ([area, slugs]) => slugs.map((slug) => [slug, area])
  )
)

export function disciplinaLabel(slug) {
  if (slug == null) return null
  return DISCIPLINA_LABELS[slug] ?? slug
}

export function areaForDisciplina(slug) {
  return DISCIPLINA_AREA[slug] ?? null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/data/disciplinas.test.js`
Expected: PASS, all assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/data/disciplinas.js src/data/disciplinas.test.js
git commit -m "feat: add disciplina taxonomy constants"
```

---

## Task 2: Tag → disciplina mapping + `disciplinasForQuestion`

**Files:**
- Create: `src/data/disciplinaFromTag.js`
- Create: `src/data/disciplinaFromTag.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/data/disciplinaFromTag.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  disciplinasForTag,
  disciplinasForQuestion,
} from './disciplinaFromTag.js'

describe('disciplinasForTag', () => {
  it('maps unambiguous nature tags', () => {
    expect(disciplinasForTag('nature', 'termologia')).toEqual(['fisica'])
    expect(disciplinasForTag('nature', 'estequiometria')).toEqual(['quimica'])
    expect(disciplinasForTag('nature', 'ecologia')).toEqual(['biologia'])
  })

  it('maps unambiguous humanas tags', () => {
    expect(disciplinasForTag('humanas', 'história moderna')).toEqual(['historia'])
    expect(disciplinasForTag('humanas', 'cartografia')).toEqual(['geografia'])
    expect(disciplinasForTag('humanas', 'ética e política')).toEqual(['filosofia'])
    expect(disciplinasForTag('humanas', 'sociologia e estrutura social')).toEqual(['sociologia'])
  })

  it('maps unambiguous linguagens tags', () => {
    expect(disciplinasForTag('linguagens', 'interpretação de texto')).toEqual(['portugues'])
    expect(disciplinasForTag('linguagens', 'literatura brasileira')).toEqual(['literatura'])
    expect(disciplinasForTag('linguagens', 'língua inglesa')).toEqual(['lingua_estrangeira'])
    expect(disciplinasForTag('linguagens', 'artes visuais')).toEqual(['artes'])
  })

  it('resolves cross-cutting tags by area', () => {
    expect(disciplinasForTag('humanas', 'meio ambiente e sustentabilidade')).toEqual(['geografia'])
    expect(disciplinasForTag('nature',  'meio ambiente e sustentabilidade')).toEqual(['biologia'])
    expect(disciplinasForTag('humanas', 'climatologia')).toEqual(['geografia'])
    expect(disciplinasForTag('nature',  'climatologia')).toEqual(['biologia'])
    expect(disciplinasForTag('humanas', 'história da cultura e arte')).toEqual(['historia'])
    expect(disciplinasForTag('linguagens', 'história da cultura e arte')).toEqual(['artes'])
    expect(disciplinasForTag('humanas', 'cultura e identidade')).toEqual(['sociologia'])
    expect(disciplinasForTag('humanas', 'comunicação e mídia')).toEqual(['sociologia'])
  })

  it('returns [] for unmapped tags', () => {
    expect(disciplinasForTag('linguagens', 'comunicação e mídia')).toEqual([])
    expect(disciplinasForTag('humanas', 'totally-made-up')).toEqual([])
  })
})

describe('disciplinasForQuestion', () => {
  it('returns ["matematica"] for any math question regardless of tags', () => {
    expect(disciplinasForQuestion({
      area: 'math', tags: ['geometria plana'],
    })).toEqual(['matematica'])
    expect(disciplinasForQuestion({
      area: 'math', tags: [],
    })).toEqual(['matematica'])
  })

  it('combines multiple tags into a sorted unique list', () => {
    expect(disciplinasForQuestion({
      area: 'nature',
      tags: ['química orgânica', 'fisiologia humana'],
    })).toEqual(['biologia', 'quimica'])
  })

  it('deduplicates when multiple tags resolve to the same disciplina', () => {
    expect(disciplinasForQuestion({
      area: 'nature',
      tags: ['ecologia', 'fisiologia humana'],
    })).toEqual(['biologia'])
  })

  it('adds lingua_estrangeira when language is en or es', () => {
    expect(disciplinasForQuestion({
      area: 'linguagens',
      tags: [],
      language: 'en',
    })).toEqual(['lingua_estrangeira'])
    expect(disciplinasForQuestion({
      area: 'linguagens',
      tags: ['interpretação de texto'],
      language: 'es',
    })).toEqual(['lingua_estrangeira', 'portugues'])
  })

  it('returns [] when no tag maps and no language hint', () => {
    expect(disciplinasForQuestion({
      area: 'linguagens',
      tags: ['totally-made-up'],
    })).toEqual([])
  })

  it('tolerates missing tags field', () => {
    expect(disciplinasForQuestion({ area: 'math' })).toEqual(['matematica'])
    expect(disciplinasForQuestion({ area: 'linguagens' })).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/data/disciplinaFromTag.test.js`
Expected: FAIL with `Cannot find module './disciplinaFromTag.js'`.

- [ ] **Step 3: Create the mapping module**

Create `src/data/disciplinaFromTag.js`:

```js
// Tag → disciplina mapping. Keyed by `${area}::${tag}` because some tags
// (e.g. "climatologia") mean different disciplinas in different areas.
// See docs/superpowers/specs/2026-06-07-discipline-tagging-design.md §"Tag → disciplina mapping".

const M = {}
const add = (area, tag, disciplina) => {
  M[`${area}::${tag}`] = disciplina
}

// ── Nature → Física ──────────────────────────────────────────────────────────
for (const t of [
  'eletricidade e magnetismo', 'mecânica newtoniana', 'termologia',
  'física moderna', 'óptica', 'ondulatória e acústica', 'ondulatória',
  'física nuclear e radioatividade', 'física nuclear',
  'gravitação e astronomia', 'cinemática', 'hidrostática',
  'análise de circuitos', 'transferência de calor', 'energia e conservação',
  'dispersão da luz', 'energia e trabalho', 'pressão', 'física',
]) add('nature', t, 'fisica')

// ── Nature → Química ─────────────────────────────────────────────────────────
for (const t of [
  'química geral e inorgânica', 'química orgânica',
  'termoquímica e cinética', 'termoquímica', 'estequiometria',
  'soluções e solubilidade', 'eletroquímica', 'equilíbrio químico',
  'cinética química', 'análise qualitativa', 'ligações químicas',
  'propriedades dos líquidos', 'chemistry estrutura molecular',
]) add('nature', t, 'quimica')

// ── Nature → Biologia ────────────────────────────────────────────────────────
for (const t of [
  'ecologia', 'fisiologia humana', 'genética e hereditariedade',
  'microbiologia e imunologia', 'microbiologia',
  'imunologia e microbiologia', 'citologia', 'biotecnologia',
  'evolução', 'zoologia', 'botânica', 'comportamento animal',
  'biologia molecular', 'sistema nervoso', 'fisiologia de plantas',
  'fisiologia vegetal', 'reprodução vegetal', 'epidemiologia',
  'endocrinologia', 'meio ambiente e sustentabilidade', 'biologia',
  'climatologia',
]) add('nature', t, 'biologia')

// ── Humanas → História ───────────────────────────────────────────────────────
for (const t of [
  'história moderna', 'história contemporânea',
  'história do brasil república', 'história do brasil colonial',
  'história do brasil imperial', 'história do brasil império',
  'história antiga e medieval', 'história medieval',
  'história moderna e contemporânea', 'história contemporânea do brasil',
  'história da cultura e arte', 'história das cruzadas',
]) add('humanas', t, 'historia')

// ── Humanas → Geografia ──────────────────────────────────────────────────────
for (const t of [
  'geografia humana e urbana', 'geografia física e geologia',
  'geopolítica e território', 'geopolítica e relações internacionais',
  'climatologia', 'cartografia',
  'clima e processos geomorfológicos',
  'geografia: cartografia', 'geografia: geografia humana e urbana',
  'meio ambiente e sustentabilidade',
]) add('humanas', t, 'geografia')

// ── Humanas → Filosofia ──────────────────────────────────────────────────────
for (const t of [
  'filosofia moderna e contemporânea', 'filosofia antiga e medieval',
  'ética e política', 'epistemologia e lógica',
  'filosofia e sociologia', 'filosofia e educação',
]) add('humanas', t, 'filosofia')

// ── Humanas → Sociologia ─────────────────────────────────────────────────────
for (const t of [
  'sociologia e estrutura social', 'cultura e identidade',
  'direitos humanos e cidadania', 'comunicação e mídia',
  'institucionalismo religioso', 'política e direitos humanos',
  'ciência e tecnologia', 'educação e políticas públicas',
]) add('humanas', t, 'sociologia')

// ── Linguagens → Português ───────────────────────────────────────────────────
for (const t of [
  'interpretação de texto', 'linguística e variação linguística',
  'gêneros textuais',
]) add('linguagens', t, 'portugues')

// ── Linguagens → Literatura ──────────────────────────────────────────────────
for (const t of [
  'literatura brasileira', 'literatura mundial',
]) add('linguagens', t, 'literatura')

// ── Linguagens → Língua Estrangeira ──────────────────────────────────────────
for (const t of [
  'língua espanhola', 'língua inglesa',
]) add('linguagens', t, 'lingua_estrangeira')

// ── Linguagens → Artes ───────────────────────────────────────────────────────
for (const t of [
  'artes visuais', 'música e dança', 'história da cultura e arte',
]) add('linguagens', t, 'artes')

export const TAG_TO_DISCIPLINA = M

export function disciplinasForTag(area, tag) {
  const slug = M[`${area}::${tag}`]
  return slug ? [slug] : []
}

export function disciplinasForQuestion(question) {
  if (!question) return []
  if (question.area === 'math') return ['matematica']

  const set = new Set()
  for (const tag of question.tags ?? []) {
    const slug = M[`${question.area}::${tag}`]
    if (slug) set.add(slug)
  }
  if (question.area === 'linguagens' &&
      (question.language === 'en' || question.language === 'es')) {
    set.add('lingua_estrangeira')
  }
  return [...set].sort()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/data/disciplinaFromTag.test.js`
Expected: PASS, all assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/data/disciplinaFromTag.js src/data/disciplinaFromTag.test.js
git commit -m "feat: add tag→disciplina mapping and disciplinasForQuestion helper"
```

---

## Task 3: Backfill script

**Files:**
- Create: `scripts/backfill-disciplinas.js`

- [ ] **Step 1: Write the script**

Create `scripts/backfill-disciplinas.js`:

```js
// scripts/backfill-disciplinas.js
// Idempotent: writes question.disciplinas onto every public/*_enem_*.json.
// Skips questions that already have a non-empty disciplinas array.
// Prints a summary including the "empty disciplinas" list for manual follow-up.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { disciplinasForQuestion } from '../src/data/disciplinaFromTag.js'
import { ALL_DISCIPLINAS } from '../src/data/disciplinas.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PUBLIC_DIR = path.join(ROOT, 'public')

function detectIndent(raw) {
  const m = raw.match(/^\{\s*\n(\s+)"/) || raw.match(/^\[\s*\n(\s+)\{/)
  return m ? m[1] : '  '
}

function isQuestionFile(name) {
  return /^(linguagens|humanas|nature|math)_enem_\d{4}\.json$/.test(name)
}

const files = fs.readdirSync(PUBLIC_DIR)
  .filter(isQuestionFile)
  .sort()

const counts = Object.fromEntries(ALL_DISCIPLINAS.map((d) => [d, 0]))
const empties = []
let totalProcessed = 0
let totalUpdated = 0
let multidiscCount = 0

for (const filename of files) {
  const filepath = path.join(PUBLIC_DIR, filename)
  const raw = fs.readFileSync(filepath, 'utf8')
  const indent = detectIndent(raw)
  const data = JSON.parse(raw)
  if (!Array.isArray(data)) continue

  let changed = false
  for (const q of data) {
    totalProcessed++
    if (Array.isArray(q.disciplinas) && q.disciplinas.length > 0) {
      for (const d of q.disciplinas) counts[d] = (counts[d] ?? 0) + 1
      if (q.disciplinas.length > 1) multidiscCount++
      continue
    }
    const disciplinas = disciplinasForQuestion(q)
    q.disciplinas = disciplinas
    changed = true
    totalUpdated++
    if (disciplinas.length === 0) {
      empties.push(`${filename}#q${q.number}`)
    } else {
      for (const d of disciplinas) counts[d] = (counts[d] ?? 0) + 1
      if (disciplinas.length > 1) multidiscCount++
    }
  }

  if (changed) {
    fs.writeFileSync(filepath, JSON.stringify(data, null, indent) + '\n', 'utf8')
    console.log(`updated ${filename}`)
  }
}

console.log('')
console.log(`Total questions processed : ${totalProcessed}`)
console.log(`Total questions updated   : ${totalUpdated}`)
console.log(`Multidisciplinar          : ${multidiscCount}`)
console.log('Per-disciplina counts:')
for (const d of ALL_DISCIPLINAS) {
  console.log(`  ${d.padEnd(20)} ${counts[d]}`)
}
console.log(`Empty disciplinas (${empties.length}) — needs manual fixup:`)
for (const e of empties) console.log(`  ${e}`)
```

- [ ] **Step 2: Verify it parses (dry import)**

Run: `node --check scripts/backfill-disciplinas.js`
Expected: no output (parses successfully).

- [ ] **Step 3: Commit the script**

```bash
git add scripts/backfill-disciplinas.js
git commit -m "tools: add disciplinas backfill script"
```

---

## Task 4: Run the backfill and commit the data

**Files:**
- Modify: every `public/*_enem_*.json` (32 files) — adds `disciplinas: string[]` per question.

- [ ] **Step 1: Run the backfill**

Run: `node scripts/backfill-disciplinas.js | tee /tmp/disciplinas-backfill.log`
Expected:
- One `updated <file>` line per JSON file.
- Per-disciplina counts non-zero for every slug except possibly `educacao_fisica` (manual pass).
- A final list under `Empty disciplinas (...)` — save this list, you will need it in Task 5.

- [ ] **Step 2: Spot-check one file**

Run: `git diff --stat public/math_enem_2023.json` and confirm only `+ "disciplinas": ["matematica"]` lines were added (no other content modified).

Run: `python3 -c "import json; json.load(open('public/math_enem_2023.json')); print('Valid')"`
Expected: `Valid`.

- [ ] **Step 3: Re-run to verify idempotency**

Run: `node scripts/backfill-disciplinas.js`
Expected: NO `updated …` lines (`Total questions updated : 0`); summary counts unchanged.

- [ ] **Step 4: Commit the data**

```bash
git add public/*_enem_*.json
git commit -m "data: backfill disciplinas on all questions

Generated by scripts/backfill-disciplinas.js. Adds a disciplinas string[]
to every question, derived from existing tags + area + language."
```

---

## Task 5: Manual fixups (Educação Física + empty-disciplinas)

**Files:**
- Modify: specific `public/*_enem_*.json` files identified in the empty-disciplinas list and the EdFís scan.

This is a manual data pass — no TDD steps, no code. The goal is to drive the "empty disciplinas" list from Task 4 down to zero and tag Educação Física questions.

- [ ] **Step 1: Identify Educação Física questions**

Run: `grep -li -E "educação física|esporte|atleta|treino|exercício físico|copa do mundo|olimpíada|futebol|basquete|vôlei|natação" public/linguagens_enem_*.json | head`
Open each candidate file, find the question, and confirm it's actually about physical education (the topic of the passage). False positives are common — read each one.

- [ ] **Step 2: Tag EdFís questions**

For each confirmed EdFís question, edit the file so its `disciplinas` field contains `"educacao_fisica"`. If the array is currently `[]`, replace with `["educacao_fisica"]`. If the question is already tagged with another disciplina (e.g., `["portugues"]`), add to the array and re-sort: `["educacao_fisica", "portugues"]`.

- [ ] **Step 3: Fix every remaining empty entry**

For each entry in the Task 4 empty-disciplinas log:
- Open the file at the question number.
- Read the question and tags.
- Decide the right disciplina(s) based on the spec's mapping table. If a recurring tag is missing from `disciplinaFromTag.js` (e.g., a new tag introduced in a recent review), prefer adding the tag to the map and re-running the backfill over hand-editing the JSON. If it's a one-off, hand-edit the JSON.

- [ ] **Step 4: Verify zero remaining empties**

Run: `node scripts/backfill-disciplinas.js`
Expected: `Empty disciplinas (0)`.

- [ ] **Step 5: Validate all JSON**

Run: `for f in public/*_enem_*.json; do python3 -c "import json; json.load(open('$f'))" || echo "BAD: $f"; done`
Expected: no `BAD:` lines.

- [ ] **Step 6: Commit**

```bash
git add public/*_enem_*.json src/data/disciplinaFromTag.js
git commit -m "data: manual disciplina fixups (EdFís + edge cases)"
```

(If only JSON was touched, `src/data/disciplinaFromTag.js` won't appear — that's fine.)

---

## Task 6: Wire disciplina state and `startDisciplinaQuiz` action

**Files:**
- Modify: `src/App.jsx` — new state, new action; does not yet change the UI.

- [ ] **Step 1: Import the data modules**

Open `src/App.jsx`. Near the top of the file (after the existing React/util imports, before `AREA_LABELS`), add:

```js
import {
  DISCIPLINAS_BY_AREA,
  ALL_DISCIPLINAS,
  DISCIPLINA_LABELS,
  DISCIPLINA_AREA,
  disciplinaLabel,
} from './data/disciplinas.js'
```

If `App.jsx` already has an import block sorted by source, slot this alphabetically with the other relative imports.

- [ ] **Step 2: Add the multiselect state**

Find the line `const [selectedTag, setSelectedTag] = useState(null)` (currently around line 579). Immediately below it, add:

```jsx
  const [selectedDisciplinas, setSelectedDisciplinas] = useState([])
  const [multidisciplinarOnly, setMultidisciplinarOnly] = useState(false)
```

- [ ] **Step 3: Add the `startDisciplinaQuiz` action**

Find `const startAreaQuiz = useCallback(...)` (currently around line 1374). Immediately after its closing `, [allQuestions, foreignLang])` line, add:

```jsx
  const startDisciplinaQuiz = useCallback((disciplinas, opts = {}) => {
    const { multidisciplinarOnly: multi = false, tag = null } = opts
    const wanted = new Set(disciplinas)
    const pool = allQuestions.filter((q) => {
      const qDisc = q.disciplinas ?? []
      if (multi && qDisc.length < 2) return false
      if (wanted.size > 0 && !qDisc.some((d) => wanted.has(d))) return false
      if (tag !== null && !q.tags?.includes(tag)) return false
      return true
    })
    if (pool.length === 0) return

    const variants = {}
    pool.forEach((q) => {
      if (q.language) {
        if (!variants[q.number]) variants[q.number] = {}
        variants[q.number][q.language] = q
      }
    })
    langVariantsRef.current = variants

    const deduped = pool.filter((q) => !q.language || q.language === foreignLang)
    const shuffled = [...deduped]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    const picked = shuffled.slice(0, 10)

    clearPausedSession()
    setAttempts({})
    saveAttemptsToSession({})
    // Reuse selectedArea/selectedTag for the existing sidebar/header logic.
    // When multiple disciplinas span areas we leave selectedArea null.
    const areas = new Set(disciplinas.map((d) => DISCIPLINA_AREA[d]).filter(Boolean))
    setSelectedArea(areas.size === 1 ? [...areas][0] : null)
    setSelectedTag(tag)
    setExpandedArea(null)
    setIsDailyChallenge(false)
    const now = Date.now()
    startTimeRef.current = now
    questionStartRef.current = now
    accQuestionTimesRef.current = {}
    prevQuestionNumRef.current = null
    setQuestions(picked)
    setQuestion(picked[0])
    setTotalElapsed(0)
    setQuestionElapsed(0)
    setPhase('quiz')
  }, [allQuestions, foreignLang])
```

- [ ] **Step 4: Verify the dev build still compiles**

Run: `npm run build`
Expected: build succeeds. No new warnings about unused imports (you imported them and will use them in the next task).

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add disciplina state and startDisciplinaQuiz action"
```

---

## Task 7: Replace the home area picker with a disciplina picker

**Files:**
- Modify: `src/App.jsx` — replaces the "Estudar por área" block at the home screen.

- [ ] **Step 1: Replace the picker JSX**

Open `src/App.jsx`. Find the `<div className="home-area-section">` block (currently around line 1867). Replace the entire block (from `<div className="home-area-section">` through its matching `</div>` — around line 1899) with:

```jsx
                <div className="home-area-section">
                  <span className="home-filter-label">Estudar por disciplina</span>
                  {(['linguagens', 'humanas', 'nature', 'math']).map((area) => (
                    <div key={area} className="home-area-day-group">
                      <span className="home-area-day-label">{AREA_LABELS[area]}</span>
                      <div className="home-area-grid">
                        {DISCIPLINAS_BY_AREA[area].map((slug) => {
                          const active = selectedDisciplinas.includes(slug)
                          return (
                            <button
                              key={slug}
                              type="button"
                              className={`home-area-pill${active ? ' home-area-pill--active' : ''}`}
                              onClick={() => {
                                setSelectedDisciplinas((prev) =>
                                  prev.includes(slug)
                                    ? prev.filter((s) => s !== slug)
                                    : [...prev, slug]
                                )
                              }}
                            >
                              {DISCIPLINA_LABELS[slug]}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                  <div className="home-area-day-group">
                    <span className="home-area-day-label">Outros</span>
                    <div className="home-area-grid">
                      <button
                        type="button"
                        className={`home-area-pill${multidisciplinarOnly ? ' home-area-pill--active' : ''}`}
                        onClick={() => setMultidisciplinarOnly((v) => !v)}
                      >
                        Multidisciplinar
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="home-area-pill home-area-pill--primary"
                    disabled={selectedDisciplinas.length === 0 && !multidisciplinarOnly}
                    onClick={() => startDisciplinaQuiz(selectedDisciplinas, { multidisciplinarOnly })}
                  >
                    Começar simulado
                  </button>
                </div>
```

- [ ] **Step 2: Verify the dev build compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Smoke-test in the browser**

Run: `npm run dev` in another terminal. Open the app, log in. Verify:
1. The home screen now shows four area-labelled groups, each with its disciplina pills.
2. Clicking a pill toggles it (active state).
3. The "Multidisciplinar" pill toggles independently.
4. "Começar simulado" is disabled until at least one filter is active.
5. Clicking "Começar simulado" with `Química` selected loads a quiz of up to 10 questions, all containing `"quimica"` in their disciplinas.
6. Clicking with only `Multidisciplinar` loads a quiz where every question has 2+ disciplinas.

Kill the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: disciplina-first home picker with Multidisciplinar filter"
```

---

## Task 8: Add disciplina-level grouping to the summary screen

**Files:**
- Modify: `src/App.jsx` — augments the existing `tagStats`/`tagList` block.

- [ ] **Step 1: Build the disciplina aggregation**

Open `src/App.jsx`. Find the `// ── Subject breakdown ──` comment (around line 2128). Just below the existing `tagList` definition (`.sort((a, b) => a.hitRate - b.hitRate)`, around line 2155) and BEFORE the `const weakTags = ...` line, add:

```jsx
    // ── Disciplina breakdown ───────────────────────────────────────────────
    const discStats = {}
    scorableQuestions.forEach((q) => {
      const att = attempts[q.number]
      const t = questionTimes[q.number] || 0
      ;(q.disciplinas || []).forEach((slug) => {
        if (!discStats[slug]) discStats[slug] = { total: 0, answered: 0, correct: 0, time: 0 }
        discStats[slug].total++
        if (att) {
          discStats[slug].answered++
          if (att.correct) discStats[slug].correct++
          discStats[slug].time += t
        }
      })
    })

    const discList = Object.entries(discStats)
      .filter(([, s]) => s.answered >= 1)
      .map(([slug, s]) => ({
        slug,
        label: DISCIPLINA_LABELS[slug] ?? slug,
        total: s.total,
        answered: s.answered,
        correct: s.correct,
        time: s.time,
        hitRate: Math.round((s.correct / s.answered) * 100),
        avgTime: Math.round(s.time / s.answered),
      }))
      .sort((a, b) => a.hitRate - b.hitRate)
```

- [ ] **Step 2: Expose `discList` from the memo**

Find where the memo currently returns its object (search for the return statement closing the `useMemo` that contains `tagStats`, `tagList`, `diagnosis`, `insights`). Add `discList,` to the returned object alongside `tagList`.

For example, if the return looks like:

```js
return { answeredCount, correctCount, wrongCount, unansweredCount, avgTime, tagList, diagnosis, insights, ... }
```

Change to:

```js
return { answeredCount, correctCount, wrongCount, unansweredCount, avgTime, tagList, discList, diagnosis, insights, ... }
```

- [ ] **Step 3: Render the disciplina section in the resumo UI**

In the summary JSX (search for where `tagList` or `diagnosis` is consumed in render), locate the heading for the existing tag breakdown ("Assuntos de menor domínio" or similar). Just above that block, add:

```jsx
{discList.length > 0 && (
  <div className="summary-disc-section">
    <h4>Desempenho por disciplina</h4>
    <ul className="summary-disc-list">
      {discList.map((d) => (
        <li key={d.slug} className="summary-disc-row">
          <span className="summary-disc-label">{d.label}</span>
          <span className="summary-disc-stats">
            {d.correct}/{d.answered} ({d.hitRate}%) · {d.avgTime}s média
          </span>
        </li>
      ))}
    </ul>
  </div>
)}
```

(If the surrounding render code destructures the memo result, add `discList` to the destructure list.)

- [ ] **Step 4: Smoke-test**

Run: `npm run dev`. Start a disciplina quiz (Task 7), answer all 10 questions, finish to summary. Confirm the "Desempenho por disciplina" section appears with the right disciplinas listed and hit rates that match what you answered.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: disciplina-level breakdown in summary"
```

---

## Task 9: Changelog, version bump, and NOTES.MD

Per the user's standing rule (`feedback_changelog_updates.md`, `feedback_changelog_patch_bump.md`, `feedback_review_update_places.md`): every feature change bumps `APP_VERSION` and adds a CHANGELOG entry; patch (x.y.Z) only bumps when the date changes; NOTES.MD needs a checkbox update too.

**Files:**
- Modify: `src/App.jsx` — `APP_VERSION`, `APP_VERSION_DATE`, `CHANGELOG`.
- Modify: `NOTES.MD` — add a `[x] Tags por disciplina` line.

- [ ] **Step 1: Bump APP_VERSION and APP_VERSION_DATE**

Open `src/App.jsx`. Find the `APP_VERSION` and `APP_VERSION_DATE` constants (near the top of the file). Bump the minor (it's a new feature): `1.14.5` → `1.15.0`, date → `07/06/2026`.

If the date is the same day as the previous entry, append items to that entry instead (patch bump only on new date — but this is a minor bump, so it gets its own entry regardless).

- [ ] **Step 2: Add the CHANGELOG entry**

In the `CHANGELOG` array (top of the file), insert a new entry at the top:

```js
  {
    version: '1.15.0',
    date: '07/06/2026',
    items: [
      'Nova taxonomia de disciplinas (Química, Física, Biologia, História, etc.) extraída a partir das tags existentes',
      'Picker da tela inicial reorganizado por disciplina; filtro "Multidisciplinar" para questões com mais de uma disciplina',
      'Tela de resumo agora mostra o desempenho agrupado por disciplina',
    ],
  },
```

- [ ] **Step 3: Update NOTES.MD**

Open `NOTES.MD`. Under the `MODOS DE USO` block (or wherever taxonomy-related entries fit), add:

```
[x] Selecao por DISCIPLINA (Quimica, Fisica, Biologia, Historia, etc.)
[x] Filtro de questoes MULTIDISCIPLINARES
```

- [ ] **Step 4: Verify the version banner**

Run: `npm run dev`. Open the app. The version banner / changelog modal (wherever displayed) should show `1.15.0 — 07/06/2026` with the three bullet items.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx NOTES.MD
git commit -m "chore: bump to 1.15.0 (disciplina tagging)"
```

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task(s) |
|---|---|
| Goals 1 + 5 (disciplina layer between area and tags, preserve tags) | Tasks 1–4 |
| Goal 2 (disciplinas are primary filter) | Task 7 |
| Goal 3 (multidisciplinar first-class) | Tasks 1, 6 (`multidisciplinarOnly` flag), 7 (pill) |
| Goal 4 (Dia 1/Dia 2 untouched) | No-op by design — the existing `startQuiz` test-selector path is not modified |
| Taxonomy table | Task 1 |
| Data model (`disciplinas: string[]`) | Task 4 (every question gets one), Task 5 (cleanup) |
| Tag → disciplina mapping, cross-cutting tags | Task 2 |
| `disciplinasForQuestion` (language hint, math auto-tag) | Task 2 |
| Subject picker UI | Task 7 |
| Simulado de disciplina (10-question, same as today's tag-filter simulado) | Task 6 (`startDisciplinaQuiz`) + Task 7 (entry button) |
| Summary screen disciplina grouping | Task 8 |
| Rollout step 1 (constants + mapping) | Tasks 1, 2 |
| Rollout step 2 (backfill script) | Tasks 3, 4 |
| Rollout step 3 (manual fixups + EdFís) | Task 5 |
| Rollout step 4 (UI) | Tasks 6, 7, 8 |
| Backwards compat (area + tags + attempts unchanged) | By construction across all tasks |

No gaps.

**2. Placeholder scan:** No TBDs, no "implement later", no "similar to Task N", no naked "add error handling". Every code-changing step has runnable code.

**3. Type / name consistency:**
- Slugs are spelled identically everywhere: `portugues`, `literatura`, `lingua_estrangeira`, `artes`, `educacao_fisica`, `historia`, `geografia`, `filosofia`, `sociologia`, `fisica`, `quimica`, `biologia`, `matematica`.
- Imports (`DISCIPLINAS_BY_AREA`, `ALL_DISCIPLINAS`, `DISCIPLINA_LABELS`, `DISCIPLINA_AREA`, `disciplinaLabel`) match exports in Task 1.
- `disciplinasForQuestion`/`disciplinasForTag` exported in Task 2 are consumed by Task 3 (`disciplinasForQuestion`) and Task 6 (`DISCIPLINA_AREA`).
- State setters (`setSelectedDisciplinas`, `setMultidisciplinarOnly`) defined in Task 6 are consumed in Task 7.
- `discList` returned from the summary memo in Task 8 step 2 matches the destructure in step 3.

Plan is internally consistent.

---

Plan complete and saved to `docs/superpowers/plans/2026-06-07-discipline-tagging.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
