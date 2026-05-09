# Global Format Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fixed-top formatting toolbar that applies rich-text HTML tags (`<b>`, `<i>`, `<sup>`, `<sub>`, `<center>`, `<br>`, stacked supsub) to whichever `<textarea>` has focus, with zero per-textarea wiring.

**Architecture:** A `FormatToolbar` component tracks the focused `<textarea>` via a `document` `focusin` listener. Buttons use `onMouseDown`+`preventDefault` to avoid blurring the textarea. The core text-manipulation logic lives in a pure `applyFormat` function so it can be unit-tested independently of the DOM. The component is mounted in `App.jsx`'s two page routes; page shells get a `padding-top` to clear the toolbar.

**Tech Stack:** React 18, Vite, Vitest, CSS custom properties (existing tokens in `App.css`)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/FormatToolbar.jsx` | Create | Component + focus tracking + DOM write-back |
| `src/FormatToolbar.css` | Create | Toolbar styles using existing CSS tokens |
| `src/applyFormat.js` | Create | Pure function: text manipulation logic |
| `src/applyFormat.test.js` | Create | Unit tests for `applyFormat` |
| `src/App.jsx` | Modify | Mount `<FormatToolbar />` in `/review` and `/editor` routes |
| `src/ReviewPage.css` | Modify | Add `padding-top` + adjust `height` on `.rp-shell` for toolbar |
| `src/QuestionEditor.css` | Modify | Add `padding-top` to `.qe-shell` for toolbar |

---

## Task 1: Pure `applyFormat` logic + tests

**Files:**
- Create: `src/applyFormat.js`
- Create: `src/applyFormat.test.js`

### What `applyFormat` does

```js
// applyFormat(value, selStart, selEnd, action) → { value, selStart, selEnd }
// action: 'b' | 'i' | 'sup' | 'sub' | 'supsub' | 'center' | 'br'
```

- **Wrap actions** (`b`, `i`, `sup`, `sub`, `center`): insert open tag before `selStart`, close tag after `selEnd`. Cursor lands after close tag.
- **Supsub**: wrap selection in `<sup>…</sup><sub></sub>`. Cursor lands inside the empty `<sub>` (between the tags).
- **br**: insert `<br>` at `selStart` (ignore selection). Cursor lands after `<br>`.

- [ ] **Step 1: Write the failing tests**

Create `src/applyFormat.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { applyFormat } from './applyFormat.js'

describe('applyFormat', () => {
  it('wraps selection in <b> tags', () => {
    const result = applyFormat('hello world', 6, 11, 'b')
    expect(result.value).toBe('hello <b>world</b>')
    expect(result.selStart).toBe(18)
    expect(result.selEnd).toBe(18)
  })

  it('inserts <b> tags at cursor when nothing is selected', () => {
    const result = applyFormat('hello', 5, 5, 'b')
    expect(result.value).toBe('hello<b></b>')
    expect(result.selStart).toBe(8)
    expect(result.selEnd).toBe(8)
  })

  it('wraps selection in <i> tags', () => {
    const result = applyFormat('foo bar', 4, 7, 'i')
    expect(result.value).toBe('foo <i>bar</i>')
    expect(result.selStart).toBe(14)
    expect(result.selEnd).toBe(14)
  })

  it('wraps selection in <sup> tags', () => {
    const result = applyFormat('x2', 1, 2, 'sup')
    expect(result.value).toBe('x<sup>2</sup>')
    expect(result.selStart).toBe(13)
    expect(result.selEnd).toBe(13)
  })

  it('wraps selection in <sub> tags', () => {
    const result = applyFormat('H2O', 1, 2, 'sub')
    expect(result.value).toBe('H<sub>2</sub>O')
    expect(result.selStart).toBe(13)
    expect(result.selEnd).toBe(13)
  })

  it('wraps selection in <center> tags', () => {
    const result = applyFormat('title', 0, 5, 'center')
    expect(result.value).toBe('<center>title</center>')
    expect(result.selStart).toBe(22)
    expect(result.selEnd).toBe(22)
  })

  it('inserts <br> at cursor', () => {
    const result = applyFormat('line1line2', 5, 5, 'br')
    expect(result.value).toBe('line1<br>line2')
    expect(result.selStart).toBe(9)
    expect(result.selEnd).toBe(9)
  })

  it('ignores selection for <br> — inserts at selStart', () => {
    const result = applyFormat('abcde', 1, 4, 'br')
    expect(result.value).toBe('a<br>bcde')
    expect(result.selStart).toBe(5)
    expect(result.selEnd).toBe(5)
  })

  it('wraps selection in supsub, cursor inside <sub>', () => {
    const result = applyFormat('ab', 0, 1, 'supsub')
    expect(result.value).toBe('<sup>a</sup><sub></sub>b')
    // cursor lands between <sub> and </sub>
    expect(result.selStart).toBe(18)
    expect(result.selEnd).toBe(18)
  })
})
```

- [ ] **Step 2: Run the tests — confirm they all FAIL**

```bash
cd /Users/prezotto/code/questionario_app && npx vitest run src/applyFormat.test.js
```

Expected: all tests fail with "Cannot find module './applyFormat.js'"

- [ ] **Step 3: Implement `applyFormat`**

Create `src/applyFormat.js`:

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

  const [open, close] = WRAP[action]
  const selected = value.slice(selStart, selEnd)
  const next = value.slice(0, selStart) + open + selected + close + value.slice(selEnd)
  const pos = selStart + open.length + selected.length + close.length
  return { value: next, selStart: pos, selEnd: pos }
}
```

