---
name: review-exam-year
description: Guide for reviewing a year of ENEM questions. Covers image fixes, text cleanup, formula formatting, and context extraction for linguagens. Use when reviewing any pending year/area in NOTES.MD.
---

# Review an ENEM Exam Year

This skill walks through the full review process for a year/area entry in `NOTES.MD`.

## What "review" means

Review fixes the raw question JSON that was initially auto-generated or imported with rough placeholders. The goal is:
- Correct image references (replace wrong/placeholder filenames with real ones)
- Clean up verbose inline descriptions inside `[Figura: ...]` brackets
- Extract source texts into `contexts.json` (linguagens areas only)
- Fix math/formula formatting

---

## Step 1 — Check what needs doing

Open `NOTES.MD` and find a pending area:
- `[]` = not started
- `[-]` = partially done
- `[x]` = complete

Pick one area (e.g., `ENEM 2024 > humanas`) and open the corresponding JSON file in `public/`.

File naming convention: `public/{area}_enem_{year}.json`
Examples: `public/math_enem_2024.json`, `public/linguagens_enem_2024.json`

---

## Step 2 — Image review (ALL areas)

For each question that has an `images` array or references a figure in `text`:

### 2a. Check image filenames

Image files live in `public/figuras/` and `figuras/` (mirrored). The naming convention is:
`q{number}_{year}_fig{n}.png`

