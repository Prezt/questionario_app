# Imagens na seleção de lista, alternativas-imagem e URL por questão — Design Spec

Data: 28/09/2026 · Branch: `feat/v3.0.0`

## Objetivo

Três entregas que se cruzam no mesmo ponto — saber *qual* questão é aquela, sem abrir o PDF original:

1. **Miniatura e preview na seleção de lista** (`PdfExporter`), para o professor identificar a questão antes de colocá-la na lista.
2. **Alternativa-imagem renderizada corretamente**, no preview e no PDF gerado. Hoje sai errado nos dois.
3. **URL própria por questão** (`/2023/10`), para poder mandar o link de uma questão para alguém.
4. **Tabelas no PDF** — pedido durante a implementação. Eram 83 blocos saindo como linhas de pipe cruas.

O que liga as três é a mesma decisão: **como saber se as imagens de uma questão pertencem ao enunciado ou às alternativas.** Essa regra está errada hoje e é o que esta spec fecha primeiro.

---

## Parte 0 — A regra de detecção (decisão central)

### Como está hoje

`src/App.jsx:3063-3073` (`displayAlts`) decide pela **contagem**:

```js
const hasStemImg   = imgs.length > 0 && imgs.length === origLetters.length + 1
const altImgsOnly  = imgs.length > 0 && imgs.length === origLetters.length
altImg: hasStemImg ? imgs[idx + 1] : altImgsOnly ? imgs[idx] : null
```

Não existe campo no banco dizendo "estas imagens são das alternativas". A posição no array é a única informação.

### O que os dados dizem

Levantamento sobre as 1.491 questões de `multiple_choice_questions` (283 têm `images`):

| Grupo | Questões | Texto das alternativas |
|---|---:|---|
| Batem no padrão posicional (`imgs == alts` ou `alts+1`) | **45** | — |
| ├ alternativas todas vazias | 19 | `["","","","",""]` |
| ├ alternativas só com descritor entre colchetes | 15 | `["[Gráfico - opção A]", …]` |
| ├ alternativas com o texto sendo só a letra | 10 | `["A","B","C","D","E"]` |
| └ alternativas com frase de verdade | **1** | q168/2024 |
| Não batem no padrão — imagem é do enunciado | 238 | — |

Ou seja: **44 das 45 candidatas são realmente alternativa-imagem.** A única exceção é a **q168/2024**, que tem 5 gráficos no enunciado e 5 alternativas que são frases inteiras sobre amplitude de oscilação.

A contagem sozinha erra nessa questão — e erra hoje, em produção: o quiz pendura um gráfico em cada frase.

### Regra nova

`alternativesAreImages(q)` é verdadeiro quando **as duas condições valem**:

1. `imgs.length === alts.length` ou `imgs.length === alts.length + 1`; **e**
2. toda alternativa, depois de remover os blocos `[...]`, é vazia **ou** uma única letra A–E.

Quando verdadeiro:
- `imgs.length === alts.length + 1` → `imgs[0]` é figura do enunciado, `imgs[1..]` são das alternativas, em ordem de letra
- `imgs.length === alts.length` → não há figura de enunciado, `imgs[0..]` são das alternativas

Quando falso: **todas** as imagens são do enunciado e as alternativas são texto.

Isso classifica corretamente as 44 e devolve a q168/2024 para o caminho de texto.

A legenda da alternativa continua vindo de `captionFromBracketText` (`parseQuestionFigures.js:110`), que já extrai o descritor entre colchetes — é o que dá legenda às 15 do grupo do meio.

### Onde a regra mora

Arquivo novo `src/alternativeImages.js`, função pura, exportando `alternativesAreImages(q)` e `splitQuestionImages(q) → { stemImages, altImages }`.

Fica na raiz de `src/` e não em `src/pdf/` porque três consumidores a usam: o `PdfExporter`, o `PrintableList` e a tela de questão única.

**Não vou alterar `displayAlts` no `App.jsx`.** O quiz é código em produção fora do escopo deste pedido, e mudá-lo aqui misturaria uma correção de renderização do quiz com três features novas. Fica registrado como pendência separada (ver "Pendências geradas").

### Ponta solta conhecida

