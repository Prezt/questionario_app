# Math Rendering — Design

**Date:** 2026-06-02
**Status:** Approved (pending implementation plan)

## Motivation

Today, fractions and other math in question JSON files are written as plain text — e.g. `"1/2"`, `"15/60"`, `"k²√3/24"`, `"(1/9)L₀"`, `"(0,5)^(1/10)"`. The result reads as inline ASCII rather than the typeset math students see on the actual ENEM exam. The clunkiest cases are alternatives like `(1/9)L₀` where parentheses are added solely to keep a fraction visually grouped, and radical expressions like `k²√3/24` where the grouping is ambiguous.

We want a way to mark math in the JSON and render it properly in the app — starting with fractions but covering the broader set of math notation ENEM uses (radicals, exponents, subscripts, Greek letters, etc.).

## Goals

- Render math (fractions, radicals, exponents, subscripts, sums, Greek letters, etc.) in question stems, contexts, alternatives, and captions.
- Use a familiar, standard syntax that handles complex expressions cleanly.
- Make fractions easy to insert when reviewing questions in the editor.
- Avoid heavy upfront cost for users who never see math content (lazy-load the math library).

## Non-goals (YAGNI)

- No automatic migration of existing parenthesized fractions; conversion happens by hand during exam review.
- No display math (centered, larger block math). All math is rendered inline. The existing `<center>` tag can still center a paragraph containing math.
- No custom macros or `\newcommand` support.
- No MathML output, accessibility tree work beyond KaTeX's defaults.

## Approach

Use **KaTeX** for math rendering. Reasons:

- One library covers fractions plus everything else ENEM math uses (`\sqrt`, `^`, `_`, `\pi`, `\cdot`, `\leq`, summations, integrals, etc.). Pure CSS would solve only fractions, leaving us to extend ad-hoc for every new notation.
- KaTeX uses real math font metrics — bar thickness, numerator/denominator scaling, baseline alignment — which a hand-rolled CSS fraction cannot match.
- Synchronous render, fast, no MathJax-style flashing.
- ~100 KB gzipped (JS + CSS + fonts). Lazy-loaded via the same `lazy`/`Suspense` pattern already used for `ReviewPage` and `QuestionEditor`, so it only loads when math is actually present.

## Syntax

Math is wrapped in `\(...\)` delimiters in the JSON. Inside the delimiters, the content is standard LaTeX/KaTeX:

```
\(\frac{1}{9}\)L_0
\(k^2 \sqrt{3} / 24\)
\(\frac{a^2}{b+1}\)
\(\pi r^2\)
```

Rules:

- **Delimiters:** `\(` opens, `\)` closes. Chosen over `$...$` because `R$` (Brazilian currency) appears throughout the question text and would collide with `$` delimiters.
- **Content:** any KaTeX-supported LaTeX. Common building blocks: `\frac{a}{b}`, `\sqrt{x}`, `a^2`, `a_n`, `\pi`, `\cdot`, `\leq`, `\geq`, `\sum`, `\int`, `\alpha`, `\beta`, etc.
- **Escape hatch:** to write a literal `\(` that should NOT start a math span, write `\\(` in the rendered text (in JSON source: `"\\\\("`). Rare in practice; documented in the toolbar tooltip.
- **Malformed input:** if `\(` is found without a closing `\)`, the literal text is left untouched and a `console.warn` is logged so broken entries surface during proofreading. If KaTeX throws on the LaTeX inside, the error is caught and the raw LaTeX is rendered in a `<span class="math-error">` for visibility.

## Architecture

### Render pipeline integration

Text is currently rendered through `escapeInline(text)` in `src/App.jsx` (lines 42-66), which HTML-escapes the input and re-allows a small whitelist of tags. `escapeInline` is called from `richHtml` and `richHtmlBr` (lines 89-106), which pass the result to React via `dangerouslySetInnerHTML`.

Math must be processed **before** `escapeInline`, because the LaTeX contains `{`, `}`, `\`, and other characters that escaping would mangle.

New flow inside `richHtml`:

1. Scan the input for `\(...\)` segments (not preceded by an extra backslash). For each segment, call `renderMath(latex)` and push the rendered HTML into a per-call array. Replace the segment in the source string with a NUL-byte-delimited sentinel `\x00MATH:i\x00`, where `i` is the array index. NUL bytes guarantee the sentinel cannot collide with anything the user typed.
2. Run the existing `escapeInline` over the placeholder-bearing text.
3. Substitute each sentinel back with the corresponding KaTeX HTML from the array.

The placeholder dance keeps the existing pipeline untouched for non-math text and prevents escaping from corrupting KaTeX's HTML.

### `renderMath`

New module `src/renderMath.js`:

```js
import katex from 'katex'

