# Correção das Divergências de Gabarito Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zerar as 21 divergências `ANSWER_MISMATCH_VS_OFFICIAL` entre `public/*_enem_*.json` e o gabarito oficial do INEP, restaurar 3 questões perdidas por duplicação e travar a regressão com um teste automatizado.

**Architecture:** O repositório já tem a ferramenta de detecção (`scripts/extract-gabarito.js` → `public/gabarito-oficial.json`, consumida por `scripts/audit-questions.js`). Nada de tooling novo: o plano corrige os dados e amarra o audit existente a um teste `vitest`, para que o erro não volte. As correções vão em lotes por natureza do problema, porque três delas exigem restaurar conteúdo, não só trocar uma letra.

**Tech Stack:** Node ESM, vitest, `npm run audit`, pdftotext (já usado pelo `extract-gabarito.js`).

**Spec:** Este documento. As evidências vêm da auditoria cruzada entre prova local, transcrições de duas fontes externas (`data/transcricoes/`) e os PDFs oficiais em `ENEMs/`, registrada na sessão de 2026-09-20/21 e na tabela `data/transcricoes/combinado/tabela_numeracao.csv`.

## Global Constraints

- **Fonte da verdade do gabarito é o INEP**, via `public/gabarito-oficial.json`. As duas fontes externas são confirmação, nunca autoridade.
- **Nunca alterar `number`** de uma questão existente para "consertar" uma duplicata. Corrigir substituindo o conteúdo do slot errado.
- `answer` usa letras minúsculas `a`–`e`, ou `annulled`. Nada mais.
- Questões 1–5 de `linguagens_*` têm **duas entradas por número** (inglês e espanhol). Toda edição nesse bloco precisa selecionar a entrada pela chave `disciplinas`, nunca só por `number`.
- Não alterar `APP_VERSION` nem `CHANGELOG` em `src/App.jsx` nestas tasks: não há mudança de comportamento de UI. (Se o time preferir registrar, fazer num commit separado ao final, como patch.)
- Rodar `npm run audit` ao final de cada task e conferir que o número de `ANSWER_MISMATCH_VS_OFFICIAL` caiu para o valor esperado na task.

---

### Task 1: Travar a regressão com um teste

Hoje o audit existe mas nada o executa: `npm test` roda só `vitest`, e o audit é um comando manual. O teste entra **primeiro** e começa vermelho — ele é o critério de aceitação de todas as tasks seguintes.

**Files:**
- Create: `src/data/gabaritoOficial.test.js`
- Reads: `public/gabarito-oficial.json`, `public/*_enem_*.json`

**Interfaces:**
- Consumes: `public/gabarito-oficial.json` no formato já produzido por `scripts/extract-gabarito.js` — chaves `"<ano>:<numero>"` e, para o bloco de língua, `"<ano>:<numero>:en"` / `"<ano>:<numero>:es"`; valores `"a"`–`"e"` ou `"annulled"`.
- Produces: nada para outras tasks. É o portão.

- [ ] **Step 1: Escrever o teste que falha**

O pacote é ESM (`"type": "module"` no `package.json`), então **`__dirname` não existe** — resolver o caminho por `import.meta.url`. O estilo do repositório é sem ponto e vírgula; seguir isso.

```javascript
// src/data/gabaritoOficial.test.js
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PUBLIC_DIR = fileURLToPath(new URL('../../public', import.meta.url))
const oficial = JSON.parse(
  fs.readFileSync(path.join(PUBLIC_DIR, 'gabarito-oficial.json'), 'utf8'),
)

// Mesma regra do audit: no bloco 1-5 de linguagens a chave carrega o idioma.
function chaveOficial(ano, numero, disciplinas) {
  const ds = disciplinas || []
  if (numero <= 5) {
    if (ds.includes('ingles')) return `${ano}:${numero}:en`
    if (ds.includes('espanhol')) return `${ano}:${numero}:es`
  }
  return `${ano}:${numero}`
}

const arquivos = fs
  .readdirSync(PUBLIC_DIR)
  .filter(f => /_enem_\d{4}\.json$/.test(f))
  .sort()

describe('answer bate com o gabarito oficial do INEP', () => {
  for (const arquivo of arquivos) {
    it(arquivo, () => {
      const questoes = JSON.parse(
        fs.readFileSync(path.join(PUBLIC_DIR, arquivo), 'utf8'),
      )
      const divergencias = []
      for (const q of questoes) {
        const chave = chaveOficial(q.year, q.number, q.disciplinas)
        const esperado = oficial[chave]
        if (!esperado) continue // sem gabarito oficial para essa chave
        if (q.answer !== esperado) {
          divergencias.push(`Q${q.number} (${chave}): json=${q.answer} inep=${esperado}`)
        }
      }
      expect(divergencias).toEqual([])
    })
  }
})
```