**q127/2024** tem alternativas `["D","A","B","E","C"]` — letras fora de ordem. Pela regra acima ela entra como alternativa-imagem e o mapeamento letra→imagem vira posicional (a→img0, b→img1…), ignorando o que o texto diz. Se o texto for o mapeamento verdadeiro, a questão sai com as figuras trocadas.

É **uma** questão. Não invento a correção: a spec assume o mapeamento posicional e deixa a q127/2024 marcada para conferência manual contra a prova original.

---

## Parte 1 — Miniatura e preview na seleção

### Miniatura

`questionThumb(q, contexts)` em `src/pdf/questionThumb.js`:

1. `splitQuestionImages(q).stemImages[0]`, se houver
2. senão, a primeira imagem dos contextos de `q.context_keys`
3. senão, `null` — não renderiza caixa vazia

O passo 1 usando `stemImages` (e não `images[0]` cru) é o que impede a miniatura de ser a figura da alternativa A. Como 575 questões têm contexto e a figura frequentemente mora lá, o passo 2 é o que dá miniatura à maioria das questões de linguagens.

Caminho da imagem via `publicImageSrc` — helper de 4 linhas já duplicado em `App.jsx:804` e `ExplanationsEditor.jsx:6`. Copio o mesmo (terceira cópia) em vez de extrair para módulo compartilhado: extrair mexeria em dois arquivos fora do escopo.

Aceita `string` e `{ src, caption }`, porque as listas de professor usam objeto.

### Onde aparece

- **Resultados da busca** (`PdfExporter.jsx:~300`) — thumb ~64px à esquerda do `#número · área · ano`. Contextos já disponíveis em `searchContexts`.
- **Cesta da seleção** (`~380`) — thumb ~48px. Contextos já em `contextMap`, alimentado por `addSearchResult`.

### Preview

Botão **"ver questão"** em cada item dos dois lugares, abrindo modal com a questão inteira: contexto (título, subtítulo, texto, imagens, referência), enunciado com as figuras intercaladas via `parseStemSegments`, e as alternativas — imagem quando for o caso, texto quando não for — com o gabarito marcado.

Reaproveita `parseStemSegments` e `richHtml`/`richHtmlBr`, seguindo o desenho do preview de `ExplanationsEditor.jsx:442-530`.

Na implementação o componente ficou em `src/QuestionPreview.jsx` com CSS próprio (`.qprev-*`) em vez de herdar as classes `.explainer-*` do `App.css`: essas carregam premissas de layout do editor de explicações, e reusá-las acoplaria as duas telas. O CSS novo usa as variáveis de tema globais, então acompanha claro/escuro.

---

## Parte 2 — Alternativa-imagem no PDF

### Como está hoje

`PrintableList.jsx:131` despeja **todas** as `q.images` como figura de enunciado:

```jsx
{Array.isArray(q.images) ? q.images.map((src, i) => <Image ... />) : null}
```

e depois imprime as letras com `alts[k]` como texto. Numa questão de alternativa-imagem saem N figuras empilhadas no enunciado e cinco letras vazias (ou com `[Gráfico - opção A]` literal) embaixo. Sem correspondência entre letra e figura. São 44 questões nessa situação.

### Como fica

`QuestionBlock` passa a usar `splitQuestionImages(q)`:

- só `stemImages` vai para o bloco do enunciado
- na linha da alternativa, quando há `altImages[i]`, renderiza `<Image>` ao lado da letra em vez do `<Text>`; a legenda do colchete, se houver, vai abaixo em fonte menor
- sem `altImages`, o comportamento atual de texto é preservado

Imagem de alternativa entra menor que figura de enunciado (`maxWidth` ~150 contra 220), senão cinco figuras não cabem numa página A4.

`maxWidth`/`maxHeight` são suportados pelo `@react-pdf/renderer` v4 — confirmado em `node_modules/@react-pdf/stylesheet`, e o render de teste embutiu as imagens corretamente.

O **gabarito** (`PrintableAnswerKey`) não muda: lista letra por questão, não precisa de figura.

---

## Parte 3 — URL por questão

### O formato

`/{ano}/{numero}` — `/2023/10`.

### A colisão

`(year, number)` é único em **1.451 das 1.491** questões. Há **40 colisões**, todas em linguagens 1–5, inglês contra espanhol, de 2018 a 2025 (5 questões × 8 anos). São as mesmas questões da correção de gabarito da v3.1.2.

