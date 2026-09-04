# Migrar Questões dos JSONs para Neon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar todas as questões dos ~33 JSONs estáticos em `public/` para uma nova tabela `multiple_choice_questions` no Postgres da Neon, de forma idempotente e auditável, mantendo os JSONs preservados como fonte histórica.

**Architecture:** Um único script Node em `scripts/migrate-questions-to-db.js` lê todos os JSONs, delega a normalização para um helper testado (`scripts/lib/parse-question-json.js`) e faz `INSERT ... ON CONFLICT DO NOTHING` em batch contra a Neon usando a mesma dependência `@neondatabase/serverless` que o resto do backend. Idempotência via unique constraint. Suporta `--dry-run` pra checar contagens antes do fire real.

**Tech Stack:** Node.js (com `--env-file`), `@neondatabase/serverless`, Vitest para os testes do parser, Postgres na Neon (SQL puro; nenhum ORM).

**Spec:** `docs/superpowers/specs/2026-09-03-v3.0.0-banco-de-questoes-design.md`

## Global Constraints

- **Nome da tabela:** `multiple_choice_questions` — reflete que suporta qualquer questão de múltipla escolha, não só ENEM (spec §"Arquitetura de dados").
- **PK:** `SERIAL` (não UUID).
- **Preserve os JSONs em `public/`** — nenhum arquivo removido ou renomeado nessa task. Fonte de verdade migra pro DB, mas JSONs ficam para auditoria (spec §"Escopo" / decisão do usuário).
- **Idempotência obrigatória:** rodar duas vezes não pode duplicar linhas. `UNIQUE (source, source_list, area, test, year, number)` + `ON CONFLICT DO NOTHING`.
- **Nenhum drive-by fix:** não editar código do App.jsx, do QuestionEditor ou de qualquer arquivo fora do escopo desta task (memória `feedback_no_drive_by_fixes`).
- **Sem `git commit`** entre as tasks sem autorização explícita — o usuário aprovou commits do spec+plano; cada task de código exige nova confirmação (memória `feedback_no_commit_without_asking`). Steps de commit no plano marcam o **momento** do commit; o executor deve pedir OK antes.
- **Não usar `/tmp` para saída intermediária** — usar diretórios do próprio repo (memória `feedback_avoid_tmp`).

---

## File Structure

**Novo:**
- `db/migrations/005_create_multiple_choice_questions.sql` — schema versionado da tabela + índices GIN.
- `scripts/lib/parse-question-json.js` — helper puro que normaliza uma questão do JSON (ENEM ou lista de professor) para o shape de linha do DB. Testável sem DB.
- `scripts/lib/parse-question-json.test.js` — testes Vitest do helper com fixtures cobrindo ENEM, lista de professor, `contextIds` de 1 e >1 elementos, campos ausentes.
- `scripts/migrate-questions-to-db.js` — script principal. Lê todos os `*enem*.json` + `ricardo_lista1.json` de `public/`, roda o parser, faz INSERT em batch com `ON CONFLICT DO NOTHING`. Suporta `--dry-run`.

**Modificado:**
- `db/schema.sql` — adiciona o mesmo bloco `CREATE TABLE multiple_choice_questions` para manter o schema versionado sincronizado com a produção.
- `package.json` — adiciona npm script `migrate:questions` que roda o script com `--env-file=.env`.

---

### Task 1: Schema e migration da tabela `multiple_choice_questions`

**Files:**
- Create: `db/migrations/005_create_multiple_choice_questions.sql`
- Modify: `db/schema.sql` (append no final)

**Interfaces:**
- Consumes: nada.
- Produces: tabela `multiple_choice_questions` em produção com colunas exatamente conforme o spec §"Arquitetura de dados" > `multiple_choice_questions`. Constraint `UNIQUE (source, source_list, area, test, year, number)` usada pelos tasks seguintes.

- [ ] **Step 1: Escrever a migration SQL**

