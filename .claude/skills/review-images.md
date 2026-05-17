---
name: review-images
description: Dedicated guide for fixing image assignments in ENEM question JSON files. Covers the two-column mis-assignment pattern, visual verification, context vs question images, and fig numbering gaps. Use when reviewing images for any year/area.
---

# Review ENEM Question Images

This skill covers everything needed to correctly assign images to questions. Image bugs are the most common error in the question JSON files and have a predictable set of root causes.

---

## The core problem: two-column PDF layout

ENEM exam PDFs are typeset in two columns. When OCR tools extract images, they process the page sequentially (top-to-bottom, left-to-right), but questions alternate between the left and right columns. This causes images to be extracted under the **wrong question number** — usually 1 or 2 numbers off from where they actually belong.

**The typical mis-assignment pattern:**

```
Left column:  Q136 (text + image)   Q138 (text + image)
Right column: Q137 (text + image)   Q139 (text + image)
```

The OCR may save Q136's image as `q137_fig1.png` because it processed the right-column text of Q137 first before recognizing the image belonged to the left-column Q136.

**Always assume the image filenames may be wrong.** Verify by reading the actual PNG files visually.

---

## Step 1 — List all images in the area

Before fixing anything, get a full picture of what image files exist:

```
figuras/q{NNN}_{year}_fig{N}.png
```

Use Glob to list all images for the year you're working on:
- `figuras/q*_2024_fig*.png` for 2024

Look for:
- Questions with images that don't appear in any `images` array
- Questions whose `images` array points to files that belong to a different question
- Gaps in fig numbering (e.g., `fig1` and `fig3` exist but `fig2` doesn't — fig2 may belong elsewhere)

---

## Step 2 — Visually verify each image

**This is the most important step.** Open every PNG in question by reading it with the Read tool. Claude can view images directly.

For each image file:
1. Read the PNG to see what it depicts
2. Cross-reference with the question text to determine which question it actually belongs to
3. Check neighboring questions (±2 numbers) if the image doesn't match the question it's filed under

**What to look for:**
- Does the image depict something the question text describes?
- Does the image show answer choices (heredograms, circuit diagrams, geometric figures) → it belongs to that question's `alternatives` section
- Does the image show a graph, diagram, or figure that the question stem asks about → it belongs in that question's `images` array
- Does the image show introductory material (molecule structure, flowchart, map) → it may belong to a context entry

---

## Step 3 — Identify the mis-assignment

When an image visually matches question N but is saved as `q{N+1}_fig1.png`:

1. Remove the image from question N+1's `images` array
2. Add it to question N's `images` array (with the same filename — don't rename files)
3. Check if question N+1 has its own image saved elsewhere (often as `q{N+1}_fig2.png`)

**Common pattern seen in practice (2024 math/nature):**

| File saved as | Actually belongs to |
|---|---|
| `q148_fig1.png` | Q147 |
| `q156_fig1.png` | Q155 |
| `q159_fig1.png` | Q158 |
| `q164_fig1.png` | Q163 |
| `q176_fig1.png` | Q175 |

In each case: the correctly-numbered question had no image, the next question had two images (`fig1` belonging to the prior question, `fig2` being its own).

---

## Step 4 — Context images vs question images

Some images belong in a context entry, not in the question's `images` array.

**Belongs in the context entry (`contexts.json`):**
- A molecule structure diagram that illustrates the intro paragraph
- A map or chart that is part of the source material
- Any figure that would appear *before* the question stem in the original PDF

**Belongs in the question's `images` array:**
- A graph, diagram, or figure that the question stem directly asks about ("Conforme o gráfico...", "Com base na figura...")
- Visual alternatives (heredograms, circuit diagrams, etc.)

**Rule of thumb:** If the image would be shown to the student before they read the question stem, it's a context image. If it's shown as part of the question itself, it stays in `images`.

When a context image exists, add it to the context entry's `images` array and **remove it from the question's `images` array**.

### After context extraction: re-check the question's images

When you extract a context from a question that had images, **always re-evaluate** whether each remaining image still belongs to the question. The image that was in the `images` array may have been the intro diagram (now belonging to the context), not the question's own figure.