- [ ] **Step 2: Garantir que o gabarito oficial está gerado**

Run: `npm run audit:gabarito`
Expected: escreve `public/gabarito-oficial.json`. Se `pdftotext` não existir, instalar com `brew install poppler`.

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/data/gabaritoOficial.test.js`
Expected: FAIL. Os arquivos com divergência devem ser exatamente estes 11: `humanas_enem_2021`, `humanas_enem_2025`, `linguagens_enem_2018`, `linguagens_enem_2019`, `linguagens_enem_2020`, `math_enem_2020`, `math_enem_2021`, `math_enem_2024`, `nature_enem_2020`, `nature_enem_2024`, `nature_enem_2025`. Somadas, 21 divergências — o mesmo número que `npm run audit` reporta como `ANSWER_MISMATCH_VS_OFFICIAL`.

- [ ] **Step 4: Commit**

```bash
git add src/data/gabaritoOficial.test.js
git commit -m "test: falha quando answer diverge do gabarito oficial do INEP"
```

---

### Task 2: Corrigir o bloco de espanhol de 2018–2020

São 11 questões em que a entrada de espanhol recebeu o gabarito da entrada de inglês. Em 2019 há um agravante: as duas entradas da questão 5 estão marcadas `disciplinas: ["espanhol"]`, sendo que a primeira (texto em inglês, *"turn this thing on"*) é a de inglês.

**Files:**
- Modify: `public/linguagens_enem_2018.json` (Q3, Q4, Q5 — entrada espanhol)
- Modify: `public/linguagens_enem_2019.json` (Q1–Q5 — entrada espanhol; + tag da Q5)
- Modify: `public/linguagens_enem_2020.json` (Q2, Q4, Q5 — entrada espanhol)
- Create: `scripts/fix-gabarito-espanhol.js`

**Interfaces:**
- Consumes: nada das tasks anteriores.
- Produces: nada. Task independente.

- [ ] **Step 1: Escrever o script de correção**

```javascript
// scripts/fix-gabarito-espanhol.js
//
// Em 2018-2020 as questões de espanhol (1-5) receberam o gabarito da versão
// de inglês. Corrige pela chave oficial "<ano>:<n>:es", nunca por posição.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const oficial = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'public', 'gabarito-oficial.json'), 'utf8'),
);

// 2019 Q5: as duas entradas vieram marcadas como espanhol. A de inglês é a que
// tem o enunciado em inglês; identificamos pelo trecho, não pela ordem.
const RETAG_2019_Q5 = 'turn this thing on';

for (const ano of [2018, 2019, 2020]) {
  const arquivo = path.join(ROOT, 'public', `linguagens_enem_${ano}.json`);
  const questoes = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  let mudancas = 0;

  if (ano === 2019) {
    const q5s = questoes.filter((q) => q.number === 5);
    const ingles = q5s.find((q) => (q.text || '').includes(RETAG_2019_Q5));
    if (ingles && !ingles.disciplinas.includes('ingles')) {
      ingles.disciplinas = ingles.disciplinas.map((d) =>
        d === 'espanhol' ? 'ingles' : d,
      );
      mudancas++;
      console.log(`  ${ano} Q5: entrada em inglês reetiquetada`);
    }
  }

  for (const q of questoes) {
    if (q.number > 5) continue;
    if (!(q.disciplinas || []).includes('espanhol')) continue;
    const esperado = oficial[`${ano}:${q.number}:es`];
    if (!esperado || q.answer === esperado) continue;
    console.log(`  ${ano} Q${q.number} espanhol: ${q.answer} -> ${esperado}`);
    q.answer = esperado;
    mudancas++;
  }

  fs.writeFileSync(arquivo, `${JSON.stringify(questoes, null, 2)}\n`);
  console.log(`${path.basename(arquivo)}: ${mudancas} mudança(s)`);
}
```

- [ ] **Step 2: Rodar e conferir a saída**

Run: `node scripts/fix-gabarito-espanhol.js`
Expected, exatamente estas linhas de mudança:
```
  2018 Q3 espanhol: d -> c
  2018 Q4 espanhol: e -> d
  2018 Q5 espanhol: c -> b
  2019 Q5: entrada em inglês reetiquetada
  2019 Q1 espanhol: b -> a
  2019 Q2 espanhol: d -> b
  2019 Q3 espanhol: a -> c
  2019 Q4 espanhol: b -> a
  2019 Q5 espanhol: e -> d
  2020 Q2 espanhol: a -> c
  2020 Q4 espanhol: d -> e
  2020 Q5 espanhol: c -> e
