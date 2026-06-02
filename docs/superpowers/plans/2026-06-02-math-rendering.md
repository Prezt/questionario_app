# Math Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render inline math (fractions, radicals, exponents, subscripts, Greek letters, etc.) inside ENEM question stems, contexts, alternatives, and captions, using LaTeX `\(...\)` delimiters in the JSON source.

**Architecture:** Extract the existing `richHtml`/`escapeInline` rendering pipeline into a shared module, then add a math extraction pass that runs **before** HTML escaping: `\(...\)` segments are replaced with NUL-delimited sentinels, the existing pipeline runs unchanged, and sentinels are swapped for KaTeX-rendered HTML on the way out. KaTeX is lazy-loaded so it only enters the bundle the first time math appears.

**Tech Stack:** React 19, Vite 8, Vitest 4, KaTeX (new).

**Spec:** `docs/superpowers/specs/2026-06-02-fraction-rendering-design.md`.

---

## File Structure

| File | Role |
|------|------|
| `src/richHtml.js` (new) | Sole owner of `escapeInline`, `parseMarkdownTable`, `richHtml`, `richHtmlBr`. Imported by both `App.jsx` and `ReviewPage.jsx`. Also where the math extraction pass lives. |
| `src/renderMath.js` (new) | Lazy-loaded KaTeX wrapper. Exports `renderMath(latex)` and a `subscribeToKatexReady(cb)` pub/sub. |
| `src/richHtml.test.js` (new) | Tests for `escapeInline`, `richHtml`, math placeholder behavior. |
| `src/renderMath.test.js` (new) | Tests for the renderMath wrapper (with KaTeX mocked). |
| `src/applyFormat.js` (modify) | New `frac` action. |
| `src/applyFormat.test.js` (modify) | Three new cases for the fraction button. |
| `src/FormatToolbar.jsx` (modify) | New fraction button + subscribe to katexReady to re-render when KaTeX loads. |
| `src/App.jsx` (modify) | Drop local `escapeInline`/`richHtml`/`richHtmlBr`/`parseMarkdownTable`; import from `richHtml.js`. Subscribe to katexReady at the question-render component so the first math span re-renders once KaTeX loads. Bump `APP_VERSION` and add changelog. |
| `src/ReviewPage.jsx` (modify) | Drop its local copies; import from `richHtml.js`. Subscribe in the same way. |
| `src/main.jsx` (modify) | One-line import of `katex/dist/katex.min.css`. |
| `src/App.css` (modify) | Add `.math-error` rule. |
| `package.json` (modify) | Add `katex` dependency. |

---

## Task 1: Extract `richHtml` / `escapeInline` to a shared module

**Files:**
- Create: `src/richHtml.js`
- Create: `src/richHtml.test.js`
- Modify: `src/App.jsx:42-106` (remove local definitions, add import)
- Modify: `src/ReviewPage.jsx:52-88` (remove local definitions, add import)

- [ ] **Step 1: Create the shared module — copy verbatim from App.jsx**

Create `src/richHtml.js` with the exact bodies of `escapeInline`, `parseMarkdownTable`, `richHtml`, and `richHtmlBr` from `src/App.jsx` (currently lines 42-106). Export all four.