**Example (q113):**
- Before extraction: question had intro paragraph + citation + `images: ["figuras/q113_2024_fig1.png"]`
- The fig1 image showed the nitrogen/carbon cycle diagram — it was the intro illustration, part of the context
- After extraction: context entry gets `"images": ["figuras/q113_2024_fig1.png"]`, question's `images` becomes `[]`
- The question stem ("Em qual etapa numerada...") refers to the diagram, which is now in the context where it belongs

---

## Step 4b — Visual alternatives: expect exactly 5 images

When a question has **all alternatives set to `""`** (empty strings), the alternatives are entirely visual — each alternative (a through e) is its own image. This means the question needs **exactly 5 image files** in its `images` array, one per alternative.

**How to find them:**
- Search for all `figuras/q{NNN}_{year}_fig*.png` files for that question number
- If fewer than 5 exist, check neighboring question numbers — some may be mis-filed there
- The 5 alternative images often start at a higher fig number (e.g., `fig3–fig7`) because `fig1` and `fig2` belonged to a context or a different question

**Example (q112 — daltonism heredograms):**
- All alternatives `""` → 5 visual heredogram options
- Files found: `fig3.png`, `fig4.png`, `fig5.png`, `fig6.png`, `fig7.png`
- fig1 and fig2 belonged elsewhere (context or adjacent question)
- Correct `images` array: `["figuras/q112_2024_fig3.png", ..., "figuras/q112_2024_fig7.png"]`

**Do not** assign only `fig1.png` and stop — for visual alternatives, always locate all 5 files.

---

## Step 5 — Fig numbering gaps

Due to the mis-assignment pattern, fig numbers within a question may have gaps:

- `q148_fig1.png` belongs to Q147 → Q148's real image is `q148_fig2.png`
- After reassigning, Q148's `images` should be `["figuras/q148_fig2.png"]`
- Do NOT rename files — keep the original filenames and update the JSON

If a question legitimately has `fig1` and `fig3` but no `fig2`, check whether `fig2` exists and belongs to an adjacent question.

---

## Step 6 — Questions missing images entirely

Some questions have no `images` array but reference a figure in `text` (e.g., `[Figura]`, `[Gráfico]`, `[Imagem]`). This means an image file probably exists nearby but wasn't linked.

Search for image files in the `figuras/` directory near that question number. Also check if a neighboring question has an extra image file that visually matches this question.

---

## Step 7 — Clean up text placeholders

Once images are correctly assigned, simplify verbose placeholder text in the `text` field:

**Before:** `[Figura: gráfico mostrando a variação da concentração de CO₂ em função da razão ar/combustível]`
**After:** `[Figura]`

**Before:** `[Gráfico: barras mostrando índices por região]`
**After:** `[Gráfico]`

Keep the bracket type (`[Figura]`, `[Gráfico]`, `[Diagrama]`, `[Esquema]`, `[Imagem]`, `[Fotografias]`) but strip all description content inside.

For alternatives that are images, set all alternative values to `""`:
```json
"a": "",
"b": "",
"c": "",
"d": "",
"e": ""
```

### Inline placement of image placeholders

The placeholder must appear **at the exact position in the text where the image sits in the original PDF** — not appended at the end, not in a separate sentence. If the image appears between two sentences, the placeholder goes between those sentences, without extra newlines.

**Before (placeholder missing or at wrong position):**
```
"O esquema representa um experimento feito com células...foram comprometidos.\n\nSADAVA, D. et al. ...\n\nQual componente celular foi afetado?"
```

**After (placeholder inserted inline at the image's position, citation dropped):**
```
"O esquema representa um experimento feito com células...foram comprometidos.[Esquema]Qual componente celular foi afetado?"
```

No space or newline is needed around the bracket — it renders as a block-level image automatically. The surrounding text flows before and after it naturally.

---

## Red flags to watch for

- A question with `images: []` but `text` contains `[Figura]` → image missing
- A question with 3+ images where only 1-2 are expected → extra images belong elsewhere
- Two adjacent questions where one has 0 images and one has 2+ images → likely a mis-assignment
- An image file exists in `figuras/` for a question number but isn't in that question's `images` array → forgotten link
- `fig1` exists for a question but the question text says "conforme o gráfico" with no `[Gráfico]` placeholder → placeholder was stripped but image wasn't linked