```

- [ ] **Step 3: Rodar o teste — os três arquivos de linguagens devem passar**

Run: `npx vitest run src/data/gabaritoOficial.test.js`
Expected: `linguagens_enem_2018`, `linguagens_enem_2019` e `linguagens_enem_2020` PASSAM. Os demais continuam falhando (restam 9 divergências).

- [ ] **Step 4: Conferir que o diff só mexeu em `answer` e numa tag**

Run: `git diff --stat public/` e `git diff public/linguagens_enem_2019.json | head -40`
Expected: só linhas `"answer"` e uma linha `"disciplinas"`. Nenhum texto de enunciado ou alternativa alterado.

- [ ] **Step 5: Commit**

```bash
git add scripts/fix-gabarito-espanhol.js public/linguagens_enem_2018.json public/linguagens_enem_2019.json public/linguagens_enem_2020.json
git commit -m "fix(gabarito): espanhol de 2018-2020 usava a chave do inglês"
```

---

### Task 3: Corrigir os 6 gabaritos avulsos

Quatro são resposta simplesmente errada; duas estão marcadas `annulled` sem que o INEP tenha anulado. Nenhuma delas é ambígua: em todas, as duas fontes externas também apontam o gabarito oficial.

| Arquivo | Q | Atual | Oficial |
|---|---|---|---|
| `humanas_enem_2021.json` | 56 | `c` | `d` |
| `humanas_enem_2021.json` | 85 | `c` | `a` |
| `math_enem_2021.json` | 179 | `b` | `a` |
| `math_enem_2024.json` | 166 | `c` | `e` |
| `math_enem_2020.json` | 157 | `annulled` | `a` |
| `nature_enem_2020.json` | 135 | `annulled` | `a` |

**Files:**
- Modify: `public/humanas_enem_2021.json`, `public/math_enem_2021.json`, `public/math_enem_2024.json`, `public/math_enem_2020.json`, `public/nature_enem_2020.json`

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: Confirmar as duas `annulled` antes de mexer**

As outras quatro já foram confirmadas contra as duas fontes externas. As duas `annulled` **não** — pode ser que o app as tenha anulado deliberadamente por um motivo editorial.

Run:
```bash
python3 -c "
import json
for y,n in [(2020,157),(2020,135)]:
    p=json.load(open(f'fonte_b/{y}/Azul/{n}.json',encoding='utf-8'))
    print(y,n,'fonte B gab=',p.get('gabarito'),'anulada=',p.get('anulada'),'orig=',p.get('gabarito_original'))
"
```
Expected: se a fonte B também marcar `anulada`, **parar e perguntar** — nesse caso o INEP e o cursinho discordam e a decisão é editorial. Se a fonte B der `a`, seguir.

- [ ] **Step 2: Aplicar as correções**

```bash
python3 - <<'EOF'
import json
ALVOS = [
    ('public/humanas_enem_2021.json', 56, 'c', 'd'),
    ('public/humanas_enem_2021.json', 85, 'c', 'a'),
    ('public/math_enem_2021.json',   179, 'b', 'a'),
    ('public/math_enem_2024.json',   166, 'c', 'e'),
    ('public/math_enem_2020.json',   157, 'annulled', 'a'),
    ('public/nature_enem_2020.json', 135, 'annulled', 'a'),
]
for arquivo, numero, de, para in ALVOS:
    qs = json.load(open(arquivo, encoding='utf-8'))
    alvo = [q for q in qs if q['number'] == numero]
    assert len(alvo) == 1, f'{arquivo} Q{numero}: esperava 1 entrada, achei {len(alvo)}'
    assert alvo[0]['answer'] == de, f'{arquivo} Q{numero}: answer era {alvo[0]["answer"]}, esperava {de}'
    alvo[0]['answer'] = para
    with open(arquivo, 'w', encoding='utf-8') as f:
        json.dump(qs, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'{arquivo} Q{numero}: {de} -> {para}')