When images were first added they may have gotten wrong numbers (e.g., `fig1` was already used for another question's context figure, so the real question figure became `fig2`, `fig7`, etc.).

**What to do:**
- Look at the actual filenames in `figuras/` for this question number
- Update the `images` array to point to the files that actually exist
- If multiple images exist for one question (e.g., `fig2` and `fig3`), include all of them in the array

### 2b. Clean up `[Figura: ...]` descriptions in text

When the question was first entered, figure descriptions often included verbose inline data as a fallback for when no image was available. Now that real images exist, simplify these:

**Before:**
```
[Figura: bússola com direções em graus e diagrama mostrando a rota planejada (P → Q → R) e a rota executada (P → S → T), com linha pontilhada indicando o trajeto necessário de T a R]
```

**After:**
```
[Figura]
```

Or keep a short label when context helps:
```
[Figura: plano cartesiano com o quadrado STUV]
→
[Figura]
```

Same rule for `[Gráfico: ...]`, `[Infográfico: ...]`, `[Imagem: ...]`, etc. — strip verbose data, keep only a brief label or nothing.

### 2c. Alternatives that ARE images

When a question's alternatives are visual (e.g., geometric figures, graphs), the alternative text should be empty:

**Before:**
```json
"a": "[Projeções ortogonais - opção A]",
"b": "[Projeções ortogonais - opção B]",
```

**After:**
```json
"a": "",
"b": "",
```

The images array already has the corresponding figures.

---

## Step 3 — Formula formatting (math/ciências)

Standalone mathematical expressions that appear on their own line should be wrapped in `<center>` tags:

**Before:**
```
D = k + tg[p(T + m)],
```

**After:**
```
<center>D = k + tg[p(T + m)],</center>
```

Apply this when a formula appears between two text paragraphs and visually belongs centered.

---

## Step 4 — Context extraction (LINGUAGENS only)

For `linguagens_enem_{year}.json`, source texts are embedded inside the question `text` field. They must be extracted to `contexts.json` and linked via `contextIds`.

### 4a. Identify source texts

Look for content at the top of a question's `text` that includes:
- A title (e.g., `"El vírus de la cancelación\n\n"`)
- A long reading passage
- A reference line (`"Disponível em: ..."`)
- Song lyrics with attribution
- Multiple paragraphs before the actual question stem

These should NOT be in the question text — only the actual question stem should remain.

**When NOT to create a context:**

Some questions have source material that is purely visual (a painting, a poster/cartaz, a charge, a tira, a photograph). These are **not** contexts — the image IS the source, and it is already in the question's `images` array.

- If the only "text" to extract is `[Imagem: ...]` + an attribution line → do NOT create a context. Keep the `[Imagem]` placeholder and attribution inline in the question `text`.
- If the question stem says "Nesse cartaz", "Nessa pintura", "Nessa charge", "Nessa tira", "Nessa fotografia" with no accompanying reading passage → no context needed.
- Short 1–2 line quotes that are integral to asking the question → leave in `text`, no context.

**Example — image-only question (NO context):**

```json
"text": "[Imagem: Campanha do agasalho]\n\nDisponível em: https://defesacivil.rs.gov.br. Acesso em: 11 mar. 2024 (adaptado).\n\nNesse cartaz, a expressão \"Vou deixar que você se vá\", em conjunto com os elementos não verbais utilizados, tem a finalidade de",
"images": ["figuras/q033_2024_fig1.png"]
```

The attribution stays inline; no `contextIds` field; no context entry created.

### 4b. Create context entries in `contexts.json`

Context ID format: `enem_{year}_linguagens_q{questionNumber}_ctx{n}`

Use `q{n}` where `n` is the question number within its language group (not the absolute question number). Use `ctx{n}` for multiple contexts per question.

Entry structure:
```json
"enem_2024_linguagens_q2_ctx1": {
  "title": "Holy War",
  "subtitle": "",
  "text": "Oh, so we can hate each other...",
  "reference": "KEYS, A. <b>Here</b>. Estados Unidos: RCA Records, 2016.",
  "images": []
}
```

- `title`: the text's heading, if any (empty string `""` if none)
- `subtitle`: subtitle if present (usually `""`)
- `text`: the body of the source text only (no title, no reference line)
- `reference`: the `Disponível em:` / attribution line (no trailing newline)
- `images`: leave `[]` unless the context itself has associated images

### 4c. Update the question

Remove the source text from `text`, keeping only the question stem:

**Before:**
```json
"text": "Holy War\n\nOh, so we can hate each other...\n\nKEYS, A. Here...\n\nNessa letra de canção, que aborda um contexto de ódio, o marcador \"instead of\" introduz a ideia de"
```

**After:**
```json
"text": "Nessa letra de canção, que aborda um contexto de ódio, o marcador \"instead of\" introduz a ideia de"
```

Then add the `contextIds` field:
```json
"contextIds": [
  "enem_2024_linguagens_q2_ctx1"
]
```

If a question references multiple source texts, list all context IDs.

### 4d. Image placeholder simplification

For linguagens questions with image placeholders, simplify the filename-style labels:

**Before:** `[Imagem: q1_quotes.png]`  
**After:** `[Imagem: Quotes]`

Remove the `q{n}_` prefix and `.png` extension; keep a human-readable label.

---

## Step 5 — Mark as done in NOTES.MD

After finishing an area, update `NOTES.MD`:
- `[]` → `[x]` when the area is fully reviewed
- `[]` → `[-]` if you stopped partway through

---

## Common pitfalls

- **Image-only source material**: if the only extractable content is `[Imagem: ...]` + attribution (painting, cartaz, charge, tira), do NOT create a context. Keep the placeholder and attribution inline in `text`. Only actual reading passages become contexts.
- **Multiple contexts per question**: some questions (especially EN/ES foreign language sections) have two source texts. Create `ctx1` and `ctx2` separately, list both in `contextIds`.
- **Reference inside question text**: if the reference line is still embedded in `text` after extracting the source text, remove it — it belongs only in the context entry's `reference` field.
- **Don't remove `[Figura]` brackets**: the app renders these as image placeholders; keep the brackets, just clean the verbose description inside them.
- **Image numbering gaps**: if `fig1.png` exists for a question but `fig2.png` is the correct figure for the question body (because `fig1` was a context image), use `fig2`. Check what actually exists in `figuras/`.