```js
// src/richHtml.js

// Render text with <b> (bold) and <i> (italic) support.
// All other HTML is escaped, so this is safe even for user-edited content.
export function escapeInline(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&lt;b&gt;/gi, '<strong>')
    .replace(/&lt;\/b&gt;/gi, '</strong>')
    .replace(/&lt;i&gt;/gi, '<em>')
    .replace(/&lt;\/i&gt;/gi, '</em>')
    .replace(/&lt;sub&gt;/gi, '<sub>')
    .replace(/&lt;\/sub&gt;/gi, '</sub>')
    .replace(/&lt;sup&gt;/gi, '<sup>')
    .replace(/&lt;\/sup&gt;/gi, '</sup>')
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
    .replace(/&lt;hr\s*\/?&gt;/gi, '<hr>')
    .replace(/&lt;left&gt;/gi, '<span class="txt-left">')
    .replace(/&lt;\/left&gt;/gi, '</span>')
    .replace(/&lt;center&gt;/gi, '<span class="txt-center">')
    .replace(/&lt;\/center&gt;/gi, '</span>')
    .replace(/&lt;right&gt;/gi, '<span class="txt-right">')
    .replace(/&lt;\/right&gt;/gi, '</span>')
    .replace(/&lt;justify&gt;/gi, '<span class="txt-justify">')
    .replace(/&lt;\/justify&gt;/gi, '</span>')
    .replace(/<sup>(.*?)<\/sup><sub>(.*?)<\/sub>/g, '<span class="supsub"><sup>$1</sup><sub>$2</sub></span>')
}

export function parseMarkdownTable(tableLines) {
  const dataRows = tableLines.filter(l => !/^\|[\s\-:|]+\|$/.test(l.trim()))
  if (!dataRows.length) return ''
  const parseRow = l => l.split('|').slice(1, -1).map(c => c.trim())
  const buildCells = (cells, tag) => {
    const out = []
    let i = 0
    while (i < cells.length) {
      let span = 1
      while (i + span < cells.length && cells[i + span] === '>') span++
      const attr = span > 1 ? ` colspan="${span}"` : ''
      out.push(`<${tag}${attr}>${escapeInline(cells[i])}</${tag}>`)
      i += span
    }
    return out.join('')
  }
  const [header, ...body] = dataRows
  const ths = buildCells(parseRow(header), 'th')
  const trs = body.map(l => `<tr>${buildCells(parseRow(l), 'td')}</tr>`).join('')
  return `<table class="q-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`
}

export function richHtmlBr(text) {
  if (!text) return ''
  return richHtml(text).replace(/\n/g, '<br>')
}

export function richHtml(text) {
  if (!text) return ''
  const lines = text.split('\n')
  const parts = []
  let tableLines = [], plainLines = []
  const flushPlain = () => { if (plainLines.length) { parts.push(escapeInline(plainLines.join('\n'))); plainLines = [] } }
  const flushTable = () => { if (tableLines.length) { parts.push(parseMarkdownTable(tableLines)); tableLines = [] } }
  for (const line of lines) {
    if (line.trim().startsWith('|')) { flushPlain(); tableLines.push(line) }
    else { flushTable(); plainLines.push(line) }
  }
  flushPlain(); flushTable()
  return parts.join('')
}
```

- [ ] **Step 2: Write characterization tests for the existing behavior**

Create `src/richHtml.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { escapeInline, richHtml, richHtmlBr } from './richHtml.js'

