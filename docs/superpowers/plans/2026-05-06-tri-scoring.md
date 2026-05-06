# TRI Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Calcular nota TRI (0–1000) por área e média geral com base nas respostas do aluno, exibindo os resultados na tela de summary.

**Architecture:** Funções puras de TRI em `src/triScoring.js` (sem dependências externas); chamadas em `finishQuiz` no `App.jsx`; resultado exibido na tela de summary existente logo abaixo dos stats atuais.

**Tech Stack:** React 19, Vite 8, Vitest (a adicionar para testes unitários das funções puras)

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/triScoring.js` | Criar | Toda a lógica TRI: ICC, MLE, conversão θ→nota |
| `src/triScoring.test.js` | Criar | Testes unitários das funções puras |
| `src/App.jsx` | Modificar | Chamar `calcTriScores` em `finishQuiz`; exibir na summary |
| `package.json` | Modificar | Adicionar Vitest |
| `vite.config.js` | Modificar | Habilitar ambiente de testes Vitest |

---

## Task 1: Configurar Vitest

**Files:**
- Modify: `package.json`
- Modify: `vite.config.js`

- [ ] **Step 1: Instalar Vitest**

```bash
npm install --save-dev vitest
```

Expected: `vitest` aparece em `devDependencies` no `package.json`.

- [ ] **Step 2: Adicionar script de teste no `package.json`**

No objeto `"scripts"`, adicionar após `"preview"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Configurar Vitest no `vite.config.js`**

Ler o arquivo atual e adicionar o bloco `test`:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
  },
})
```

- [ ] **Step 4: Verificar que o ambiente funciona**

```bash
npm test
```

Expected: `No test files found` ou similar — sem erros de configuração.

- [ ] **Step 5: Commit**

```bash
git add package.json vite.config.js package-lock.json
git commit -m "chore: add vitest for unit tests"
```

---

## Task 2: Funções TRI puras com TDD

**Files:**
- Create: `src/triScoring.test.js`
- Create: `src/triScoring.js`

### Step 1: Escrever os testes antes de implementar

- [ ] **Criar `src/triScoring.test.js`:**

```js
import { describe, it, expect } from 'vitest'
import { icc, estimateTheta, calcTriScores } from './triScoring.js'

describe('icc', () => {
  it('returns c when theta is very low (floor = guessing)', () => {
    const p = icc(1.7, 0, 0.2, -10)
    expect(p).toBeCloseTo(0.2, 2)
  })

  it('returns ~1 when theta is very high', () => {
    const p = icc(1.7, 0, 0.2, 10)
    expect(p).toBeCloseTo(1.0, 2)
  })

  it('returns ~0.6 when theta equals b (inflection point)', () => {
    // At theta = b: P = c + (1-c)/2 = 0.2 + 0.4 = 0.6
    const p = icc(1.7, 1.0, 0.2, 1.0)
    expect(p).toBeCloseTo(0.6, 2)
  })
})

describe('estimateTheta', () => {
  it('returns upper bound when all items correct', () => {
    const items = [
      { a: 1.7, b: -1.0, c: 0.2, correct: true },
      { a: 1.7, b:  0.0, c: 0.2, correct: true },
      { a: 1.7, b:  1.0, c: 0.2, correct: true },
    ]
    expect(estimateTheta(items)).toBe(4)
  })

  it('returns lower bound when all items wrong', () => {
    const items = [
      { a: 1.7, b: -1.0, c: 0.2, correct: false },
      { a: 1.7, b:  0.0, c: 0.2, correct: false },
      { a: 1.7, b:  1.0, c: 0.2, correct: false },
    ]
    expect(estimateTheta(items)).toBe(-4)
  })

  it('estimates near 0 when student got easy right and hard wrong', () => {
    // Easy (b=-1): correct. Hard (b=+1): wrong. Expect theta near 0.
    const items = [
      { a: 1.7, b: -1.0, c: 0.2, correct: true },
      { a: 1.7, b:  1.0, c: 0.2, correct: false },
    ]
    const theta = estimateTheta(items)
    expect(theta).toBeGreaterThan(-0.5)
    expect(theta).toBeLessThan(0.5)
  })

  it('estimates positive theta when student also got hard item right', () => {
    const items = [
      { a: 1.7, b: -1.0, c: 0.2, correct: true },
      { a: 1.7, b:  0.0, c: 0.2, correct: true },
      { a: 1.7, b:  1.0, c: 0.2, correct: true },
      { a: 1.7, b:  2.0, c: 0.2, correct: false },
    ]
    const theta = estimateTheta(items)
    expect(theta).toBeGreaterThan(0.5)
  })
})