Desempate por terceiro segmento: `/2023/1/ingles` e `/2023/1/espanhol`.

`/2023/1` sem idioma abre no idioma que o usuário já usa no app (`foreignLang`, `App.jsx:1531`) e oferece a troca na própria tela — decisão do Ricardo durante a implementação. O desempate explícito (`/2023/1/ingles`) continua valendo como link, e trocar na tela atualiza a URL e a preferência do app.

Atenção ao vocabulário: o app guarda `'en'`/`'es'`, a coluna `language` do banco guarda `'ingles'`/`'espanhol'`. Os dois convivem, então a tradução é explícita em `src/questionPath.js` (`DB_LANG`/`APP_LANG`). Filtrar a API com `'en'` devolve zero linhas.

### Backend

**Nenhuma function nova** — continua em 11/12 na Vercel.

`parseSearchQuery` (`api/questions/_helpers.js:18`) passa a aceitar `number`:

```js
if (query.number) push('number = ?', Number.parseInt(query.number, 10))
```

A tela consome `/api/questions/search?year=2023&number=10`, que já devolve `contexts` junto. `_helpers.test.js` já existe e cobre esse parser.

### Frontend

- `App.jsx:1385+` — o parse de `window.location.pathname` passa a reconhecer `^/(\d{4})/(\d+)(?:/(ingles|espanhol))?$` antes de cair no `LEGACY_TAB_MAP`
- entrada `questao` no `VALID_TABS`
- tela de questão única: mesmo preview da Parte 1, em página inteira, com estado de carregando, "não encontrada" e o seletor de idioma da colisão
- a URL é atualizada com `history.pushState` ao abrir uma questão pelo preview, para o link poder ser copiado da barra de endereço

### Acesso

A rota herda o modelo restritivo da v3.0.0 (decisão registrada em `docs/v3.0.0-tasks.md`): sem sessão, cai no login. O link funciona para quem tem conta; não é uma página pública.

---

## Ordem de implementação

1. **Parte 0** — `src/alternativeImages.js` e seus testes. Trava a regra antes de qualquer consumidor.
2. **Parte 3** — URL por questão. É a mais independente e entrega valor sozinha.
3. **Parte 2** — alternativa-imagem no PDF. Depende da Parte 0.
4. **Parte 1** — miniatura e preview na seleção. Depende de 0 e reaproveita a tela da 3.

---

## Testes

**Automatizado** (`vitest`, que é o que o projeto tem):

- `src/alternativeImages.test.js` — os quatro grupos do levantamento: alternativas vazias, só colchete, só letra, frase real (q168/2024 tem que sair como texto); `imgs == alts` contra `imgs == alts+1`; questão sem imagem; `images` como objeto `{src}`.
- `src/pdf/questionThumb.test.js` — enunciado ganha do contexto; fallback quando não há figura de enunciado; alternativa-imagem **não** vira miniatura; contexto sem imagem; nada → `null`.
- `api/questions/_helpers.test.js` — filtro `number`, sozinho e combinado com `year`; valor não numérico ignorado.

**Não automatizado, e digo isso agora em vez de no fim:** o modal, as miniaturas, a tela de questão única e o layout do PDF não têm como ser testados aqui. O projeto tem só `vitest`, sem jsdom e sem testing-library, e instalar isso seria aumentar escopo por conta própria. A verificação dessas partes é visual, por você.

O que dá para automatizar do PDF é o que já fiz na investigação: renderizar com `renderToBuffer` e contar `/Subtype /Image` no buffer. Isso prova que a imagem entrou no arquivo, não que ela está no lugar certo da página.

---

## Pendências geradas (não entram nesta spec)

- **`displayAlts` no quiz** (`App.jsx:3063`) continua com a regra por contagem e segue renderizando a q168/2024 errado — um gráfico pendurado em cada frase. Correção separada, porque mexe em código de produção fora deste pedido.
- **q127/2024** com alternativas `["D","A","B","E","C"]` precisa de conferência manual contra a prova original.
- **Listas de professor**: `normalizeIntegrarQuestion` (`PdfExporter.jsx:33`) zera `context_keys`, e o stem usa marcador `[Imagem N]`, que o `formatQuestionText` do PDF não reconhece. Hoje é inofensivo — `custom_questions` tem 1 registro, sem imagem. Vira problema quando professores começarem a usar.


---