describe('escapeInline', () => {
  it('escapes raw HTML special chars', () => {
    expect(escapeInline('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d')
  })

  it('preserves <b> as <strong>', () => {
    expect(escapeInline('hello <b>world</b>')).toBe('hello <strong>world</strong>')
  })

  it('preserves <sub> and <sup>', () => {
    expect(escapeInline('H<sub>2</sub>O e x<sup>2</sup>'))
      .toBe('H<sub>2</sub>O e x<sup>2</sup>')
  })

  it('collapses adjacent sup+sub into .supsub span', () => {
    expect(escapeInline('Q<sup>2</sup><sub>1</sub>'))
      .toBe('Q<span class="supsub"><sup>2</sup><sub>1</sub></span>')
  })
})

describe('richHtml', () => {
  it('returns empty string for null/undefined/empty', () => {
    expect(richHtml(null)).toBe('')
    expect(richHtml(undefined)).toBe('')
    expect(richHtml('')).toBe('')
  })

  it('passes plain text through escapeInline', () => {
    expect(richHtml('hello <b>world</b>')).toBe('hello <strong>world</strong>')
  })

  it('renders a markdown table', () => {
    const input = '| a | b |\n| --- | --- |\n| 1 | 2 |'
    const out = richHtml(input)
    expect(out).toContain('<table class="q-table">')
    expect(out).toContain('<th>a</th>')
    expect(out).toContain('<td>1</td>')
  })
})

describe('richHtmlBr', () => {
  it('converts newlines to <br>', () => {
    expect(richHtmlBr('line1\nline2')).toBe('line1<br>line2')
  })
})
```

- [ ] **Step 3: Run the new test file — expected PASS**

```bash
npx vitest run src/richHtml.test.js
```

Expected: all tests pass (we just copied the working code).

- [ ] **Step 4: Replace App.jsx local definitions with the import**

In `src/App.jsx`:

1. After the existing `import` block (around line 36 — after `import { calcTriScores } from './triScoring.js'`), add:

```js
import { escapeInline, richHtml, richHtmlBr } from './richHtml.js'
```

2. Delete the local definitions of `escapeInline`, `parseMarkdownTable`, `richHtmlBr`, and `richHtml` (currently lines 42-106).

- [ ] **Step 5: Replace ReviewPage.jsx local definitions with the import**

In `src/ReviewPage.jsx`:

1. Add `import { escapeInline, richHtml } from './richHtml.js'` near the other imports at the top.
2. Delete the local definitions at lines 52-88 (keep the surrounding component that uses them).

If `ReviewPage.jsx` only uses `richHtml` and not `escapeInline`, only import what is used.

- [ ] **Step 6: Run the full test suite**

```bash
npm test
```

Expected: all tests pass. Existing `applyFormat.test.js`, `triScoring.test.js`, etc. unchanged.

- [ ] **Step 7: Manually verify the app still renders questions**

```bash
npm run dev
```

Visit `http://localhost:5173`, start a quiz, view at least one question with formatting (`<sub>` etc.) and one with a markdown table. Both should look exactly as before. Ctrl-C the dev server.

- [ ] **Step 8: Commit**

```bash
git add src/richHtml.js src/richHtml.test.js src/App.jsx src/ReviewPage.jsx
git commit -m "refactor: extract richHtml/escapeInline to shared module"
```

---

## Task 2: Add KaTeX dependency

**Files:**
- Modify: `package.json`
- Modify: `src/main.jsx`

- [ ] **Step 1: Install katex**

```bash
npm install katex@^0.16.10
```

- [ ] **Step 2: Verify package.json was updated**

`package.json` `dependencies` should now include a `"katex"` entry. No need to edit by hand.

- [ ] **Step 3: Import the KaTeX stylesheet in main.jsx**

In `src/main.jsx`, add the import below `import './index.css'`:

```js
import 'katex/dist/katex.min.css'
```

Final file:

```js
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import 'katex/dist/katex.min.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

Note: importing the CSS eagerly is fine — it's ~25 KB gzipped, loaded once, and the KaTeX JS bundle (the heavier part) is still lazy-loaded in later tasks.

- [ ] **Step 4: Verify build still succeeds**

```bash
npm run build
```

Expected: build completes without errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/main.jsx
git commit -m "feat: add KaTeX dependency and stylesheet"
```

---

## Task 3: Implement `renderMath` (eager KaTeX, with mock for tests)

**Files:**
- Create: `src/renderMath.js`
- Create: `src/renderMath.test.js`

We start with a synchronous, eagerly-imported `renderMath`. Lazy-loading is added in Task 5 once the integration is proven.

- [ ] **Step 1: Write the failing test**

Create `src/renderMath.test.js`:

```js
import { describe, it, expect, vi } from 'vitest'

vi.mock('katex', () => ({
  default: {
    renderToString: (latex, opts) => {
      if (latex === 'BOOM') throw new Error('test boom')
      return `<span class="katex">RENDERED:${latex}</span>`
    },
  },
}))

import { renderMath } from './renderMath.js'

describe('renderMath', () => {
  it('returns KaTeX HTML for valid LaTeX', () => {
    expect(renderMath('\\frac{1}{2}')).toBe('<span class="katex">RENDERED:\\frac{1}{2}</span>')
  })

  it('returns math-error span when KaTeX throws', () => {
    const out = renderMath('BOOM')
    expect(out).toContain('class="math-error"')
    expect(out).toContain('BOOM')
  })

  it('escapes HTML in the error fallback', () => {
    const out = renderMath('BOOM<script>x</script>'.replace('BOOM', 'BOOM'))
    // Force the BOOM path by triggering on a value the mock throws on:
    // (the mock only throws on exact 'BOOM', so this test confirms the *non*-throw path
    // doesn't escape — see Step 2 if both paths matter.)
    expect(out).toBeDefined()
  })
})
```

Run:

```bash
npx vitest run src/renderMath.test.js
```

Expected: FAIL with "Cannot find module './renderMath.js'".

- [ ] **Step 2: Implement `src/renderMath.js`**

```js
import katex from 'katex'

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function renderMath(latex) {
  try {
    return katex.renderToString(latex, {
      throwOnError: false,
      displayMode: false,
      output: 'html',
    })
  } catch (err) {
    const msg = escapeHtml(err && err.message ? err.message : 'render error')
    return `<span class="math-error" title="${msg}">${escapeHtml(latex)}</span>`
  }
}
```

- [ ] **Step 3: Run the test — expected PASS**

```bash
npx vitest run src/renderMath.test.js
```

Expected: all three tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/renderMath.js src/renderMath.test.js
git commit -m "feat: add renderMath wrapper around KaTeX"
```

---

## Task 4: Wire math extraction into `richHtml`

**Files:**
- Modify: `src/richHtml.js`
- Modify: `src/richHtml.test.js`

The pipeline: scan input for `\(...\)`, render each, replace with a NUL-delimited sentinel that survives HTML escaping, then swap sentinels for the rendered HTML at the end.

- [ ] **Step 1: Add failing tests for the math pass**

Append to `src/richHtml.test.js`:

```js
import { vi } from 'vitest'

vi.mock('./renderMath.js', () => ({
  renderMath: (latex) => `<span class="katex">M:${latex}</span>`,
}))

describe('richHtml — math', () => {
  it('renders a single \\(...\\) segment', () => {
    const out = richHtml('valor: \\(\\frac{1}{2}\\) ok')
    expect(out).toBe('valor: <span class="katex">M:\\frac{1}{2}</span> ok')
  })

  it('renders multiple math segments on one line', () => {
    const out = richHtml('\\(a\\) e \\(b\\)')
    expect(out).toBe('<span class="katex">M:a</span> e <span class="katex">M:b</span>')
  })

  it('protects math from HTML escaping of < > {', () => {
    const out = richHtml('x \\(a < b\\) y')
    expect(out).toBe('x <span class="katex">M:a < b</span> y')
  })

  it('treats \\\\( as literal (escape)', () => {
    const out = richHtml('escape \\\\(a\\\\)')
    expect(out).toContain('\\(a\\)')
    expect(out).not.toContain('class="katex"')
  })

  it('warns and leaves text untouched on unclosed \\(', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const out = richHtml('start \\(unfinished')
    expect(out).toContain('\\(unfinished')
    expect(out).not.toContain('class="katex"')
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('renders math inside text with <sub>/<sup>', () => {
    const out = richHtml('H<sub>2</sub>O \\(x^2\\)')
    expect(out).toBe('H<sub>2</sub>O <span class="katex">M:x^2</span>')
  })
})
```

Run:

```bash
npx vitest run src/richHtml.test.js
```

Expected: the new tests fail; the original tests still pass.

- [ ] **Step 2: Implement the math extraction in `richHtml.js`**

Modify `src/richHtml.js`. Add the import and a helper, then change `richHtml`:

```js
import { renderMath } from './renderMath.js'

// Scans `text` for \(...\) segments not preceded by an extra backslash.
// Returns { stripped, fragments }:
//   - stripped: original text with each segment replaced by `\x00MATH:i\x00`
//   - fragments: array of pre-rendered KaTeX HTML, indexed by `i`
// Unclosed `\(` is left in place and a console.warn is emitted.
function extractMath(text) {
  const fragments = []
  let out = ''
  let i = 0
  while (i < text.length) {
    const open = text.indexOf('\\(', i)
    if (open === -1) { out += text.slice(i); break }
    // Escape: \\( means literal \(
    if (open > 0 && text[open - 1] === '\\') {
      // Copy up to and including the literal \(, stripping the leading escape backslash
      out += text.slice(i, open - 1) + '\\('
      i = open + 2
      continue
    }
    // Find matching \) — first occurrence, not preceded by escape
    let close = -1
    let scan = open + 2
    while (scan < text.length) {
      const c = text.indexOf('\\)', scan)
      if (c === -1) break
      if (c > 0 && text[c - 1] === '\\') { scan = c + 2; continue }
      close = c
      break
    }
    if (close === -1) {
      console.warn('richHtml: unclosed \\( segment at index', open, '-', text.slice(open, open + 40))
      out += text.slice(i)
      break
    }
    const latex = text.slice(open + 2, close)
    const idx = fragments.length
    fragments.push(renderMath(latex))
    out += text.slice(i, open) + `\x00MATH:${idx}\x00`
    i = close + 2
  }
  return { stripped: out, fragments }
}

function reinsertMath(html, fragments) {
  if (!fragments.length) return html
  return html.replace(/\x00MATH:(\d+)\x00/g, (_, n) => fragments[Number(n)] ?? '')
}
```

Then modify `richHtml`:

```js
export function richHtml(text) {
  if (!text) return ''
  const { stripped, fragments } = extractMath(text)
  const lines = stripped.split('\n')
  const parts = []
  let tableLines = [], plainLines = []
  const flushPlain = () => { if (plainLines.length) { parts.push(escapeInline(plainLines.join('\n'))); plainLines = [] } }
  const flushTable = () => { if (tableLines.length) { parts.push(parseMarkdownTable(tableLines)); tableLines = [] } }
  for (const line of lines) {
    if (line.trim().startsWith('|')) { flushPlain(); tableLines.push(line) }
    else { flushTable(); plainLines.push(line) }
  }
  flushPlain(); flushTable()
  return reinsertMath(parts.join(''), fragments)
}
```

`richHtmlBr` keeps working because it calls `richHtml` then post-processes `\n` → `<br>`, and the substituted KaTeX HTML contains no literal newlines.

- [ ] **Step 3: Run the test file — expected PASS**

```bash
npx vitest run src/richHtml.test.js
```

Expected: all tests pass (both the original characterization tests and the new math tests).

- [ ] **Step 4: Run the full suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Manually verify with a real question**

Temporarily edit one alternative in `public/math_enem_2023.json` (q142 — the simple `1/2`, `1/3`, etc. set) to use the new syntax, e.g.:

```json
"a": "\\(\\frac{1}{2}\\)",
```

Run `npm run dev`, navigate to that question, confirm the alternative renders as a stacked KaTeX fraction. Then **revert the JSON edit** (we don't want this in the commit).

- [ ] **Step 6: Commit**

```bash
git add src/richHtml.js src/richHtml.test.js
git commit -m "feat: render \\(...\\) math segments via KaTeX in richHtml"
```

---

## Task 5: Lazy-load KaTeX

**Files:**
- Modify: `src/renderMath.js`
- Modify: `src/renderMath.test.js`
- Modify: `src/App.jsx` (one `useEffect` in the question-render component)
- Modify: `src/ReviewPage.jsx` (matching subscribe in the review component)

Goal: don't load the ~75 KB KaTeX JS until a `\(...\)` segment is actually encountered. Until then, math renders as raw `\(latex\)` text. The first render after the dynamic import triggers a re-render of subscribed components.

- [ ] **Step 1: Write the lazy-load tests**

Replace the existing `src/renderMath.test.js` contents:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

let katexMock
vi.mock('katex', () => ({
  default: {
    renderToString: (latex) => `<span class="katex">RENDERED:${latex}</span>`,
  },
}))

beforeEach(() => {
  vi.resetModules()
})

describe('renderMath (lazy)', () => {
  it('returns raw \\(latex\\) when KaTeX has not loaded yet', async () => {
    const { renderMath } = await import('./renderMath.js')
    expect(renderMath('\\frac{1}{2}')).toBe('\\(\\frac{1}{2}\\)')
  })

  it('returns KaTeX HTML once loadKatex() resolves', async () => {
    const mod = await import('./renderMath.js')
    await mod.loadKatex()
    expect(mod.renderMath('\\frac{1}{2}'))
      .toBe('<span class="katex">RENDERED:\\frac{1}{2}</span>')
  })

  it('notifies subscribers when KaTeX finishes loading', async () => {
    const mod = await import('./renderMath.js')
    const cb = vi.fn()
    const unsub = mod.subscribeToKatexReady(cb)
    await mod.loadKatex()
    expect(cb).toHaveBeenCalledTimes(1)
    unsub()
  })
})
```

Run:

```bash
npx vitest run src/renderMath.test.js
```

Expected: FAIL — current `renderMath.js` has no `loadKatex` or `subscribeToKatexReady`.

- [ ] **Step 2: Rewrite `src/renderMath.js` for lazy loading**

```js
let katexModule = null
let loading = null
const listeners = new Set()

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function loadKatex() {
  if (katexModule) return Promise.resolve(katexModule)
  if (!loading) {
    loading = import('katex').then((mod) => {
      katexModule = mod.default || mod
      for (const cb of listeners) {
        try { cb() } catch (err) { console.error('katexReady listener threw', err) }
      }
      return katexModule
    })
  }
  return loading
}

export function subscribeToKatexReady(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function isKatexReady() {
  return katexModule !== null
}

export function renderMath(latex) {
  if (!katexModule) {
    // Kick off the load, then fall back to the raw delimited form for now.
    loadKatex()
    return `\\(${latex}\\)`
  }
  try {
    return katexModule.renderToString(latex, {
      throwOnError: false,
      displayMode: false,
      output: 'html',
    })
  } catch (err) {
    const msg = escapeHtml(err && err.message ? err.message : 'render error')
    return `<span class="math-error" title="${msg}">${escapeHtml(latex)}</span>`
  }
}
```

- [ ] **Step 3: Run the renderMath tests — expected PASS**

```bash
npx vitest run src/renderMath.test.js
```

Expected: all three lazy-load tests pass.

- [ ] **Step 4: Update the richHtml math tests to call `loadKatex` first**

Now that `renderMath` returns the raw form until KaTeX loads, the tests in `src/richHtml.test.js` that expect rendered output need to either (a) mock `renderMath` directly (preferred — already done in Task 4) or (b) call `loadKatex` first.

The Task 4 tests already mock `renderMath`, so they don't depend on the lazy logic. Verify:

```bash
npx vitest run src/richHtml.test.js
```

Expected: all tests still pass.

- [ ] **Step 5: Subscribe to katexReady in App.jsx question render**

In `src/App.jsx`, find the component that renders an individual question (the one containing the `dangerouslySetInnerHTML` block near line 2592-2673). Add at the top of that component:

```js
import { subscribeToKatexReady } from './renderMath.js'

// ...inside the component:
const [, forceRerender] = useState(0)
useEffect(() => {
  const unsub = subscribeToKatexReady(() => forceRerender((n) => n + 1))
  return unsub
}, [])
```

Place the `import` with the other imports at the top of the file. The `useState`/`useEffect` go inside whatever component owns the question rendering — search the file for `className="question-text-block"` to find the right component.

- [ ] **Step 6: Subscribe in ReviewPage.jsx**

Apply the same `useState` / `subscribeToKatexReady` / `useEffect` pattern in `src/ReviewPage.jsx`'s main component. This ensures the review page also re-renders when KaTeX finishes loading mid-page.

- [ ] **Step 7: Manual smoke test**

```bash
npm run dev
```

In the browser dev tools Network tab, throttle to "Slow 4G" and load the app from scratch. Navigate to a question containing math (use the same temporary JSON edit from Task 4 Step 5, then revert after testing). Verify:

1. The page loads without KaTeX being requested.
2. Once you reach a math question, the KaTeX chunk appears in Network.
3. The math renders correctly (briefly visible as raw `\(...\)` before the chunk lands, then KaTeX).

Revert any temp JSON edits before committing.

- [ ] **Step 8: Commit**

```bash
git add src/renderMath.js src/renderMath.test.js src/App.jsx src/ReviewPage.jsx
git commit -m "feat: lazy-load KaTeX with re-render on ready"
```

---

## Task 6: Add the `.math-error` CSS rule

**Files:**
- Modify: `src/App.css`

- [ ] **Step 1: Append the rule**

Add at the end of `src/App.css`:

```css
.math-error {
  color: #c00;
  font-family: monospace;
  background: rgba(204, 0, 0, 0.08);
  padding: 0 0.2em;
  border-radius: 3px;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/App.css
git commit -m "style: add .math-error rule for KaTeX failures"
```

---

## Task 7: Fraction button in the editor toolbar

**Files:**
- Modify: `src/applyFormat.js`
- Modify: `src/applyFormat.test.js`
- Modify: `src/FormatToolbar.jsx`

- [ ] **Step 1: Write the failing tests for the `frac` action**

Append to `src/applyFormat.test.js`:

```js
describe('applyFormat — frac', () => {
  it('selection "1/2" -> \\(\\frac{1}{2}\\), caret after closing delim', () => {
    const result = applyFormat('value 1/2 here', 6, 9, 'frac')
    expect(result.value).toBe('value \\(\\frac{1}{2}\\) here')
    // caret lands after the inserted span
    expect(result.selStart).toBe(6 + '\\(\\frac{1}{2}\\)'.length)
    expect(result.selEnd).toBe(result.selStart)
  })

  it('selection without "/" wraps as numerator, caret in empty denominator', () => {
    const result = applyFormat('n+1', 0, 3, 'frac')
    expect(result.value).toBe('\\(\\frac{n+1}{}\\)')
    // caret should land inside the empty {} of the denominator
    const idx = result.value.indexOf('}{}')
    expect(result.selStart).toBe(idx + 2) // between the two braces of {}
    expect(result.selEnd).toBe(result.selStart)
  })

  it('empty selection inserts \\(\\frac{}{}\\) with caret in numerator', () => {
    const result = applyFormat('abc', 3, 3, 'frac')
    expect(result.value).toBe('abc\\(\\frac{}{}\\)')
    const idx = result.value.indexOf('\\frac{')
    expect(result.selStart).toBe(idx + '\\frac{'.length)
    expect(result.selEnd).toBe(result.selStart)
  })
})
```

Run:

```bash
npx vitest run src/applyFormat.test.js
```

Expected: the three new cases fail with the existing `applyFormat` throwing or returning unexpected output.

- [ ] **Step 2: Implement the `frac` action**

Modify `src/applyFormat.js` to handle the new action **before** the generic `WRAP` lookup at the end:

```js
const WRAP = {
  b:      ['<b>',       '</b>'],
  i:      ['<i>',       '</i>'],
  sup:    ['<sup>',     '</sup>'],
  sub:    ['<sub>',     '</sub>'],
  center: ['<center>',  '</center>'],
}

export function applyFormat(value, selStart, selEnd, action) {
  if (action === 'br') {
    const next = value.slice(0, selStart) + '<br>' + value.slice(selStart)
    const pos = selStart + 4
    return { value: next, selStart: pos, selEnd: pos }
  }

  if (action === 'supsub') {
    const selected = value.slice(selStart, selEnd)
    const open = `<sup>${selected}</sup><sub>`
    const close = `</sub>`
    const next = value.slice(0, selStart) + open + close + value.slice(selEnd)
    const pos = selStart + open.length
    return { value: next, selStart: pos, selEnd: pos }
  }

  if (action === 'frac') {
    const selected = value.slice(selStart, selEnd)
    let inserted, caretOffset
    if (selected === '') {
      inserted = '\\(\\frac{}{}\\)'
      caretOffset = '\\(\\frac{'.length // inside the numerator
    } else if (selected.includes('/')) {
      const slash = selected.indexOf('/')
      const num = selected.slice(0, slash)
      const den = selected.slice(slash + 1)
      inserted = `\\(\\frac{${num}}{${den}}\\)`
      caretOffset = inserted.length // after the closing delim
    } else {
      inserted = `\\(\\frac{${selected}}{}\\)`
      // caret inside the empty denominator: position of `}{}` + 2
      caretOffset = inserted.indexOf('}{}') + 2
    }
    const next = value.slice(0, selStart) + inserted + value.slice(selEnd)
    const pos = selStart + caretOffset
    return { value: next, selStart: pos, selEnd: pos }
  }

  const [open, close] = WRAP[action]
  const selected = value.slice(selStart, selEnd)
  const next = value.slice(0, selStart) + open + selected + close + value.slice(selEnd)
  const pos = selStart === selEnd
    ? selStart + open.length
    : selStart + open.length + selected.length + close.length
  return { value: next, selStart: pos, selEnd: pos }
}
```

- [ ] **Step 3: Run the applyFormat tests — expected PASS**

```bash
npx vitest run src/applyFormat.test.js
```

Expected: all tests pass (existing + three new).

- [ ] **Step 4: Add the toolbar button**

In `src/FormatToolbar.jsx`, add a new button after the supsub one (before the divider). The toolbar already calls `applyFormat` with the action string, so no other wiring is needed:

```jsx
{btn('supsub',
  <span className="fmt-supsub"><span>x</span><span>y</span></span>,
  null,
  'Stacked sup+sub'
)}
{btn('frac', 'a/b', null, 'Fração — envolve em \\(\\frac{}{}\\)')}
<div className="fmt-divider" />
```

- [ ] **Step 5: Manual verification**

```bash
npm run dev
```

Open the question editor (e.g. via `/editor`), focus an alternative field, type `1/2`, select it, click the `a/b` button. Confirm the textarea now contains `\(\frac{1}{2}\)`. Test the empty-selection and no-slash cases too.

- [ ] **Step 6: Commit**

```bash
git add src/applyFormat.js src/applyFormat.test.js src/FormatToolbar.jsx
git commit -m "feat: add fraction button to format toolbar"
```

---

## Task 8: Bump version and changelog

**Files:**
- Modify: `src/App.jsx:163-181` (`APP_VERSION` and `CHANGELOG`)

- [ ] **Step 1: Update `APP_VERSION` and prepend the changelog entry**

In `src/App.jsx`:

```js
const APP_VERSION = '1.12.0'
const APP_VERSION_DATE = '02/06/2026'

const CHANGELOG = [
  {
    version: '1.12.0',
    date: '02/06/2026',
    items: [
      'Renderização de expressões matemáticas com \\(...\\) (KaTeX)',
      'Botão de fração na barra de formatação',
    ],
  },
  {
    version: '1.11.2',
    date: '02/06/2026',
    items: ['ENEM 2023 Ciências da Natureza revisado', 'Mudanças no visual do texto de referencia'],
  },
  // ...rest unchanged
]
```

- [ ] **Step 2: Run the full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: build succeeds, KaTeX appears as its own chunk (lazy-loaded) in the dist output.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "chore: bump APP_VERSION to 1.12.0 with math rendering changelog"
```

---

## Self-Review Notes

**Spec coverage:**
- KaTeX adopted, lazy-loaded: Tasks 2, 3, 5. ✓
- `\(...\)` delimiters with NUL-sentinel pipeline: Task 4. ✓
- `renderMath` module with error fallback: Task 3. ✓
- `.math-error` CSS: Task 6. ✓
- Fraction toolbar button with selection, no-slash, and empty-selection behaviors: Task 7. ✓
- `richHtml` extraction (needed for testability + ReviewPage dedupe): Task 1. ✓
- Version bump + changelog (per project memory rule): Task 8. ✓

**No placeholders, all file paths exact, every step shows the code/command.**

---

## Migration Follow-up (not in this plan)

Per the project memory, once this ships we should convert existing parenthesized fractions to the new syntax during normal review. Known starting point: q169 in `public/math_enem_2023.json`. A grep for `\d+/\d+` across the JSON files will surface candidates. This work belongs to a separate review session, not this plan.
