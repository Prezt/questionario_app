# contexts.json — Purpose, Structure, and How to Build It

## Why it exists

ENEM questions in Linguagens (and occasionally Humanas) are built around **shared reading passages**: a newspaper article, poem, excerpt, legal text, or image sequence that 2 to 6 consecutive questions all reference. Without `contexts.json`, every one of those questions would embed the same full passage inside its own `text` field — repeating thousands of characters across multiple objects, making the data hard to maintain and the app harder to read.

`contexts.json` solves this by storing each passage once, keyed by a unique ID. Questions reference the ID. The app fetches the passage and renders it above the question stem, exactly as it appears in the original exam booklet.

**This matters for three reasons:**

1. **Accuracy** — The passage appears in the correct position relative to the question, not buried inside the stem.
2. **Consistency** — An edit to the passage (fixing a typo, adjusting formatting) happens in one place and applies to all linked questions instantly.
3. **Study experience** — When navigating between questions that share a passage, the app can display the passage persistently, letting the student read it once and answer all related questions without losing their place.

---

## Current state of contexts.json

As of the latest build, `contexts.json` holds **19 passages**. Of these:

- **10 are actively linked** to at least one question
- **9 are defined but not yet linked** — their corresponding questions have not been entered yet

The 9 unlinked passages are all from ENEM 2025 Linguagens (`ctx3` through `ctx11`). They represent the portions of that exam that are still missing from the question pool. **Any agent adding ENEM 2025 Linguagens questions must link to these existing entries rather than creating new ones or pasting the text into the question stem.**

The passage with the most links is `enem_2025_lang_ctx1` ("De próprio punho"), which is referenced by questions 6, 7, 8, 9, and 10 — a typical ENEM cluster of 5 questions around one long text.

---

## File location and format

```
public/contexts.json
```

The file is a single JSON **object** (not array). Each key is a unique context ID; each value is the passage object.

```json
{
  "enem_2025_lang_ctx1": { ... },
  "enem_2025_lang_ctx2": { ... }
}
```

---

## Context object structure

```json
{
  "title":     "De próprio punho",
  "subtitle":  "A escrita e suas tecnologias sofrem interessantes metamorfoses...",
  "text":      "Estranhei muito na primeira vez que escutei a expressão...\n\nDepois dos teclados...",
  "reference": "RIBEIRO, A. E. Disponível em: https://rascunho.com.br. Acesso em: 16 jan. 2024 (adaptado)."
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `title` | string or `null` | Yes | Title of the text as printed in the exam. `null` if the exam shows no title. |
| `subtitle` | string or `null` | Yes | Subtitle/epigraph line printed below the title. `null` if absent. |
| `text` | string | Yes | Full passage. Preserve paragraph breaks as `\n\n`. Preserve stanza breaks in poetry as `\n\n`. Do not truncate. |
| `reference` | string or `null` | Yes | Bibliographic credit exactly as printed at the end of the passage in the exam. `null` if the exam shows none. |

### Text formatting rules

- Use `\n\n` between paragraphs and between stanzas.
- Use `\n` for line breaks within a stanza (poetry) or within a continuous list.
- Preserve ellipses (`...` or `…`) exactly as they appear — they often indicate the examiner cut the original.
- Preserve dialogue dashes (`—`) and formatting marks.
- Do **not** add markdown. The app renders plain text.
- If the passage contains an image (infographic, photograph, painting), note its position with an inline marker using the same syntax as question images: `[Figura: descrição]`. Add the image path to a top-level `images` array on the context object (same pattern as questions).

---

## ID naming convention

```
{test}_{year}_{area_abbrev}_ctx{N}
```

| Part | Value |
|------|-------|
| `test` | `enem`, `ufsc`, etc. (lowercase) |
| `year` | 4-digit year |
| `area_abbrev` | `lang` (linguagens), `hum` (humanas), `nat` (nature), `math` |
| `N` | Sequential integer starting at 1 within the same exam+area |

Examples:
```
enem_2025_lang_ctx1
enem_2025_lang_ctx2
enem_2024_hum_ctx1
ufsc_2024_lang_ctx1
```

When one exam block presents **two texts side by side** (Texto I / Texto II for a single question), give each text its own entry with a suffix:
```
enem_2023_lang_ctx2a   ← Texto I
enem_2023_lang_ctx2b   ← Texto II
```

---

## How questions reference contexts

### Single passage
Use `contextId` (string):
```json
{
  "number": 6,
  "text": "No que diz respeito ao gênero bilhete, a autora dessa crônica",
  "contextId": "enem_2025_lang_ctx1",
  ...
}
```

The `text` field contains **only the question stem** — the passage itself must not be duplicated there.

### Two passages for one question
Use `contextIds` (array):
```json
{
  "number": 22,
  "text": "Comparando os dois textos, é correto afirmar que",
  "contextIds": ["enem_2025_lang_ctx12a", "enem_2025_lang_ctx12b"],
  ...
}
```

### Multiple questions sharing one passage
Each question gets its own `contextId` pointing to the same ID:
```json
{ "number": 6,  "contextId": "enem_2025_lang_ctx1", ... },
{ "number": 7,  "contextId": "enem_2025_lang_ctx1", ... },
{ "number": 8,  "contextId": "enem_2025_lang_ctx1", ... },
{ "number": 9,  "contextId": "enem_2025_lang_ctx1", ... },
{ "number": 10, "contextId": "enem_2025_lang_ctx1", ... }
```

---

## When NOT to use contexts.json

Not every reference in a question stem warrants a context entry. Use `contextId` only when:

- The passage is **explicitly printed as a standalone block** in the exam (set apart with a title, reference line, or box)
- The passage is **shared by 2 or more questions**, OR
- The passage is **longer than ~3 sentences** and is the primary reading material for the question

Do **not** create a context for:
- A single short quote embedded mid-sentence in the question stem (leave it inline in `text`)
- A table or infographic that belongs to a single question (use `images` instead)
- Paraphrased content that the examiner summarized inside the stem

---

## Completeness requirement

Every passage that appears in the original exam **must be entered in full**. Do not summarize, paraphrase, or truncate. The ENEM in particular relies on the exact wording of the source text for its questions — a shortened passage will make certain questions unanswerable or misleading.

If a passage is missing from `contexts.json` and the corresponding question has already been entered with the passage pasted directly into `text`, migrate the passage to `contexts.json`, replace the inline text with a `contextId`, and leave only the question stem in `text`.

---

## Checklist for adding a context

- [ ] ID follows the naming convention and is unique
- [ ] `title` and `subtitle` match the exam exactly (`null` if absent)
- [ ] `text` is complete — no truncation, no paraphrasing
- [ ] Paragraph/stanza breaks use `\n\n`
- [ ] `reference` matches the bibliographic credit printed in the exam (`null` if absent)
- [ ] All questions that reference this passage use `contextId` or `contextIds`
- [ ] No question's `text` field contains the passage text itself
- [ ] If the passage includes images, they are listed in an `images` array and the files exist under `public/figuras/`