- [ ] **Step 4: Run the tests — confirm they all PASS**

```bash
npx vitest run src/applyFormat.test.js
```

Expected: 9 tests pass, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/applyFormat.js src/applyFormat.test.js
git commit -m "feat: add applyFormat pure function with tests"
```

---

## Task 2: `FormatToolbar` component + CSS

**Files:**
- Create: `src/FormatToolbar.jsx`
- Create: `src/FormatToolbar.css`

- [ ] **Step 1: Create `src/FormatToolbar.css`**

```css
/* src/FormatToolbar.css */
.fmt-toolbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  height: 36px;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 10px;
  background: var(--surface, #f8f8fa);
  border-bottom: 1px solid var(--border, rgba(0,0,0,0.07));
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}

.fmt-divider {
  width: 1px;
  height: 20px;
  background: var(--border, rgba(0,0,0,0.12));
  margin: 0 4px;
}

.fmt-btn {
  height: 26px;
  min-width: 26px;
  padding: 0 6px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text, #222);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.12s;
  user-select: none;
}

.fmt-btn:hover:not(:disabled) {
  background: var(--alt-bg, #e8e8ec);
}

.fmt-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.fmt-btn--bold { font-weight: 700; }
.fmt-btn--italic { font-style: italic; }

.fmt-supsub {
  display: inline-flex;
  flex-direction: column;
  font-size: 0.6em;
  line-height: 1.1;
  vertical-align: middle;
}
```

- [ ] **Step 2: Create `src/FormatToolbar.jsx`**

```jsx
import { useEffect, useRef, useState } from 'react'
import { applyFormat } from './applyFormat.js'
import './FormatToolbar.css'

function writeToTextarea(el, newValue, selStart, selEnd) {
  // React tracks the native input value via an internal property.
  // To trigger onChange on a controlled input we must set the value
  // through the native setter, then dispatch an 'input' event.
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype, 'value'
  ).set
  nativeSetter.call(el, newValue)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.selectionStart = selStart
  el.selectionEnd = selEnd
}

