# Data Guide — Adding Questions to the Questionário App

This document instructs an agent (or human) on how to structure question data so it works correctly in the app. Read it entirely before producing any JSON.

---

## Architecture overview

Questions live as static JSON files in **`public/`**. The app fetches them at runtime — there is no database for question content. Each file covers one subject area for one year. The manifest tells the app which files to load and in what order.

```
public/
├── questions-manifest.json          ← load order list
├── contexts.json                    ← shared reading passages (optional)
├── math_enem_2025.json
├── nature_enem_2025.json
├── linguagens_enem_2025.json
├── humanas_enem_2025.json
└── figuras/                         ← images referenced by questions
```

After editing any file in `public/`, run `npm run build` so `dist/` is kept in sync.

---

## File naming

Pattern: `{area}_{test}_{year}.json`

| Area code | Subject |
|-----------|---------|
| `math` | Matemática |
| `nature` | Ciências da Natureza |
| `linguagens` | Linguagens e Códigos |
| `humanas` | Ciências Humanas |

Examples: `math_enem_2025.json`, `nature_enem_2023.json`

The file must be added to **`questions-manifest.json`** in the desired load order (most recent first per area).

---

## Question structure

Each file is a **JSON array** of question objects. Every field is described below.

```json
{
  "number":       136,
  "text":         "Enunciado completo da questão...",
  "alternatives": { "a": "...", "b": "...", "c": "...", "d": "...", "e": "..." },
  "answer":       "c",
  "area":         "math",
  "test":         "ENEM",
  "year":         2025,
  "tags":         ["aritmética e números", "álgebra"],
  "difficulty":   3,
  "images":       [],
  "language":     "en",
  "contextId":    "enem_2025_lang_ctx1",
  "contextIds":   ["enem_2025_lang_ctx1", "enem_2025_lang_ctx2"]
}
```

### Required fields

| Field | Type | Description |
|-------|------|-------------|
| `number` | integer | The official question number as it appears in the exam (e.g. 136). Must be unique within the file. |
| `text` | string | Full question stem. Include figure markers inline — see Images section. |
| `alternatives` | object | Keys `"a"` through `"e"`, each a string. If an alternative contains only an image, write `"[Figura: descrição]"` as the value. |
| `answer` | string | Correct alternative key: `"a"`, `"b"`, `"c"`, `"d"`, or `"e"`. |
| `area` | string | One of: `"math"`, `"nature"`, `"linguagens"`, `"humanas"`. Must match the filename. |
| `test` | string | Exam name, e.g. `"ENEM"`, `"UFSC"`. |
| `year` | integer | Exam year, e.g. `2025`. |
| `tags` | array | 2–4 strings from the unified taxonomy (see Tags section). |
| `difficulty` | integer | Score from 1 (very easy) to 10 (very hard). See scale below. |
| `images` | array | List of image paths relative to `public/`. Empty array `[]` if no images. |

### Optional fields

| Field | Type | When to use |
|-------|------|-------------|
| `language` | string | `"en"` or `"es"`. Only for foreign-language questions in `linguagens`. Questions that are *about* English/Spanish but written in Portuguese do **not** get this field. The sibling question in the other language must have the same `number`. |
| `contextId` | string | ID of a shared reading passage in `contexts.json` that this question references. Use when a single passage is shared by multiple questions. |
| `contextIds` | array | Like `contextId` but for questions that reference multiple distinct passages. Use array of IDs. Prefer `contextId` (singular) when only one passage. |

---

## Difficulty scale

Rate based on the cognitive demand and the percentage of candidates expected to answer correctly on the real exam.

| Score | Label | Rough pass rate |
|-------|-------|----------------|
| 1–2 | Very easy | > 80% |
| 3–4 | Easy | 60–80% |
| 5–6 | Medium | 40–60% |
| 7–8 | Hard | 20–40% |
| 9–10 | Very hard | < 20% |

When in doubt, default to `5`.

---

## Tags — unified taxonomy

Each question must have **2 to 4 tags** chosen exclusively from the list below. Do not invent new tags. Do not use author names, historical figures, or specific events as tags — map them to their thematic category.

### Matemática
`aritmética e números` · `álgebra` · `funções` · `geometria plana` · `geometria espacial` · `geometria analítica` · `trigonometria` · `estatística` · `probabilidade` · `análise combinatória` · `matemática financeira` · `sequências e progressões`

### Física
`mecânica newtoniana` · `termologia` · `óptica` · `ondulatória e acústica` · `eletricidade e magnetismo` · `física moderna` · `física nuclear e radioatividade` · `gravitação e astronomia`

### Química
`química geral e inorgânica` · `química orgânica` · `estequiometria` · `termoquímica e cinética` · `eletroquímica` · `equilíbrio químico` · `soluções e solubilidade`

### Biologia
`citologia` · `genética e hereditariedade` · `evolução` · `ecologia` · `fisiologia humana` · `botânica` · `zoologia` · `microbiologia e imunologia` · `biotecnologia`

### História
`história do brasil colonial` · `história do brasil imperial` · `história do brasil república` · `história antiga e medieval` · `história moderna` · `história contemporânea` · `geopolítica e relações internacionais` · `história da cultura e arte`

### Geografia
`geografia física e geologia` · `geografia humana e urbana` · `meio ambiente e sustentabilidade` · `geopolítica e território` · `cartografia` · `climatologia`

### Filosofia e Sociologia
`filosofia antiga e medieval` · `filosofia moderna e contemporânea` · `ética e política` · `sociologia e estrutura social` · `cultura e identidade` · `direitos humanos e cidadania` · `epistemologia e lógica`

### Linguagens
`interpretação de texto` · `gêneros textuais` · `linguística e variação linguística` · `literatura brasileira` · `literatura mundial` · `artes visuais` · `música e dança` · `comunicação e mídia` · `língua espanhola` · `língua inglesa`