EOF
```
Expected: 6 linhas de confirmação, nenhum `AssertionError`.

- [ ] **Step 3: Rodar o teste**

Run: `npx vitest run src/data/gabaritoOficial.test.js`
Expected: passam também `humanas_enem_2021`, `math_enem_2020`, `math_enem_2021`, `math_enem_2024`, `nature_enem_2020`. Restam falhando só os 3 da Task 4: `nature_enem_2024`, `nature_enem_2025`, `humanas_enem_2025`.

- [ ] **Step 4: Commit**

```bash
git add public/humanas_enem_2021.json public/math_enem_2021.json public/math_enem_2024.json public/math_enem_2020.json public/nature_enem_2020.json
git commit -m "fix(gabarito): 6 respostas divergentes do oficial do INEP"
```

---

### Task 4: Restaurar as 3 questões perdidas por duplicação

Estas **não são** gabarito errado. Em cada caso, a questão de número menor é uma cópia literal da seguinte (mesmas alternativas, mesma resposta), e a questão real daquele número desapareceu da base. Trocar a letra aqui seria esconder o problema.

| Arquivo | Slot ocupado por cópia | Questão real que sumiu | Gabarito |
|---|---|---|---|
| `nature_enem_2024.json` | Q125 (= cópia da Q126) | Placas de saída de emergência, ZnS dopado | `c` |
| `humanas_enem_2025.json` | Q56 (= cópia da Q57) | Rio Reno, queda do nível da água | `c` |
| `nature_enem_2025.json` | Q95 (= cópia da Q96) | Mariposas e transferência de calor | `c` |

O conteúdo das três está em `fonte_b/{ano}/Azul/{n}.json` e foi conferido contra fontes públicas independentes.

**Files:**
- Modify: `public/nature_enem_2024.json`, `public/humanas_enem_2025.json`, `public/nature_enem_2025.json`
- Read: `fonte_b/2024/Azul/125.json`, `fonte_b/2025/Azul/56.json`, `fonte_b/2025/Azul/95.json`

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: Escrever o teste que prova a duplicação**

```javascript
// acrescentar em src/data/gabaritoOficial.test.js
describe('nenhuma questão é cópia de outra', () => {
  for (const arquivo of arquivos) {
    it(arquivo, () => {
      const questoes = JSON.parse(
        fs.readFileSync(path.join(PUBLIC_DIR, arquivo), 'utf8'),
      )
      const vistas = new Map()
      const duplicadas = []
      for (const q of questoes) {
        // O bloco 1-5 de linguagens tem dois idiomas por número: alternativas
        // diferentes, então uma colisão ali também é bug de verdade.
        const assinatura = ['a', 'b', 'c', 'd', 'e']
          .map(k => (q.alternatives?.[k] || '').trim())
          .join('|')
        if (assinatura.length < 40) continue // alternativas curtas colidem à toa
        if (vistas.has(assinatura)) {
          duplicadas.push(`Q${vistas.get(assinatura)} e Q${q.number} têm as mesmas alternativas`)
        } else {
          vistas.set(assinatura, q.number)
        }
      }
      expect(duplicadas).toEqual([])
    })
  }
})
```

- [ ] **Step 2: Rodar e confirmar que falha nos três esperados**

Run: `npx vitest run src/data/gabaritoOficial.test.js -t "nenhuma questão é cópia"`
Expected: FAIL em `nature_enem_2024` (Q125 e Q126), `humanas_enem_2025` (Q56 e Q57), `nature_enem_2025` (Q95 e Q96). Todos os outros arquivos passam.

- [ ] **Step 3: Substituir cada slot duplicado pela questão real**

Este passo é manual e questão a questão — o conteúdo vem da transcrição da fonte B, que traz `textos`, `comando` e `alternativas`, mas num formato diferente do da base local (`text`, `alternatives` com chaves minúsculas, `images`).

A entrada da base local tem esta forma — os campos que a transcrição **não** fornece (`tags`, `difficulty`, `disciplinas`, `area`, `test`, `year`, `explanation`) saem da questão vizinha de mesma área, ajustados ao conteúdo novo:

```json
{
  "number": 125,
  "text": "As placas que indicam saída de emergência brilham no escuro, pois apresentam substâncias que fosforecem na cor amarelo-esverdeada após exposição à luz ambiente, conforme a figura.\n\n[Imagem: placa de saída de emergência brilhando no escuro]\n\nEsse fenômeno ocorre pela presença do sulfeto de zinco (ZnS), dopado com prata ou cobre, na superfície da placa.\n\nO aparecimento do brilho nessas condições ocorre como consequência de",
  "alternatives": {
    "a": "colisões interatômicas.",
    "b": "coloração dos átomos.",
    "c": "transições eletrônicas.",
    "d": "reações nucleares.",
    "e": "reflexão da luz."
  },
  "images": [],
  "tags": ["estrutura atômica"],
  "year": 2024,
  "test": "ENEM",
  "area": "nature",
  "answer": "c",
  "difficulty": 5,
  "disciplinas": ["quimica"],
  "explanation": "Sem explicação ainda."
}
```

Notar que a questão substituída (a cópia da 126) tinha `contextIds`; a nova **não** deve herdá-lo — aquele contexto pertence à 126. Omitir o campo.

Repetir o mesmo procedimento para `humanas_enem_2025` Q56 (Rio Reno, `answer: "c"`, área `humanas`) e `nature_enem_2025` Q95 (mariposas, `answer: "c"`, área `nature`, disciplina `fisica`). Conferir o texto contra a transcrição antes de gravar:

```bash
python3 -c "
import json
for y,n in [(2024,125),(2025,56),(2025,95)]:
    p=json.load(open(f'fonte_b/{y}/Azul/{n}.json',encoding='utf-8'))
    print('='*20,y,n,'gab=',p.get('gabarito'))
    for t in (p.get('textos') or []): print('TEXTO:',t.get('conteudo'))
    print('COMANDO:',p.get('comando'))
    print('ALTS:',json.dumps(p.get('alternativas'),ensure_ascii=False,indent=1))
