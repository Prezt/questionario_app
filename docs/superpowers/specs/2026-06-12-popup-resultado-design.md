# Popup de Resultado + Tela Cheia da Prova + Sair Pausar/Encerrar

## Contexto

Hoje, ao finalizar qualquer sessão de questões que não seja jogo (Streak/Blitz/Milionário), o aluno cai na mesma tela `Resultado` (`summary-screen` em `App.jsx`), que mostra stats + lista de questões + (quando há TRI) banner de notas por área.

Queremos separar o tratamento por tipo de sessão para alinhar o peso visual ao peso real da atividade:

- Modos **leves** (Desafio Diário, Lista, Simulado parcial, modo Área, Integrar) → popup compacto estilo jogos.
- Modo **sério**, a **Prova** completa (ENEM 2 dias, todas as áreas, com TRI) → tela cheia com nota.

Também queremos diferenciar o "Sair" durante a sessão: na Prova, três opções (Continuar / Pausar / Encerrar). Nos outros modos, mantém o descarte simples atual.

## Definições

- **Prova**: simulação ENEM completa — Dia 1 + Dia 2, todas as áreas, sem filtro de área, com cálculo de TRI 100–1000. É a única que ganha tela cheia.
- **Sessões leves**: tudo o mais que não é jogo nem Prova. Inclui Desafio Diário, Lista de Exercícios, Simulado parcial (1 dia, 1 disciplina, customizado), modo Área, Integrar.
- **Jogos**: Streak, Blitz, Milionário — mantêm o popup `.game-over-card` que já existe; fora do escopo deste spec.

## Roteamento de resultado

Detecção de `isProvaCompleta`, ao chegar em `phase === 'summary'`:

```
isProvaCompleta =
     !isDailyChallenge
  && !selectedArea
  && !gameMode
  && selectedTest !== 'Integrar'
  && (selectedDay === 'completo' OU equivalente que indique 2 dias)
```

(A flag exata para "Dia 1 + Dia 2" deve ser confirmada na fase de implementação lendo o seletor de simulado em `App.jsx`. Se o app hoje só permite escolher um dia por vez, "Prova" pode ser definido como "sessão contínua que abrangeu Dia 1 e Dia 2" via flag persistida ao iniciar.)

- Se `isProvaCompleta === true` → renderiza `summary-screen` atual (com pequenos retoques de paleta).
- Senão → renderiza `<ResultModal />` sobre a última questão respondida (ou sobre Home, decidido na implementação — preferir sobre Home pra simplificar estado).

Jogos seguem em `phase === 'game-over'` independente.

## `<ResultModal />` — popup das sessões leves

### Layout

```
┌─────────────────────────┐
│      ✨ Desafio          │
│      Diário             │
│                         │
│  ACERTOS    4 / 5       │
│  TEMPO      2:34        │
│  TAXA       80%         │
│                         │
│  ● ● ● ○ ●               │
│                         │
│  [ Ver gabarito ]        │
│  [ Refazer       ]       │
│  [ Sair          ]       │
└─────────────────────────┘
```

- Modal centralizado, overlay escuro semi-transparente.
- Card herda visualmente do `.game-over-card`; cria modifier `.game-over-card--result` se precisar de tweak.
- Ícone + título variam por tipo:
  - Desafio Diário: ✨ "Desafio Diário"
  - Lista: 📋 "Lista — {nome}"
  - Simulado parcial: 📝 "Simulado — {disciplina/ano}"
  - Modo Área: 🎯 "{Área}"
  - Integrar: 🎯 "Integrar — {nome}"

### Stats

| Linha | Fonte |
|-------|-------|
| ACERTOS `X / Total` | `correctCount` / `sortedQuestions.length` |
| TEMPO `mm:ss` | `totalElapsed` formatado |
| TAXA `XX%` | `Math.round(X/Total*100)` |

### Sneak peek

Tira horizontal de até 10 bolinhas representando as questões na ordem:

- ● `--accent` (verde-menta) → resposta correta
- ○ `--rail-bad` (coral) → resposta errada
- ⚪ `--text-soft` opacity 0.3 → não respondida

