# ADR 0001 — Navegação por categoria (não por ação)

**Data:** 2026-09-15
**Status:** Aceito
**Escopo:** v3.0.0

## Contexto

O spec original da v3.0.0 (`docs/superpowers/specs/2026-09-03-v3.0.0-banco-de-questoes-design.md`)
definiu 4 abas fixas nomeadas pela ação principal do aluno:

- Jogos
- Pesquisar Questões
- Responder Questões (que agrupa Prova Completa, Sorteio, Trilhas)
- Imprimir Lista

Essa nomenclatura organiza a nav por *o que o usuário faz*.

Durante a implementação da fase A (task #4), ao ver o layout em barra
horizontal renderizado, a decisão foi reestruturar por **categoria de
objeto** em vez de ação.

## Decisão

Nav v3.0.0 organiza por **categoria** (o objeto do domínio) em vez de por
ação (o verbo do aluno). 4 categorias top-level:

1. **Questões** — Aleatória, Sorteio, Pesquisar, Jogar, Imprimir, Criar (prof),
   Adicionar Resolução (prof)
2. **Provas** — Iniciar, Imprimir
3. **Listas** — Imprimir, Criar (prof)
4. **Trilhas** (fase B) — Fazer, Criar (prof), Aprovar (prof)

O menu vive num popover compacto ancorado no avatar (estilo GitHub); as
categorias são accordions colapsados. Início é a landing screen com 4 cards
(um por categoria); clicar num card leva pra Tela de Categoria dedicada
com grid dos sub-itens (Ações).

Guest não acessa a home — cai direto em login/cadastro.

## Consequências

Positivo:
- IA reflete os objetos do domínio (question / prova / lista / trilha),
  facilitando adicionar novas ações a cada categoria sem virar mais uma "aba".
- Categorias novas (ex.: Trilhas em fase B) plugam sem rearrumar top-level.
- Menu não polui a tela — visível só quando o avatar é clicado.
- Alinha com "não há uso sem cadastro" (Q30) — remove home guest banner e
  side effects de anônimo.

Negativo:
- Toda a fase A anterior (Ondas 1-4: barra horizontal + drawer com nav) vira
  scaffolding transitório. Commits `9a8df96`, `7797c89`, `64e22e2` implementaram
  algo que é substancialmente substituído aqui.
- "Imprimir" aparece em 3 categorias (Questões, Provas, Listas) — pode
  confundir. Mitigação: 1 flow único no PdfExporter com preset diferente
  por entrada (Q13 B).
- Sub-items de Questões (7 aluno + 2 prof) pressiona o limite de "compact
  dropdown" (Q3 C). Mitigação: accordion (Q15 A) só expande uma categoria.

Alternativas consideradas:
- **Manter barra horizontal + 4 abas por ação (spec original)** — rejeitado
  porque "menus sempre visíveis e temas parecidos" cansou o usuário (Q4).
- **Drawer lateral com nav (Onda 3+4 recém implementada)** — rejeitado porque
  drawer conflita com estética GitHub-compacta escolhida (Q3 C → Q7 A).
- **Cores por categoria (multi-color)** — rejeitado, briga com paleta sóbria
  unificada da task #1.

## Referências

- Design tree completo — sessão de grilling em 2026-09-15
- Spec anterior — `docs/superpowers/specs/2026-09-03-v3.0.0-banco-de-questoes-design.md`
- Glossário — `CONTEXT.md`