## Parte 4 — Tabelas no PDF (acrescentada durante a implementação)

### O problema

Tabelas são markdown de pipe dentro do próprio `text`, renderizadas na web por
`parseMarkdownTable` (`src/richHtml.js`). O exportador de PDF não conhecia esse
formato e imprimia as linhas literais: `|Loja | Raio (cm) | Preço|`.

São **83 blocos** — 63 em questões e 20 em contextos. A distribuição de colunas
é 2 a 4 na maioria (65 dos 83), com cauda em 13, 14 e 27 colunas; a de 27 é a
tabela da Cifra de César em `enem_2021_math_q147_ctx1`.

### A solução

- `parseTableGrid` extraído de `parseMarkdownTable` em `src/richHtml.js`: devolve
  `{ header, rows, columnCount }` com `colspan` preservado. Uma fonte de verdade
  para web e PDF; o HTML gerado não mudou (os 14 testes de `richHtml` seguem verdes).
- `src/pdf/PdfTable.jsx` desenha a grade com `View` em `flexDirection: row` e
  `flexGrow` igual ao colspan — o `@react-pdf/renderer` não tem `<table>`.
  A fonte encolhe de 9pt a 5pt conforme a tabela alarga, senão a de 27 colunas
  estoura a largura útil da A4 (~499pt).
- `formatQuestionText` ganhou o bloco `{ type: 'table', grid }`.

### Marcação inline, de quebra

Com a tabela renderizando, o `<i>` dentro da célula apareceria literal. O mesmo
já valia para o enunciado: 72 enunciados, 47 contextos e 24 alternativas usam
`<b>`, `<i>`, `<sub>` ou `<sup>`.

`src/pdf/inlineText.js` converte isso em segmentos que viram `<Text>` aninhado
com a fonte correspondente (`Helvetica-Bold`, `Helvetica-Oblique`, …).

### Marcadores de figura

A investigação com dado real revelou que `[Figura]`, `[Imagem]`, `[Gráfico]` e
`[Esquema]` — **358 ocorrências** — saíam literais no PDF, porque o regex antigo
exigia dois-pontos (`[Figura:`). Pior: a imagem correspondente era empilhada no
fim do enunciado, longe do ponto em que deveria aparecer.

O `PrintableList` passou a usar `parseStemSegments` (`src/parseQuestionFigures.js`),
o mesmo parser do app web, que coloca cada figura no lugar do seu marcador.
Marcador sem imagem correspondente é removido do PDF.

---

## Estado da implementação (28/09/2026)

Tudo desta spec está implementado, com 330 testes passando (eram 273).

| Arquivo | O quê |
|---|---|
| `src/alternativeImages.js` + teste | regra de detecção (Parte 0) |
| `src/questionPath.js` + teste | rota `/ano/número` e tradução de idioma |
| `src/pdf/questionThumb.js` + teste | miniatura com fallback de contexto |
| `src/pdf/inlineText.js` + teste | `<b>`/`<i>`/`<sub>`/`<sup>` no PDF |
| `src/pdf/PdfTable.jsx` | grade de tabela no PDF |
| `src/pdf/PrintableList.jsx` + teste | junta tudo no documento |
| `src/QuestionPreview.jsx` + CSS | questão renderizada por inteiro |
| `src/QuestionRoute.jsx` + CSS | tela da URL própria |
| `src/pdf/PdfExporter.jsx` | miniaturas e modal "ver questão" |
| `src/richHtml.js` | `parseTableGrid` extraído |
| `api/questions/_helpers.js` + teste | filtro `number` |
| `src/App.jsx` | rota, aba `questao`, versão 3.2.0 |

Verificações feitas contra o banco real, não só contra fixture:

- a regra de detecção classifica 44 questões como alternativa-imagem e devolve
  exatamente a q168/2024 ao caminho de texto;
- 2019/139 renderiza 5 figuras, uma por letra, com a legenda do colchete;
- a tabela de 27 colunas do 2021/147 vira grade e cabe na página;
- `/2023/10` devolve 1 questão com o contexto; `/2023/1` devolve 2 e aciona o
  seletor de idioma.

Continua **sem teste automatizado**: o modal, as miniaturas, a tela de questão
avulsa e o layout visual do PDF. O projeto tem só `vitest`, sem jsdom nem
testing-library. Essa parte precisa de conferência no browser.