export default function FormatToolbar() {
  const activeEl = useRef(null)
  const [hasActive, setHasActive] = useState(false)

  useEffect(() => {
    const onFocusIn = (e) => {
      if (e.target.tagName === 'TEXTAREA') {
        activeEl.current = e.target
        setHasActive(true)
      }
    }
    const onFocusOut = (e) => {
      if (e.target === activeEl.current) {
        activeEl.current = null
        setHasActive(false)
      }
    }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  const apply = (action) => (e) => {
    e.preventDefault()
    const el = activeEl.current
    if (!el) return
    const { value, selStart, selEnd } = applyFormat(
      el.value,
      el.selectionStart,
      el.selectionEnd,
      action,
    )
    writeToTextarea(el, value, selStart, selEnd)
    el.focus()
  }

  const btn = (action, label, className, title) => (
    <button
      className={`fmt-btn${className ? ` ${className}` : ''}`}
      title={title}
      disabled={!hasActive}
      onMouseDown={apply(action)}
    >
      {label}
    </button>
  )

  return (
    <div className="fmt-toolbar">
      {btn('b', 'B', 'fmt-btn--bold', 'Bold <b>')}
      {btn('i', 'I', 'fmt-btn--italic', 'Italic <i>')}
      <div className="fmt-divider" />
      {btn('sup', 'x²', null, 'Superscript <sup>')}
      {btn('sub', 'x₂', null, 'Subscript <sub>')}
      {btn('supsub',
        <span className="fmt-supsub"><span>x</span><span>y</span></span>,
        null,
        'Stacked sup+sub'
      )}
      <div className="fmt-divider" />
      {btn('center', '⬛ center', null, 'Center <center>')}
      {btn('br', '↵ br', null, 'Line break <br>')}
    </div>
  )
}
```

- [ ] **Step 3: Verify the component renders without errors**

Start the dev server (`npm run dev`) and open any page — you should see a slim toolbar pinned to the top. No textareas are focused yet so all buttons are dimmed.

- [ ] **Step 4: Commit**

```bash
git add src/FormatToolbar.jsx src/FormatToolbar.css
git commit -m "feat: add FormatToolbar component"
```

---

## Task 3: Mount toolbar in `App.jsx`

**Files:**
- Modify: `src/App.jsx` lines 341–343

- [ ] **Step 1: Add the import at the top of `App.jsx`**

After the existing imports at the top of the file, add:

```js
import FormatToolbar from './FormatToolbar.jsx'
```

- [ ] **Step 2: Wrap the two early-return routes**

Find these two lines (around line 342):

```jsx
  if (window.location.pathname === '/review') return <Suspense fallback={null}><ReviewPage /></Suspense>
  if (window.location.pathname === '/editor') return <Suspense fallback={null}><QuestionEditor /></Suspense>
```

Replace them with:

```jsx
  if (window.location.pathname === '/review') return <><FormatToolbar /><Suspense fallback={null}><ReviewPage /></Suspense></>
  if (window.location.pathname === '/editor') return <><FormatToolbar /><Suspense fallback={null}><QuestionEditor /></Suspense></>
```

- [ ] **Step 3: Verify toolbar appears on `/review` and `/editor`**

Navigate to both pages. The toolbar should appear fixed at the top. Click into any textarea — buttons should become active. Press **B** with some text selected — `<b>…</b>` should wrap the selection.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: mount FormatToolbar in review and editor routes"
```

---

## Task 4: Adjust page shells for toolbar height

**Files:**
- Modify: `src/ReviewPage.css`
- Modify: `src/QuestionEditor.css`

The toolbar is 36px + 1px border = 37px. Use `37px` as the offset.

- [ ] **Step 1: Update `.rp-shell` in `ReviewPage.css`**

Find (line 21–28):

```css
.rp-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  font-family: system-ui, sans-serif;
  font-size: 14px;
  background: #f8fafc;
  color: #1e293b;
}
```

Replace with:

```css
.rp-shell {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 37px);
  margin-top: 37px;
  overflow: hidden;
  font-family: system-ui, sans-serif;
  font-size: 14px;
  background: #f8fafc;
  color: #1e293b;
}
```

(`margin-top` instead of `padding-top` because the shell uses `overflow: hidden` — padding-top would be clipped.)

- [ ] **Step 2: Update `.qe-shell` in `QuestionEditor.css`**

Find (line 1–8):

```css
.qe-shell {
  max-width: 720px;
  margin: 0 auto;
  padding: 1.5rem 1rem 4rem;
  font-family: inherit;
  color: var(--text);
}
```

Replace with:

```css
.qe-shell {
  max-width: 720px;
  margin: 0 auto;
  padding: calc(1.5rem + 37px) 1rem 4rem;
  font-family: inherit;
  color: var(--text);
}
```

- [ ] **Step 3: Verify layout on both pages**

- On `/review`: the sticky header row should start immediately below the toolbar, nothing cut off at the top
- On `/editor`: the "← Voltar" / "Criar" header should sit below the toolbar with normal spacing

- [ ] **Step 4: Commit**

```bash
git add src/ReviewPage.css src/QuestionEditor.css
git commit -m "fix: offset page shells for 37px format toolbar height"
```