"
```

As imagens referenciadas nas transcrições são URLs do blob da fonte B e **não** devem ir para a base. Registrar o marcador de imagem no texto e deixar `images: []`, que o audit vai sinalizar como `MARKER_WITHOUT_IMAGE` — é o comportamento correto para imagem ainda não extraída, e já existem 6 casos assim na base.

- [ ] **Step 4: Rodar os dois testes**

Run: `npx vitest run src/data/gabaritoOficial.test.js`
Expected: PASS em tudo. Zero divergências de gabarito, zero duplicatas.

- [ ] **Step 5: Rodar o audit completo e comparar com a linha de base**

Run: `npm run audit`
Expected: `ANSWER_MISMATCH_VS_OFFICIAL: 0` (era 21). `DUPLICATE_ALTERNATIVES` continua em 5 — são alternativas repetidas *dentro* da mesma questão (`nature_enem_2019` Q113 e outras), problema diferente e fora do escopo deste plano.

- [ ] **Step 6: Commit**

```bash
git add public/nature_enem_2024.json public/humanas_enem_2025.json public/nature_enem_2025.json src/data/gabaritoOficial.test.js
git commit -m "fix(questoes): restaura 3 questoes perdidas por duplicacao de slot"
```

---

### Task 5: Corrigir o texto corrompido das alternativas do gabarito

O audit **não** pega isto, e é o achado mais sutil: em algumas questões uma palavra da alternativa está trocada na base local, e quando a palavra trocada cai justamente na alternativa correta, a questão passa a ter duas respostas defensáveis.

O caso confirmado contra fonte pública é `humanas_enem_2021` Q56:

| Alt | Base local | Oficial |
|---|---|---|
| C | *adequação* do pensamento patriarcal | *superação* do pensamento patriarcal |
| D | incorporação das *estruturas* sociais | incorporação das *estratificações* sociais |

Com "adequação", a alternativa C fica defensável e o gabarito `c` da base passa a fazer sentido — o erro de resposta da Task 3 é *consequência* deste. Há outras duas candidatas na mesma situação (palavra divergente caindo na alternativa do gabarito, com os gabaritos discordando): `humanas_enem_2021` Q85 e `linguagens_enem_2020` Q38.

**Files:**
- Modify: `public/humanas_enem_2021.json` (Q56 alt C e D; Q85 alt A e C)
- Modify: `public/linguagens_enem_2020.json` (Q38 alt A)

**Interfaces:**
- Consumes: as correções de `answer` da Task 3 (Q56 e Q85 já devem estar em `d` e `a`).
- Produces: nada.

- [ ] **Step 1: Levantar a redação oficial de cada uma**

Os PDFs `ENEMs/*_PV_impresso_*.pdf` são digitalizados e **não têm camada de texto** — `pdftotext` retorna vazio. Então a redação oficial precisa vir de outra fonte. Duas opções, nesta ordem:

1. A transcrição da fonte B (`fonte_b/{ano}/Azul/{n}.json`), que nestes três casos é a que diverge da base local.
2. Confirmação numa fonte pública, como já foi feito para a Q56 de 2021.

Atenção: a divergência **não é sempre culpa da base local**. Numa varredura das 85 alternativas com exatamente uma palavra divergente, a maioria é erro de OCR da fonte B (`vebais`, `pioereiras`, `sircreticos`, `immersa`, `colibir`). Só vale corrigir a base local quando uma fonte independente confirmar.

- [ ] **Step 2: Aplicar só o que foi confirmado**

Para a Q56 de 2021 a redação oficial já está confirmada contra fonte pública — aplicar estas duas:

```bash
python3 - <<'EOF'
import json
arquivo = 'public/humanas_enem_2021.json'
qs = json.load(open(arquivo, encoding='utf-8'))
q = next(x for x in qs if x['number'] == 56)
assert q['alternatives']['c'] == 'adequação do pensamento patriarcal.', q['alternatives']['c']
assert q['alternatives']['d'] == 'incorporação das estruturas sociais.', q['alternatives']['d']
q['alternatives']['c'] = 'superação do pensamento patriarcal.'
q['alternatives']['d'] = 'incorporação das estratificações sociais.'
with open(arquivo, 'w', encoding='utf-8') as f:
    json.dump(qs, f, ensure_ascii=False, indent=2)
    f.write('\n')
print('2021 humanas Q56: alternativas C e D corrigidas')
EOF
```

Se um dos `assert` falhar, **parar**: significa que o texto na base não é o que este plano registrou, e a correção precisa ser reconferida.

Para Q85 de 2021 e Q38 de 2020, confirmar a redação numa fonte pública antes de editar, do mesmo jeito. Não usar script em lote: são poucas e cada uma precisa de confirmação própria.

- [ ] **Step 3: Rodar os testes e o audit**

Run: `npm test && npm run audit`
Expected: continua tudo passando; `ANSWER_MISMATCH_VS_OFFICIAL: 0`.

- [ ] **Step 4: Commit**

```bash
git add public/humanas_enem_2021.json public/linguagens_enem_2020.json
git commit -m "fix(alternativas): corrige palavra trocada nas alternativas do gabarito"
```

---

### Task 6: Amarrar o audit ao `npm test`

Sem isto, a Task 1 protege só o gabarito e o resto do audit continua sendo um comando que ninguém roda.

**Files:**
- Modify: `package.json` (campo `scripts`)

**Interfaces:**
- Consumes: o teste da Task 1, já verde.
- Produces: nada.

- [ ] **Step 1: Adicionar o audit como verificação**

```json
"test": "vitest run",
"test:all": "vitest run && npm run audit"
```

Não colocar o audit dentro de `test` direto: ele depende de `pdftotext` instalado, e quebrar o `npm test` de quem não tem poppler é pior do que o problema que resolve. O teste da Task 1 já cobre o gabarito sem depender do binário, porque lê o `gabarito-oficial.json` já commitado.

- [ ] **Step 2: Rodar**

Run: `npm run test:all`
Expected: vitest verde e o audit reportando `ANSWER_MISMATCH_VS_OFFICIAL: 0`.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: script test:all roda vitest mais o audit de questoes"
```

---

## Fora de escopo (registrado para depois)

Estes vieram da mesma investigação mas não afetam o que o app entrega ao usuário. Não entram neste plano.

- **2 campos `gabarito` errados nas transcrições dos cursinhos**, onde a própria resolução escrita traz a letra certa: `fonte A/2020/Azul/105.json` (campo `a`, resolução diz "alternativa D") e `fonte B/2022/Azul/145.json` (campo `d`, resolução diz "o gabarito oficial apresentou a alternativa E"). Corrigíveis com alta confiança.
- **2 discordâncias reais dos cursinhos** com o oficial, onde a resolução confirma o campo: `fonte B/2021/Azul/24.json` (defende E) e `fonte A` de `linguagens 2020 Q34` (defende D). Não são erros — merecem um campo `gabarito_original`, como já se faz nas anuladas.
- **10 divergências inconclusivas** entre cursinho e oficial, em que a resolução não cita letra nenhuma. Exigem leitura manual da JPG.
- **1.257 resoluções fundidas** ainda não escritas em `data/transcricoes/combinado/`.
- **`nature_enem_2019` Q113** com alternativas duplicadas dentro da própria questão (b=d e c=e), detectada pelo audit.
