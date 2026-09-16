# Trilha Integrar — glossário

Glossário do domínio. Referência pra escrita de código e conversas em PR/design.
Não é spec; é vocabulário. Termos específicos de release ficam no doc do release.

## Navegação (v3.0.0)

### Categoria

Bucket top-level de features no menu. Cada categoria agrupa ações relacionadas
a um mesmo tipo de objeto do domínio.

Categorias v3.0.0 (nessa ordem):
- **Questões** — unidades individuais (respostas rápidas, busca, gestão).
- **Provas** — simulados completos (ENEM inteiro por área + ano).
- **Listas** — coleções curadas por professor (`question_sets`).
- **Trilhas** — coleções temáticas com aprovação inline (fase B).

### Ação

Sub-item de uma categoria. Sempre um verbo. Ex.: Sorteio, Pesquisar, Imprimir,
Criar, Fazer, Aprovar. Cada ação renderiza uma tela específica.

### Início

Landing screen visível ao logar. Mostra 4 cards em coluna (um por Categoria).
Clicar num card leva pra Tela de Categoria (não abre menu).

### Tela de Categoria

Tela dedicada por categoria com grid dos sub-itens (Ações). Substitui o padrão
de "aba com filtros" da v2.

### Menu do avatar

Popover compacto (estilo GitHub) ancorado no botão de avatar do header. Único
ponto de acesso à navegação profunda: accordion por categoria, cada categoria
expande as suas ações. Só uma categoria aberta por vez. Fecha ao selecionar.

### Preferências

Tela separada (fora do menu) pra flags de sessão: embaralhar alternativas,
mostrar resposta, mostrar dificuldade, som, limpar histórico. Acessada por item
próprio no menu do avatar.

## Roles

Enum `user_role` no Postgres: `user` | `prof` | `admin`.

- **user** (aluno) — vê Questões (Aleatória/Sorteio/Pesquisar/Jogar/Imprimir),
  Provas (Iniciar/Imprimir), Listas (Imprimir), Trilhas (Fazer, quando existir).
- **prof** — user + Questões > Criar + Adicionar Resolução, Listas > Criar,
  Trilhas > Criar/Aprovar.
- **admin** — prof + painel Administrar.

Cadastro público cria `user`. Admin promove `user` ↔ `prof`.

## Fluxos de resposta

### Questão Aleatória

Sorteia 1 questão do banco e abre em modo estudo. Atalho pra "quero uma
questão agora".

### Sorteio

Formulário: quantidade (5/10/20) + área (todas ou 1). Sorteia N questões e
inicia sessão. Sem filtros de tag/ano/dificuldade.

### Pesquisar

UI de busca/filtro derivada do QuestionEditor. Aluno filtra por área/tag/ano/
dificuldade e monta a própria sessão a partir do resultado.

### Prova Completa (Provas > Iniciar)

Formulário: área (radio) + ano + língua estrangeira (se Linguagens). Inicia
sessão ENEM cheia dessa área. Substitui o EnemPicker (deprecar em fase A).

### Fazer Trilha

Abre uma trilha aprovada e inicia sessão. Progresso persiste em
`trilha_progress` (fase B).

## Ferramentas de professor

### Criar (Questões / Listas / Trilhas)

Editor de conteúdo. Questões > Criar e Listas > Criar reaproveitam
`QuestionEditor.jsx`. Trilhas > Criar (fase B) tem UI própria.

### Adicionar Resolução

Renomeada de "Explicar Questão" — reaproveita `ExplanationsEditor.jsx`.
Escreve na tabela `explanations` (chave: area, year, test, number).

### Imprimir (Questões / Provas / Listas)

Um único flow (PdfExporter) com 3 pontos de entrada. Cada entrada pré-seleciona
o filtro apropriado (avulsa vs prova vs lista). Não são 3 flows separados.

## Objetos de dados

### question / questão

Unidade mínima. Migrada de JSON pra Postgres em `multiple_choice_questions`.
Campos: area, test, year, number, text, alternatives (JSONB), answer, tags,
disciplinas, difficulty, context_key.

### context / contexto

Texto/imagem compartilhado por múltiplas questões (ex.: um poema base pra 3
perguntas). Migrado de `contexts.json` pra tabela `contexts` (task #9).

### question_set / lista

Coleção manual de questões curada por professor. Persistida em `question_sets`.
Rendered no menu como categoria "Listas".

### trilha

Coleção temática de questões (por tags ou manual) com fluxo de aprovação.
Nasce com `status='pending'` — invisível até aprovada por prof/admin.
Fase B da v3.0.0.

### trilha_progress

Progresso de um aluno numa trilha. Chave `(user_id, trilha_id)`. Guarda
`question_ids_answered` + `last_seen_at`. Fase B.

### test_result

Resultado de uma sessão (não confundir com `test` como sinônimo de "prova").
Chave `(user_id, test, year, day)`. Guarda `score`, `total`, `elapsed`.

## Terminologia a evitar

- **Aba** — v2 usava "aba". Em v3 é "categoria" (top-level) ou "ação" (sub-item).
- **Menu lateral** / **drawer** — v3.0.0 não tem mais drawer lateral. É "menu
  do avatar" (popover compacto).
- **Guest** / **sem login** — v3 não tem uso sem cadastro. Guest cai em login.
- **Simule / Estude / Pesquise** — nomes de v2. Removidos. Se aparecer em
  código, é dead code ou LEGACY_TAB_MAP compat.
- **Explicar** — renomeada pra "Adicionar Resolução" na v3.
- **EnemPicker** — deprecar em fase A (substituído pelo formulário simples
  de Provas > Iniciar).