Se a sessão tem mais de 10 questões, mostra as 10 primeiras e indica "…" no final.

### Ações

| Botão | Comportamento | Visível quando |
|-------|---------------|----------------|
| Ver gabarito | Fecha modal, abre `summary-screen` atual em modo gabarito | Sempre |
| Refazer | Mesmo conjunto de questões, mesma seleção, do zero | Sempre EXCETO Desafio Diário do dia atual (já feito hoje) |
| Sair | Limpa estado da sessão, volta pra Home | Sempre |

## Tela cheia da Prova

A `summary-screen` atual já contém o que precisamos: stats, banner de TRI por área + geral, lista de questões. Mudanças mínimas:

- Aplicar paleta Mochila ao banner de TRI (lilás brand para destaque "Geral", soft pastels para áreas).
- Tipografia Nunito vem por herança de `body`.
- Título do header: trocar "Resultado" por "Resultado da Prova" quando `isProvaCompleta`.
- Botão "Sair" do header: mantém comportamento atual (a Prova já foi finalizada, então Sair é OK).

## Sair durante a sessão — só Prova

Substitui o dialog atual `Finalizar prova? / Sair da prova?` (~App.jsx:4268) por um modal com 3 opções quando `isProvaCompleta` é a sessão em curso:

```
Sair da prova?

Seu progresso é importante. Como você prefere?

[ Continuar          ]   → fecha modal, segue na prova
[ Pausar e voltar    ]   → salva sessão (mecanismo já existe), vai pra Home
[ Encerrar (perde)   ]   → descarta histórico, vai pra Home sem resultado
```

Implementação:

- "Continuar" → simplesmente fecha o modal.
- "Pausar" → mantém o estado persistido (`saveAttemptsToSession`, `setPaused…`), navega pra Home. Home detecta sessão pausada e oferece "Retomar".
- "Encerrar" → chama `clearPausedSession()`, `setAttempts({})`, `setQuestions([])`, `setQuestion(null)`, `setPhase('home')`. Nenhum resultado é mostrado.

Para os outros modos (Simulado leve, Lista, Desafio): "Sair" segue o caminho atual (descarte simples ou conforme já implementado para esses tipos), sem o dialog de 3 opções.

## Estrutura de arquivos

- `src/components/ResultModal.jsx` (novo) — popup de resultado para sessões leves.
- `src/components/ResultModal.css` (novo) — herda tokens, reusa visual de `.game-over-card`.
- `src/components/ProvaExitDialog.jsx` (novo) — dialog Continuar/Pausar/Encerrar.
- `src/App.jsx` — adicionar detecção `isProvaCompleta`, roteamento, hookar dialog de sair só na Prova.
- `src/App.css` — pequeno ajuste no banner de TRI da `summary-screen` para usar paleta Mochila.

## Fora de escopo

- Mudanças em `triScoring.js`.
- Mudanças no fluxo dos jogos (Streak/Blitz/Milionário).
- Refatoração da `summary-screen` em si (só ajuste de cores).
- Compartilhamento social do resultado.
- Histórico de resultados anteriores no popup.

## Critérios de aceite

1. Finalizar Desafio Diário mostra popup (não tela cheia).
2. Finalizar Lista mostra popup.
3. Finalizar Simulado parcial mostra popup.
4. Finalizar Prova ENEM completa mostra tela cheia com nota TRI.
5. "Ver gabarito" no popup leva ao `summary-screen` atual.
6. "Refazer" no popup reinicia a mesma sessão; oculto no Desafio Diário do dia.
7. Sair durante a Prova abre dialog com Continuar/Pausar/Encerrar.
8. Sair durante outros modos descarta como hoje.
9. Pausar persiste estado e Home oferece retomar.
10. Encerrar descarta tudo sem mostrar resultado.

## Versionamento

Mudança de feature → bump APP_VERSION patch ao implementar (data muda para 2026-06-12; nova entrada 2.0.4). Itens curtos no CHANGELOG seguindo padrão de 5–7 palavras.