export function renderMath(latex) {
  try {
    return katex.renderToString(latex, {
      throwOnError: false,
      displayMode: false,
      output: 'html',
    })
  } catch (err) {
    return `<span class="math-error" title="${escapeAttr(err.message)}">${escapeHtml(latex)}</span>`
  }
}
```

`throwOnError: false` makes KaTeX render errors inline (red text) rather than throwing; the `try/catch` is a belt-and-suspenders fallback.

### Lazy loading

`katex` is ~100 KB gzipped (JS + CSS + fonts). To avoid loading it on the home page, login, dashboard, etc.:

- KaTeX is imported dynamically the first time `richHtml` sees a `\(...\)` segment.
- During the initial dynamic import, the placeholder for that span renders as the raw `\(latex\)` text; once KaTeX loads, a re-render is triggered (state bump on the question container).
- Concretely: a module-level `let katexPromise = null; let katexReady = false;` plus a tiny pub/sub so consuming React components can force a re-render when `katexReady` flips. The QuestionEditor and question-display components subscribe in a `useEffect`.

Trade-off accepted: math in the very first question shown may flash from raw `\(...\)` to rendered KaTeX once (typically <100ms on a warm cache). For subsequent questions in the same session, it renders synchronously.

### CSS

- Import KaTeX's stylesheet once at app entry: `import 'katex/dist/katex.min.css'` in `src/main.jsx`.
- Add a tiny override in `src/App.css` for the error state:
  ```css
  .math-error { color: #c00; font-family: monospace; }
  ```

No other CSS work needed; KaTeX styles its own output.

### Editor toolbar

A new button is added to `src/FormatToolbar.jsx`:

- **Label:** `a/b` (or a small SVG icon — implementer's choice).
- **Tooltip:** `Inserir fração — wraps in \(...\)`.
- **Behavior** (implemented in `src/applyFormat.js`):
  - If the selection contains a `/` (e.g. user selected `1/2`), produce `\(\frac{1}{2}\)`, splitting on the first `/`.
  - If the selection is non-empty but has no `/`, wrap it: `\(\frac{<selection>}{}\)` with the caret placed inside the empty denominator.
  - If the selection is empty, insert `\(\frac{|}{}\)` with the caret at `|`.

The QuestionEditor already pipes its content through `richHtml` for live preview, so math renders in the editor preview automatically once the pipeline is wired in — no separate editor work needed.

## Testing

New test file `src/renderMath.test.js` covers:

- `renderMath('\\frac{1}{2}')` returns HTML containing `katex` root class.
- `renderMath('\\invalid')` returns HTML containing `math-error` class (or KaTeX's own error span).

New test file `src/richHtml.test.js` (extract `richHtml`/`escapeInline` to a module-level export for testability if not already) covers:

- Text with no math passes through unchanged.
- `\(\frac{1}{2}\)` is replaced with KaTeX HTML.
- Math placeholder survives existing inline-tag processing (`<b>hello \(x^2\)</b>` becomes bold wrapping both).
- Unclosed `\(` leaves literal text and triggers `console.warn`.
- Escaped `\\(` is preserved as literal `\(` in output.

New tests in `src/applyFormat.test.js`:

- Selection `1/2` + fraction button produces `\(\frac{1}{2}\)`.
- Selection `n+1` + fraction button produces `\(\frac{n+1}{}\)` with caret in denominator.
- Empty selection + fraction button inserts `\(\frac{}{}\)` with caret in numerator.

KaTeX itself is mocked in the test files (it pulls in fonts at runtime); tests assert on the placeholder/wrap behavior, not on KaTeX's output.

## Changelog

Bump `APP_VERSION` in `src/App.jsx:163` from `1.11.2` to `1.12.0` and add a new entry at the top of `CHANGELOG`:

```js
{
  version: '1.12.0',
  date: '02/06/2026',
  items: [
    'Renderização de expressões matemáticas com \\(...\\) (KaTeX)',
    'Botão de fração na barra de formatação',
  ],
},
```

## Migration of existing content

Out of scope for this design. Once shipped, exam files can be revisited during normal review to convert plain-text math to KaTeX form — for example:

- `(1/9)L₀` becomes `\(\frac{1}{9}\)L_0` (or `\(\frac{1}{9} L_0\)`)
- `k²√3/24` becomes `\(\frac{k^2 \sqrt{3}}{24}\)`
- `(0,5)^(1/10)` becomes `\((0{,}5)^{1/10}\)`

q169 in `math_enem_2023.json` is a known starting point.

## Files touched (summary)

- `package.json` — add `katex` dependency.
- `src/main.jsx` — import KaTeX stylesheet.
- `src/App.jsx` — modify `richHtml` to extract math, lazy-load KaTeX, substitute back; bump `APP_VERSION` + changelog.
- `src/renderMath.js` — new module wrapping `katex.renderToString` with error handling and lazy-load helpers.
- `src/App.css` — add `.math-error` rule.
- `src/FormatToolbar.jsx` — add fraction button.
- `src/applyFormat.js` — add fraction insertion behavior.
- `src/renderMath.test.js` — new test file.
- `src/richHtml.test.js` — new test file (and small refactor to export `richHtml`).
- `src/applyFormat.test.js` — add three cases.