Criar `db/migrations/005_create_multiple_choice_questions.sql` com este conteúdo exato:

```sql
-- db/migrations/005_create_multiple_choice_questions.sql
-- Run once manually in the Neon SQL console.
-- Cria a tabela `multiple_choice_questions` — banco unificado de questões de múltipla escolha.

CREATE TABLE IF NOT EXISTS multiple_choice_questions (
  id            SERIAL PRIMARY KEY,

  source        TEXT NOT NULL,
  source_list   TEXT,
  area          TEXT,
  test          TEXT,
  year          INTEGER,
  number        INTEGER NOT NULL,

  text          TEXT NOT NULL,
  alternatives  JSONB NOT NULL,
  answer        TEXT NOT NULL,
  images        TEXT[] DEFAULT '{}',
  tags          TEXT[] DEFAULT '{}',
  disciplinas   TEXT[] DEFAULT '{}',
  difficulty    INTEGER,
  context_key   TEXT,

  review        BOOLEAN DEFAULT FALSE,

  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (source, source_list, area, test, year, number)
);

CREATE INDEX IF NOT EXISTS idx_mcq_area        ON multiple_choice_questions(area);
CREATE INDEX IF NOT EXISTS idx_mcq_year        ON multiple_choice_questions(year);
CREATE INDEX IF NOT EXISTS idx_mcq_source      ON multiple_choice_questions(source);
CREATE INDEX IF NOT EXISTS idx_mcq_tags        ON multiple_choice_questions USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_mcq_disciplinas ON multiple_choice_questions USING GIN(disciplinas);
```

- [ ] **Step 2: Sincronizar `db/schema.sql`**

Anexar o mesmo bloco `CREATE TABLE multiple_choice_questions ...` no final de `db/schema.sql`, respeitando o padrão de indentação do arquivo (comentário curto acima da tabela, alinhamento de colunas com dois espaços entre nome e tipo — igual às outras tabelas do arquivo).

- [ ] **Step 3: Rodar a migration na Neon**

Colar o conteúdo de `db/migrations/005_create_multiple_choice_questions.sql` no SQL Editor da Neon (mesmo fluxo dos comentários das migrations 001–003). Rodar. Confirmar sucesso.

Se preferir automatizar via CLI: `psql "$DATABASE_URL" -f db/migrations/005_create_multiple_choice_questions.sql`.

- [ ] **Step 4: Verificar que a tabela existe e o schema bate**

Rodar no SQL Editor da Neon:

```sql
\d multiple_choice_questions
```

Ou, se `\d` não estiver disponível:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'multiple_choice_questions'
ORDER BY ordinal_position;
```

Verificar que aparecem as 18 colunas (`id`, `source`, `source_list`, `area`, `test`, `year`, `number`, `text`, `alternatives`, `answer`, `images`, `tags`, `disciplinas`, `difficulty`, `context_key`, `review`, `created_at`, `updated_at`) e os 5 índices (`idx_mcq_area`, `idx_mcq_year`, `idx_mcq_source`, `idx_mcq_tags`, `idx_mcq_disciplinas`).

- [ ] **Step 5: Pedir OK e commit**

Pedir autorização ao usuário para commit. Se aprovado:

```bash
git add db/migrations/005_create_multiple_choice_questions.sql db/schema.sql
git commit -m "$(cat <<'EOF'
feat(db): migration da tabela multiple_choice_questions

Task #8 da v3.0.0 — schema do banco de questões unificado.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Parser puro de questão JSON com testes

**Files:**
- Create: `scripts/lib/parse-question-json.js`
- Create: `scripts/lib/parse-question-json.test.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `parseQuestion(rawJson, sourceMeta) → row` — recebe uma questão do JSON e um objeto `sourceMeta` (`{ source, source_list }`) e retorna um objeto normalizado com as chaves da tabela: `{ source, source_list, area, test, year, number, text, alternatives, answer, images, tags, disciplinas, difficulty, context_key, review }`. Warnings vão via `console.warn` (não lança).

- [ ] **Step 1: Escrever os testes falhos**

Criar `scripts/lib/parse-question-json.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseQuestion } from './parse-question-json.js'

