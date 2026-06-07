# Discipline Tagging Design

**Date:** 2026-06-07
**Status:** Approved — implementation pending

## Problem

ENEM groups Química, Física, and Biologia under a single "Ciências da Natureza" area, and similarly lumps História, Geografia, Filosofia, Sociologia under "Humanas". The app currently uses these area names as the top-level filter, which means a user practicing only Química has to filter through subject tags inside a CN-wide question pool.

Existing per-question `tags` (e.g. `"química orgânica"`, `"termologia"`, `"história moderna"`) already imply a discipline, but they're flat and intermixed with cross-cutting tags like `"interpretação de texto"`. Users can't easily ask "show me only Biologia questions" or "give me a simulado de Filosofia".

## Goals

1. Add a "disciplina" (discipline) tagging layer that sits between `area` and the existing `tags`.
2. Make disciplinas the primary filter in the subject picker.
3. Surface questions that span more than one disciplina (multidisciplinares) as a first-class filter option.
4. Keep `area` intact so the Dia 1 / Dia 2 official simulado modes still work.
5. Preserve all existing tags as "subtags" — no loss of data.

## Non-goals

- Not normalizing or de-duplicating the existing tag list (separate cleanup task).
- Not changing how user attempts are stored (keyed by question number, unaffected).
- Not restructuring the per-year JSON file layout.

## Taxonomy

Fixed list of disciplinas, grouped by area:

| Area (existing) | Disciplinas (new) |
|---|---|
| `linguagens` | Português, Literatura, Língua Estrangeira, Artes, Educação Física |
| `humanas` | História, Geografia, Filosofia, Sociologia |
| `nature` | Física, Química, Biologia |
| `math` | Matemática |

Stored as a constant `DISCIPLINAS_BY_AREA` in `src/data/disciplinas.js`. Slugs are lowercase ascii (`fisica`, `quimica`, `historia`, `lingua_estrangeira`, `educacao_fisica`, …) for use in filters and URLs; display labels keep accents.

## Data model

A new field on every question:

```json
{
  "number": 96,
  "area": "nature",
  "disciplinas": ["biologia", "quimica"],
  "tags": ["cinética química", "estequiometria"],
  ...
}
```

- `disciplinas` is **always an array**, even when a single disciplina applies. This makes multi-disciplina handling uniform.
- Existing `tags` array stays untouched — those become the "subtags" inside a disciplina.
- Existing `area` field stays — used for Day 1/Day 2 simulado boundaries and as a grouping hint in the picker UI.

## Tag → disciplina mapping

A single file `src/data/disciplinaFromTag.js` (plain JS object) keyed by `(area, tag)` because some tags (e.g. `meio ambiente e sustentabilidade`, `cultura e identidade`) appear in multiple areas and resolve to different disciplinas depending on context.

Mapping (consolidated from the existing tag survey across all years):

**Nature → Física**
`eletricidade e magnetismo`, `mecânica newtoniana`, `termologia`, `física moderna`, `óptica`, `ondulatória e acústica`, `ondulatória`, `física nuclear e radioatividade`, `física nuclear`, `gravitação e astronomia`, `cinemática`, `hidrostática`, `análise de circuitos`, `transferência de calor`, `energia e conservação`, `dispersão da luz`, `energia e trabalho`, `pressão`, `física`

**Nature → Química**
`química geral e inorgânica`, `química orgânica`, `termoquímica e cinética`, `termoquímica`, `estequiometria`, `soluções e solubilidade`, `eletroquímica`, `equilíbrio químico`, `cinética química`, `análise qualitativa`, `ligações químicas`, `propriedades dos líquidos`, `chemistry estrutura molecular`

**Nature → Biologia**
`ecologia`, `fisiologia humana`, `genética e hereditariedade`, `microbiologia e imunologia`, `microbiologia`, `imunologia e microbiologia`, `citologia`, `biotecnologia`, `evolução`, `zoologia`, `botânica`, `comportamento animal`, `biologia molecular`, `sistema nervoso`, `fisiologia de plantas`, `fisiologia vegetal`, `reprodução vegetal`, `epidemiologia`, `endocrinologia`, `meio ambiente e sustentabilidade`, `biologia`, `climatologia` (in nature context)

**Humanas → História**
`história moderna`, `história contemporânea`, `história do brasil república`, `história do brasil colonial`, `história do brasil imperial`, `história do brasil império`, `história antiga e medieval`, `história medieval`, `história moderna e contemporânea`, `história contemporânea do brasil`, `história da cultura e arte`, `história das cruzadas`

**Humanas → Geografia**
`geografia humana e urbana`, `geografia física e geologia`, `geopolítica e território`, `geopolítica e relações internacionais`, `climatologia`, `cartografia`, `clima e processos geomorfológicos`, `geografia: cartografia`, `geografia: geografia humana e urbana`

**Humanas → Filosofia**
`filosofia moderna e contemporânea`, `filosofia antiga e medieval`, `ética e política`, `epistemologia e lógica`, `filosofia e sociologia`, `filosofia e educação`

**Humanas → Sociologia**
`sociologia e estrutura social`, `cultura e identidade`, `direitos humanos e cidadania`, `comunicação e mídia`, `institucionalismo religioso`, `política e direitos humanos`, `ciência e tecnologia`, `educação e políticas públicas`

**Linguagens → Português**
`interpretação de texto`, `linguística e variação linguística`, `gêneros textuais`

**Linguagens → Literatura**
`literatura brasileira`, `literatura mundial`

