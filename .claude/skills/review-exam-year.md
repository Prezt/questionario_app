---
name: review-exam-year
description: Guide for reviewing a year of ENEM questions. Covers image fixes, text cleanup, formula formatting, and context extraction (all areas — not just linguagens). Use when reviewing any pending year/area in NOTES.MD.
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

Use the `review-images` skill for a full walkthrough of image verification and fixing. Key points:

- Image filenames follow `q{number}_{year}_fig{n}.png` in `figuras/`
- Two-column PDF layout causes images to be saved under the **wrong question number** — always visually verify by reading the PNG files
- A question's `fig1` may actually belong to the prior question; its own image may be `fig2`
- Context images (intro diagrams) belong in the context entry's `images` array, not the question's
- Clean verbose `[Figura: long description]` → `[Figura]` once real images are confirmed
- Alternatives that are images → set all alternative values to `""`

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

## Step 4 — Context extraction (ALL areas — not just linguagens)

Context extraction applies to **every area** (linguagens, humanas, nature, math) whenever a question quotes an external source. The indicator is a source citation line — `"Disponível em:"`, an author/journal reference (e.g., `"GONÇALVES, A. A. et al. ... Química Nova, n. 3, 2013 (adaptado)."`), or a `(adaptado)` flag.

### 4-science. Science areas (nature / math) with contexts

Nature and math questions often open with a brief descriptive paragraph, a figure, and then a citation. All of that belongs in a context entry — only the bare question stem stays in `text`.

**Context ID format for science areas:** `enem_{year}_{area}_q{questionNumber}_ctx{n}`
Examples: `enem_2024_nature_q94_ctx1`, `enem_2024_math_q145_ctx1`

Use the **absolute question number** (the question's `number` field), not a relative position within the area.

**What goes in the context entry:**
- `text`: the intro/description paragraph(s) that precede the question stem
- `reference`: the citation line (author, journal, year)
- `images`: any figure that belongs to the intro (e.g., a molecule diagram that illustrates the intro text)

**What stays in `text` (question stem):**
Only the part of the text that is a direct question or instruction — starting with "Com base...", "Qual...", "Nesse contexto...", "Calcule...", etc.

**Example — nature question with intro + figure + citation:**

Before:
```json
"text": "A nimesulida é um fármaco pouco solúvel em água...\n\n[Figura: estrutura química da nimesulida]\n\nGONÇALVES, A. A. et al. Química Nova, n. 3, 2013 (adaptado).\n\nPara converter a nimesulida nessa espécie eletricamente carregada, deve-se utilizar qual dos seguintes compostos?"
```

After question field:
```json
"text": "Para converter a nimesulida nessa espécie eletricamente carregada, deve-se utilizar qual dos seguintes compostos?",
"contextIds": ["enem_2024_nature_q94_ctx1"]
```

New context entry in `contexts.json`:
```json
"enem_2024_nature_q94_ctx1": {
  "title": "",
  "subtitle": "",
  "text": "A nimesulida é um fármaco pouco solúvel em água, utilizado como anti-inflamatório, analgésico e antitérmico...",
  "reference": "GONÇALVES, A. A. et al. Contextualizando reações ácido-base... <b>Química Nova</b>, n. 3, 2013 (adaptado).",
  "images": ["figuras/q094_2024_fig1.png"]
}
```

### 4-ocr-drop. OCR drops reference lines — detection and recovery

**The pattern**: In two-column PDF layouts, the citation line that appears between a figure and the question stem is often **completely omitted** by OCR. The question JSON will look syntactically fine but the context is incomplete or missing entirely.

**How to detect it:**
1. The question stem begins with a pronoun or demonstrative that has no antecedent in the same `text` field: `"esse fármaco"`, `"essa substância"`, `"esses dados"`, `"o composto acima"`, `"o gráfico a seguir"` — but there is no preceding description.
2. The `text` field is unusually short for a question that has images.
3. The question has `images` but no `contextIds` and no intro paragraph in `text`.

**What to do:**
- Open the original PDF page for that question (in `figuras/page-*.png` or the source scan).
- Look for the citation/reference line that OCR dropped — it typically sits between the last figure and the first line of the question stem.
- Create a context entry that includes the intro text, the dropped citation, and any relevant images.
- Link the question to the new context via `contextIds`.

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

**For linguagens:** Context ID format: `enem_{year}_linguagens_q{questionNumber}_ctx{n}`
Use `q{n}` where `n` is the question number within its language group (not the absolute question number).

**For all other areas (humanas, nature, math):** Use the question's absolute `number` field.
Format: `enem_{year}_{area}_q{questionNumber}_ctx{n}`

Use `ctx{n}` for multiple contexts per question.

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