describe('parseQuestion', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('normalizes an ENEM question with all fields', () => {
    const raw = {
      number: 136,
      text: 'Enunciado.',
      alternatives: { a: 'I', b: 'II', c: 'III', d: 'IV', e: 'V' },
      images: ['figuras/q136_2024_fig1.png'],
      tags: ['estatística', 'geometria plana'],
      year: 2024,
      test: 'ENEM',
      area: 'math',
      answer: 'a',
      difficulty: 4,
      disciplinas: ['matematica'],
    }
    const row = parseQuestion(raw, { source: 'enem', source_list: null })
    expect(row).toEqual({
      source: 'enem',
      source_list: null,
      area: 'math',
      test: 'ENEM',
      year: 2024,
      number: 136,
      text: 'Enunciado.',
      alternatives: { a: 'I', b: 'II', c: 'III', d: 'IV', e: 'V' },
      answer: 'a',
      images: ['figuras/q136_2024_fig1.png'],
      tags: ['estatística', 'geometria plana'],
      disciplinas: ['matematica'],
      difficulty: 4,
      context_key: null,
      review: false,
    })
  })

  it('takes first contextIds element into context_key when array has 1 item', () => {
    const raw = {
      number: 46,
      text: 't',
      alternatives: { a: '1', b: '2', c: '3', d: '4', e: '5' },
      year: 2021, test: 'ENEM', area: 'humanas', answer: 'a',
      contextIds: ['enem_2021_humanas_q46_ctx1'],
    }
    const row = parseQuestion(raw, { source: 'enem', source_list: null })
    expect(row.context_key).toBe('enem_2021_humanas_q46_ctx1')
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('warns and keeps first when contextIds has multiple items', () => {
    const raw = {
      number: 47, text: 't',
      alternatives: { a: '1', b: '2', c: '3', d: '4', e: '5' },
      year: 2021, test: 'ENEM', area: 'humanas', answer: 'b',
      contextIds: ['ctx_A', 'ctx_B'],
    }
    const row = parseQuestion(raw, { source: 'enem', source_list: null })
    expect(row.context_key).toBe('ctx_A')
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('multiple contextIds')
    )
  })

  it('normalizes a teacher-list question with source_list', () => {
    const raw = {
      number: 1,
      text: 'Enunciado.',
      alternatives: { a: 'A', b: 'B', c: 'C', d: 'D', e: 'E' },
      images: [],
      tags: ['álgebra'],
      year: 2026,
      test: 'Integrar',
      area: 'math',
      answer: 'a',
      difficulty: 1,
      contextIds: ['enem_2023_math_q150_ctx1'],
      day: 'Matematica e interpretacao - Enem',
      teacher: 'Ricardo',
    }
    const row = parseQuestion(raw, { source: 'teacher_list', source_list: 'ricardo_lista1' })
    expect(row.source).toBe('teacher_list')
    expect(row.source_list).toBe('ricardo_lista1')
    expect(row.test).toBe('Integrar')
    expect(row.context_key).toBe('enem_2023_math_q150_ctx1')
  })

  it('defaults images/tags/disciplinas to empty arrays when missing', () => {
    const raw = {
      number: 1, text: 't',
      alternatives: { a: '1', b: '2', c: '3', d: '4', e: '5' },
      year: 2020, test: 'ENEM', area: 'math', answer: 'a',
    }
    const row = parseQuestion(raw, { source: 'enem', source_list: null })
    expect(row.images).toEqual([])
    expect(row.tags).toEqual([])
    expect(row.disciplinas).toEqual([])
  })

  it('preserves review=true when present', () => {
    const raw = {
      number: 1, text: 't',
      alternatives: { a: '1', b: '2', c: '3', d: '4', e: '5' },
      year: 2020, test: 'ENEM', area: 'math', answer: 'a',
      review: true,
    }
    const row = parseQuestion(raw, { source: 'enem', source_list: null })
    expect(row.review).toBe(true)
  })

  it('keeps difficulty null when missing', () => {
    const raw = {
      number: 1, text: 't',
      alternatives: { a: '1', b: '2', c: '3', d: '4', e: '5' },
      year: 2020, test: 'ENEM', area: 'math', answer: 'a',
    }
    const row = parseQuestion(raw, { source: 'enem', source_list: null })
    expect(row.difficulty).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Rodar: `npx vitest run scripts/lib/parse-question-json.test.js`

Esperado: FAIL — módulo `./parse-question-json.js` não existe.

- [ ] **Step 3: Implementar `parseQuestion` mínimo pra fazer os testes passarem**

Criar `scripts/lib/parse-question-json.js`:

```js
// Normaliza uma questão bruta de JSON (ENEM ou lista de professor) para o shape
// da linha da tabela `multiple_choice_questions`.

export function parseQuestion(raw, sourceMeta) {
  const contextIds = Array.isArray(raw.contextIds) ? raw.contextIds : []
  let context_key = null
  if (contextIds.length === 1) {
    context_key = contextIds[0]
  } else if (contextIds.length > 1) {
    console.warn(
      `[parseQuestion] question year=${raw.year} number=${raw.number} has multiple contextIds; keeping first (${contextIds[0]})`
    )
    context_key = contextIds[0]
  }

  return {
    source: sourceMeta.source,
    source_list: sourceMeta.source_list ?? null,
    area: raw.area ?? null,
    test: raw.test ?? null,
    year: raw.year ?? null,
    number: raw.number,
    text: raw.text,
    alternatives: raw.alternatives,
    answer: raw.answer,
    images: Array.isArray(raw.images) ? raw.images : [],
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    disciplinas: Array.isArray(raw.disciplinas) ? raw.disciplinas : [],
    difficulty: raw.difficulty ?? null,
    context_key,
    review: raw.review === true,
  }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Rodar: `npx vitest run scripts/lib/parse-question-json.test.js`

Esperado: PASS — todos os 7 casos verdes.

- [ ] **Step 5: Pedir OK e commit**

```bash
git add scripts/lib/parse-question-json.js scripts/lib/parse-question-json.test.js
git commit -m "$(cat <<'EOF'
feat(scripts): parser puro de questao JSON para o schema do banco

Task #8 da v3.0.0 — helper testado que normaliza ENEM e listas
de professor no shape de multiple_choice_questions.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Script principal de migração com `--dry-run`

**Files:**
- Create: `scripts/migrate-questions-to-db.js`
- Modify: `package.json` (adicionar npm script)

**Interfaces:**
- Consumes: `parseQuestion` de `scripts/lib/parse-question-json.js`.
- Produces: comando `npm run migrate:questions` (e `npm run migrate:questions -- --dry-run`) que popula `multiple_choice_questions` na Neon com todas as questões dos JSONs em `public/`, de forma idempotente. Sai com código 0 no sucesso, 1 em erro.

- [ ] **Step 1: Escrever o script**

Criar `scripts/migrate-questions-to-db.js`:

```js
// scripts/migrate-questions-to-db.js
//
// Lê todos os JSONs de questões em public/ e faz upsert (INSERT ... ON CONFLICT
// DO NOTHING) em multiple_choice_questions.
//
// Uso:
//   npm run migrate:questions            # roda de verdade
//   npm run migrate:questions -- --dry-run   # só conta e reporta, não escreve

import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'
import { parseQuestion } from './lib/parse-question-json.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public')

const dryRun = process.argv.includes('--dry-run')

const ENEM_AREAS = ['math', 'nature', 'humanas', 'linguagens']
const TEACHER_LISTS = ['ricardo_lista1'] // adicionar aqui novas listas quando surgirem

function loadEnemJsons() {
  const files = readdirSync(PUBLIC_DIR).filter((name) => /_enem_\d{4}\.json$/.test(name))
  return files.map((name) => {
    const filePath = path.join(PUBLIC_DIR, name)
    const raw = JSON.parse(readFileSync(filePath, 'utf8'))
    return { file: name, sourceMeta: { source: 'enem', source_list: null }, questions: raw }
  })
}

function loadTeacherLists() {
  return TEACHER_LISTS.flatMap((slug) => {
    const filePath = path.join(PUBLIC_DIR, `${slug}.json`)
    let raw
    try {
      raw = JSON.parse(readFileSync(filePath, 'utf8'))
    } catch (err) {
      console.warn(`[migrate] skipping ${slug}: ${err.message}`)
      return []
    }
    return [{ file: `${slug}.json`, sourceMeta: { source: 'teacher_list', source_list: slug }, questions: raw }]
  })
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required (use `node --env-file=.env`)')
    process.exit(1)
  }

  const bundles = [...loadEnemJsons(), ...loadTeacherLists()]

  console.log(`[migrate] found ${bundles.length} JSON bundles`)

  const rows = []
  for (const bundle of bundles) {
    for (const raw of bundle.questions) {
      try {
        rows.push(parseQuestion(raw, bundle.sourceMeta))
      } catch (err) {
        console.error(`[migrate] parse error in ${bundle.file} q=${raw.number}:`, err.message)
      }
    }
  }

  console.log(`[migrate] parsed ${rows.length} questions total`)

  if (dryRun) {
    const bySource = rows.reduce((acc, r) => {
      const key = r.source_list ? `${r.source}/${r.source_list}` : r.source
      acc[key] = (acc[key] ?? 0) + 1
      return acc
    }, {})
    console.log('[migrate] DRY RUN — breakdown por origem:')
    for (const [key, count] of Object.entries(bySource)) {
      console.log(`  ${key}: ${count}`)
    }
    console.log('[migrate] no rows inserted. Rerun without --dry-run to persist.')
    return
  }

  const sql = neon(process.env.DATABASE_URL)
  let inserted = 0
  let skipped = 0

  for (const r of rows) {
    const result = await sql`
      INSERT INTO multiple_choice_questions
        (source, source_list, area, test, year, number,
         text, alternatives, answer, images, tags, disciplinas,
         difficulty, context_key, review)
      VALUES
        (${r.source}, ${r.source_list}, ${r.area}, ${r.test}, ${r.year}, ${r.number},
         ${r.text}, ${r.alternatives}, ${r.answer}, ${r.images}, ${r.tags}, ${r.disciplinas},
         ${r.difficulty}, ${r.context_key}, ${r.review})
      ON CONFLICT (source, source_list, area, test, year, number) DO NOTHING
      RETURNING id
    `
    if (result.length === 1) inserted++
    else skipped++
  }

  console.log(`[migrate] inserted=${inserted} skipped(duplicates)=${skipped}`)
}

main().catch((err) => {
  console.error('[migrate] fatal:', err)
  process.exit(1)
})
```

- [ ] **Step 2: Adicionar npm script em `package.json`**

Modificar `package.json`, adicionando dentro de `"scripts"` (mantendo alfabetização/ordem existente similar):

```json
"migrate:questions": "node --env-file=.env scripts/migrate-questions-to-db.js"
```

Se `.env` não existir no repositório do desenvolvedor, ele precisa criar com pelo menos `DATABASE_URL=postgres://...`. Não commitar `.env`.

- [ ] **Step 3: Rodar dry-run e conferir contagens**

Rodar: `npm run migrate:questions -- --dry-run`

Esperado (aproximado — números exatos podem variar):

```
[migrate] found 33 JSON bundles
[migrate] parsed ~1500 questions total
[migrate] DRY RUN — breakdown por origem:
  enem: ~1440
  teacher_list/ricardo_lista1: ~60
[migrate] no rows inserted. Rerun without --dry-run to persist.
```

Se os números destoarem muito do esperado (ex: 0 no ENEM), abrir um dos JSONs e verificar o glob `_enem_YYYY.json`.

- [ ] **Step 4: Rodar de verdade contra a Neon**

Rodar: `npm run migrate:questions`

Esperado:

```
[migrate] found 33 JSON bundles
[migrate] parsed ~1500 questions total
[migrate] inserted=~1500 skipped(duplicates)=0
```

- [ ] **Step 5: Verificar contagens no DB**

No SQL editor da Neon:

```sql
SELECT source, COUNT(*)
FROM multiple_choice_questions
GROUP BY source
ORDER BY source;
```

Confirmar que o total bate com o parsed do step 3.

- [ ] **Step 6: Rodar novamente pra confirmar idempotência**

Rodar de novo: `npm run migrate:questions`

Esperado:

```
[migrate] inserted=0 skipped(duplicates)=~1500
```

Se `inserted` for maior que 0 no segundo run, algum campo do `UNIQUE` está variando entre execuções — investigar antes de prosseguir.

- [ ] **Step 7: Spot-check de 3 questões**

No SQL editor:

```sql
SELECT id, source, area, year, number, difficulty, tags, context_key
FROM multiple_choice_questions
WHERE (source='enem' AND area='math' AND year=2024 AND number=136)
   OR (source='enem' AND area='humanas' AND year=2021 AND number=46)
   OR (source='teacher_list' AND source_list='ricardo_lista1' AND number=1);
```

Comparar cada linha manualmente com o JSON de origem. Cheques mínimos:
- `alternatives` completo (a–e).
- `tags` preservado (inclusive acentuação em `estatística`).
- `context_key` populado no q46/2021 humanas.
- `context_key` NULL no q136/2024 math (sem `contextIds` no JSON).

- [ ] **Step 8: Pedir OK e commit**

```bash
git add scripts/migrate-questions-to-db.js package.json
git commit -m "$(cat <<'EOF'
feat(scripts): script de migracao de questoes para Neon

Task #8 da v3.0.0 — le todos os JSONs em public/ e popula
multiple_choice_questions com upsert idempotente.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Fechar a task e sinalizar próxima

**Files:**
- Modify: `docs/v3.0.0-tasks.md` (marcar #8 como concluída)

**Interfaces:**
- Consumes: nada.
- Produces: doc de tarefas atualizado; task #8 no TaskList marcada como `completed`.

- [ ] **Step 1: Marcar #8 como concluída no doc**

Editar `docs/v3.0.0-tasks.md`, mudar a linha da task 8 na tabela para status `concluída` (ex.: `| 8 | Migrar questões dos JSONs para Postgres na Neon | concluída |`).

- [ ] **Step 2: Marcar task #8 no TaskList do harness**

Usar `TaskUpdate` com `taskId: 8`, `status: completed`.

- [ ] **Step 3: Pedir OK e commit da doc**

```bash
git add docs/v3.0.0-tasks.md
git commit -m "$(cat <<'EOF'
docs: task #8 (migracao de questoes) concluida

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Reportar ao usuário**

Reportar quantas linhas foram inseridas por `source`, os 3 spot-checks visuais, e propor abrir o plano da próxima task na ordem (#10 — formalizar role de professor).

---

## Non-goals desta task

Coisas que **não** entram no escopo da task #8, mesmo tentadoras:

- **Migrar `contexts.json`** — é a task #9, faz depois.
- **Ler/consumir o DB no front-end** — é a task #3, virá depois.
- **Remover ou renomear os JSONs em `public/`** — decisão do usuário: JSONs ficam para auditoria.
- **Adicionar coluna `role` em `users`** — é a task #10.
- **Criar API de leitura** — é a task #3.
- **Refactor visual no App.jsx** — é a task #1/#2/#4.
- **Bump de `APP_VERSION` ou entrada no CHANGELOG** — a task é só backend/dados, App.jsx não muda. O bump acontece quando a UI da v3.0.0 começar a mudar (task #2 em diante).