**Tag selection rules:**
- Pick the most specific applicable tags first.
- A `linguagens` question about an English text that tests reading comprehension gets `língua inglesa` + `interpretação de texto`.
- A `nature` question about DNA replication that involves chemistry gets `genética e hereditariedade` + `citologia`, not a chemistry tag.
- Cross-area tags (e.g. a math question involving physics context) should use the math tag for the skill being tested, not the context subject.

---

## Images

### File location
Images go in `public/figuras/`. Name them descriptively and uniquely, e.g.:
```
figuras/q136_cilindro.png
figuras/q138_enunciado.png
figuras/q138_alt_a.png
```

### Referencing images in `images` array
Paths are relative to `public/`:
```json
"images": ["figuras/q138_enunciado.png"]
```

### Inline figure markers in `text`
The app uses markers inside the `text` string to position images at the right point in the question stem. **Always add a marker at the exact position where the figure should appear.** The marker text becomes the image caption.

Supported marker formats (case-insensitive prefix):
- `[Figura: descrição]`
- `[Figuras: descrição]`
- `[Gráfico: descrição]` / `[Gráfico de pizza: ...]` / `[Gráfico 1: ...]`
- `[Infográfico: descrição]`
- `[Esquema: descrição]`
- `[Tabela: descrição]`

Example:
```
"text": "Observe o gráfico a seguir.\n\n[Gráfico: consumo mensal de energia por fonte]\n\nCom base no gráfico, qual fonte apresentou maior crescimento?"
```

### Alternatives with images
When **every alternative is an image** (common in geometry questions), provide:
- 1 stem image (the question figure) + 5 alternative images, total 6 entries in `images`
- The order must be: `[enunciado, alt_a, alt_b, alt_c, alt_d, alt_e]`
- Write the alternative text as `"[Figura: descrição da opção]"`

---

## Shared reading passages (`contexts.json`)

When multiple questions share the same source text (common in `linguagens`), store the passage once in `contexts.json` and reference it by ID instead of repeating it in each question's `text`.

### Context object structure

```json
{
  "enem_2025_lang_ctx1": {
    "title": "De próprio punho",
    "subtitle": "Subtítulo opcional do texto",
    "text": "Texto completo do trecho...",
    "reference": "RIBEIRO, A. E. Disponível em: https://rascunho.com.br. Acesso em: 16 jan. 2024."
  }
}
```

- `title`: Title of the text or `null`
- `subtitle`: Subtitle or `null`
- `text`: Full passage text, preserving paragraphs with `\n\n`
- `reference`: Bibliographic reference as it appears in the exam, or `null`

### ID naming convention
`{test}_{year}_{area_abbrev}_ctx{N}`

Examples: `enem_2025_lang_ctx1`, `enem_2024_hum_ctx3`

### Referencing from a question
```json
"contextId": "enem_2025_lang_ctx1"
```

If a question uses two separate passages:
```json
"contextIds": ["enem_2025_lang_ctx1", "enem_2025_lang_ctx2"]
```

Do **not** paste passage text into `question.text` when a `contextId` is provided — keep `text` to only the question stem itself.

---

## Foreign language questions (`linguagens` only)

ENEM offers questions in English or Spanish for the foreign language section. Each language version of a question is a **separate object** in the array with the same `number` but different `language` and `text`.

```json
[
  {
    "number": 1,
    "language": "en",
    "text": "...(English stem)...",
    "alternatives": { "a": "...", ... },
    "answer": "d",
    "area": "linguagens",
    "test": "ENEM",
    "year": 2025,
    "tags": ["interpretação de texto", "língua inglesa"],
    "difficulty": 3,
    "images": []
  },
  {
    "number": 1,
    "language": "es",
    "text": "...(Spanish stem)...",
    "alternatives": { "a": "...", ... },
    "answer": "d",
    "area": "linguagens",
    "test": "ENEM",
    "year": 2025,
    "tags": ["interpretação de texto", "língua espanhola"],
    "difficulty": 3,
    "images": []
  }
]
```

**Rules:**
- Both objects must have the same `number` and `answer`.
- The `language` field must be exactly `"en"` or `"es"`.
- Portuguese questions (even those *about* English/Spanish) must NOT have a `language` field.
- The alternatives are typically in Portuguese regardless of language variant.

---

## Manifest (`questions-manifest.json`)

This file is a flat JSON array listing every question filename in the order they should load. Most-recent year first within each area.

```json
[
  "math_enem_2025.json",
  "math_enem_2024.json",
  "math_enem_2023.json",
  "math_enem_2022.json",
  "nature_enem_2025.json",
  ...
]
```

When adding a new file, insert it **at the top of its area block** (before older years of the same area).

---

## Quality checklist

Before submitting data, verify each question against this list:

- [ ] `number` is the official question number from the exam
- [ ] `text` is complete and faithful to the source — no truncation
- [ ] All 5 alternatives (`a`–`e`) are present and non-empty
- [ ] `answer` is one of `a`, `b`, `c`, `d`, `e` and is correct
- [ ] `area` matches the filename
- [ ] `year` matches the filename
- [ ] `tags` has 2–4 entries, all from the approved taxonomy
- [ ] `difficulty` is set (1–10)
- [ ] `images` is present (empty array `[]` if no images)
- [ ] Every image referenced in `images` has a corresponding `[Marker]` in `text` (or all alternatives are images)
- [ ] Image files exist at the listed paths under `public/figuras/`
- [ ] Context passages are in `contexts.json` and referenced via `contextId`, not duplicated in `text`
- [ ] Foreign language variants share the same `number` and `answer`
- [ ] New file is added to `questions-manifest.json`
