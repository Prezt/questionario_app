# Global Format Toolbar — Design Spec

**Date:** 2026-05-09  
**Status:** Approved

## Overview

A single fixed-top formatting toolbar that applies rich-text tags to whichever `<textarea>` on the page currently has focus. No per-textarea wiring — one component works everywhere.

## Architecture

### Component: `FormatToolbar`

- Rendered once in `App.jsx`, above all page content
- `position: fixed; top: 0; left: 0; right: 0; z-index: 1000`
- Pages that have textareas add `padding-top` to their shell to avoid content hiding behind the bar

### Focus tracking

- A `focusin` event listener on `document` (added in a `useEffect`) stores the last focused `<textarea>` in a `useRef`
- A `focusout` listener clears it when focus leaves a textarea (sets a flag that dims the buttons)
- Buttons are visually dimmed (`opacity: 0.4`, `cursor: default`) when no textarea is active

### Button behaviour

Each button uses `onMouseDown` + `e.preventDefault()` (not `onClick`) to prevent the textarea from losing focus before the format is applied.

On activation:
1. Read `selectionStart` / `selectionEnd` from the stored textarea ref
2. Build the new string: wrap selected text with the tag pair, or insert the tag at the cursor if nothing is selected
3. Write back to the textarea via `Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, newValue)` + `el.dispatchEvent(new Event('input', { bubbles: true }))` — this is required for React controlled inputs to pick up the change
4. Restore cursor: `selectionStart = selectionEnd = newCursorPos`

### Buttons

| Label | Tag behaviour |
|-------|--------------|
| **B** | Wraps selection in `<b>…</b>` |
| *I* | Wraps selection in `<i>…</i>` |
| x² | Wraps selection in `<sup>…</sup>` |
| x₂ | Wraps selection in `<sub>…</sub>` |
| ˣ₂ | Wraps selection in `<sup>…</sup><sub></sub>` (stacked sup+sub), cursor lands inside `<sub>` |
| Center | Wraps selection in `<center>…</center>` |
| ↵ br | Inserts `<br>` at cursor (no wrapping) |

### Styling

- Toolbar height: ~36px, compact single row
- Matches existing dark/light theme via CSS variables already present in the project
- Buttons are minimal (no heavy borders), separated by a thin divider between logical groups (inline formatting | block formatting | insert)

## Files changed

| File | Change |
|------|--------|
| `src/FormatToolbar.jsx` | New component |
| `src/FormatToolbar.css` | New styles |
| `src/App.jsx` | Mount `<FormatToolbar />` once at the top |
| `src/ReviewPage.css` | Add `padding-top` to `.rp-shell` |
| `src/QuestionEditor.css` | Add `padding-top` to `.qe-shell` |

No changes to individual textarea elements — they just work automatically.
