# Trilha Integrar

Plataforma de estudos do colégio Integrar — questões do ENEM (2018–2025) das quatro áreas de conhecimento (Matemática, Ciências da Natureza, Linguagens e Ciências Humanas) e listas próprias dos professores, ordenadas pelo **número da questão**, com **barra vertical à esquerda** para saltar entre elas, feedback de acerto/erro, caderno de anotações e alternância de tema claro/escuro. Aplicação em React + Vite.

## Como rodar

1. Instale dependências: `npm install`
2. Desenvolvimento: `npm run dev`
3. Build de produção: `npm run build` (saída em `dist/`)

No componente principal, todos os Hooks do React (incluindo `useMemo` para o enunciado segmentado) ficam **acima** do retorno condicional de “Carregando…”, para respeitar a regra de ordem estável dos Hooks.

## Layout e navegação

- **Esquerda:** lista rolável de botões circulares com o **número oficial** de cada questão (ex.: 136, 137…). O item da questão atual fica destacado em roxo; depois de responder, o contorno fica **verde** se acertou e **vermelho** se errou.
- **Centro:** enunciado, alternativas, tags e botão **Próxima questão** (avança na ordem do JSON e volta ao início depois da última).
- **Topo do centro:** indicador **posição / total** (ex.: `5 / 45`), tipo de prova (`test`, se existir) e ano.

As respostas são guardadas na sessão (`sessionStorage`, chave `trilha-integrar-tentativas`) para manter o estado ao recarregar a página na mesma aba.

## Caderno (bloco de notas)

No canto superior direito há o botão **Caderno**, que desliza um painel pela direita. **Não há bloqueio do restante da página**: dá para continuar a ler a questão, marcar alternativas e usar os botões enquanto o caderno está aberto (só a faixa ocupada pelo painel fica reservada ao caderno).

O conteúdo é um editor **rich text** (HTML) com barra **Negrito**, **Itálico** e **Sublinhado**; a seleção de texto recebe a formatação ao clicar nos botões. Tudo é salvo automaticamente em **`sessionStorage`** (chave `trilha-integrar-caderno`). Texto antigo só em texto puro é convertido na primeira carga. As notas duram enquanto a **aba** estiver aberta; ao **fechar a aba ou o navegador**, são apagadas. **Esc** ou **×** fecham o painel (sem escurecer o fundo).

## Figuras das questões

As imagens ficam na pasta **`figuras/`** na raiz do repositório (onde você adiciona os PNGs).

Para o navegador conseguir abrir `/figuras/nome.png`, o Vite precisa desses arquivos dentro de **`public/`**. Este projeto usa um **link simbólico**:

- `public/figuras` → `../figuras`

Assim, qualquer arquivo novo em `figuras/` passa a ser servido automaticamente em desenvolvimento e entra no build (a pasta `dist/figuras` recebe os mesmos arquivos).

Se o link quebrar em outra máquina, recrie na raiz do projeto:

```bash
ln -sfn ../figuras public/figuras
```

## Tags das questões

Cada questão possui um array `tags` com 2 a 4 temas da **taxonomia unificada** do projeto. Os temas são organizados por área de conhecimento (ex.: `mecânica newtoniana`, `genética e hereditariedade`, `história do brasil república`, `interpretação de texto`).

A lista completa de tags válidas, com exemplos de conteúdos representativos para cada uma, está documentada em [`docs/tags-taxonomy.md`](docs/tags-taxonomy.md).

> Nomes de autores, filósofos ou personagens históricos **não são tags** — usar sempre a categoria temática correspondente.

## Campo `test` (tipo de prova)

Cada questão pode incluir o campo opcional **`test`** (por exemplo `"ENEM"`). Na interface, ele aparece como etiqueta no topo, junto com o progresso e o **ano** (o ano continua com o destaque em roxo).

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
