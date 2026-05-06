# TRI Scoring — Design Spec

**Data:** 2026-05-06  
**Status:** Aprovado

---

## Objetivo

Calcular uma nota por área (0–1000) e uma nota geral (média das áreas) com base na Teoria de Resposta ao Item (TRI), modelo logístico de 3 parâmetros (3PL), a partir das respostas do aluno ao finalizar uma sessão de questionário.

---

## Modelo TRI — 3PL

### Curva Característica do Item (ICC)

```
P(θ) = c + (1 - c) / (1 + e^(-a × (θ - b)))
```

### Parâmetros por questão

| Parâmetro | Descrição | Valor |
|---|---|---|
| `a` | Discriminação | `1.7` (fixo — convenção logística INEP) |
| `b` | Dificuldade | `(difficulty - 5.5) / 1.5` → escala ~[-3.0, +3.0] |
| `c` | Acerto por chute | `0.20` (5 alternativas) |

O campo `difficulty` (1–10) já existe em todas as questões nos arquivos JSON.

### Estimação do θ (habilidade latente)

Máxima Verossimilhança (MLE) via busca binária no intervalo [-4, 4]:

```
LL(θ) = Σ [ uᵢ × ln(Pᵢ(θ)) + (1 - uᵢ) × ln(1 - Pᵢ(θ)) ]

onde uᵢ = 1 se acertou, 0 se errou
```

Busca pelo zero da derivada dLL/dθ, usando bisseção com tolerância `1e-6`.

### Conversão θ → nota

```
nota = clamp(500 + 100 × θ, 0, 1000)
```

---

## Fluxo completo

```
respostas do aluno (attempts)
        ↓
agrupar questões por área (math, nature, linguagens, humanas)
        ↓  [para cada área]
questões não respondidas → tratadas como erradas (uᵢ = 0)
        ↓
estimar θ via MLE (bisseção em [-4, 4])
        ↓
nota_area = clamp(500 + 100 × θ, 0, 1000)
        ↓
nota_geral = média das áreas com pelo menos 1 questão
```

---

## Casos extremos

| Situação | Tratamento |
|---|---|
| Todas as questões corretas em uma área | θ limitado a +4 → nota ≈ 900 |
| Todas as questões erradas em uma área | θ limitado a -4 → nota ≈ 100 |
| Área sem nenhuma questão na sessão | `null` — excluída da média geral |

---

## Arquitetura

### Novo arquivo: `src/triScoring.js`

Funções puras, sem dependências externas:

- `icc(a, b, c, theta)` — retorna P(θ) para um item
- `dLogLikelihood(items, theta)` — derivada da log-verossimilhança
- `estimateTheta(items)` — MLE via bisseção, retorna θ ∈ [-4, 4]
- `calcTriScores(questions, attempts)` — entrada principal; retorna `{ math, nature, linguagens, humanas, geral }`

### Modificação: `App.jsx` → `finishQuiz`

- Importar `calcTriScores`
- Chamar após calcular o score simples atual
- Guardar resultado em novo state `triScores`

### Modificação: tela de summary (`phase === 'summary'`)

- Exibir as 4 notas TRI por área
- Exibir a nota geral (média)
- Manter o contador de acertos atual (não substituir, apenas adicionar)

---

## O que não muda

- Estrutura dos arquivos JSON de questões (usa `difficulty` já existente)
- Lógica de `attempts` e `pickAlternative`
- API `/api/results` (continua recebendo o score simples; TRI é client-side)
- Qualquer outra tela ou fluxo do app
