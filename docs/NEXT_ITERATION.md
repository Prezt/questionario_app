# Próxima iteração — instruções pós Fase A2

Estado no fim desta sessão: v3.1.0 (16/09/2026), branch `feat/v3.0.0`.
Fase A2 (nav por categoria) committada. Build limpo.

## QA visual pendente (não passei no browser)

Um humano precisa passar por cada fluxo abaixo antes de fechar Fase A:

- [ ] Popover accordion no avatar: abre, fecha por click fora / ESC / retoggle no avatar
- [ ] Apenas uma categoria aberta por vez no accordion
- [ ] Click em cada ação do accordion navega e fecha o menu
- [ ] Início: 4 cards Questões/Provas/Listas/Trilhas, click leva pra categoria
- [ ] Category screens: grid de ações, click leva pra ação
- [ ] `provas-iniciar` → seleciona área + ano → Iniciar → entra no quiz
- [ ] `questoes-sorteio` → seleciona quantidade + área → Sortear → entra no quiz
- [ ] `questoes-jogar` → funciona igual antes
- [ ] `questoes-pesquisar` → funciona igual antes
- [ ] `listas-imprimir` → PdfExporter carrega
- [ ] `questoes-criar`, `questoes-resolucao`, `listas-criar` → editores carregam pra prof/admin
- [ ] Placeholders "Em breve" aparecem em: `questoes-aleatoria`, `questoes-imprimir`, `provas-imprimir`, `trilhas-criar`, `trilhas-aprovar`
- [ ] Preferências: todos os toggles gravam em localStorage; Limpar histórico com confirmação
- [ ] Mobile: cards de Início em coluna renderizam com desc empilhada abaixo
- [ ] Dark mode: paleta funciona nos novos elementos (popover, category cards, preferencias)

## Riscos e pontas soltas

- **useEffect legacy em App.jsx (~L1795)** ainda força `phase='home'` pra `/milhao`, `/jogos`, `/jogos/milhao`. Era herança do modo guest (removido em Q30). Provavelmente dead code — auditar e remover se seguro.
- **selectedTest defaulting**: `switchTab` só seta `'ENEM'` pra `provas-iniciar`. Se `startSorteio`/quiz precisar dele em outra ação, filtro pode vir vazio. Testar.
- **LEGACY_TAB_MAP** normaliza tokens antigos do localStorage. Um usuário com `activeTab='responder'` cai em `'inicio'` (não tem responder-sem-modo mais). OK, mas confirmar que ninguém aterrissa em tela vazia.
- **Ícones do Category screen**: cards de ação usam só título + descrição + chevron. Se quiser paridade visual com Início, adicionar ícone por ação (mapear no NAV_CATEGORIES).

## Próximas ondas (Fase B)

Ações stub que precisam de tela real:

- [ ] `questoes-aleatoria` — loop infinito de uma questão por vez, sem timer, para revisão relaxada
- [ ] `questoes-imprimir` — PDF de questões avulsas (talvez fundir com pesquisar + botão "gerar PDF")
- [ ] `provas-imprimir` — PDF da prova completa por ano/área
- [ ] `trilhas-fazer` — motor de trilhas temáticas (hoje é só um placeholder "chegam em breve")
- [ ] `trilhas-criar` — editor de trilha (definir schema)
- [ ] `trilhas-aprovar` — fluxo admin de aprovação inline

## Backlog longo prazo (NOTES.MD)

- [ ] REVISAO ENEM 2019 ciências + matemática
- [ ] Comentário de resolução da questão (v3.1 tem stub `questoes-resolucao` → ExplanationsEditor; pode ser suficiente)
- [ ] Tutorial de uso da plataforma
- [ ] Legal disclaimer
- [ ] Resumo IA das questões erradas
- [ ] Ferramenta para criar questões (v3.1 tem stub `questoes-criar`; conferir escopo)
- [ ] ETAPA 2: UFSC

## Cleanups sugeridos

- Auditar CSS para outras classes órfãs (rodei limpeza de `.home-side-*`, `.home-tabs`, `.home-tab-strip`, `.home-menu-btn`; podem existir mais).
- Considerar remover `ensineTool` state (não é mais lido; setEnsineTool ainda existe em `switchTab`).
- Considerar remover as strings de LEGACY_TAB_MAP depois de N releases (`jogos`, `pesquisar`, `responder`, `imprimir`, `ensine`, `pesquise`, `simule`, `estude`, `listas`).
