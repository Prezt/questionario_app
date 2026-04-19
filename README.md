# Questionário (matemática)

Aplicação em React + Vite que carrega questões de `public/math_enem_2025.json` e exibe uma questão aleatória por vez, com alternativas clicáveis e alternância de tema claro/escuro.

## Como rodar

1. Instale dependências: `npm install`
2. Desenvolvimento: `npm run dev`
3. Build de produção: `npm run build` (saída em `dist/`)

No componente principal, todos os Hooks do React (incluindo `useMemo` para o enunciado segmentado) ficam **acima** do retorno condicional de “Carregando…”, para respeitar a regra de ordem estável dos Hooks.

## Figuras das questões

As imagens ficam na pasta **`figuras/`** na raiz do repositório (onde você adiciona os PNGs).

Para o navegador conseguir abrir `/figuras/nome.png`, o Vite precisa desses arquivos dentro de **`public/`**. Este projeto usa um **link simbólico**:

- `public/figuras` → `../figuras`

Assim, qualquer arquivo novo em `figuras/` passa a ser servido automaticamente em desenvolvimento e entra no build (a pasta `dist/figuras` recebe os mesmos arquivos).

Se o link quebrar em outra máquina, recrie na raiz do projeto:

```bash
ln -sfn ../figuras public/figuras
```

## Campo `images` no JSON

Cada questão pode ter um array `images` com caminhos relativos à raiz pública, por exemplo:

```json
"images": ["figuras/q137_infografico.png"]
```

Os caminhos são normalizados para URLs absolutas (ex.: `figuras/x.png` → `/figuras/x.png`).

### Onde a figura aparece e qual é a legenda

No **texto do enunciado** (`text`), cada figura deve ter um **marcador** entre colchetes, na posição em que a ilustração deve aparecer. O conteúdo interno do marcador vira a **legenda** (`<figcaption>`) abaixo da imagem.

Formatos reconhecidos pelo parser (em `src/parseQuestionFigures.js`):

- `[Infográfico …]`
- `[Figura …]` ou `[Figuras …]`
- `[Gráfico …]` (inclui “Gráfico de pizza”, “Gráfico 1:”, etc.)
- `[Esquema …]`

O texto é cortado nesses marcadores: o trecho **antes** permanece como parágrafo, em seguida vem a **imagem** com legenda, depois o trecho **depois** do marcador. Assim, se o indicador está entre dois parágrafos, a figura fica entre eles.

**Vários marcadores e uma única imagem** (por exemplo, dois `[Gráfico …]` seguidos e um PNG só com os dois gráficos): a interface usa **uma** figura no lugar de **todos** esses marcadores e a legenda reúne as descrições, uma por linha.

**Sem marcador no texto** mas com imagem listada: a imagem é colocada **no final** do enunciado (útil só como último recurso; o ideal é sempre ter o marcador no lugar certo).

Foram adicionados marcadores explícitos no JSON onde antes só havia imagem, por exemplo:

- Questão **143**: `[Figura: rótulos dos produtos…]` antes da lista de produtos.
- Questão **169**: `[Figura: gráficos das alternativas…]` entre o quadro e a pergunta final.

### Questão com figura em cada alternativa

Quando o número de imagens é **exatamente** `1 + número de alternativas`, a **primeira** imagem segue as regras acima no enunciado; as demais aparecem **em cada alternativa**, na ordem **a, b, c, …**. O texto entre colchetes em cada alternativa (ex.: questão 138) vira legenda da respectiva miniatura; se a alternativa for só o marcador, só a letra e a figura são mostradas.

## Estilo das imagens

As figuras usam a variável CSS `--figure-border` (claro e escuro) para uma **borda de 1px** e cantos arredondados. As legendas usam tipo menor e cor `--text-soft` para não competir com o enunciado.