**Linguagens → Língua Estrangeira**
`língua espanhola`, `língua inglesa`. Additionally: any linguagens question with `"language": "en"` or `"language": "es"` (Day 1 Q1–5) adds this disciplina even when no tag matches.

**Linguagens → Artes**
`artes visuais`, `música e dança`, `história da cultura e arte` (in linguagens context)

**Linguagens → Educação Física**
No existing tag maps cleanly here. Resolution: leave this disciplina empty after the automated backfill and tag the ~15–25 affected questions manually in a follow-up commit. Optionally add a new tag `educação física` during that pass.

**Math → Matemática**
Every question with `area: "math"` gets `disciplinas: ["matematica"]`.

**Cross-cutting / ambiguous tags** are resolved by the `(area, tag)` key so the same tag string can map to different disciplinas in different areas. Concrete handling:

- `comunicação e mídia` → Sociologia when `area === "humanas"`; no entry (skipped) when `area === "linguagens"` because other tags on the question already classify it.
- `meio ambiente e sustentabilidade` → Biologia in nature, Geografia in humanas, no entry in linguagens.
- `cultura e identidade` → Sociologia in humanas, no entry in linguagens.
- `direitos humanos e cidadania` → Sociologia in humanas, no entry in linguagens.
- `climatologia` → Geografia in humanas, Biologia in nature.
- `história da cultura e arte` → História in humanas, Artes in linguagens.

A tag absent from the map for a given area produces no disciplina from that tag (other tags on the same question may still produce one). A question whose tags resolve to no disciplinas at all is flagged in the backfill report for manual review.

**Multi-disciplina cases:** when a question's tags resolve to two or more disciplinas (e.g. `["química orgânica", "fisiologia humana"]` → `["quimica", "biologia"]`), all are added. This is the multidisciplinar case.

## UI changes

### Subject / topic picker

- Top level lists the **disciplinas list** (13 entries: Português, Literatura, Língua Estrangeira, Artes, Educação Física, História, Geografia, Filosofia, Sociologia, Física, Química, Biologia, Matemática) plus a **"Multidisciplinar"** entry at the bottom that filters to `disciplinas.length > 1`.
- Each disciplina is selectable (multi-select, mirroring today's tag picker).
- Below the disciplinas list, the existing **subtag selector** (current `tags`) still shows, but now filters within the selected disciplinas. If no disciplina is selected, subtags fall back to "all".
- `area` is no longer a top-level UI choice but is used to group/color disciplinas in the picker (e.g., the three CN disciplinas show under a "Ciências da Natureza" subheading).

### Simulado / prova completa

- Dia 1 / Dia 2 prova completa remains unchanged — still uses the existing `area` field to bound the question set (Dia 1 = LC+CH, Dia 2 = CN+MT).
- New addition: a "prova de disciplina" mode — a simulado filtered to a single disciplina (e.g., "Simulado de Química"). Same length / timer rules as today's tag-filter simulado.

### Summary screen (resumo)

The existing tag-stats diagnostic ("assuntos de menor domínio") gets an extra grouping by disciplina at the top: disciplina-level hit rates first, then drill down to tag stats inside each disciplina.

## Rollout

### 1. Add constants and mapping

- New file: `src/data/disciplinas.js` — exports `DISCIPLINAS_BY_AREA`, slug list, and display labels.
- New file: `src/data/disciplinaFromTag.js` — exports the `(area, tag) → disciplina[]` map and a helper `disciplinasForQuestion(question)` that takes a question object and returns its derived disciplinas (consulting the map, the `language` field, and the area).

Commit: `feat: add disciplina taxonomy and tag mapping`.

### 2. Backfill script

`scripts/backfill-disciplinas.js` — Node, no deps, idempotent.

```
For each file in public/*_enem_*.json:
  For each question in the file:
    If question.disciplinas already exists, skip.
    Otherwise:
      Compute disciplinas = disciplinasForQuestion(question)
      Set question.disciplinas to the sorted unique list.
Write the file back, pretty-printed, same indentation as before.

Print summary:
  - Total questions processed
  - Count per disciplina
  - Count of multidisciplinar questions
  - List of (file, question number) where disciplinas came out empty
```

Run once, review the "empty disciplinas" list, then commit the resulting JSON changes (one commit, ~30 files touched).

Commit: `data: backfill disciplinas on all questions`.

### 3. Manual fixups

- Walk the "empty disciplinas" report and assign disciplinas by hand.
- Identify Educação Física questions (manual scan of `area: "linguagens"` questions about sports/exercise) and add `disciplinas: ["educacao_fisica"]`.

Commit: `data: manual disciplina fixups (EdFís + edge cases)`.

### 4. UI changes

Implement the picker / simulado / resumo updates from the UI section above.

Commit: `feat: disciplina-first picker, simulado mode, summary grouping`.

### Backwards compatibility

- `area` field is unchanged — Dia 1 / Dia 2 simulado keeps working through the entire rollout.
- Existing `tags` arrays are unchanged.
- User attempt data is keyed by question number, unaffected.
- If the UI rollout has issues, it can be reverted without touching the data backfill.

## Open questions / future work

- **Tag cleanup:** the existing tag list has duplicates and miscategorizations (e.g. `"biologia"` showing up under humanas). Not in scope here, but the disciplina backfill will make these easier to spot.
- **Educação Física tag introduction:** during the manual fixup pass we may add an `educação física` tag, which would make a future re-run of the backfill script automatic.
- **Multidisciplinar visual treatment:** the picker labels multidisciplinar questions and lets users filter to them, but there's no further visual badge on the question itself yet. Could be added later if useful.