describe('calcTriScores', () => {
  const makeQuestion = (number, area, difficulty, answer) => ({
    number, area, difficulty, answer,
    text: '', alternatives: {}, images: [], tags: [], year: 2023, test: 'ENEM',
  })

  it('returns null for areas with no questions', () => {
    const questions = [makeQuestion(1, 'math', 5, 'a')]
    const attempts = { 1: { selected: 'a', correct: true } }
    const scores = calcTriScores(questions, attempts)
    expect(scores.nature).toBeNull()
    expect(scores.linguagens).toBeNull()
    expect(scores.humanas).toBeNull()
  })

  it('excludes annulled questions from TRI', () => {
    const questions = [
      makeQuestion(1, 'math', 5, 'a'),
      makeQuestion(2, 'math', 5, 'annulled'),
    ]
    const attempts = {
      1: { selected: 'a', correct: true },
      2: { selected: 'b', correct: false },
    }
    const scoresWithAnnulled = calcTriScores(questions, attempts)
    const questionsNoAnnulled = [makeQuestion(1, 'math', 5, 'a')]
    const scoresWithout = calcTriScores(questionsNoAnnulled, { 1: { selected: 'a', correct: true } })
    expect(scoresWithAnnulled.math).toBe(scoresWithout.math)
  })

  it('treats unanswered questions as wrong', () => {
    const questions = [
      makeQuestion(1, 'math', 5, 'a'),
      makeQuestion(2, 'math', 5, 'a'),
    ]
    // Q2 unanswered
    const attemptsPartial = { 1: { selected: 'a', correct: true } }
    const attemptsBothWrong = {
      1: { selected: 'a', correct: true },
      2: { selected: 'b', correct: false },
    }
    expect(calcTriScores(questions, attemptsPartial).math)
      .toBe(calcTriScores(questions, attemptsBothWrong).math)
  })

  it('geral is average of non-null area scores', () => {
    const questions = [
      makeQuestion(1, 'math', 5, 'a'),
      makeQuestion(2, 'nature', 5, 'a'),
    ]
    const attempts = {
      1: { selected: 'a', correct: true },
      2: { selected: 'a', correct: true },
    }
    const scores = calcTriScores(questions, attempts)
    expect(scores.geral).toBe(Math.round((scores.math + scores.nature) / 2))
  })

  it('all correct gives 1000', () => {
    const questions = Array.from({ length: 10 }, (_, i) =>
      makeQuestion(i + 1, 'math', i + 1, 'a')
    )
    const attempts = Object.fromEntries(
      questions.map((q) => [q.number, { selected: 'a', correct: true }])
    )
    expect(calcTriScores(questions, attempts).math).toBe(1000)
  })

  it('all wrong gives 100', () => {
    const questions = Array.from({ length: 10 }, (_, i) =>
      makeQuestion(i + 1, 'math', i + 1, 'a')
    )
    const attempts = Object.fromEntries(
      questions.map((q) => [q.number, { selected: 'b', correct: false }])
    )
    expect(calcTriScores(questions, attempts).math).toBe(100)
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

```bash
npm test
```

Expected: Erros de importação — `triScoring.js` não existe ainda.

- [ ] **Step 3: Criar `src/triScoring.js`**

```js
const A = 1.7
const C = 0.20
const THETA_MIN = -4
const THETA_MAX = 4

function difficultyToB(difficulty) {
  return (difficulty - 5.5) / 1.5
}

export function icc(a, b, c, theta) {
  return c + (1 - c) / (1 + Math.exp(-a * (theta - b)))
}

// Derivative of log-likelihood w.r.t. theta (used for MLE bisection)
function dLogLikelihood(items, theta) {
  return items.reduce((sum, { a, b, c, correct }) => {
    const p = icc(a, b, c, theta)
    const u = correct ? 1 : 0
    const dP = a * (p - c) * (1 - p) / (1 - c)
    const pSafe = Math.max(p, 1e-10)
    const qSafe = Math.max(1 - p, 1e-10)
    return sum + dP * (u - p) / (pSafe * qSafe)
  }, 0)
}

export function estimateTheta(items) {
  if (items.every((i) => i.correct)) return THETA_MAX
  if (items.every((i) => !i.correct)) return THETA_MIN

  // Bisection on dLL/dtheta = 0
  let lo = THETA_MIN
  let hi = THETA_MAX
  for (let i = 0; i < 100; i++) {
    if (hi - lo < 1e-6) break
    const mid = (lo + hi) / 2
    if (dLogLikelihood(items, mid) > 0) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

function thetaToScore(theta) {
  // Linear map [-4, +4] → [100, 1000]: slope=112.5, intercept=550
  return Math.round(Math.min(1000, Math.max(0, 550 + 112.5 * theta)))
}

export function calcTriScores(questions, attempts) {
  const areas = ['math', 'nature', 'linguagens', 'humanas']
  const scores = {}

  for (const area of areas) {
    const areaQs = questions.filter(
      (q) => q.area === area && q.answer !== 'annulled'
    )
    if (areaQs.length === 0) {
      scores[area] = null
      continue
    }

    const items = areaQs.map((q) => ({
      a: A,
      b: difficultyToB(q.difficulty ?? 5),
      c: C,
      correct: attempts[q.number]?.correct ?? false,
    }))

    scores[area] = thetaToScore(estimateTheta(items))
  }

  const validScores = Object.values(scores).filter((s) => s !== null)
  scores.geral = validScores.length > 0
    ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
    : null

  return scores
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

```bash
npm test
```

Expected: Todos os testes `✓ passing`.

- [ ] **Step 5: Commit**

```bash
git add src/triScoring.js src/triScoring.test.js
git commit -m "feat: add TRI 3PL scoring engine with MLE theta estimation"
```

---

## Task 3: Integrar TRI no `finishQuiz`

**Files:**
- Modify: `src/App.jsx` (linhas 1–10 para import; linhas 1163–1211 para `finishQuiz`; linha ~347 para novo state)

- [ ] **Step 1: Adicionar import do `calcTriScores` no topo de `App.jsx`**

Após a linha de import de `parseQuestionFigures.js` (linha ~43), adicionar:

```js
import { calcTriScores } from './triScoring.js'
```

- [ ] **Step 2: Adicionar state `triScores` perto dos outros states (linha ~347)**

Localizar a linha:
```js
const [userResults, setUserResults] = useState([]) // [{test,year,day,score,total}]
```

Logo abaixo, adicionar:
```js
const [triScores, setTriScores] = useState(null) // {math,nature,linguagens,humanas,geral}
```

- [ ] **Step 3: Chamar `calcTriScores` dentro de `finishQuiz`**

Localizar o bloco no `finishQuiz` (linha ~1178):
```js
    // Persist result to DB (fire-and-forget — never blocks UI)
    if (token) {
```

Imediatamente antes dessa linha, inserir:
```js
    setTriScores(calcTriScores(questions, attempts))
```

- [ ] **Step 4: Limpar `triScores` ao reiniciar**

No botão "Reiniciar" da summary (linha ~2026), localizar:
```js
                setQuestions([])
                setQuestion(null)
```

Logo após, adicionar:
```js
                setTriScores(null)
```

- [ ] **Step 5: Verificar que o app compila sem erros**

```bash
npm run dev
```

Expected: sem erros no console, app abre normalmente.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat: compute TRI scores on quiz finish"
```

---

## Task 4: Exibir notas TRI na tela de summary

**Files:**
- Modify: `src/App.jsx` (bloco summary, a partir da linha ~2053)

- [ ] **Step 1: Inserir bloco de notas TRI na summary**

Localizar o fechamento do `summary-score-bar-wrap` (linha ~2098):
```jsx
          </div>

          {/* Scrollable body: insight + subjects + question table */}
```

Entre o `</div>` e o comentário, inserir:

```jsx
          {triScores && (
            <div className="summary-tri">
              <h2 className="summary-section-title">Nota TRI por área</h2>
              <div className="summary-tri-grid">
                {[
                  { key: 'linguagens', label: 'Linguagens' },
                  { key: 'humanas',    label: 'Ciências Humanas' },
                  { key: 'nature',     label: 'Ciências da Natureza' },
                  { key: 'math',       label: 'Matemática' },
                ].map(({ key, label }) =>
                  triScores[key] !== null ? (
                    <div key={key} className="summary-tri-card">
                      <span className="summary-tri-score">{triScores[key]}</span>
                      <span className="summary-tri-label">{label}</span>
                    </div>
                  ) : null
                )}
                {triScores.geral !== null && (
                  <div className="summary-tri-card summary-tri-card--geral">
                    <span className="summary-tri-score">{triScores.geral}</span>
                    <span className="summary-tri-label">Média Geral</span>
                  </div>
                )}
              </div>
            </div>
          )}
```

- [ ] **Step 2: Adicionar estilos do bloco TRI no CSS**

Localizar o arquivo de estilos principal (App.css). Adicionar ao final:

```css
/* ── TRI Scores ─────────────────────────────────────────────────────────── */
.summary-tri {
  margin-top: 1.5rem;
}

.summary-tri-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.summary-tri-card {
  flex: 1 1 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.875rem 0.5rem;
  border-radius: 10px;
  background: var(--card-bg, #f3f4f6);
  border: 1px solid var(--border, #e5e7eb);
}

.summary-tri-card--geral {
  border-color: var(--accent, #6366f1);
  background: color-mix(in srgb, var(--accent, #6366f1) 8%, transparent);
}

.summary-tri-score {
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1;
  color: var(--fg, #111827);
}

.summary-tri-card--geral .summary-tri-score {
  color: var(--accent, #6366f1);
}

.summary-tri-label {
  font-size: 0.72rem;
  text-align: center;
  color: var(--fg-muted, #6b7280);
  line-height: 1.2;
}
```

- [ ] **Step 3: Verificar visualmente**

```bash
npm run dev
```

Faça um simulado curto (3–5 questões) e finalize. Confirme que:
- O bloco "Nota TRI por área" aparece abaixo da barra de percentual
- Cada área com questões mostra uma nota entre 0 e 1000
- O card "Média Geral" aparece destacado
- Áreas sem questões na sessão não aparecem

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx src/App.css
git commit -m "feat: display TRI scores per area in summary screen"
```

---

## Verificação Final

- [ ] `npm test` — todos os testes passando
- [ ] `npm run build` — build de produção sem erros
- [ ] Fluxo completo manual: iniciar sessão → responder questões de áreas diferentes → finalizar → notas TRI aparecem corretamente
