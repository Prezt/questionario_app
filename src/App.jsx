import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
  lazy,
  Suspense,
} from 'react'
import './App.css'

// Voiceover do Show do Milhão. Arquivos em public/audio/voiceover/.
// Se um arquivo não existir, falha silenciosa (jogo não quebra).
const VOICEOVER_PATHS = {
  inicio:         '/audio/voiceover/mil-inicio.mp3',
  acerto:         '/audio/voiceover/mil-acerto.mp3',
  muitoBoa:       '/audio/voiceover/mil-muito-boa.mp3',
  erro:           '/audio/voiceover/mil-erro.mp3',
  parou:          '/audio/voiceover/mil-parou.mp3',
  cartas:         '/audio/voiceover/mil-cartas.mp3',
  universitarios: '/audio/voiceover/mil-universitarios.mp3',
  plateia:        '/audio/voiceover/mil-plateia.mp3',
  milhao:         '/audio/voiceover/mil-milhao.mp3',
  pulo:           '/audio/voiceover/mil-pulo.mp3',
  proximaPergunta:'/audio/voiceover/mil-proxima-pergunta.mp3',
  jingle:         '/audio/voiceover/mil-jingle.mp3',
  musica:         '/audio/voiceover/mil-musica.mp3',
}
// Toca o anúncio do prêmio da próxima pergunta e, ao terminar, emenda o jingle.
function playPerguntaThenJingle(levelIdx, muted) {
  playVoiceover(perguntaPath(levelIdx), muted, () => {
    playVoiceover('jingle', muted)
  })
}
// Pool aleatório: sorteia uma das alternativas equivalentes do VO.
const VOICEOVER_POOLS = {
  acerto: ['acerto', 'muitoBoa'],
  pulo:   ['pulo', 'proximaPergunta'],
}
function pickVoiceoverKey(poolName) {
  const opts = VOICEOVER_POOLS[poolName]
  if (!opts || opts.length === 0) return poolName
  return opts[Math.floor(Math.random() * opts.length)]
}
// Áudio específico da pergunta do nível N (0-indexed). Mapeia pro prêmio
// correspondente: mil-pergunta-1000.mp3, mil-pergunta-2000.mp3, etc.
function perguntaPath(levelIdx) {
  const prize = MILIONARIO_PRIZES?.[levelIdx]
  if (prize == null) return null
  return `/audio/voiceover/mil-pergunta-${prize}.mp3`
}
let __voCurrentAudio = null
function playVoiceover(keyOrPath, muted = false, onEnded = null) {
  if (muted) {
    if (onEnded) onEnded()
    return
  }
  if (!keyOrPath) {
    if (onEnded) onEnded()
    return
  }
  const path = typeof keyOrPath === 'string' && keyOrPath.startsWith('/')
    ? keyOrPath
    : VOICEOVER_PATHS[keyOrPath]
  if (!path) {
    if (onEnded) onEnded()
    return
  }
  try {
    if (__voCurrentAudio) {
      __voCurrentAudio.pause()
      __voCurrentAudio = null
    }
    const audio = new Audio(path)
    audio.volume = 0.85
    if (onEnded) {
      audio.addEventListener('ended', onEnded, { once: true })
      audio.addEventListener('error', onEnded, { once: true })
    }
    audio.play().catch(() => {
      // arquivo ausente ou browser bloqueou — segue o fluxo
      if (onEnded) onEnded()
    })
    __voCurrentAudio = audio
  } catch { /* no-op */ }
}

function playFeedbackSound(correct, muted = false) {
  if (muted) return
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const notes = correct
      ? [[440, 0, 0.08], [554.37, 0.09, 0.08], [659.25, 0.18, 0.10]]
      : [[330, 0, 0.10], [220, 0.11, 0.14]]
    notes.forEach(([f, t, d]) => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.type = 'square'; o.frequency.value = f
      g.gain.setValueAtTime(0.10, ctx.currentTime + t)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + d)
      o.connect(g); g.connect(ctx.destination)
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + d)
    })
    setTimeout(() => ctx.close(), 800)
  } catch { /* AudioContext unavailable */ }
}
import {
  parseStemSegments,
  alternativeLabelForDisplay,
  captionFromBracketText,
} from './parseQuestionFigures.js'
import { calcTriScores } from './triScoring.js'
import { richHtml, richHtmlBr } from './richHtml.js'
import { subscribeToKatexReady } from './renderMath.js'
import {
  DISCIPLINAS_BY_AREA,
  ALL_DISCIPLINAS,
  DISCIPLINA_LABELS,
  DISCIPLINA_AREA,
  disciplinaLabel,
} from './data/disciplinas.js'
const ReviewPage  = lazy(() => import('./ReviewPage.jsx'))
const QuestionEditor = lazy(() => import('./QuestionEditor.jsx'))
const ExplanationsEditor = lazy(() => import('./ExplanationsEditor.jsx'))
const EnemPicker = lazy(() => import('./EnemPicker.jsx'))
const PdfExporter = lazy(() => import('./pdf/PdfExporter.jsx'))

const ATTEMPTS_SESSION_KEY = 'trilha-integrar-tentativas'
const PAUSED_SESSION_KEY   = 'trilha-integrar-sessao'

function readPausedSession() {
  try {
    const raw = localStorage.getItem(PAUSED_SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function clearPausedSession() {
  localStorage.removeItem(PAUSED_SESSION_KEY)
}

function savePausedSession(data) {
  try { localStorage.setItem(PAUSED_SESSION_KEY, JSON.stringify(data)) } catch {}
}

// ── Scoreboards (personal, localStorage) ──────────────────────────────────
// Schema: { v, streak: [[score, ts, disc], ...],
//          blitz: { '5': [...], '10': [...] },
//          milionario: [[level, ts, disc], ...] }
// ts = seconds since epoch; disc = disciplina slug or null. Top 5 per bucket.
const SCOREBOARDS_KEY = 'scoreboards'
const SCOREBOARDS_VERSION = 1
const SCOREBOARD_LIMIT = 5

function loadScoreboards() {
  try {
    const raw = localStorage.getItem(SCOREBOARDS_KEY)
    if (!raw) return { v: SCOREBOARDS_VERSION }
    const data = JSON.parse(raw)
    if (!data || data.v !== SCOREBOARDS_VERSION) return { v: SCOREBOARDS_VERSION }
    return data
  } catch { return { v: SCOREBOARDS_VERSION } }
}

function saveScoreboards(data) {
  try { localStorage.setItem(SCOREBOARDS_KEY, JSON.stringify(data)) } catch {}
}

function getScoreboardBucket(data, mode, blitzMinutes) {
  if (mode === 'streak') return data?.streak || []
  if (mode === 'milionario') return data?.milionario || []
  if (mode === 'blitz') {
    const k = String(blitzMinutes || 5)
    return (data?.blitz && data.blitz[k]) || []
  }
  return []
}

function bestScoreFor(data, mode, blitzMinutes) {
  const bucket = getScoreboardBucket(data, mode, blitzMinutes)
  return bucket.length > 0 ? bucket[0][0] : 0
}

function recordGameScore({ mode, score, disc, blitzMinutes }) {
  if (!Number.isFinite(score) || score <= 0) return null
  const data = loadScoreboards()
  const prevBest = bestScoreFor(data, mode, blitzMinutes)
  const ts = Math.floor(Date.now() / 1000)
  const entry = [score, ts, disc || null]
  let bucket
  if (mode === 'streak') {
    data.streak = data.streak || []
    bucket = data.streak
  } else if (mode === 'milionario') {
    data.milionario = data.milionario || []
    bucket = data.milionario
  } else if (mode === 'blitz') {
    data.blitz = data.blitz || {}
    const k = String(blitzMinutes || 5)
    data.blitz[k] = data.blitz[k] || []
    bucket = data.blitz[k]
  } else {
    return null
  }
  bucket.push(entry)
  bucket.sort((a, b) => b[0] - a[0] || a[1] - b[1])
  if (bucket.length > SCOREBOARD_LIMIT) bucket.length = SCOREBOARD_LIMIT
  saveScoreboards(data)
  const idx = bucket.findIndex(e => e[1] === ts && e[0] === score)
  const rank = idx >= 0 ? idx + 1 : null
  return {
    rank,
    prevBest,
    newBest: bestScoreFor(data, mode, blitzMinutes),
    isNewRecord: rank === 1 && score > prevBest,
    scoreboards: data,
  }
}

// Stable per-question identifier — questions across years/tests can share the
// same `number`, so attempts/times must be keyed by the full tuple.
function attemptKey(q) {
  return `${q.area}:${q.year}:${q.test ?? ''}:${q.number}`
}

// ── Modo Milhão: 17-step prize ladder + lifeline helpers ───────────────────
const MILIONARIO_PRIZES = [
  1000, 2000, 3000, 5000, 10000, 15000, 20000, 30000, 50000,
  75000, 100000, 150000, 200000, 300000, 500000, 750000, 1000000,
]
const MILIONARIO_TOTAL_LEVELS = MILIONARIO_PRIZES.length
// Patamares (cofres) — passar deles trava um prêmio mínimo se errar depois.
// Índices em MILIONARIO_PRIZES. Confirmar a 5ª pergunta garante R$10.000;
// confirmar a 10ª garante R$75.000.
const MILIONARIO_SAFETY_NETS = [4, 9]

function formatMilPrize(n) {
  return `R$ ${Number(n).toLocaleString('pt-BR')}`
}

function getMilStopPrize(milLevel) {
  if (milLevel <= 0) return 0
  return MILIONARIO_PRIZES[milLevel - 1]
}

function getMilLossPrize(milLevel) {
  if (milLevel <= 0) return 0
  let safetyIdx = -1
  for (const idx of MILIONARIO_SAFETY_NETS) {
    if (idx < milLevel) safetyIdx = idx
  }
  return safetyIdx >= 0 ? MILIONARIO_PRIZES[safetyIdx] : 0
}

function normalizeDifficulty(d) {
  if (typeof d === 'number') return d
  if (d === 'easy')   return 3
  if (d === 'medium') return 5
  if (d === 'hard')   return 7
  return 5
}

// Pool de universitários — 2 por área do ENEM. Quando a área do estudante bate
// com a área da questão, ele entra com vantagem (mais chance de acertar +
// confiança mais alta) e recebe um selo "É a minha área!" no card.
const MIL_UNIV_PEOPLE = [
  { name: 'Bia',     course: 'Eng. Mecatrônica IFSC',    emoji: '⚙️',  area: 'math' },
  { name: 'Léo',     course: 'Eng. Aeroespacial UFSC',   emoji: '🚀',  area: 'math' },
  { name: 'Júlia',   course: 'Ciências Biológicas UDESC', emoji: '🧬',  area: 'nature' },
  { name: 'Sofia',   course: 'Lic. em Física IFSC',       emoji: '🔭',  area: 'nature' },
  { name: 'Nina',    course: 'Letras UFSC',              emoji: '📜',  area: 'linguagens' },
  { name: 'Marina',  course: 'Jornalismo UFSC',          emoji: '🎙️',  area: 'linguagens' },
  { name: 'Caio',    course: 'História UDESC',           emoji: '🏛️',  area: 'humanas' },
  { name: 'Rafa',    course: 'Direito UFSC',             emoji: '⚖️',  area: 'humanas' },
  { name: 'Davi',    course: 'Lic. em Matemática IFSC',  emoji: '🧮',  area: 'math' },
  { name: 'Yara',    course: 'Medicina UFSC',            emoji: '🩺',  area: 'nature' },
  { name: 'Téo',     course: 'Música UDESC',             emoji: '🎼',  area: 'linguagens' },
  { name: 'Helena',  course: 'Pedagogia UDESC',          emoji: '👩‍🏫',  area: 'humanas' },
]

function pickRandomUniversitarios() {
  const pool = [...MIL_UNIV_PEOPLE]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, 3)
}

function makeMilUnivVotes(question) {
  // Easier question → more students hit the right answer.
  const diff = normalizeDifficulty(question.difficulty)
  const pCorrectBase = Math.max(0.32, 0.96 - (diff - 1) * 0.085) // 1→0.96 … 9→0.28
  const letters = Object.keys(question.alternatives)
  const wrongs  = letters.filter((l) => l !== question.answer)
  const trio = pickRandomUniversitarios()
  return trio.map((p) => {
    const isExpert = p.area && p.area === question.area
    // Expert: +18% chance de acertar (cap 96%); confiança mais alta nos dois casos.
    const pCorrect = isExpert ? Math.min(0.96, pCorrectBase + 0.18) : pCorrectBase
    const hit = Math.random() < pCorrect
    const sureness = hit
      ? (isExpert ? 0.85 + Math.random() * 0.15 : 0.7 + Math.random() * 0.3)
      : (isExpert ? 0.55 + Math.random() * 0.3  : 0.4 + Math.random() * 0.4)
    return {
      ...p,
      answer: hit ? question.answer : wrongs[Math.floor(Math.random() * wrongs.length)],
      sureness,
      isExpert,
    }
  })
}

function makeMilPlacasVotes(question) {
  const diff = normalizeDifficulty(question.difficulty)
  // Audience leans on correct: 86% easy → ~32% hard
  const correctBias = Math.max(28, 90 - (diff - 1) * 7)
  const letters = Object.keys(question.alternatives)
  const correct = question.answer
  const votes = {}
  letters.forEach((l) => { votes[l] = 0 })
  votes[correct] = correctBias
  let remaining = 100 - correctBias
  const others = letters.filter((l) => l !== correct)
  for (let i = 0; i < others.length - 1; i++) {
    const slice = Math.floor(Math.random() * (remaining + 1))
    votes[others[i]] = slice
    remaining -= slice
  }
  votes[others[others.length - 1]] = remaining
  return votes
}

// Classic Show do Milhão "Cartas" deck:
//   A = elimina 1 errada
//   2 = elimina 2 erradas
//   3 = elimina 3 erradas
//   4 = elimina todas as erradas (sobra só a certa)
//   K = elimina nenhuma (carta zica)
const MIL_CARTAS_VALUES = ['A', '2', '3', '4', 'K']
const MIL_CARTAS_SUITS = ['♥', '♦', '♣', '♠']
const MIL_CARTAS_ELIMINATES = { 'A': 1, '2': 2, '3': 3, '4': 4, 'K': 0 }

function makeMilCartasDeck() {
  // 5 cartas embaralhadas, cada uma com naipe aleatório (♥♦♣♠).
  const values = [...MIL_CARTAS_VALUES]
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[values[i], values[j]] = [values[j], values[i]]
  }
  return values.map((value) => ({
    value,
    suit: MIL_CARTAS_SUITS[Math.floor(Math.random() * MIL_CARTAS_SUITS.length)],
  }))
}

function pickMilCartasEliminated(question, count) {
  const letters = Object.keys(question.alternatives)
  const wrongs = letters.filter((l) => l !== question.answer)
  for (let i = wrongs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[wrongs[i], wrongs[j]] = [wrongs[j], wrongs[i]]
  }
  return wrongs.slice(0, Math.min(count, wrongs.length))
}

// Pause/resume is only supported for a full ENEM/UFSC exam (year + numeric day).
// Games, Estude por disciplina, Daily Challenge and Listas exit straight to the
// matching home tab without leaving a "Retomar prova" entry behind.
function isFullExamSession(saved) {
  if (!saved) return false
  if (saved.isAreaMode) return false
  if (saved.isDailyChallenge) return false
  if (saved.gameMode) return false
  if (!saved.selectedTest || saved.selectedTest === 'Integrar') return false
  if (saved.selectedYear == null) return false
  if (typeof saved.selectedDay !== 'number') return false
  return true
}

// Best-effort migration from the pre-2.0.4 numeric-keyed format. Used when
// restoring paused sessions saved before the composite-key change.
function migrateNumericKeyedMap(map, questions) {
  if (!map || typeof map !== 'object') return {}
  const out = {}
  for (const [k, v] of Object.entries(map)) {
    if (typeof k === 'string' && k.includes(':')) {
      out[k] = v
      continue
    }
    const num = Number(k)
    if (Number.isNaN(num)) continue
    const match = questions.find((q) => q.number === num)
    if (match) out[attemptKey(match)] = v
  }
  return out
}

function loadAttemptsFromSession() {
  if (typeof sessionStorage === 'undefined') return {}
  try {
    const raw = sessionStorage.getItem(ATTEMPTS_SESSION_KEY)
    if (!raw) return {}
    const o = JSON.parse(raw)
    if (typeof o !== 'object' || o === null) return {}
    const out = {}
    for (const [k, v] of Object.entries(o)) {
      // Accept only the new composite-key format ("area:year:test:number").
      // Legacy numeric keys from older sessions are silently dropped.
      if (typeof k === 'string' && k.includes(':') && v && typeof v === 'object') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function saveAttemptsToSession(attempts) {
  try {
    sessionStorage.setItem(ATTEMPTS_SESSION_KEY, JSON.stringify(attempts))
  } catch { /* ignore */ }
}

// Normalize contextId (string) or contextIds (array) → always an array
function getContextIds(question) {
  if (Array.isArray(question.contextIds)) return question.contextIds
  if (question.contextId) return [question.contextId]
  return []
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

const APP_VERSION = '2.2.0'
const APP_VERSION_DATE = '04/09/2026'

const REVIEW_STATUS = [
  { year: 2025, linguagens: true, humanas: true, natureza: true, matematica: true },
  { year: 2024, linguagens: true, humanas: true, natureza: true, matematica: true },
  { year: 2023, linguagens: true, humanas: true, natureza: true, matematica: true },
  { year: 2022, linguagens: true, humanas: true, natureza: true, matematica: true },
  { year: 2021, linguagens: true, humanas: true, natureza: true, matematica: true },
  { year: 2020, linguagens: true, humanas: true, natureza: true, matematica: true },
  { year: 2019, linguagens: false, humanas: false, natureza: false, matematica: false },
  { year: 2018, linguagens: true, humanas: true, natureza: true, matematica: true },
]

const CHANGELOG = [
  {
    version: '2.2.0',
    date: '04/09/2026',
    items: [
      'Nova ferramenta Gerar Lista para Impressão',
    ],
  },
  {
    version: '2.1.2',
    date: '12/06/2026',
    items: [
      'Corrige ajudas do Milhão com alternativas embaralhadas',
      'Cartas viram baralho interativo com flip',
      'Baralho A-2-3-4-K como no Show original',
      'Cartas ganham naipes ♥ ♦ ♣ ♠ com layout real',
      'Universitários divididos por área do ENEM',
      'Selo de expert quando bate a área',
      'Universitários estudam em IFSC, UFSC e UDESC',
      'Pool de universitários cresce para 12 (3 por área)',
      'Botão Parar leva o que já confirmou',
      'Patamares no 5º e 10º níveis travam prêmio mínimo',
      'Recorde pessoal por modo de jogo',
      'Destaque de novo recorde no fim do jogo',
      'Card de cada jogo mostra recorde pessoal',
      'Jogos abrem sem login; cadastro pede ao fim',
      'Voiceover no Show do Milhão (mute respeitado)',
    ],
  },
  {
    version: '2.1.1',
    date: '12/06/2026',
    items: [
      'Popup de resultado para sessões leves',
      'Sneak peek de acertos no popup',
      'Refazer e ver gabarito a partir do popup',
      'Prêmio do Milhão em banner dedicado',
      'Banner mostra valor garantido se errar',
      'Tela final destaca quanto o jogador ganhou',
      'Prêmios escritos por extenso em reais',
      'Deeplink /milhao inicia o jogo direto',
      'Milhão agora tem 17 níveis como no Show',
      'Card do Milhão com tagline icônica',
      'Escada do Milhão ajustada nos múltiplos de 25',
    ],
  },
  {
    version: '2.1.0',
    date: '11/06/2026',
    items: [
      'Nova aba Jogos no menu lateral',
      'Modo Streak: questões até errar uma',
      'Modo Blitz: duração de 5 a 30 min',
      'Modo Milhão estilo Show do Milhão',
      'Cartas, Universitários, Plateia e 3 pulos',
      'Perguntas com dificuldade crescente',
      'Chuva de moedas ao ganhar o milhão',
      'Cards de Jogos em 2×2 no celular',
      'Cards de Jogos com contorno colorido',
      'Picker de tema dos Jogos em chips',
      'Simulado só de Inglês ou Espanhol',
      'Escolha do idioma no Simule Dia 1',
      'Quantidade customizada no Estude',
      'Lupa para ampliar imagens das questões',
      'Imagens das alternativas com altura limitada',
      'Pausar restrito a Provas Completas',
      'Erros do Desafio Diário visíveis no card',
    ],
  },
  {
    version: '2.0.3',
    date: '11/06/2026',
    items: [
      'Novo estilo Mochila: lúdico e acolhedor',
      'Highlights de aba unificados em lilás',
      'Modo escuro vira índigo profundo',
      'Tipografia Nunito arredondada',
      'Desafio Diário em destaque no menu',
      'Corrige círculos marcados em outras questões',
      'Opções e Sair migram para o menu lateral',
      'Desafio Diário removido da Estude',
      'Abas com novos nomes mais descritivos',
      'Listas viram aba separada de Simulados',
      'Menu lateral reagrupado com Jogos em destaque',
      'Criar Material visível só para professores',
      'Opções no menu lateral viram recolhíveis',
      'Aba Listas vira Listas de Exercícios',
      'Botão Explicar vira Explicar Questão do Enem',
      'Botão Criar lista vira Criar Lista de Questões',
    ],
  },
  {
    version: '2.0.2',
    date: '10/06/2026',
    items: [
      'Tabs movidas para menu lateral',
    ],
  },
  {
    version: '2.0.1',
    date: '08/06/2026',
    items: [
      'Filtros do Explicar como nas outras páginas',
    ],
  },
  {
    version: '2.0.0',
    date: '07/06/2026',
    items: [
      'Projeto renomeado para Trilha Integrar',
      'Cinco abas: Estude, Simule, Pesquise, Ensine, Administre',
      'Cores e favicons próprios por aba',
      'Deep-link por URL para cada aba',
      'Card e cabeçalho na largura total',
      'Logo movido para o cabeçalho',
      'Histórico de versões abre da versão',
      'Nova taxonomia de 13 disciplinas',
      'Estude dividido em sub-abas ENEM e Listas',
      'Novo picker de disciplina com subtemas',
      'Subtemas novos de Matemática e Linguística',
      'Resumo agrupado por disciplina',
      'Nova aba Pesquise com busca de questões',
      'Filtros por disciplina e assunto',
      'Busca insensível a acentos',
      'Filtros como dropdowns no estilo Estude',
      'Nova aba Administre apenas para admins',
      'Painel Admin embutido na nova aba',
      'Nova ferramenta Explicar para professores',
      'Criar lista e Explicar embutidos no Ensine',
      'Convenção de imagens em contextos inline',
    ],
  },
  {
    version: '1.14.6',
    date: '07/06/2026',
    items: [
      'ENEM 2019 - Questões de Linguagens corrigidas',
      'ENEM 2019 - Questões de Humanas corrigidas',
      'ENEM 2019 - Questões de Matemática corrigidas',
      'ENEM 2019 - Questões de Ciências da Natureza corrigidas',
    ],
  },
  {
    version: '1.14.5',
    date: '05/06/2026',
    items: [
      '2020 linguagens revisada',
      '2020 humanas revisada',
      '2020 ciências da natureza revisada',
      '2020 matemática revisada',
    ],
  },
  {
    version: '1.14.4',
    date: '04/06/2026',
    items: [
      '2021 linguagens revisada',
      '2021 humanas revisada',
      '2021 matemática revisada',
      '2021 ciências da natureza revisada',
      'Figuras refeitas em cinco questões',
    ],
  },
  {
    version: '1.14.3',
    date: '04/06/2026',
    items: [
      '2022 matemática revisada',
      'Resumo: cor âmbar para questões em branco',
      'Resumo: placar mostra corretas/respondidas/total',
      'Alterações apenas visuais; dados preservados',
    ],
  },
  {
    version: '1.14.2',
    date: '03/06/2026',
    items: [
      '2022 ciências da natureza revisada',
    ],
  },
  {
    version: '1.14.1',
    date: '02/06/2026',
    items: [
      '2022 linguagens revisada',
      '2022 humanas revisada',
    ],
  },
  {
    version: '1.14.0',
    date: '02/06/2026',
    items: [
      'Frações KaTeX em Matemática 2022–2025',
      'Fração corrigida em Ciências 2025 Q132',
    ],
  },
  {
    version: '1.13.0',
    date: '02/06/2026',
    items: [
      'Botão Sair no resultado do simulado',
      'Percentual de acerto na seleção de ano',
      'Botão alterna entre Sair e Finalizar',
    ],
  },
  {
    version: '1.12.0',
    date: '02/06/2026',
    items: [
      'Frações e expressões matemáticas formatadas',
      'Botão de fração na barra de formatação',
    ],
  },
  {
    version: '1.11.2',
    date: '02/06/2026',
    items: ['ENEM 2023 Ciências da Natureza revisado', 'Mudanças no visual do texto de referencia'],
  },
  {
    version: '1.11.1',
    date: '31/05/2026',
    items: ['Painel de bugs mostra ano, prova e área', 'Seção de versão e histórico na tela inicial'],
  },
  {
    version: '1.11.0',
    date: '31/05/2026',
    items: ['ENEM 2023 Humanas revisado', 'ENEM 2023 Linguagens revisado', 'ENEM 2024 Matemática revisado', 'Log de mudanças adicionado'],
  },
  {
    version: '1.10.0',
    date: '17/05/2026',
    items: ['ENEM 2024 revisado (todas as áreas)'],
  },
  {
    version: '1.9.0',
    date: '09/05/2026',
    items: ['ENEM 2025 Ciências da Natureza adicionado', 'Barra de formatação no editor'],
  },
  {
    version: '1.8.0',
    date: '06/05/2026',
    items: ['Pontuação TRI por área no resumo final', 'Motor de cálculo TRI 3PL'],
  },
  {
    version: '1.7.0',
    date: '04/05/2026',
    items: ['Editor de questões', 'Papéis de usuário (prof/admin)', 'Separação EN/ES por questão', 'ENEM 2018 revisado'],
  },
  {
    version: '1.6.0',
    date: '02/05/2026',
    items: ['Ferramenta de revisão interna', 'Edição de contextos e textos', 'Negrito e itálico nos textos', 'Correção de acentos em português'],
  },
  {
    version: '1.5.0',
    date: '01/05/2026',
    items: ['ENEM 2018–2021 adicionados', 'Acompanhamento visual de desempenho', 'Nível de dificuldade por questão', 'Opção de ocultar gabarito', 'Questões anuladas tratadas'],
  },
  {
    version: '1.4.0',
    date: '30/04/2026',
    items: ['Desafio Diário', 'Modo Estudar por Área', 'Embaralhar alternativas', 'Menu de configurações', 'Seletor de prova e ano'],
  },
  {
    version: '1.3.0',
    date: '28/04/2026',
    items: ['Pausar e retomar simulado', 'Feedback personalizado por assunto', 'Banco de dados e histórico do aluno', 'Painel administrativo'],
  },
  {
    version: '1.2.0',
    date: '23/04/2026',
    items: ['Login de alunos', 'ENEM 2024 adicionado (Dia 1 e Dia 2)'],
  },
  {
    version: '1.1.0',
    date: '20/04/2026',
    items: ['Filtros por dia e área', 'Textos de referência e contextos', 'ENEM 2025 Ciências da Natureza', 'Caderno lateral de questões', 'Melhorias de estilo'],
  },
  {
    version: '1.0.0',
    date: '19/04/2026',
    items: ['Lançamento inicial', 'Quiz com imagens e alternativas', 'Caderno de anotações', 'Timer por questão e total'],
  },
]


const AREA_LABELS = {
  math:       'Matemática',
  nature:     'Ciências da Natureza',
  linguagens:       'Linguagens',
  humanas:     'Ciências Humanas'
}

function areaLabel(area) {
  return AREA_LABELS[area] ?? area ?? null
}

function publicImageSrc(path) {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) return path
  return path.startsWith('/') ? path : `/${path}`
}


function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function NotebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      <line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="12" y2="15"/>
    </svg>
  )
}

function SoundOnIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  )
}

function SoundOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  )
}

function WarnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function FinishIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function ExitIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

function MenuDotsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function NumberedListIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="10" y1="6" x2="21" y2="6"/>
      <line x1="10" y1="12" x2="21" y2="12"/>
      <line x1="10" y1="18" x2="21" y2="18"/>
      <path d="M4 6h1v4"/>
      <path d="M4 10h2"/>
      <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>
    </svg>
  )
}
function ZoomInIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="20" y1="20" x2="16" y2="16" />
      <line x1="8" y1="11" x2="14" y2="11" />
      <line x1="11" y1="8" x2="11" y2="14" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}
function LogoutIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Porta */}
      <path d="M3 21h12V3H3z" />

      {/* Maçaneta */}
      <circle cx="10" cy="12" r="1" />

      {/* Seta de saída */}
      <path d="M15 12h6" />
      <path d="M18 9l3 3-3 3" />
    </svg>
  )
}

const SESSION_NOTES_KEY = 'trilha-integrar-caderno'

function readNotesFromSession() {
  if (typeof sessionStorage === 'undefined') return ''
  try { return sessionStorage.getItem(SESSION_NOTES_KEY) ?? '' } catch { return '' }
}

function writeNotesToSession(value) {
  try { sessionStorage.setItem(SESSION_NOTES_KEY, value) } catch { /* ignore */ }
}

function legacyPlainToHtml(raw) {
  if (!raw || !String(raw).trim()) return '<p><br></p>'
  const t = String(raw).trim()
  if (t.startsWith('<')) return raw
  const esc = String(raw).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<p>${esc.replace(/\n/g, '<br>')}</p>`
}

function ChangelogSection() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('changelog') // 'changelog' | 'status'
  const wrapRef = useRef(null)

  // Close when the user clicks outside the popover.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const areaAbbr = ['Ling', 'Hum', 'Nat', 'Mat']
  const areaKeys = ['linguagens', 'humanas', 'natureza', 'matematica']

  return (
    <div className="changelog-wrap" ref={wrapRef}>
      <button
        type="button"
        className="changelog-pill-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={`Histórico de versões · v${APP_VERSION} (${APP_VERSION_DATE})`}
      >
        V{APP_VERSION}
      </button>

      {open && (
        <div className="changelog-panel changelog-panel--popover" role="menu">
          <div className="changelog-tabs">
            <button
              type="button"
              className={`changelog-tab${tab === 'changelog' ? ' active' : ''}`}
              onClick={() => setTab('changelog')}
            >
              Histórico
            </button>
            <button
              type="button"
              className={`changelog-tab${tab === 'status' ? ' active' : ''}`}
              onClick={() => setTab('status')}
            >
              Revisão de provas
            </button>
          </div>

          {tab === 'changelog' && (
            <div className="changelog-list">
              {CHANGELOG.map((entry) => (
                <div key={entry.version} className="changelog-entry">
                  <div className="changelog-entry-header">
                    <span className="changelog-entry-version">v{entry.version}</span>
                    <span className="changelog-entry-date">{entry.date}</span>
                  </div>
                  <ul className="changelog-entry-items">
                    {entry.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {tab === 'status' && (
            <div className="changelog-status">
              <div className="changelog-status-header">
                <span className="changelog-status-year">Ano</span>
                {areaAbbr.map((a) => (
                  <span key={a} className="changelog-status-area">{a}</span>
                ))}
              </div>
              {REVIEW_STATUS.map((row) => (
                <div key={row.year} className="changelog-status-row">
                  <span className="changelog-status-year">{row.year}</span>
                  {areaKeys.map((k) => (
                    <span key={k} className={`changelog-status-cell${row[k] ? ' done' : ''}`}>
                      {row[k] ? '✓' : '·'}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ExplanationBlock({ text, canEdit, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (editing) {
    return (
      <div className="explanation explanation--editing">
        <div className="explanation-summary">Editando explicação</div>
        <div className="explanation-body">
          <textarea
            className="explanation-textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            autoFocus
          />
          {error && <p className="explanation-error">{error}</p>}
          <div className="explanation-edit-actions">
            <button
              type="button"
              className="btn--ghost"
              onClick={() => { setEditing(false); setDraft(text); setError('') }}
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="home-start-btn"
              onClick={async () => {
                setSaving(true); setError('')
                try { await onSave(draft); setEditing(false) }
                catch (err) { setError(err.message ?? 'Erro ao salvar') }
                finally { setSaving(false) }
              }}
              disabled={saving || draft === text}
            >
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <details className="explanation">
      <summary className="explanation-summary">
        <span>Explicação</span>
        {canEdit && (
          <button
            type="button"
            className="explanation-edit-btn"
            onClick={(e) => { e.preventDefault(); setDraft(text); setEditing(true) }}
            title="Editar explicação"
          >
            Editar
          </button>
        )}
      </summary>
      <div
        className="explanation-body"
        dangerouslySetInnerHTML={{ __html: richHtmlBr(text || 'Sem explicação ainda.') }}
      />
    </details>
  )
}

export default function App() {
  if (window.location.pathname === '/review') return <Suspense fallback={null}><ReviewPage /></Suspense>


  const [user, setUser] = useState(null)
  // Active tool inside the Ensine tab: null = tool launcher, otherwise the tool id.
  const [ensineTool, setEnsineTool] = useState(null)
  useEffect(() => {
    const p = window.location.pathname
    if (
      p === '/editor' ||
      ['/estude', '/simule', '/pesquise', '/ensine', '/administre', '/milhao', '/jogos/milhao'].includes(p)
    ) {
      window.history.replaceState(null, '', '/')
    }
  }, [])

  // Deeplink "/milhao" (e alias "/jogos/milhao") agenda o auto-start do Milhão
  // assim que as questões carregarem e o usuário estiver logado.
  const [pendingGameMode, setPendingGameMode] = useState(() => {
    if (typeof window === 'undefined') return null
    const p = window.location.pathname.replace(/^\/+|\/+$/g, '')
    if (p === 'milhao' || p === 'jogos/milhao') return 'milionario'
    return null
  })
  // All questions loaded from manifest
  const [allQuestions, setAllQuestions] = useState([])
  const [contexts, setContexts] = useState({}) // { [contextId]: { title, subtitle, text, reference } }
  const [explanationOverrides, setExplanationOverrides] = useState({}) // { "area:year:test:number": text } from DB
  // Active set for current quiz session (set when quiz starts)
  const [questions, setQuestions] = useState([])
  const [question, setQuestion] = useState(null)
  const [attempts, setAttempts] = useState(loadAttemptsFromSession)
  const [loading, setLoading] = useState(true)
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('dark')
    if (saved !== null) return saved === 'true'
    const h = new Date().getHours()
    return h < 6 || h >= 18
  })
  const [randomizeAlts, setRandomizeAlts] = useState(() => {
    const saved = localStorage.getItem('randomize-alts')
    return saved === null ? true : saved === 'true'
  })
  const [soundMuted, setSoundMuted] = useState(() =>
    localStorage.getItem('sound-muted') === 'true'
  )
  const [showDifficulty, setShowDifficulty] = useState(() => {
    return localStorage.getItem('show-difficulty') === 'true'
  })
  const [showAnswer, setShowAnswer] = useState(() => {
    const saved = localStorage.getItem('show-answer')
    return saved === null ? true : saved === 'true'
  })
  const [notebookOpen, setNotebookOpen] = useState(false)
  const [pendingSelection, setPendingSelection] = useState(null)
  const [contextExpanded, setContextExpanded] = useState({}) // { [contextId]: boolean }
  const prevContextIdRef = useRef([])

  const [token, setToken] = useState(() => localStorage.getItem('token') ?? null)
  const [authMode, setAuthMode] = useState('login') // 'login' | 'register'
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackQuestion, setFeedbackQuestion] = useState(null)

  const [userResults, setUserResults] = useState([]) // [{test,year,day,score,total}]
  const [triScores, setTriScores] = useState(null) // {math,nature,linguagens,humanas,geral}

  const [isDailyChallenge, setIsDailyChallenge] = useState(false)
  const [dailyChallengeLoading, setDailyChallengeLoading] = useState(false)
  const [dailyChallengeResult, setDailyChallengeResult] = useState(null) // {score, total} if already done today
  const [dailyChallengePractice, setDailyChallengePractice] = useState(false) // true = retake, do not post result
  const [dailyChallengeError, setDailyChallengeError] = useState(null)

  // ── Jogos (Streak / Blitz / Milhão) — null when not playing a game ─────────
  const [gameMode, setGameMode] = useState(null) // 'streak' | 'blitz' | 'milionario' | null
  const [gameStreak, setGameStreak] = useState(0)
  const [gameCorrect, setGameCorrect] = useState(0)
  const [gameWrongs, setGameWrongs] = useState(0)
  const [gameTimeLeft, setGameTimeLeft] = useState(0) // seconds — blitz only
  const [gameDisciplina, setGameDisciplina] = useState(null)
  const [blitzMinutes, setBlitzMinutes] = useState(5) // 5 | 10 | 15 | 20 | 30
  // Milhão state
  const [milLevel, setMilLevel] = useState(0) // 0..14 (index into MILIONARIO_PRIZES)
  const [milSkipsLeft, setMilSkipsLeft] = useState(3)
  const [milCardsLeft, setMilCardsLeft] = useState(1)
  const [milUnivLeft, setMilUnivLeft] = useState(1)
  const [milPlacasLeft, setMilPlacasLeft] = useState(1)
  const [milActiveHelp, setMilActiveHelp] = useState(null) // 'cartas'|'univ'|'placas'|null
  const [milEliminatedLetters, setMilEliminatedLetters] = useState([]) // letters knocked out by Cartas for current question
  const [milCartasDeck, setMilCartasDeck] = useState([]) // 5 shuffled face values: A, 2, 3, 4, K
  const [milCartasPickedPos, setMilCartasPickedPos] = useState(null) // 0..4 — deck position the player flipped
  const [milStopConfirmOpen, setMilStopConfirmOpen] = useState(false)
  const [milUnivVotes, setMilUnivVotes] = useState(null) // [{name, course, answer, confidence}]
  const [milPlacasVotes, setMilPlacasVotes] = useState(null) // { letter: percent }
  const [gameFinalStats, setGameFinalStats] = useState(null) // {mode, streak, correct, wrongs, durationSecs, disciplina}
  const [gameConfigOpen, setGameConfigOpen] = useState(null) // 'streak' | 'blitz' | 'milionario' | null
  const [scoreboards, setScoreboards] = useState(() => loadScoreboards())
  const [personalBestInfo, setPersonalBestInfo] = useState(null) // {rank, prevBest, newBest, isNewRecord}
  const recordedGameRef = useRef(null)
  const gameQueueRef = useRef([]) // shuffled question pool
  const gameQueueIndexRef = useRef(0)
  const gameStartTsRef = useRef(null)
  const gameBlitzSecsRef = useRef(0) // total seconds for this blitz run
  const gameAdvanceTimerRef = useRef(null)
  const gameLastProcessedKeyRef = useRef(null)
  // Guest fluxo: marca que após o próximo login bem-sucedido o app deve voltar
  // pra phase 'game-over' (em vez de ir pra 'home'), preservando gameFinalStats.
  const pendingResultSaveRef = useRef(false)

  useLayoutEffect(() => {
    if (!gameFinalStats) {
      recordedGameRef.current = null
      setPersonalBestInfo(null)
      return
    }
    if (recordedGameRef.current === gameFinalStats) return
    recordedGameRef.current = gameFinalStats
    const s = gameFinalStats
    let score
    if (s.mode === 'streak') score = s.streak
    else if (s.mode === 'blitz') score = s.correct
    else if (s.mode === 'milionario') score = s.milLevelReached ?? 0
    else return
    const result = recordGameScore({
      mode: s.mode,
      score,
      disc: s.disciplina,
      blitzMinutes: s.blitzMinutes,
    })
    if (result) {
      setPersonalBestInfo(result)
      setScoreboards(result.scoreboards)
    } else {
      const fresh = loadScoreboards()
      const best = bestScoreFor(fresh, s.mode, s.blitzMinutes)
      setPersonalBestInfo({ rank: null, prevBest: best, newBest: best, isNewRecord: false })
    }
  }, [gameFinalStats])

  const [selectedArea, setSelectedArea] = useState(null) // 'math' | 'nature' | 'linguagens' | 'humanas'
  const [selectedTag, setSelectedTag] = useState(null)   // unified tag string | null
  const [selectedDisciplina, setSelectedDisciplina] = useState(() => {
    try { return localStorage.getItem('trilha-integrar-picker-disc') || null } catch { return null }
  })
  const [allowMultidisciplinar, setAllowMultidisciplinar] = useState(() => {
    try { return localStorage.getItem('trilha-integrar-picker-allowmulti') !== '0' } catch { return true }
  })
  const [selectedSubtags, setSelectedSubtags] = useState(() => {
    try {
      const raw = localStorage.getItem('trilha-integrar-picker-subtags')
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  })
  const [disciplinaQuizLength, setDisciplinaQuizLength] = useState(() => {
    try {
      const raw = localStorage.getItem('trilha-integrar-picker-length')
      if (raw === 'all') return 'all'
      const n = parseInt(raw, 10)
      return Number.isFinite(n) && n > 0 ? n : 10
    } catch { return 10 }
  })

  useEffect(() => {
    try { localStorage.setItem('trilha-integrar-picker-disc', selectedDisciplina || '') } catch {}
  }, [selectedDisciplina])
  useEffect(() => {
    try { localStorage.setItem('trilha-integrar-picker-allowmulti', allowMultidisciplinar ? '1' : '0') } catch {}
  }, [allowMultidisciplinar])
  useEffect(() => {
    try { localStorage.setItem('trilha-integrar-picker-subtags', JSON.stringify(selectedSubtags)) } catch {}
  }, [selectedSubtags])
  useEffect(() => {
    try { localStorage.setItem('trilha-integrar-picker-length', String(disciplinaQuizLength)) } catch {}
  }, [disciplinaQuizLength])
  const [expandedArea, setExpandedArea] = useState(null) // area panel open on home screen
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
  const [sideMenuOpen, setSideMenuOpen] = useState(false)
  const [activeTab, setActiveTab] = useState(() => {
    const VALID = ['estude', 'listas', 'simule', 'jogos', 'pesquise', 'ensine', 'administre']
    // Guest (sem token) só pode estar na aba Jogos.
    const hasToken = typeof window !== 'undefined' && !!localStorage.getItem('token')
    if (!hasToken) return 'jogos'
    // Deep-link via path (e.g. /ensine). URL is rewritten back to / by the effect above for cleanliness.
    if (typeof window !== 'undefined') {
      const p = window.location.pathname.replace(/^\/+|\/+$/g, '')
      if (VALID.includes(p)) return p
      // Mode-specific deeplinks land on the Jogos tab.
      if (p === 'milhao' || p === 'jogos/milhao') return 'jogos'
    }
    try {
      const stored = localStorage.getItem('trilha-integrar-active-tab')
      return VALID.includes(stored) ? stored : 'estude'
    } catch { return 'estude' }
  })
  const switchTab = (tab) => {
    // Guest só pode ficar na aba Jogos; outras opções abrem a tela de login.
    if (!token && tab !== 'jogos') {
      setPhase('login')
      return
    }
    setActiveTab(tab)
    try { localStorage.setItem('trilha-integrar-active-tab', tab) } catch {}
    setSelectedYear(null)
    setSelectedDay(null)
    setSelectedIntegrarYear(null)
    setSelectedTest(tab === 'simule' ? 'ENEM' : null)
    if (tab !== 'ensine') setEnsineTool(null)
  }
  useEffect(() => {
    const FAVICON_COLOR_BY_TAB = { estude: 'red', listas: 'red', simule: 'amber', jogos: 'amber', pesquise: 'green', ensine: 'blue', administre: 'purple' }
    const color = FAVICON_COLOR_BY_TAB[activeTab] ?? 'red'
    const ico = document.querySelector('link[rel="icon"][type="image/x-icon"]')
    const png = document.querySelector('link[rel="icon"][type="image/png"]')
    if (ico) ico.href = `/favicon-${color}.ico`
    if (png) png.href = `/favicon-${color}-32.png`
  }, [activeTab])

  useEffect(() => {
    if (!sideMenuOpen) return
    const onKey = (e) => { if (e.key === 'Escape') setSideMenuOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [sideMenuOpen])
  const [finishConfirmOpen, setFinishConfirmOpen] = useState(false)
  const [summaryView, setSummaryView] = useState('popup') // 'popup' | 'full'
  const [timerDrawerOpen, setTimerDrawerOpen] = useState(false)
  const [lightboxImage, setLightboxImage] = useState(null) // { src, caption } | null

  // Close lightbox on ESC
  useEffect(() => {
    if (!lightboxImage) return
    const onKey = (e) => { if (e.key === 'Escape') setLightboxImage(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [lightboxImage])

  // Force re-render once KaTeX finishes loading (math switches from raw \(latex\) to rendered HTML)
  const [, forceMathRerender] = useState(0)
  useEffect(() => {
    const unsub = subscribeToKatexReady(() => forceMathRerender((n) => n + 1))
    return unsub
  }, [])

  // Phase: 'home' | 'quiz' | 'summary' | 'login' | 'admin'
  const [phase, setPhase] = useState('login')

  const [adminStats, setAdminStats] = useState(null)
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminError, setAdminError] = useState('')
  const [clearHistoryConfirm, setClearHistoryConfirm] = useState(false)
  const [clearHistoryLoading, setClearHistoryLoading] = useState(false)

  // Homepage filters (step-by-step single select)
  const [selectedTest, setSelectedTest] = useState('ENEM')   // 'ENEM' | 'UFSC' | …
  const [selectedYear, setSelectedYear] = useState(null)   // number
  const [selectedDay, setSelectedDay] = useState(null)     // 1 | 2 | set name string (Integrar)
  const [selectedIntegrarYear, setSelectedIntegrarYear] = useState(null) // optional filter for Integrar

  // Foreign language toggle (EN / ES) — only relevant for Dia 1 q1-5
  const [foreignLang, setForeignLang] = useState('en')

  // Sidebar visibility — closed by default on narrow screens
  const [railOpen, setRailOpen] = useState(() => window.innerWidth >= 600)
  const langVariantsRef = useRef({}) // { [number]: { en: Q, es: Q } }

  // Timers
  const [totalElapsed, setTotalElapsed] = useState(0)
  const [questionElapsed, setQuestionElapsed] = useState(0)
  const [questionTimes, setQuestionTimes] = useState({})

  const startTimeRef = useRef(null)
  const questionStartRef = useRef(null)
  const accQuestionTimesRef = useRef({})
  const prevQuestionNumRef = useRef(null)
  const notebookEditorRef = useRef(null)
  const notebookEditorHydrated = useRef(false)

  // ── Load all questions from manifest ──────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const [manifest, ctxMap, explanationMap] = await Promise.all([
          fetch('/questions-manifest.json').then((r) => r.json()),
          fetch('/contexts.json').then((r) => r.json()).catch(() => ({})),
          fetch('/api/explanations').then((r) => r.json()).catch(() => ({})),
        ])
        const datasets = await Promise.all(
          manifest.map((file) => fetch(`/${file}`).then((r) => r.json()).catch(() => []))
        )
        const staticQs = datasets.flat()
        const all = staticQs.sort((a, b) => a.number - b.number)
        setAllQuestions(all)
        setContexts(ctxMap)
        setExplanationOverrides(explanationMap)

        // Auto-restore a paused session if the user is logged in.
        // Pause now only persists for a full ENEM/UFSC exam — anything else
        // (legacy daily-challenge / area-mode sessions) is wiped on load.
        const savedUser  = localStorage.getItem('user')
        const savedToken = localStorage.getItem('token')
        const saved      = readPausedSession()
        if (saved && !isFullExamSession(saved)) {
          clearPausedSession()
        }
        if (savedUser && savedToken && saved && isFullExamSession(saved)) {
          {
            const DAY_AREAS_MAP = { 1: ['linguagens', 'humanas'], 2: ['math', 'nature'] }
            const areas = DAY_AREAS_MAP[saved.selectedDay]
            if (areas) {
              const lang     = saved.foreignLang ?? 'en'
              const filtered = all.filter((q) =>
                q.test === saved.selectedTest &&
                q.year === saved.selectedYear &&
                areas.includes(q.area)
              )
              const variants = {}
              filtered.forEach((q) => {
                if (q.language) {
                  if (!variants[q.number]) variants[q.number] = {}
                  variants[q.number][q.language] = q
                }
              })
              langVariantsRef.current = variants
              const deduped  = filtered.filter((q) => !q.language || q.language === lang)
              const sorted   = [...deduped].sort((a, b) => a.number - b.number)
              const currentQ = (saved.currentKey && sorted.find((q) => attemptKey(q) === saved.currentKey))
                ?? sorted.find((q) => q.number === saved.currentNumber)
                ?? sorted[0]
              if (sorted.length > 0 && currentQ) {
                const restoredAttempts = migrateNumericKeyedMap(saved.attempts, sorted)
                const restoredTimes = migrateNumericKeyedMap(saved.questionTimes, sorted)
                setSelectedTest(saved.selectedTest)
                setSelectedYear(saved.selectedYear)
                setSelectedDay(saved.selectedDay)
                setForeignLang(lang)
                setQuestions(sorted)
                setQuestion(currentQ)
                setAttempts(restoredAttempts)
                saveAttemptsToSession(restoredAttempts)
                setTotalElapsed(saved.totalElapsed ?? 0)
                setQuestionTimes(restoredTimes)
                accQuestionTimesRef.current = { ...restoredTimes }
                const now = Date.now()
                startTimeRef.current   = now - (saved.totalElapsed ?? 0) * 1000
                const savedQStart = Number(localStorage.getItem('trilha-integrar-question-start'))
                questionStartRef.current = savedQStart && savedQStart < now ? savedQStart : now
                prevQuestionNumRef.current = null
                setPhase('quiz')
              }
            }
          }
        }
      } catch (err) {
        console.error('Erro ao carregar questões:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ── Load teacher-created Integrar questions from DB ───────────────────────
  useEffect(() => {
    if (!token) return
    fetch('/api/question-sets/all', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : [])
      .catch(() => [])
      .then((integrarQs) => {
        if (!integrarQs.length) return
        setAllQuestions((prev) => {
          // Merge DB questions with static JSON Integrar questions.
          // DB questions for the same teacher+day set replace their static counterparts
          // (teacher updated the set); sets only in static JSON are kept as-is.
          const dbKeys = new Set(integrarQs.map(q => `${q.teacher}::${q.day}`))
          const staticIntegrar = prev.filter(
            (q) => q.test === 'Integrar' && !dbKeys.has(`${q.teacher}::${q.day}`)
          )
          const nonIntegrar = prev.filter((q) => q.test !== 'Integrar')
          return [...nonIntegrar, ...staticIntegrar, ...integrarQs].sort((a, b) => a.number - b.number)
        })
      })
  }, [token])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('dark', dark)
  }, [dark])

  useEffect(() => {
    if (!notebookOpen) return
    const onKey = (e) => { if (e.key === 'Escape') setNotebookOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [notebookOpen])

  useLayoutEffect(() => {
    if (!question) return
    const el = notebookEditorRef.current
    if (!el || notebookEditorHydrated.current) return
    el.innerHTML = legacyPlainToHtml(readNotesFromSession())
    notebookEditorHydrated.current = true
  }, [question])

  const syncNotebookFromEditor = useCallback(() => {
    const html = notebookEditorRef.current?.innerHTML ?? ''
    writeNotesToSession(html)
  }, [])

  const applyNotebookFormat = useCallback(
    (command) => (e) => {
      e.preventDefault()
      notebookEditorRef.current?.focus({ preventScroll: true })
      document.execCommand(command, false)
      syncNotebookFromEditor()
    },
    [syncNotebookFromEditor],
  )

  const handleLogin = useCallback(async (username, password) => {
    setAuthLoading(true)
    setAuthError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) { setAuthError(data.error ?? 'Erro ao entrar'); return }
      setUser(data.user)
      setToken(data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      localStorage.setItem('token', data.token)
      // Guest → game-over → login: volta pra tela de resultado autenticado.
      if (pendingResultSaveRef.current && gameFinalStats) {
        pendingResultSaveRef.current = false
        setPhase('game-over')
      } else {
        setPhase('home')
      }
    } catch {
      setAuthError('Erro de conexão')
    } finally {
      setAuthLoading(false)
    }
  }, [gameFinalStats])

  const handleRegister = useCallback(async (username, password) => {
    setAuthLoading(true)
    setAuthError('')
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) { setAuthError(data.error ?? 'Erro ao criar conta'); return }
      setUser(data.user)
      setToken(data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      localStorage.setItem('token', data.token)
      if (pendingResultSaveRef.current && gameFinalStats) {
        pendingResultSaveRef.current = false
        setPhase('game-over')
      } else {
        setPhase('home')
      }
    } catch {
      setAuthError('Erro de conexão')
    } finally {
      setAuthLoading(false)
    }
  }, [gameFinalStats])

  useEffect(() => {
    if (notebookOpen && notebookEditorRef.current) {
      notebookEditorRef.current.focus({ preventScroll: true })
    }
  }, [notebookOpen])

  const sortedQuestions = useMemo(
    () => (isDailyChallenge || selectedArea)
      ? [...questions]
      : [...questions].sort((a, b) => a.number - b.number),
    [questions, isDailyChallenge, selectedArea],
  )

  // Tags available per area, with question counts, sorted by frequency
  const tagsByArea = useMemo(() => {
    const areas = ['math', 'nature', 'linguagens', 'humanas']
    const counts = Object.fromEntries(areas.map((a) => [a, {}]))
    for (const q of allQuestions) {
      if (!counts[q.area]) continue
      for (const tag of q.tags ?? []) {
        counts[q.area][tag] = (counts[q.area][tag] ?? 0) + 1
      }
    }
    const result = {}
    for (const area of areas) {
      result[area] = Object.entries(counts[area])
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
    }
    return result
  }, [allQuestions])

  // Reset pending selection, track question time, and manage context panel on navigation
  useEffect(() => {
    setPendingSelection(null)
    if (phase !== 'quiz' || !question) return
    // Auto-expand any context that wasn't present in the previous question
    const cids = getContextIds(question)
    const prevCids = prevContextIdRef.current
    const newCids = cids.filter((id) => !prevCids.includes(id))
    if (newCids.length > 0) {
      setContextExpanded((prev) => {
        const next = { ...prev }
        newCids.forEach((id) => { next[id] = true })
        return next
      })
    }
    prevContextIdRef.current = cids
    const prevKey = prevQuestionNumRef.current
    const currentKey = attemptKey(question)
    if (prevKey !== null && prevKey !== currentKey && questionStartRef.current) {
      accQuestionTimesRef.current[prevKey] =
        (accQuestionTimesRef.current[prevKey] || 0) +
        Math.floor((Date.now() - questionStartRef.current) / 1000)
      questionStartRef.current = Date.now()
      try { localStorage.setItem('trilha-integrar-question-start', String(questionStartRef.current)) } catch {}
      setQuestionElapsed(0)
    }
    prevQuestionNumRef.current = currentKey
  }, [question, phase])

  // Timer tick
  useEffect(() => {
    if (phase !== 'quiz') return
    const id = setInterval(() => {
      if (startTimeRef.current) setTotalElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
      if (questionStartRef.current) {
        setQuestionElapsed(Math.floor((Date.now() - questionStartRef.current) / 1000))
        try { localStorage.setItem('trilha-integrar-question-start', String(questionStartRef.current)) } catch {}
      }
    }, 1000)
    return () => clearInterval(id)
  }, [phase])

  // Restore session on mount
  useEffect(() => {
    const saved = localStorage.getItem('user')
    const savedToken = localStorage.getItem('token')
    if (saved && savedToken) {
      setUser(JSON.parse(saved))
      setToken(savedToken)
      setPhase('home')
      return
    }
    // Guest mode: deeplink de jogo (/milhao, /jogos, /jogos/milhao) entra direto
    // na Home com a aba Jogos visível, sem passar pela tela de login.
    if (typeof window !== 'undefined') {
      const p = window.location.pathname.replace(/^\/+|\/+$/g, '')
      if (pendingGameMode || p === 'jogos' || p === 'jogos/milhao' || p === 'milhao') {
        setPhase('home')
      }
    }
  }, [])

  // Check daily challenge completion status on home load
  useEffect(() => {
    if (phase !== 'home' || !token) return
    fetch('/api/daily-challenge', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data.completed) {
          setDailyChallengeResult({ score: data.completed.score, total: data.completed.total })
        }
      })
      .catch(() => {})
  }, [phase, token])

  // Fetch past results on home load
  useEffect(() => {
    if (phase !== 'home' || !token) return
    fetch('/api/results', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(rows => setUserResults(Array.isArray(rows) ? rows : []))
      .catch(() => {})
  }, [phase, token])

  const questionIndex = useMemo(() => {
    if (!question) return -1
    return sortedQuestions.findIndex((q) => q.number === question.number && (q.language ?? null) === (question.language ?? null))
  }, [question, sortedQuestions])

  const railRef = useRef(null)
  const railInnerRef = useRef(null)

  const scrollRail = useCallback((dir) => {
    const inner = railInnerRef.current
    if (!inner) return
    const firstBtn = inner.querySelector('.question-rail-btn')
    if (!firstBtn) return
    const step = firstBtn.getBoundingClientRect().height + (parseFloat(getComputedStyle(inner).gap) || 0)
    inner.scrollBy({ top: dir * step * 4, behavior: 'smooth' })
  }, [])

  useLayoutEffect(() => {
    const inner = railInnerRef.current
    if (!inner || !question) return
    const currentBtn = inner.querySelector('.question-rail-btn--current')
    if (!currentBtn) return
    const btnTop    = currentBtn.offsetTop
    const btnHeight = currentBtn.offsetHeight
    inner.scrollTop = btnTop - inner.clientHeight / 2 + btnHeight / 2
  }, [question, sortedQuestions])

  const next = useCallback(() => {
    if (!question || sortedQuestions.length === 0) return
    const idx = sortedQuestions.findIndex((q) => q.number === question.number && (q.language ?? null) === (question.language ?? null))
    if (idx < 0 || idx >= sortedQuestions.length - 1) return
    setQuestion(sortedQuestions[idx + 1])
  }, [question, sortedQuestions])

  const prev = useCallback(() => {
    if (!question || sortedQuestions.length === 0) return
    const idx = sortedQuestions.findIndex((q) => q.number === question.number && (q.language ?? null) === (question.language ?? null))
    if (idx <= 0) return
    setQuestion(sortedQuestions[idx - 1])
  }, [question, sortedQuestions])

  const goToQuestion = useCallback((q) => setQuestion(q), [])

  const pickAlternative = useCallback((letter) => {
    if (!question) return
    const qKey = attemptKey(question)
    setAttempts((a) => {
      if (a[qKey]) return a
      const isAnnulled = question.answer === 'annulled'
      const correct = !isAnnulled && letter === question.answer
      const next = { ...a, [qKey]: { selected: letter, correct, annulled: isAnnulled } }
      saveAttemptsToSession(next)
      return next
    })
    const isAnnulled = question.answer === 'annulled'
    playFeedbackSound(!isAnnulled && letter === question.answer, soundMuted || !showAnswer)
  }, [question, soundMuted])

  const confirmAnswer = useCallback(() => {
    if (!pendingSelection) return
    pickAlternative(pendingSelection)
    setPendingSelection(null)
  }, [pendingSelection, pickAlternative])

  // Auto-save session whenever answers or current question change
  useEffect(() => {
    if (phase !== 'quiz' || !question) return
    const sessionData = isDailyChallenge
      ? {
          isDailyChallenge: true,
          dailyChallengePractice,
          dailyQuestionRefs: questions.map((q) => ({ area: q.area, year: q.year, test: q.test, number: q.number })),
        }
      : selectedArea
        ? { isAreaMode: true, selectedArea, selectedTag, selectedDisciplina, areaQuestionRefs: questions.map((q) => ({ area: q.area, year: q.year, test: q.test, number: q.number })) }
        : { selectedTest, selectedYear, selectedDay }
    savePausedSession({
      ...sessionData,
      foreignLang,
      currentNumber: question.number,
      currentKey: attemptKey(question),
      attempts,
      totalElapsed,
      questionTimes,
    })
  // totalElapsed ticks every second — exclude to avoid writing on every tick.
  // It is saved precisely when pausing or finishing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, question?.number, attempts])

  const DAY_AREAS = {
    1: ['linguagens', 'humanas'],
    2: ['math', 'nature'],
  }

  async function handleClearHistory() {
    setClearHistoryLoading(true)
    try {
      await fetch('/api/results', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      // Also clear local session state
      sessionStorage.removeItem(ATTEMPTS_SESSION_KEY)
      localStorage.removeItem(PAUSED_SESSION_KEY)
      setAttempts({})
    } finally {
      setClearHistoryLoading(false)
      setClearHistoryConfirm(false)
    }
  }

  function handleLogout() {
    setUser(null)
    setToken(null)
    localStorage.removeItem('user')
    localStorage.removeItem('token')
    setPhase('login')
  }

  const loadAdminStats = useCallback(async () => {
    setAdminLoading(true)
    setAdminError('')
    try {
      const res = await fetch('/api/admin/stats', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) { setAdminError(data.error ?? 'Erro'); return }
      setAdminStats(data)
    } catch {
      setAdminError('Erro de conexão')
    } finally {
      setAdminLoading(false)
    }
  }, [token])

  // Auto-load admin stats when the Administre tab activates (admins only, fetched lazily once).
  useEffect(() => {
    if (activeTab !== 'administre') return
    if (user?.role !== 'admin') return
    if (adminStats || adminLoading) return
    loadAdminStats()
  }, [activeTab, user?.role, adminStats, adminLoading, loadAdminStats])

  const pauseQuiz = useCallback(() => {
    // Pause only persists for a full ENEM/UFSC exam. Other modes exit cleanly
    // to home and never leave a "Retomar prova" stub.
    const pausable = !gameMode
      && !isDailyChallenge
      && !selectedArea
      && selectedTest && selectedTest !== 'Integrar'
      && selectedYear != null
      && typeof selectedDay === 'number'
    if (!pausable) {
      clearPausedSession()
      startTimeRef.current = null
      questionStartRef.current = null
      try { localStorage.removeItem('trilha-integrar-question-start') } catch {}
      setPhase('home')
      return
    }
    // Snapshot times before leaving
    if (questionStartRef.current && question) {
      accQuestionTimesRef.current[question.number] =
        (accQuestionTimesRef.current[question.number] || 0) +
        Math.floor((Date.now() - questionStartRef.current) / 1000)
    }
    const currentTotal = startTimeRef.current
      ? Math.floor((Date.now() - startTimeRef.current) / 1000)
      : totalElapsed
    savePausedSession({
      selectedTest,
      selectedYear,
      selectedDay,
      foreignLang,
      currentNumber: question?.number,
      currentKey: question ? attemptKey(question) : null,
      attempts,
      totalElapsed: currentTotal,
      questionTimes: { ...accQuestionTimesRef.current },
    })
    startTimeRef.current   = null
    questionStartRef.current = null
    try { localStorage.removeItem('trilha-integrar-question-start') } catch {}
    setPhase('home')
  }, [question, totalElapsed, attempts, selectedTest, selectedYear, selectedDay, selectedArea, foreignLang, gameMode, isDailyChallenge])

  const resumeQuiz = useCallback(() => {
    const saved = readPausedSession()
    if (!saved) return
    const lang = saved.foreignLang ?? 'en'

    let sorted = []
    const variants = {}

    if (saved.isDailyChallenge && saved.dailyQuestionRefs) {
      const resolved = []
      for (const qRef of saved.dailyQuestionRefs) {
        const matches = allQuestions.filter(
          (q) => q.area === qRef.area && q.year === qRef.year &&
                  q.test === qRef.test && q.number === qRef.number
        )
        for (const q of matches) {
          if (q.language) {
            if (!variants[q.number]) variants[q.number] = {}
            variants[q.number][q.language] = q
          }
          resolved.push(q)
        }
      }
      sorted = resolved.filter((q) => !q.language || q.language === lang)
    } else if (saved.isAreaMode && saved.areaQuestionRefs) {
      const resolved = []
      for (const qRef of saved.areaQuestionRefs) {
        const matches = allQuestions.filter(
          (q) => q.area === qRef.area && q.year === qRef.year &&
                  q.test === qRef.test && q.number === qRef.number
        )
        resolved.push(...matches)
      }
      sorted = resolved.filter((q) => !q.language || q.language === lang)
      setSelectedArea(saved.selectedArea)
      setSelectedTag(saved.selectedTag ?? null)
    } else if (saved.selectedTest === 'Integrar') {
      const i = saved.selectedDay?.indexOf('::') ?? -1
      if (i === -1) { clearPausedSession(); return }
      const integrarTeacher = saved.selectedDay.slice(0, i)
      const integrarSetName = saved.selectedDay.slice(i + 2)
      const filtered = allQuestions.filter((q) =>
        q.test === 'Integrar' &&
        q.day === integrarSetName &&
        q.teacher === integrarTeacher
      )
      filtered.forEach((q) => {
        if (q.language) {
          if (!variants[q.number]) variants[q.number] = {}
          variants[q.number][q.language] = q
        }
      })
      const deduped = filtered.filter((q) => !q.language || q.language === lang)
      sorted = [...deduped].sort((a, b) => a.number - b.number)
      setSelectedTest('Integrar')
      setSelectedDay(saved.selectedDay)
    } else {
      const areas    = DAY_AREAS[saved.selectedDay]
      if (!areas) { clearPausedSession(); return }
      const filtered = allQuestions.filter((q) =>
        q.test === saved.selectedTest &&
        q.year === saved.selectedYear &&
        areas.includes(q.area)
      )
      filtered.forEach((q) => {
        if (q.language) {
          if (!variants[q.number]) variants[q.number] = {}
          variants[q.number][q.language] = q
        }
      })
      const deduped = filtered.filter((q) => !q.language || q.language === lang)
      sorted = [...deduped].sort((a, b) => a.number - b.number)
    }

    langVariantsRef.current = variants
    const currentQ = (saved.currentKey && sorted.find((q) => attemptKey(q) === saved.currentKey))
      ?? sorted.find((q) => q.number === saved.currentNumber)
      ?? sorted[0]
    if (!currentQ) return
    const restoredAttempts = migrateNumericKeyedMap(saved.attempts, sorted)
    const restoredTimes = migrateNumericKeyedMap(saved.questionTimes, sorted)

    if (!saved.isDailyChallenge && !saved.isAreaMode) {
      setSelectedTest(saved.selectedTest)
      setSelectedYear(saved.selectedYear)
      setSelectedDay(saved.selectedDay)
    }
    setForeignLang(lang)
    setQuestions(sorted)
    setQuestion(currentQ)
    setAttempts(restoredAttempts)
    saveAttemptsToSession(restoredAttempts)
    setTotalElapsed(saved.totalElapsed ?? 0)
    setQuestionTimes(restoredTimes)
    accQuestionTimesRef.current    = { ...restoredTimes }
    const now = Date.now()
    startTimeRef.current           = now - (saved.totalElapsed ?? 0) * 1000
    questionStartRef.current       = now
    prevQuestionNumRef.current     = null
    if (saved.isDailyChallenge) setIsDailyChallenge(true)
    if (saved.dailyChallengePractice) setDailyChallengePractice(true)
    if (saved.selectedDisciplina) setSelectedDisciplina(saved.selectedDisciplina)
    if (saved.selectedArea) setSelectedArea(saved.selectedArea)
    if (saved.selectedTag !== undefined) setSelectedTag(saved.selectedTag)
    setPhase('quiz')
  }, [allQuestions])

  const abandonQuiz = useCallback(() => {
    clearPausedSession()
    setQuestions([])
    setQuestion(null)
    setAttempts({})
    saveAttemptsToSession({})
    setSelectedTest(null)
    setSelectedYear(null)
    setSelectedDay(null)
    setIsDailyChallenge(false)
    setSelectedArea(null)
    setSelectedTag(null)
  }, [])

  const startQuiz = useCallback(() => {
    const isIntegrarStart = selectedTest === 'Integrar'
    if (isIntegrarStart) {
      if (!selectedDay) return
    } else {
      if (!selectedTest || !selectedYear) return
      if (selectedTest === 'ENEM' && !selectedDay) return
    }
    const areas = (!isIntegrarStart && selectedDay) ? DAY_AREAS[selectedDay] : null
    // For Integrar, selectedDay is "teacher::setName"
    const [integrarTeacher, integrarSetName] = isIntegrarStart && selectedDay
      ? (() => { const i = selectedDay.indexOf('::'); return [selectedDay.slice(0, i), selectedDay.slice(i + 2)] })()
      : [null, null]

    const filtered = allQuestions
      .filter((q) => q.test === selectedTest)
      .filter((q) => isIntegrarStart
        ? q.day === integrarSetName && q.teacher === integrarTeacher
        : q.year === selectedYear)
      .filter((q) => !areas || areas.includes(q.area))
    if (filtered.length === 0) return

    // Build language variant lookup and deduplicate
    const variants = {}
    filtered.forEach((q) => {
      if (q.language) {
        if (!variants[q.number]) variants[q.number] = {}
        variants[q.number][q.language] = q
      }
    })
    langVariantsRef.current = variants

    // Keep only the active language for questions that have variants
    const deduped = filtered.filter(
      (q) => !q.language || q.language === foreignLang
    )
    const sorted = [...deduped].sort((a, b) => a.number - b.number)

    clearPausedSession()
    setAttempts({})
    saveAttemptsToSession({})
    const now = Date.now()
    startTimeRef.current = now
    questionStartRef.current = now
    accQuestionTimesRef.current = {}
    prevQuestionNumRef.current = null
    setQuestions(sorted)
    setQuestion(sorted[0])
    setTotalElapsed(0)
    setQuestionElapsed(0)
    setPhase('quiz')
  }, [allQuestions, selectedTest, selectedYear, selectedDay, foreignLang])

  // Open a single ENEM question in study mode (used by the Pesquise tab).
  const startSingleQuestionStudy = useCallback((rawQ) => {
    if (!rawQ) return
    const match = allQuestions.find(q =>
      q.test === 'ENEM' && q.year === rawQ.year && q.area === rawQ.area && q.number === rawQ.number
    )
    const studyQ = match ?? rawQ
    clearPausedSession()
    setAttempts({})
    saveAttemptsToSession({})
    const now = Date.now()
    startTimeRef.current = now
    questionStartRef.current = now
    accQuestionTimesRef.current = {}
    prevQuestionNumRef.current = null
    setQuestions([studyQ])
    setQuestion(studyQ)
    setTotalElapsed(0)
    setQuestionElapsed(0)
    setPhase('quiz')
  }, [allQuestions])

  const startDailyChallenge = useCallback(async (opts = {}) => {
    const { practice = false } = opts
    setDailyChallengeLoading(true)
    setDailyChallengeError(null)
    if (!practice) setDailyChallengeResult(null)
    try {
      // Check if today's challenge exists and if user already completed it
      const res = await fetch('/api/daily-challenge', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Falha ao buscar desafio (HTTP ${res.status})`)

      if (data.completed && !practice) {
        setDailyChallengeResult({ score: data.completed.score, total: data.completed.total })
        return
      }

      let questionRefs = data.questions

      if (!questionRefs) {
        // First access today — send candidates so server can create the challenge
        if (allQuestions.length === 0) throw new Error('Questões ainda carregando, tente em instantes')
        const seen = new Set()
        const candidates = allQuestions
          .filter((q) => {
            const key = `${q.area}:${q.year}:${q.test}:${q.number}`
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })
          .map((q) => ({ area: q.area, year: q.year, test: q.test, number: q.number }))

        const postRes = await fetch('/api/daily-challenge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ candidates }),
        })
        const postData = await postRes.json().catch(() => ({}))
        if (!postRes.ok) throw new Error(postData.error || `Falha ao criar desafio (HTTP ${postRes.status})`)

        if (postData.completed && !practice) {
          setDailyChallengeResult({ score: postData.completed.score, total: postData.completed.total })
          return
        }
        questionRefs = postData.questions
      }

      if (!questionRefs?.length) throw new Error('Nenhuma questão disponível para o desafio')

      // Resolve question objects from the local question pool
      const resolved = []
      const variants = {}
      for (const qRef of questionRefs) {
        const matches = allQuestions.filter(
          (q) => q.area === qRef.area && q.year === qRef.year &&
                  q.test === qRef.test && q.number === qRef.number
        )
        for (const q of matches) {
          if (q.language) {
            if (!variants[q.number]) variants[q.number] = {}
            variants[q.number][q.language] = q
          }
          resolved.push(q)
        }
      }

      langVariantsRef.current = variants
      const sorted = resolved.filter((q) => !q.language || q.language === foreignLang)
      if (sorted.length === 0) throw new Error('Não foi possível montar o desafio (questões não encontradas localmente)')

      clearPausedSession()
      setAttempts({})
      saveAttemptsToSession({})
      const now = Date.now()
      startTimeRef.current       = now
      questionStartRef.current   = now
      accQuestionTimesRef.current = {}
      prevQuestionNumRef.current = null
      setIsDailyChallenge(true)
      setDailyChallengePractice(practice)
      setQuestions(sorted)
      setQuestion(sorted[0])
      setTotalElapsed(0)
      setQuestionElapsed(0)
      setPhase('quiz')
    } catch (err) {
      console.error('Erro ao carregar desafio diário:', err)
      setDailyChallengeError(err?.message || 'Erro desconhecido ao carregar o desafio')
    } finally {
      setDailyChallengeLoading(false)
    }
  }, [allQuestions, token, foreignLang])

  const startDisciplinaQuiz = useCallback((disciplina, opts = {}) => {
    const { allowMultidisciplinar: allowMulti = true, tags = [], length = 10 } = opts
    if (!disciplina) return
    // "Inglês"/"Espanhol" pin the variant — picking one must show that language's
    // questions even if the global lang toggle is currently on the other side.
    const langForDisciplina = disciplina === 'ingles' ? 'en'
      : disciplina === 'espanhol' ? 'es'
      : foreignLang
    const wantedTags = new Set(tags)
    const pool = allQuestions.filter((q) => {
      const qDisc = q.disciplinas ?? []
      if (!qDisc.includes(disciplina)) return false
      if (!allowMulti && qDisc.length > 1) return false
      if (wantedTags.size > 0 && !(q.tags ?? []).some((t) => wantedTags.has(t))) return false
      return true
    })
    if (pool.length === 0) return

    const variants = {}
    pool.forEach((q) => {
      if (q.language) {
        if (!variants[q.number]) variants[q.number] = {}
        variants[q.number][q.language] = q
      }
    })
    langVariantsRef.current = variants
    if (langForDisciplina !== foreignLang) setForeignLang(langForDisciplina)

    const deduped = pool.filter((q) => !q.language || q.language === langForDisciplina)
    const shuffled = [...deduped]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    const picked = length === 'all' ? shuffled : shuffled.slice(0, length)

    clearPausedSession()
    setAttempts({})
    saveAttemptsToSession({})
    setSelectedArea(DISCIPLINA_AREA[disciplina] ?? null)
    setSelectedTag(tags.length === 1 ? tags[0] : null)
    setExpandedArea(null)
    setIsDailyChallenge(false)
    const now = Date.now()
    startTimeRef.current = now
    questionStartRef.current = now
    accQuestionTimesRef.current = {}
    prevQuestionNumRef.current = null
    setQuestions(picked)
    setQuestion(picked[0])
    setTotalElapsed(0)
    setQuestionElapsed(0)
    setPhase('quiz')
  }, [allQuestions, foreignLang])

  const switchLang = useCallback((lang) => {
    if (!question?.language || lang === foreignLang) return
    const variant = langVariantsRef.current[question.number]?.[lang]
    if (!variant) return
    setForeignLang(lang)
    setQuestion(variant)
    setQuestions((prev) => prev.map((q) => q.number === variant.number ? variant : q))
    setPendingSelection(null)
  }, [question, foreignLang])

  // ── Jogos: pool builder + start/advance/end helpers ────────────────────────
  const buildGamePool = useCallback((disciplina, mode = 'streak') => {
    const effectiveLang = disciplina === 'ingles' ? 'en'
      : disciplina === 'espanhol' ? 'es'
      : foreignLang
    const pool = allQuestions.filter((q) => {
      if (q.test !== 'ENEM') return false  // Games draw from ENEM bank only
      if (q.answer === 'annulled') return false
      if (q.language && q.language !== effectiveLang) return false
      if (disciplina && !(q.disciplinas ?? []).includes(disciplina)) return false
      return true
    })
    if (mode === 'milionario') {
      // Build a deliberate difficulty ramp: pick exactly MILIONARIO_TOTAL_LEVELS
      // questions, level i targeting interpolated difficulty between the easiest
      // and hardest available. Bucket by difficulty, shuffle within each bucket,
      // then for each level grab from the bucket closest to the target.
      const buckets = {}
      for (const q of pool) {
        const d = normalizeDifficulty(q.difficulty)
        if (!buckets[d]) buckets[d] = []
        buckets[d].push(q)
      }
      for (const k of Object.keys(buckets)) {
        const arr = buckets[k]
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[arr[i], arr[j]] = [arr[j], arr[i]]
        }
      }
      // Pool size: 15 niveis + 3 buffer para pulos. Resta um pequeno extra
      // caso o jogador acerte e queira reshuffle (raro — encerra em 15 acertos).
      const queueSize = MILIONARIO_TOTAL_LEVELS + 3
      const picked = []
      for (let i = 0; i < queueSize; i++) {
        const available = Object.keys(buckets)
          .map(Number)
          .filter((d) => buckets[d].length > 0)
        if (available.length === 0) break
        const min = Math.min(...available)
        const max = Math.max(...available)
        // Map slot index onto the 0..1 ramp using only os 17 níveis "reais" —
        // buffer slots (>=17) keep targeting the hardest end.
        const idx = Math.min(i, MILIONARIO_TOTAL_LEVELS - 1)
        const t = MILIONARIO_TOTAL_LEVELS === 1 ? 0 : idx / (MILIONARIO_TOTAL_LEVELS - 1)
        // Variabilidade nos primeiros níveis: 20% de chance de subir o alvo
        // em 1–2 buckets, evitando que toda a fase inicial venha do mesmo
        // bucket (ex: tudo dificuldade 1). Cap em `max` pra não estourar.
        let target = min + t * (max - min)
        if (Math.random() < 0.20) target = Math.min(max, target + 1 + Math.random())
        let best = available[0]
        let bestDist = Math.abs(available[0] - target)
        for (const d of available) {
          const dist = Math.abs(d - target)
          if (dist < bestDist) { bestDist = dist; best = d }
        }
        picked.push(buckets[best].pop())
      }
      return picked
    }
    const shuffled = [...pool]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }, [allQuestions, foreignLang])

  const advanceGameQuestion = useCallback(() => {
    gameQueueIndexRef.current += 1
    let next = gameQueueRef.current[gameQueueIndexRef.current]
    if (!next) {
      // Pool exhausted — reshuffle and continue
      const reshuffled = [...gameQueueRef.current]
      for (let i = reshuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[reshuffled[i], reshuffled[j]] = [reshuffled[j], reshuffled[i]]
      }
      gameQueueRef.current = reshuffled
      gameQueueIndexRef.current = 0
      next = reshuffled[0]
    }
    if (!next) return
    setQuestion(next)
    setQuestions((prev) => [...prev, next])
    setPendingSelection(null)
    // Reset per-question Milhão help state
    setMilEliminatedLetters([])
    setMilCartasDeck([])
    setMilCartasPickedPos(null)
    setMilUnivVotes(null)
    setMilPlacasVotes(null)
    setMilActiveHelp(null)
    questionStartRef.current = Date.now()
  }, [])

  const endGame = useCallback(() => {
    if (gameAdvanceTimerRef.current) {
      clearTimeout(gameAdvanceTimerRef.current)
      gameAdvanceTimerRef.current = null
    }
    const durationSecs = gameStartTsRef.current
      ? Math.floor((Date.now() - gameStartTsRef.current) / 1000)
      : 0
    const isMil = gameMode === 'milionario'
    setGameFinalStats({
      mode: gameMode,
      streak: gameStreak,
      correct: isMil ? milLevel : (gameMode === 'streak' ? gameStreak : gameCorrect),
      wrongs: gameWrongs,
      durationSecs,
      disciplina: gameDisciplina,
      blitzMinutes: gameBlitzSecsRef.current > 0 ? Math.round(gameBlitzSecsRef.current / 60) : null,
      milWon: isMil && milLevel >= MILIONARIO_TOTAL_LEVELS,
      milPrize: isMil ? (milLevel > 0 ? MILIONARIO_PRIZES[milLevel - 1] : 0) : null,
      milLevelReached: isMil ? milLevel : null,
      milSkipsUsed: isMil ? 3 - milSkipsLeft : null,
      milHelpsUsed: isMil ? (1 - milCardsLeft) + (1 - milUnivLeft) + (1 - milPlacasLeft) : null,
      milGaveUp: isMil,
    })
    playVoiceover('musica', soundMuted)
    setPhase('game-over')
  }, [gameMode, gameStreak, gameCorrect, gameWrongs, gameDisciplina, soundMuted,
      milLevel, milSkipsLeft, milCardsLeft, milUnivLeft, milPlacasLeft])

  const startGame = useCallback((mode, disciplina, opts = {}) => {
    const pool = buildGamePool(disciplina, mode)
    if (pool.length === 0) return
    gameQueueRef.current = pool
    gameQueueIndexRef.current = 0
    gameLastProcessedKeyRef.current = null
    if (gameAdvanceTimerRef.current) {
      clearTimeout(gameAdvanceTimerRef.current)
      gameAdvanceTimerRef.current = null
    }
    clearPausedSession()
    setAttempts({})
    saveAttemptsToSession({})
    setQuestionTimes({})
    accQuestionTimesRef.current = {}
    setPendingSelection(null)
    setIsDailyChallenge(false)
    setDailyChallengePractice(false)
    setSelectedArea(null)
    setSelectedTag(null)
    setSelectedTest(null)
    setSelectedYear(null)
    setSelectedDay(null)
    setGameMode(mode)
    setGameDisciplina(disciplina)
    setGameStreak(0)
    setGameCorrect(0)
    setGameWrongs(0)
    setGameFinalStats(null)
    // Milhão fresh state
    setMilLevel(0)
    setMilSkipsLeft(3)
    setMilCardsLeft(1)
    setMilUnivLeft(1)
    setMilPlacasLeft(1)
    setMilActiveHelp(null)
    setMilEliminatedLetters([])
    setMilCartasDeck([])
    setMilCartasPickedPos(null)
    setMilUnivVotes(null)
    setMilPlacasVotes(null)
    // Blitz duration in minutes — caller may override (5/10/15/20/30); default 5.
    const blitzMin = mode === 'blitz' ? (opts.blitzMinutes ?? blitzMinutes ?? 5) : 0
    const blitzSecs = blitzMin * 60
    gameBlitzSecsRef.current = blitzSecs
    setGameTimeLeft(blitzSecs)
    const now = Date.now()
    gameStartTsRef.current = now
    startTimeRef.current = now
    questionStartRef.current = now
    setQuestions([pool[0]])
    setQuestion(pool[0])
    setTotalElapsed(0)
    setQuestionElapsed(0)
    setGameConfigOpen(null)
    if (mode === 'milionario') {
      // O 'inicio' já foi disparado no clique do card (com tempo de respiro
      // pra rolar enquanto o usuário escolhe disciplina). Aqui anuncia a
      // primeira pergunta e emenda o jingle.
      playPerguntaThenJingle(0, soundMuted)
    }
    setPhase('quiz')
  }, [buildGamePool, blitzMinutes, soundMuted])

  // Auto-start a deeplinked game assim que as questões carregarem.
  // Guest pode auto-iniciar via deeplink (sem token); o save de resultado
  // só acontece se o usuário se cadastrar ao fim.
  useEffect(() => {
    if (!pendingGameMode) return
    if (!allQuestions.length) return
    if (phase === 'login') return
    startGame(pendingGameMode, null)
    setPendingGameMode(null)
  }, [pendingGameMode, allQuestions.length, phase, startGame])

  const commitGameAnswer = useCallback((letter) => {
    if (!question) return
    if (gameMode == null) return
    const qKey = attemptKey(question)
    if (attempts[qKey]) return
    if (gameLastProcessedKeyRef.current === qKey) return
    gameLastProcessedKeyRef.current = qKey
    const isAnnulled = question.answer === 'annulled'
    const correct = !isAnnulled && letter === question.answer
    const next = { ...attempts, [qKey]: { selected: letter, correct, annulled: isAnnulled } }
    setAttempts(next)
    saveAttemptsToSession(next)
    playFeedbackSound(correct, soundMuted || !showAnswer)

    if (gameMode === 'streak') {
      if (correct) {
        setGameStreak((s) => s + 1)
        gameAdvanceTimerRef.current = setTimeout(() => {
          gameAdvanceTimerRef.current = null
          advanceGameQuestion()
        }, 900)
      } else {
        // End the streak — give the user time to see the right answer
        gameAdvanceTimerRef.current = setTimeout(() => {
          gameAdvanceTimerRef.current = null
          setGameFinalStats({
            mode: 'streak',
            streak: gameStreak,
            correct: gameStreak,
            wrongs: 1,
            durationSecs: gameStartTsRef.current
              ? Math.floor((Date.now() - gameStartTsRef.current) / 1000)
              : 0,
            disciplina: gameDisciplina,
            blitzMinutes: null,
          })
          playVoiceover('musica', soundMuted)
          setPhase('game-over')
        }, 1800)
      }
    } else if (gameMode === 'blitz') {
      if (correct) {
        setGameCorrect((c) => c + 1)
        gameAdvanceTimerRef.current = setTimeout(() => {
          gameAdvanceTimerRef.current = null
          advanceGameQuestion()
        }, 600)
      } else {
        const nextWrongs = gameWrongs + 1
        setGameWrongs(nextWrongs)
        gameAdvanceTimerRef.current = setTimeout(() => {
          gameAdvanceTimerRef.current = null
          if (nextWrongs >= 3) {
            setGameFinalStats({
              mode: 'blitz',
              streak: gameStreak,
              correct: gameCorrect,
              wrongs: nextWrongs,
              durationSecs: gameStartTsRef.current
                ? Math.floor((Date.now() - gameStartTsRef.current) / 1000)
                : 0,
              disciplina: gameDisciplina,
              blitzMinutes: gameBlitzSecsRef.current > 0 ? Math.round(gameBlitzSecsRef.current / 60) : null,
            })
            playVoiceover('musica', soundMuted)
            setPhase('game-over')
          } else {
            advanceGameQuestion()
          }
        }, 900)
      }
    } else if (gameMode === 'milionario') {
      if (correct) {
        const nextLevel = milLevel + 1
        setMilLevel(nextLevel)
        setGameCorrect((c) => c + 1)
        playVoiceover(pickVoiceoverKey('acerto'), soundMuted)
        gameAdvanceTimerRef.current = setTimeout(() => {
          gameAdvanceTimerRef.current = null
          if (nextLevel >= MILIONARIO_TOTAL_LEVELS) {
            playVoiceover('milhao', soundMuted, () => playVoiceover('musica', soundMuted))
            setGameFinalStats({
              mode: 'milionario',
              streak: nextLevel,
              correct: nextLevel,
              wrongs: 0,
              durationSecs: gameStartTsRef.current
                ? Math.floor((Date.now() - gameStartTsRef.current) / 1000)
                : 0,
              disciplina: gameDisciplina,
              blitzMinutes: null,
              milWon: true,
              milPrize: MILIONARIO_PRIZES[MILIONARIO_TOTAL_LEVELS - 1],
              milLevelReached: nextLevel,
              milSkipsUsed: 3 - milSkipsLeft,
              milHelpsUsed: (1 - milCardsLeft) + (1 - milUnivLeft) + (1 - milPlacasLeft),
            })
            setPhase('game-over')
          } else {
            advanceGameQuestion()
            setTimeout(() => playPerguntaThenJingle(nextLevel, soundMuted), 400)
          }
        }, 900)
      } else {
        // Errou — game over. Prêmio = último patamar (cofre) confirmado.
        playVoiceover('erro', soundMuted, () => playVoiceover('musica', soundMuted))
        const reachedLevel = milLevel
        const prize = getMilLossPrize(reachedLevel)
        gameAdvanceTimerRef.current = setTimeout(() => {
          gameAdvanceTimerRef.current = null
          setGameFinalStats({
            mode: 'milionario',
            streak: reachedLevel,
            correct: reachedLevel,
            wrongs: 1,
            durationSecs: gameStartTsRef.current
              ? Math.floor((Date.now() - gameStartTsRef.current) / 1000)
              : 0,
            disciplina: gameDisciplina,
            blitzMinutes: null,
            milWon: false,
            milStopped: false,
            milPrize: prize,
            milLevelReached: reachedLevel,
            milSkipsUsed: 3 - milSkipsLeft,
            milHelpsUsed: (1 - milCardsLeft) + (1 - milUnivLeft) + (1 - milPlacasLeft),
          })
          setPhase('game-over')
        }, 1800)
      }
    }
  }, [
    question, gameMode, attempts, advanceGameQuestion, soundMuted, showAnswer,
    gameStreak, gameCorrect, gameWrongs, gameDisciplina,
    milLevel, milSkipsLeft, milCardsLeft, milUnivLeft, milPlacasLeft,
  ])

  // Milhão: pular questão (ignora a resposta atual e avança)
  const milSkipQuestion = useCallback(() => {
    if (gameMode !== 'milionario' || milSkipsLeft <= 0) return
    if (gameAdvanceTimerRef.current) {
      clearTimeout(gameAdvanceTimerRef.current)
      gameAdvanceTimerRef.current = null
    }
    setMilSkipsLeft((n) => n - 1)
    playVoiceover(pickVoiceoverKey('pulo'), soundMuted)
    // Skip without crediting/penalizing — advance to next question
    advanceGameQuestion()
  }, [gameMode, milSkipsLeft, advanceGameQuestion, soundMuted])

  // Milhão: ativar uma ajuda (cartas, universitários, placas)
  const milUseHelp = useCallback((kind) => {
    if (gameMode !== 'milionario' || !question) return
    if (kind === 'cartas') {
      if (milCardsLeft <= 0) return
      // Deal a fresh 5-card deck. The player will pick exactly one card —
      // its face value (A=1, 2-4, K=0) decides how many wrong alternatives
      // are eliminated. Actual letters are chosen at pick time.
      setMilCartasDeck(makeMilCartasDeck())
      setMilCartasPickedPos(null)
      setMilEliminatedLetters([])
      setMilCardsLeft(0)
      setMilActiveHelp('cartas')
      playVoiceover('cartas', soundMuted)
    } else if (kind === 'univ') {
      if (milUnivLeft <= 0) return
      setMilUnivVotes(makeMilUnivVotes(question))
      setMilUnivLeft(0)
      setMilActiveHelp('univ')
      playVoiceover('universitarios', soundMuted)
    } else if (kind === 'placas') {
      if (milPlacasLeft <= 0) return
      setMilPlacasVotes(makeMilPlacasVotes(question))
      setMilPlacasLeft(0)
      setMilActiveHelp('placas')
      playVoiceover('plateia', soundMuted)
    }
  }, [gameMode, question, milCardsLeft, milUnivLeft, milPlacasLeft, soundMuted])

  // Milhão Cartas: jogador escolhe UMA carta do baralho (5 cartas: A/2/3/4/K).
  // O valor da carta define quantas erradas saem (A=1, 2-4, K=0).
  const milPickCartasCard = useCallback((position) => {
    if (gameMode !== 'milionario' || !question) return
    if (milActiveHelp !== 'cartas') return
    if (milCartasPickedPos !== null) return
    const card = milCartasDeck[position]
    if (!card) return
    const count = MIL_CARTAS_ELIMINATES[card.value] ?? 0
    setMilCartasPickedPos(position)
    setMilEliminatedLetters(pickMilCartasEliminated(question, count))
  }, [gameMode, question, milActiveHelp, milCartasPickedPos, milCartasDeck])

  // Milhão: parar e levar o que já confirmou. Encerra com milStopped=true e
  // prêmio = último nível confirmado (getMilStopPrize).
  const milStopGame = useCallback(() => {
    if (gameMode !== 'milionario') return
    if (gameAdvanceTimerRef.current) {
      clearTimeout(gameAdvanceTimerRef.current)
      gameAdvanceTimerRef.current = null
    }
    playVoiceover('parou', soundMuted, () => playVoiceover('musica', soundMuted))
    const durationSecs = gameStartTsRef.current
      ? Math.floor((Date.now() - gameStartTsRef.current) / 1000)
      : 0
    setGameFinalStats({
      mode: 'milionario',
      streak: milLevel,
      correct: milLevel,
      wrongs: 0,
      durationSecs,
      disciplina: gameDisciplina,
      blitzMinutes: null,
      milWon: false,
      milStopped: true,
      milPrize: getMilStopPrize(milLevel),
      milLevelReached: milLevel,
      milSkipsUsed: 3 - milSkipsLeft,
      milHelpsUsed: (1 - milCardsLeft) + (1 - milUnivLeft) + (1 - milPlacasLeft),
    })
    setPhase('game-over')
  }, [gameMode, milLevel, gameDisciplina, milSkipsLeft, milCardsLeft, milUnivLeft, milPlacasLeft, soundMuted])

  const exitGame = useCallback(() => {
    if (gameAdvanceTimerRef.current) {
      clearTimeout(gameAdvanceTimerRef.current)
      gameAdvanceTimerRef.current = null
    }
    setGameMode(null)
    setGameDisciplina(null)
    setGameFinalStats(null)
    setGameStreak(0)
    setGameCorrect(0)
    setGameWrongs(0)
    setGameTimeLeft(0)
    gameLastProcessedKeyRef.current = null
    gameQueueRef.current = []
    gameQueueIndexRef.current = 0
    gameStartTsRef.current = null
    setQuestions([])
    setQuestion(null)
    setAttempts({})
    saveAttemptsToSession({})
    setPendingSelection(null)
    setPhase('home')
  }, [])

  // Blitz timer: count down, end on zero
  useEffect(() => {
    if (gameMode !== 'blitz' || phase !== 'quiz' || !gameStartTsRef.current) return
    const totalSecs = gameBlitzSecsRef.current || 5 * 60
    const id = setInterval(() => {
      const elapsed = (Date.now() - gameStartTsRef.current) / 1000
      const left = Math.max(0, totalSecs - elapsed)
      setGameTimeLeft(Math.ceil(left))
      if (left <= 0) {
        clearInterval(id)
        if (gameAdvanceTimerRef.current) {
          clearTimeout(gameAdvanceTimerRef.current)
          gameAdvanceTimerRef.current = null
        }
        setGameFinalStats({
          mode: 'blitz',
          streak: gameStreak,
          correct: gameCorrect,
          wrongs: gameWrongs,
          durationSecs: totalSecs,
          disciplina: gameDisciplina,
          blitzMinutes: Math.round(totalSecs / 60),
        })
        playVoiceover('musica', soundMuted)
        setPhase('game-over')
      }
    }, 250)
    return () => clearInterval(id)
  }, [gameMode, phase, gameStreak, gameCorrect, gameWrongs, gameDisciplina])

  const disciplinaMatchingQuestions = useMemo(() => {
    if (!selectedDisciplina) return []
    const effectiveLang = selectedDisciplina === 'ingles' ? 'en'
      : selectedDisciplina === 'espanhol' ? 'es'
      : foreignLang
    return allQuestions.filter((q) => {
      if (q.language && q.language !== effectiveLang) return false
      const qd = q.disciplinas ?? []
      if (!qd.includes(selectedDisciplina)) return false
      if (!allowMultidisciplinar && qd.length > 1) return false
      return true
    })
  }, [allQuestions, selectedDisciplina, allowMultidisciplinar, foreignLang])

  const availableSubtags = useMemo(() => {
    const set = new Set()
    for (const q of disciplinaMatchingQuestions) {
      for (const t of q.tags ?? []) set.add(t)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [disciplinaMatchingQuestions])

  const disciplinaPoolSize = useMemo(() => {
    if (disciplinaMatchingQuestions.length === 0) return 0
    if (selectedSubtags.length === 0) return disciplinaMatchingQuestions.length
    const wantedTags = new Set(selectedSubtags)
    return disciplinaMatchingQuestions.filter(
      (q) => (q.tags ?? []).some((t) => wantedTags.has(t))
    ).length
  }, [disciplinaMatchingQuestions, selectedSubtags])

  const finishQuiz = useCallback(() => {
    if (questionStartRef.current && question) {
      const qKey = attemptKey(question)
      accQuestionTimesRef.current[qKey] =
        (accQuestionTimesRef.current[qKey] || 0) +
        Math.floor((Date.now() - questionStartRef.current) / 1000)
    }
    const finalTotal = startTimeRef.current
      ? Math.floor((Date.now() - startTimeRef.current) / 1000)
      : totalElapsed
    setTotalElapsed(finalTotal)
    setQuestionTimes({ ...accQuestionTimesRef.current })
    startTimeRef.current = null
    questionStartRef.current = null
    try { localStorage.removeItem('trilha-integrar-question-start') } catch {}
    clearPausedSession()

    setTriScores(calcTriScores(questions, attempts))

    // Persist result to DB (fire-and-forget — never blocks UI)
    if (token) {
      const score = Object.values(attempts).filter((a) => a.correct).length
      const scorableTotal = questions.filter((q) => q.answer !== 'annulled').length
      if (isDailyChallenge && !dailyChallengePractice) {
        fetch('/api/daily-challenge/result', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            score,
            total: scorableTotal,
            elapsed_secs: finalTotal,
          }),
        }).catch(() => {})
      } else if (!isDailyChallenge && !selectedArea && selectedTest !== 'Integrar') {
        // Integrar results are not yet persisted (day column is INTEGER in DB;
        // Integrar uses set name strings — migration needed before tracking)
        fetch('/api/results', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            test: selectedTest,
            year: selectedYear,
            day: selectedDay,
            score,
            total: scorableTotal,
            elapsed_secs: finalTotal,
          }),
        }).catch(() => {})
      }
    }

    setSummaryView('popup')
    setPhase('summary')
  }, [question, totalElapsed, token, attempts, questions, selectedTest, selectedYear, selectedDay, selectedArea, isDailyChallenge, dailyChallengePractice])

  const stemSegments = useMemo(() => {
    if (!question) return []
    const imgs = question.images ?? []
    const letters = Object.keys(question.alternatives)
    const hasStemImg = imgs.length > 0 && imgs.length === letters.length + 1
    const altImgsOnly = imgs.length > 0 && imgs.length === letters.length
    const paths = hasStemImg ? [imgs[0]] : altImgsOnly ? [] : imgs.length > 0 ? imgs : []
    return parseStemSegments(question.text, paths)
  }, [question])

  // Stable per-question shuffled alternatives (seeded by question.number)
  const displayAlts = useMemo(() => {
    if (!question) return []
    const imgs = question.images ?? []
    const origLetters = Object.keys(question.alternatives)
    const hasStemImg = imgs.length > 0 && imgs.length === origLetters.length + 1
    const altImgsOnly = imgs.length > 0 && imgs.length === origLetters.length
    const items = origLetters.map((letter, idx) => ({
      origLetter: letter,
      rawContent: question.alternatives[letter],
      altImg: hasStemImg ? imgs[idx + 1] : altImgsOnly ? imgs[idx] : null,
    }))
    if (!randomizeAlts) {
      return items.map((item, idx) => ({ ...item, displayLabel: origLetters[idx] }))
    }
    // Seeded Fisher-Yates — stable for the same question.number
    let seed = question.number
    for (let i = items.length - 1; i > 0; i--) {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff
      const j = Math.abs(seed) % (i + 1)
      ;[items[i], items[j]] = [items[j], items[i]]
    }
    return items.map((item, idx) => ({
      ...item,
      displayLabel: String.fromCharCode(65 + idx), // A, B, C, D, E
    }))
  }, [question?.number, randomizeAlts])

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return <div className="center">Carregando...</div>

  // ── Homepage ──────────────────────────────────────────────────────────────
  if (phase === 'home') {
    const rawPaused = readPausedSession()
    // Only a paused full ENEM/UFSC exam takes over the home screen with a
    // Retomar/Abandonar choice. Stale non-exam sessions are ignored here and
    // cleared on app load.
    const pausedSession = isFullExamSession(rawPaused) ? rawPaused : null

    if (pausedSession) {
      const answeredCount = Object.keys(pausedSession.attempts ?? {}).length
      return (
        <div className="app-shell">
          <div className="home-screen">
            <div className="home-topbar">
              <span className="home-greeting">Olá, {user?.username}</span>
            </div>
            <div className="home-card">
              <div className="home-logo-wrap">
                <img
                  src="/figuras/logos/integrar-logo-transparent.png"
                  alt="Integrar"
                  className="home-logo"
                />
              </div>
              <h1 className="home-title">Prova em andamento</h1>
              <div className="paused-info">
                <p className="paused-info-line">
                  <strong>{`${pausedSession.selectedTest} ${pausedSession.selectedYear}`}</strong>
                  {' '}— Dia {pausedSession.selectedDay}
                </p>
                <p className="paused-info-line paused-info-sub">
                  {answeredCount} {answeredCount === 1 ? 'questão respondida' : 'questões respondidas'}
                  {pausedSession.totalElapsed > 0 && ` · ${formatTime(pausedSession.totalElapsed)} registrados`}
                </p>
              </div>
              <button type="button" className="home-start-btn" onClick={resumeQuiz}>
                Retomar prova
              </button>
              <button type="button" className="btn--ghost" onClick={abandonQuiz}>
                Abandonar prova
              </button>
            </div>
          </div>
        </div>
      )
    }

    const allTests = [...new Set(['ENEM', 'UFSC', ...allQuestions.map((q) => q.test).filter(Boolean)])]
    // Simule never offers Integrar (Integrar lives in Estude)
    const simuleAvailableTests = allTests.filter(t => t !== 'Integrar')
    const isIntegrar = selectedTest === 'Integrar'

    const availableYears = [...new Set(
      allQuestions
        .filter((q) => !selectedTest || q.test === selectedTest)
        .map((q) => q.year)
    )].sort((a, b) => b - a)

    // Integrar lists are available regardless of selectedTest (rendered inside Estude tab)
    const allIntegrarQs = allQuestions.filter(q => q.test === 'Integrar')
    const integrarYears = [...new Set(allIntegrarQs.map(q => q.year).filter(Boolean))].sort((a, b) => b - a)
    const integrarSetsFiltered = (() => {
      const seen = new Set()
      return allIntegrarQs
        .filter(q => !selectedIntegrarYear || q.year === selectedIntegrarYear)
        .reduce((acc, q) => {
          const key = `${q.teacher}::${q.day}`
          if (!seen.has(key)) { seen.add(key); acc.push({ name: q.day, teacher: q.teacher, year: q.year }) }
          return acc
        }, [])
    })()

    const canStart = selectedTest && (
      isIntegrar
        ? !!selectedDay
        : selectedYear && (selectedTest === 'ENEM' ? !!selectedDay : true)
    )

    // Build a lookup: "TEST-YEAR-DAY" → best result
    const resultMap = {}
    for (const r of userResults) {
      const key = `${r.test}-${r.year}-${r.day ?? 'null'}`
      if (!resultMap[key] || r.score / r.total > resultMap[key].score / resultMap[key].total) {
        resultMap[key] = r
      }
    }
    const getResult = (test, year, day = null) => resultMap[`${test}-${year}-${day ?? 'null'}`] ?? null

    const resultTier = (score, total) => {
      if (!total) return null
      if (score === total) return 'perfect'
      if (score / total >= 0.75) return 'great'
      return 'done'
    }

    const yearDone = (year) => {
      if (selectedTest !== 'ENEM') return getResult(selectedTest, year)
      return getResult(selectedTest, year, 1) || getResult(selectedTest, year, 2)
    }

    const yearTier = (year) => {
      if (selectedTest !== 'ENEM') {
        const r = getResult(selectedTest, year)
        return r ? resultTier(r.score, r.total) : null
      }
      const r1 = getResult(selectedTest, year, 1)
      const r2 = getResult(selectedTest, year, 2)
      if (!r1 && !r2) return null
      if (!r1 || !r2) return resultTier((r1 ?? r2).score, (r1 ?? r2).total)
      // Both days done — evaluate combined
      return resultTier(r1.score + r2.score, r1.total + r2.total)
    }

    const yearPercent = (year) => {
      if (selectedTest !== 'ENEM') {
        const r = getResult(selectedTest, year)
        return r && r.total ? Math.round((r.score / r.total) * 100) : null
      }
      const r1 = getResult(selectedTest, year, 1)
      const r2 = getResult(selectedTest, year, 2)
      if (!r1 && !r2) return null
      if (!r1 || !r2) {
        const r = r1 ?? r2
        return r.total ? Math.round((r.score / r.total) * 100) : null
      }
      const totalScore = r1.score + r2.score
      const totalTotal = r1.total + r2.total
      return totalTotal ? Math.round((totalScore / totalTotal) * 100) : null
    }

    return (
      <div className="app-shell">
        <div className={`home-screen home-screen--${activeTab}`}>
          {!token && (
            <div className="home-guest-banner" role="status">
              <span className="home-guest-banner-text">
                Faça login pra acessar simulados, listas e estatísticas
              </span>
              <button
                type="button"
                className="home-guest-banner-btn"
                onClick={() => setPhase('login')}
              >
                Fazer login
              </button>
            </div>
          )}
          <header className="home-header">
            <div className="home-header-row">
              <button
                type="button"
                className="home-menu-btn"
                onClick={() => setSideMenuOpen(true)}
                aria-label="Abrir menu"
                aria-expanded={sideMenuOpen}
              >
                <MenuIcon />
              </button>
              <img
                src="/figuras/logos/integrar-logo-transparent.png"
                alt="Integrar"
                className="home-header-logo"
              />
              <span className="home-header-title">Trilha Integrar</span>
              <ChangelogSection />
              <div className="home-header-actions">
                <button
                  type="button"
                  className="theme-toggle home-theme-btn"
                  onClick={() => setDark((d) => !d)}
                  aria-label="Alternar tema"
                >
                  {dark ? <SunIcon /> : <MoonIcon />}
                </button>
              </div>
            </div>
          </header>

          {sideMenuOpen && (
            <>
              <div
                className="home-side-backdrop"
                onClick={() => setSideMenuOpen(false)}
                aria-hidden
              />
              <aside
                className="home-side-menu"
                role="dialog"
                aria-label="Menu de navegação"
              >
                <div className="home-side-menu-header">
                  <span className="home-side-menu-greeting">
                    Olá, <strong>{user?.username}</strong>
                  </span>
                  <button
                    type="button"
                    className="home-side-menu-close"
                    onClick={() => setSideMenuOpen(false)}
                    aria-label="Fechar menu"
                  >
                    ×
                  </button>
                </div>
                <div className="home-side-menu-body">
                  <nav className="home-side-menu-nav" role="tablist" aria-label="Modo">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeTab === 'jogos'}
                      className={`home-side-menu-item home-side-menu-item--jogos${activeTab === 'jogos' ? ' active' : ''}`}
                      onClick={() => { switchTab('jogos'); setSideMenuOpen(false) }}
                    >
                      Jogos
                    </button>

                    {token && (
                      <>
                        <details className="home-side-menu-group">
                          <summary className="home-side-menu-item home-side-menu-group-header">
                            <span>ENEM</span>
                          </summary>
                          <div className="home-side-menu-group-items">
                            {[
                              { id: 'simule', label: 'Provas Completas' },
                              { id: 'estude', label: 'Por Matéria' },
                              { id: 'pesquise', label: 'Pesquisar' },
                            ].map(({ id, label }) => (
                              <button
                                key={id}
                                type="button"
                                role="tab"
                                aria-selected={activeTab === id}
                                className={`home-side-menu-item home-side-menu-item--sub home-side-menu-item--${id}${activeTab === id ? ' active' : ''}`}
                                onClick={() => { switchTab(id); setSideMenuOpen(false) }}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </details>

                        {[
                          { id: 'listas', label: 'Listas de Exercícios', show: true },
                          { id: 'ensine', label: 'Criar Material', show: user?.role === 'prof' || user?.role === 'admin' },
                          { id: 'administre', label: 'Administrar', show: user?.role === 'admin' },
                        ].filter((t) => t.show).map(({ id, label }) => (
                          <button
                            key={id}
                            type="button"
                            role="tab"
                            aria-selected={activeTab === id}
                            className={`home-side-menu-item home-side-menu-item--${id}${activeTab === id ? ' active' : ''}`}
                            onClick={() => { switchTab(id); setSideMenuOpen(false) }}
                          >
                            {label}
                          </button>
                        ))}
                      </>
                    )}
                    {!token && (
                      <button
                        type="button"
                        className="home-side-menu-item home-side-menu-item--login"
                        onClick={() => { setSideMenuOpen(false); setPhase('login') }}
                      >
                        Fazer login
                      </button>
                    )}
                  </nav>

                  <details className="home-side-menu-section home-side-menu-section--collapsible">
                    <summary className="home-side-menu-section-label home-side-menu-section-summary">Opções</summary>
                    <label className="home-side-toggle-row">
                      <span className="home-side-toggle-label">Embaralhar alternativas</span>
                      <span className={`options-toggle-switch${randomizeAlts ? ' on' : ''}`}>
                        <input
                          type="checkbox"
                          checked={randomizeAlts}
                          onChange={(e) => {
                            setRandomizeAlts(e.target.checked)
                            localStorage.setItem('randomize-alts', e.target.checked)
                          }}
                        />
                        <span className="options-toggle-thumb" />
                      </span>
                    </label>
                    <label className="home-side-toggle-row">
                      <span className="home-side-toggle-label">Mostrar resposta</span>
                      <span className={`options-toggle-switch${showAnswer ? ' on' : ''}`}>
                        <input
                          type="checkbox"
                          checked={showAnswer}
                          onChange={(e) => {
                            setShowAnswer(e.target.checked)
                            localStorage.setItem('show-answer', e.target.checked)
                            if (!e.target.checked) { setSoundMuted(true); localStorage.setItem('sound-muted', true) }
                          }}
                        />
                        <span className="options-toggle-thumb" />
                      </span>
                    </label>
                    <label className="home-side-toggle-row">
                      <span className="home-side-toggle-label">Mostrar dificuldade</span>
                      <span className={`options-toggle-switch${showDifficulty ? ' on' : ''}`}>
                        <input
                          type="checkbox"
                          checked={showDifficulty}
                          onChange={(e) => {
                            setShowDifficulty(e.target.checked)
                            localStorage.setItem('show-difficulty', e.target.checked)
                          }}
                        />
                        <span className="options-toggle-thumb" />
                      </span>
                    </label>
                    <label className="home-side-toggle-row">
                      <span className="home-side-toggle-label">
                        {soundMuted ? <SoundOffIcon /> : <SoundOnIcon />} Som
                      </span>
                      <span className={`options-toggle-switch${!soundMuted ? ' on' : ''}`}>
                        <input
                          type="checkbox"
                          checked={!soundMuted}
                          onChange={(e) => {
                            setSoundMuted(!e.target.checked)
                            localStorage.setItem('sound-muted', !e.target.checked)
                            if (e.target.checked && !showAnswer) { setShowAnswer(true); localStorage.setItem('show-answer', true) }
                          }}
                        />
                        <span className="options-toggle-thumb" />
                      </span>
                    </label>
                    <label className="home-side-toggle-row">
                      <span className="home-side-toggle-label">
                        {dark ? <MoonIcon /> : <SunIcon />} {dark ? 'Modo escuro' : 'Modo claro'}
                      </span>
                      <span className={`options-toggle-switch options-toggle-switch--theme${dark ? ' on' : ''}`}>
                        <input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} />
                        <span className="options-toggle-thumb" />
                      </span>
                    </label>
                    {clearHistoryConfirm ? (
                      <div className="home-side-confirm-row">
                        <span className="home-side-confirm-label">Tem certeza?</span>
                        <button
                          type="button"
                          className="options-confirm-btn options-confirm-btn--danger"
                          onClick={handleClearHistory}
                          disabled={clearHistoryLoading}
                        >
                          {clearHistoryLoading ? 'Limpando…' : 'Confirmar'}
                        </button>
                        <button
                          type="button"
                          className="options-confirm-btn"
                          onClick={() => setClearHistoryConfirm(false)}
                          disabled={clearHistoryLoading}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="home-side-clear-btn"
                        onClick={() => setClearHistoryConfirm(true)}
                      >
                        Limpar histórico
                      </button>
                    )}
                  </details>
                </div>
                <div className="home-side-menu-footer">
                  <button
                    type="button"
                    className="home-side-logout-btn"
                    onClick={() => { setSideMenuOpen(false); handleLogout() }}
                  >
                    Sair
                  </button>
                </div>
              </aside>
            </>
          )}

          <div className="home-card home-card--wide">
            {activeTab === 'estude' && (
              <div className="home-tab-content">
                <div className="home-area-section">
                  <span className="home-filter-label">Estudar por disciplina</span>

                  {/* ── Disciplina dropdown (single-select) ── */}
                  <details className="home-dropdown">
                    <summary className="home-dropdown-summary">
                      <span className="home-dropdown-label">Disciplina</span>
                      <span className={`home-dropdown-value${selectedDisciplina ? ' home-dropdown-value--filled' : ''}`}>
                        {selectedDisciplina
                          ? DISCIPLINA_LABELS[selectedDisciplina]
                          : 'Selecionar…'}
                      </span>
                    </summary>
                    <div className="home-dropdown-panel">
                      {(['linguagens', 'humanas', 'nature', 'math']).map((area) => (
                        <div key={area} className="home-dropdown-group">
                          <span className="home-dropdown-group-label">{AREA_LABELS[area]}</span>
                          {DISCIPLINAS_BY_AREA[area].map((slug) => (
                            <label key={slug} className="home-dropdown-option">
                              <input
                                type="radio"
                                name="disciplina"
                                checked={selectedDisciplina === slug}
                                onChange={(e) => {
                                  setSelectedDisciplina(slug)
                                  setSelectedSubtags([])
                                  e.currentTarget.closest('details')?.removeAttribute('open')
                                }}
                              />
                              <span>{DISCIPLINA_LABELS[slug]}</span>
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>
                  </details>

                  {/* ── Always-visible multidisciplinar toggle ── */}
                  <label className="home-toggle-row">
                    <input
                      type="checkbox"
                      checked={allowMultidisciplinar}
                      onChange={() => {
                        setSelectedSubtags([])
                        setAllowMultidisciplinar((v) => !v)
                      }}
                    />
                    <span>Incluir questões multidisciplinares</span>
                  </label>

                  {/* ── Subtag dropdown (only when disciplina chosen) ── */}
                  {selectedDisciplina && availableSubtags.length > 0 && (
                    <details className="home-dropdown">
                      <summary className="home-dropdown-summary">
                        <span className="home-dropdown-label">Subtemas</span>
                        <span className="home-dropdown-value">
                          {selectedSubtags.length === 0
                            ? `Todos (${availableSubtags.length})`
                            : selectedSubtags.length <= 2
                              ? selectedSubtags.join(', ')
                              : `${selectedSubtags.length} selecionados`}
                        </span>
                      </summary>
                      <div className="home-dropdown-panel">
                        <div className="home-dropdown-group home-dropdown-group--cols-2">
                          {availableSubtags.map((tag) => (
                            <label key={tag} className="home-dropdown-option">
                              <input
                                type="checkbox"
                                checked={selectedSubtags.includes(tag)}
                                onChange={() =>
                                  setSelectedSubtags((prev) =>
                                    prev.includes(tag)
                                      ? prev.filter((t) => t !== tag)
                                      : [...prev, tag]
                                  )
                                }
                              />
                              <span>{tag}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </details>
                  )}

                  {/* ── Quantidade ── */}
                  {selectedDisciplina && (
                    <div className="home-area-day-group">
                      <span className="home-area-day-label">
                        Quantidade <span style={{ fontWeight: 400, opacity: 0.6 }}>({disciplinaPoolSize} disponíveis)</span>
                      </span>
                      <div className="home-test-seg">
                        {[10, 20, 45, 'all'].map((n) => (
                          <button
                            key={n}
                            type="button"
                            className={`home-test-seg-btn${disciplinaQuizLength === n ? ' active' : ''}`}
                            onClick={() => setDisciplinaQuizLength(n)}
                          >
                            {n === 'all' ? 'Todas' : n}
                          </button>
                        ))}
                      </div>
                      <label className="home-area-custom-qty">
                        <span>Outra quantidade:</span>
                        <input
                          type="number"
                          min={1}
                          max={disciplinaPoolSize || undefined}
                          inputMode="numeric"
                          value={typeof disciplinaQuizLength === 'number' && ![10, 20, 45].includes(disciplinaQuizLength)
                            ? disciplinaQuizLength
                            : ''}
                          placeholder="qualquer número"
                          onChange={(e) => {
                            const raw = e.target.value
                            if (raw === '') return
                            const v = parseInt(raw, 10)
                            if (Number.isFinite(v) && v > 0) setDisciplinaQuizLength(v)
                          }}
                          onFocus={(e) => e.target.select()}
                        />
                      </label>
                    </div>
                  )}

                  {/* ── Começar button ── */}
                  {(() => {
                    const effective = disciplinaQuizLength === 'all'
                      ? disciplinaPoolSize
                      : Math.min(disciplinaQuizLength, disciplinaPoolSize)
                    const label = effective === 0
                      ? 'Começar simulado'
                      : `Começar simulado · ${effective} ${effective === 1 ? 'questão' : 'questões'}`
                    return (
                      <button
                        type="button"
                        className="home-area-pill home-area-pill--primary"
                        disabled={effective === 0}
                        onClick={() => startDisciplinaQuiz(selectedDisciplina, {
                          allowMultidisciplinar,
                          tags: selectedSubtags,
                          length: disciplinaQuizLength,
                        })}
                      >
                        {label}
                      </button>
                    )
                  })()}
                </div>

              </div>
            )}

            {activeTab === 'listas' && (
              <div className="home-tab-content">
                {allIntegrarQs.length === 0 ? (
                  <p className="home-ensine-message">
                    Nenhuma lista disponível ainda.
                  </p>
                ) : (
                  <>
                    <div className="home-filters">
                      <div className="home-filter-group">
                        <span className="home-filter-label">Listas Integrar</span>
                      </div>

                      {integrarYears.length > 0 && (
                        <div className="home-filter-group">
                          <span className="home-filter-label">Ano <span style={{ fontWeight: 400, opacity: 0.6 }}>(opcional)</span></span>
                          <div className="home-filter-pills home-year-grid">
                            {integrarYears.map((y) => (
                              <button
                                key={y}
                                type="button"
                                className={`home-filter-pill home-year-pill ${selectedIntegrarYear === y ? 'active' : ''}`}
                                onClick={() => {
                                  setSelectedIntegrarYear(prev => prev === y ? null : y)
                                  setSelectedDay(null)
                                }}
                              >
                                <span>{y}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="home-filter-group">
                        <span className="home-filter-label">Lista</span>
                        <div className="home-filter-pills">
                          {integrarSetsFiltered.length === 0 && (
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-soft)' }}>Nenhuma lista disponível</span>
                          )}
                          {integrarSetsFiltered.map(({ name, teacher, year }) => {
                            const setKey = `${teacher}::${name}`
                            const isActive = isIntegrar && selectedDay === setKey
                            return (
                              <button
                                key={setKey}
                                type="button"
                                className={`home-filter-pill home-filter-pill--wide home-day-pill ${isActive ? 'active' : ''}`}
                                onClick={() => {
                                  setSelectedTest('Integrar')
                                  setSelectedYear(year ?? null)
                                  setSelectedDay(setKey)
                                }}
                              >
                                <span className="home-day-label-text">
                                  {name}
                                  {year ? <span style={{ opacity: 0.6 }}> · {year}</span> : ''}
                                </span>
                                <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>{teacher}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>

                    {isIntegrar && !!selectedDay && (
                      <button
                        type="button"
                        className="home-start-btn"
                        onClick={startQuiz}
                      >
                        Iniciar lista
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {activeTab === 'simule' && (
              <div className="home-tab-content">
                <div className="home-filters">
                  {/* Step 1 — Prova */}
                  <div className="home-filter-group">
                    <span className="home-filter-label">Prova</span>
                    <div className="home-test-seg">
                      {simuleAvailableTests.map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={`home-test-seg-btn${selectedTest === t ? ' active' : ''}`}
                          onClick={() => {
                            setSelectedTest(t)
                            setSelectedYear(null)
                            setSelectedDay(null)
                          }}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Step 2 — Ano */}
                  <div className="home-filter-group">
                    <span className="home-filter-label">Ano</span>
                    <div className="home-filter-pills home-year-grid">
                      {availableYears.map((y) => {
                        const tier = yearTier(y)
                        const pct = yearPercent(y)
                        return (
                          <button
                            key={y}
                            type="button"
                            className={`home-filter-pill home-year-pill ${selectedYear === y ? 'active' : ''} ${tier ?? ''}`}
                            onClick={() => {
                              setSelectedYear(y)
                              setSelectedDay(null)
                            }}
                          >
                            <span className="home-year-label">
                              <span>{y}</span>
                              {tier === 'perfect' && <span className="home-year-star">★</span>}
                              {tier === 'great'   && <span className="home-year-star">✓</span>}
                              {tier === 'done'    && <span className="home-year-check">●</span>}
                            </span>
                            {pct != null && <span className="home-year-pct">{pct}%</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Step 3 — Dia (ENEM only) */}
                  {selectedTest === 'ENEM' && selectedYear && (
                    <div className="home-filter-group">
                      <span className="home-filter-label">Dia</span>
                      <div className="home-filter-pills">
                        {[1, 2].map((day) => {
                          const label = day === 1
                            ? 'Dia 1 · Linguagens e Ciências Humanas'
                            : 'Dia 2 · Matemática e Ciências da Natureza'
                          const r = getResult(selectedTest, selectedYear, day)
                          const tier = r ? resultTier(r.score, r.total) : null
                          return (
                            <button
                              key={day}
                              type="button"
                              className={`home-filter-pill home-filter-pill--wide home-day-pill ${selectedDay === day ? 'active' : ''} ${tier ?? ''}`}
                              onClick={() => setSelectedDay(day)}
                            >
                              <span className="home-day-label-text">
                                {tier === 'perfect' && <span className="home-day-tier-icon">★ </span>}
                                {tier === 'great'   && <span className="home-day-tier-icon">✓ </span>}
                                {label}
                              </span>
                              {r && (
                                <span className="home-day-result">
                                  {r.score}/{r.total} · {Math.round(r.score / r.total * 100)}%
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {selectedTest === 'ENEM' && !selectedYear && (
                    <div className="home-filter-group">
                      <span className="home-filter-label">Dia</span>
                      <div className="home-filter-pills">
                        <button type="button" className="home-filter-pill home-filter-pill--wide" disabled>
                          Dia 1 · Linguagens e Ciências Humanas
                        </button>
                        <button type="button" className="home-filter-pill home-filter-pill--wide" disabled>
                          Dia 2 · Matemática e Ciências da Natureza
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 4 — Língua estrangeira (Dia 1 ENEM only) */}
                  {selectedTest === 'ENEM' && selectedYear && selectedDay === 1 && (
                    <div className="home-filter-group">
                      <span className="home-filter-label">Língua estrangeira</span>
                      <div className="home-test-seg">
                        <button
                          type="button"
                          className={`home-test-seg-btn${foreignLang === 'en' ? ' active' : ''}`}
                          onClick={() => setForeignLang('en')}
                        >
                          🇺🇸 Inglês
                        </button>
                        <button
                          type="button"
                          className={`home-test-seg-btn${foreignLang === 'es' ? ' active' : ''}`}
                          onClick={() => setForeignLang('es')}
                        >
                          🇪🇸 Espanhol
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="home-start-btn"
                  onClick={startQuiz}
                  disabled={!canStart}
                >
                  Iniciar
                </button>
              </div>
            )}

            {activeTab === 'jogos' && (
              <div className="home-tab-content">
                <div className="jogos-grid">
                  {[
                    {
                      id: 'streak',
                      title: 'Streak',
                      tagline: 'Quantas seguidas você acerta?',
                      iconClass: 'jogo-card-icon--streak',
                      icon: '🔥',
                      rule: 'Responda até errar uma. Sem tempo, só foco.',
                    },
                    {
                      id: 'blitz',
                      title: 'Blitz',
                      tagline: '5 minutos. 3 vidas.',
                      iconClass: 'jogo-card-icon--blitz',
                      icon: '⚡',
                      rule: 'Acerte o máximo antes de errar 3 ou acabar o tempo.',
                    },
                    {
                      id: 'milionario',
                      title: 'Milhão',
                      tagline: 'Quem quer ser um milionário?',
                      iconClass: 'jogo-card-icon--milionario',
                      icon: '💰',
                      rule: 'Suba a escada de prêmios. Use ajudas e pulos.',
                    },
                    {
                      id: 'daily',
                      title: 'Desafio Diário',
                      tagline: 'Uma rodada por dia',
                      iconClass: 'jogo-card-icon--daily',
                      icon: '★',
                      rule: dailyChallengeError
                        ? `⚠ ${dailyChallengeError}`
                        : dailyChallengeLoading
                          ? 'Carregando…'
                          : dailyChallengeResult
                            ? `Feito hoje · ${dailyChallengeResult.score}/${dailyChallengeResult.total}`
                            : 'Questões selecionadas todo dia para todos.',
                    },
                  ].map(({ id, title, tagline, iconClass, icon, rule }) => {
                    const isOpen = gameConfigOpen === id
                    const isDaily = id === 'daily'
                    const best = isDaily ? 0 : bestScoreFor(scoreboards, id, blitzMinutes)
                    let bestLabel = null
                    if (best > 0) {
                      if (id === 'streak') bestLabel = `Recorde: ${best} 🔥`
                      else if (id === 'blitz') bestLabel = `Recorde (${blitzMinutes} min): ${best}`
                      else if (id === 'milionario') bestLabel = `Nível recorde: ${best}/${MILIONARIO_TOTAL_LEVELS}`
                    }
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`jogo-card jogo-card--${id}${isOpen ? ' jogo-card--open' : ''}`}
                        onClick={() => {
                          if (isDaily) {
                            startDailyChallenge({ practice: !!dailyChallengeResult })
                            return
                          }
                          // VO do Milhão começa ao clicar no card — assim o
                          // "Bem vindos ao Show" toca enquanto o usuário escolhe disciplina.
                          if (id === 'milionario' && gameConfigOpen !== id) {
                            playVoiceover('inicio', soundMuted)
                          }
                          setGameConfigOpen((prev) => prev === id ? null : id)
                        }}
                        disabled={isDaily && dailyChallengeLoading}
                      >
                        <span className={`jogo-card-icon ${iconClass}`}>{icon}</span>
                        <span className="jogo-card-title">{title}</span>
                        <span className="jogo-card-tagline">{tagline}</span>
                        <span className="jogo-card-rule">{rule}</span>
                        {bestLabel && <span className="jogo-card-best">{bestLabel}</span>}
                      </button>
                    )
                  })}
                </div>

                {gameConfigOpen && gameConfigOpen !== 'daily' && (
                  <div className={`jogo-config jogo-config--${gameConfigOpen}`}>
                    <details className="home-dropdown">
                      <summary className="home-dropdown-summary">
                        <span className="home-dropdown-label">Disciplina</span>
                        <span className={`home-dropdown-value${gameDisciplina ? ' home-dropdown-value--filled' : ''}`}>
                          {gameDisciplina ? DISCIPLINA_LABELS[gameDisciplina] : 'Qualquer'}
                        </span>
                      </summary>
                      <div className="home-dropdown-panel">
                        <label className="home-dropdown-option">
                          <input
                            type="radio"
                            name="jogo-disciplina"
                            checked={gameDisciplina === null}
                            onChange={(e) => {
                              setGameDisciplina(null)
                              e.currentTarget.closest('details')?.removeAttribute('open')
                            }}
                          />
                          <span>Qualquer disciplina</span>
                        </label>
                        {(['linguagens', 'humanas', 'nature', 'math']).map((area) => (
                          <div key={area} className="home-dropdown-group">
                            <span className="home-dropdown-group-label">{AREA_LABELS[area]}</span>
                            {DISCIPLINAS_BY_AREA[area].map((slug) => (
                              <label key={slug} className="home-dropdown-option">
                                <input
                                  type="radio"
                                  name="jogo-disciplina"
                                  checked={gameDisciplina === slug}
                                  onChange={(e) => {
                                    setGameDisciplina(slug)
                                    e.currentTarget.closest('details')?.removeAttribute('open')
                                  }}
                                />
                                <span>{DISCIPLINA_LABELS[slug]}</span>
                              </label>
                            ))}
                          </div>
                        ))}
                      </div>
                    </details>

                    {gameConfigOpen === 'blitz' && (
                      <div className="jogo-blitz-time">
                        <span className="jogo-blitz-time-label">Duração</span>
                        <div className="jogo-blitz-time-row">
                          {[5, 10, 15, 20, 30].map((m) => (
                            <button
                              key={m}
                              type="button"
                              className={`jogo-blitz-time-chip${blitzMinutes === m ? ' is-active' : ''}`}
                              onClick={() => setBlitzMinutes(m)}
                            >
                              {m} min
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      className={`jogo-start-btn jogo-start-btn--${gameConfigOpen}`}
                      onClick={() => startGame(gameConfigOpen, gameDisciplina, gameConfigOpen === 'blitz' ? { blitzMinutes } : {})}
                    >
                      <span className="jogo-start-icon">
                        {gameConfigOpen === 'streak' ? '🔥' : gameConfigOpen === 'blitz' ? '⚡' : '💰'}
                      </span>
                      Começar {
                        gameConfigOpen === 'streak'
                          ? 'Streak'
                          : gameConfigOpen === 'blitz'
                            ? `Blitz · ${blitzMinutes} min`
                            : 'Milhão'
                      }
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'pesquise' && (
              <div className="home-tab-content">
                <Suspense fallback={<p className="qe-loading">Carregando…</p>}>
                  <EnemPicker
                    actionLabel={null}
                    allQuestions={allQuestions}
                    contexts={contexts}
                    onSelect={(q) => startSingleQuestionStudy(q)}
                  />
                </Suspense>
              </div>
            )}

            {activeTab === 'ensine' && (
              <div className="home-tab-content">
                {(user?.role === 'prof' || user?.role === 'admin') ? (
                  ensineTool === 'criar-lista' ? (
                    <Suspense fallback={<p className="qe-loading">Carregando…</p>}>
                      <QuestionEditor embedded onClose={() => setEnsineTool(null)} />
                    </Suspense>
                  ) : ensineTool === 'criar-questao' ? (
                    <Suspense fallback={<p className="qe-loading">Carregando…</p>}>
                      <QuestionEditor embedded quickAdd onClose={() => setEnsineTool(null)} />
                    </Suspense>
                  ) : ensineTool === 'explicar' ? (
                    <Suspense fallback={<p className="qe-loading">Carregando…</p>}>
                      <ExplanationsEditor
                        allQuestions={allQuestions}
                        contexts={contexts}
                        explanationOverrides={explanationOverrides}
                        setExplanationOverrides={setExplanationOverrides}
                        token={token}
                        onClose={() => setEnsineTool(null)}
                      />
                    </Suspense>
                  ) : ensineTool === 'gerar-pdf' ? (
                    <Suspense fallback={<p className="qe-loading">Carregando…</p>}>
                      <PdfExporter token={token} onClose={() => setEnsineTool(null)} />
                    </Suspense>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="home-start-btn"
                        onClick={() => setEnsineTool('criar-lista')}
                      >
                        Criar Lista de Questões
                      </button>
                      <button
                        type="button"
                        className="home-start-btn"
                        onClick={() => setEnsineTool('criar-questao')}
                      >
                        Criar Questão
                      </button>
                      <button
                        type="button"
                        className="home-start-btn"
                        onClick={() => setEnsineTool('explicar')}
                      >
                        Explicar Questão do Enem
                      </button>
                      <button
                        type="button"
                        className="home-start-btn"
                        onClick={() => setEnsineTool('gerar-pdf')}
                      >
                        Gerar Lista para Impressão
                      </button>
                    </>
                  )
                ) : (
                  <p className="home-ensine-message">
                    Esta área é para professores. Fale com seu professor se você acredita que deveria ter acesso.
                  </p>
                )}
              </div>
            )}

            {activeTab === 'administre' && user?.role === 'admin' && (
              <div className="home-tab-content">
                {adminError && <p className="auth-error" style={{ margin: 0 }}>{adminError}</p>}
                {!adminStats && <p className="qe-loading">{adminLoading ? 'Carregando…' : 'Aguardando…'}</p>}
                {adminStats && (
                  <AdminPanel
                    embedded
                    stats={adminStats}
                    dark={dark}
                    setDark={setDark}
                    token={token}
                    explanationOverrides={explanationOverrides}
                    questionsCount={new Set(allQuestions.map((q) => `${q.area}:${q.year}:${q.test}:${q.number}`)).size}
                    onExplanationsCleared={() => setExplanationOverrides({})}
                  />
                )}
              </div>
            )}

          </div>

        </div>

      </div>
    )
  }

  if (phase === 'login') {
    const isRegister = authMode === 'register'
    return (
      <div className="app-shell">
        <div className="home-screen">
          <div className="home-card">
            <h1 className="home-title">{isRegister ? 'Criar conta' : 'Login'}</h1>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                const username = e.target.username.value
                const password = e.target.password.value
                if (isRegister) handleRegister(username, password)
                else handleLogin(username, password)
              }}
              className="home-filters"
            >
              <input
                name="username"
                type="text"
                placeholder="Nome de usuário"
                className="home-input"
                required
              />
              <input
                name="password"
                type="password"
                placeholder={isRegister ? 'Senha (mín. 6 caracteres)' : 'Senha'}
                className="home-input"
                required
                minLength={isRegister ? 6 : undefined}
              />
              {authError && <p className="auth-error">{authError}</p>}
              <button type="submit" className="home-start-btn" disabled={authLoading}>
                {authLoading ? 'Aguarde…' : isRegister ? 'Criar conta' : 'Entrar'}
              </button>
              <button
                type="button"
                className="btn--ghost"
                onClick={() => { setAuthMode(isRegister ? 'login' : 'register'); setAuthError('') }}
              >
                {isRegister ? 'Já tenho conta' : 'Criar conta'}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  // ── Game over (Streak / Blitz) ────────────────────────────────────────────
  if (phase === 'game-over' && gameFinalStats) {
    const stats = gameFinalStats
    const minutes = Math.floor(stats.durationSecs / 60)
    const seconds = stats.durationSecs % 60
    const durationLabel = `${minutes}:${String(seconds).padStart(2, '0')}`
    const disciplinaLabel = stats.disciplina ? DISCIPLINA_LABELS[stats.disciplina] : 'Todas as disciplinas'
    const isStreak = stats.mode === 'streak'
    const isMil = stats.mode === 'milionario'
    const milWon = isMil && stats.milWon

    if (isMil) {
      const prize = stats.milPrize ?? 0
      const levelReached = stats.milLevelReached ?? 0
      return (
        <div className="app-shell">
          <div className={`game-over-screen game-over-screen--mil${milWon ? ' game-over-screen--mil-won' : ''}`}>
            {milWon && (
              <>
                <div className="mil-coin-rain" aria-hidden>
                  {Array.from({ length: 48 }).map((_, i) => {
                    const left = Math.random() * 100
                    const delay = Math.random() * 4
                    const dur = 3 + Math.random() * 3
                    const sway = (Math.random() - 0.5) * 40
                    const size = 22 + Math.random() * 22
                    return (
                      <span
                        key={i}
                        className="mil-coin"
                        style={{
                          left: `${left}%`,
                          animationDelay: `${delay}s`,
                          animationDuration: `${dur}s`,
                          fontSize: `${size}px`,
                          // sway via CSS custom property
                          '--sway': `${sway}px`,
                        }}
                      >🪙</span>
                    )
                  })}
                </div>
                <div className="mil-fireworks" aria-hidden>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <span
                      key={i}
                      className="mil-firework"
                      style={{
                        left: `${10 + i * 14}%`,
                        animationDelay: `${i * 0.3}s`,
                      }}
                    >✨</span>
                  ))}
                </div>
              </>
            )}
            <div className={`game-over-card game-over-card--mil${milWon ? ' game-over-card--mil-won' : ''}`}>
              <span className={`game-over-icon ${milWon ? 'game-over-icon--mil-won' : 'game-over-icon--mil'}`}>
                {milWon ? '🏆' : stats.milStopped ? '🛑' : (levelReached === 0 ? '💸' : '💰')}
              </span>
              <h1 className="game-over-title">
                {milWon
                  ? 'MILHÃO!'
                  : stats.milStopped
                    ? 'Você parou'
                    : levelReached === 0
                      ? 'Errou na primeira'
                      : 'Errou aqui'}
              </h1>
              {milWon && (
                <p className="mil-won-sub">Você completou os {MILIONARIO_TOTAL_LEVELS} níveis</p>
              )}
              <div className="mil-prize-display">
                <span className="mil-prize-label">
                  {milWon ? 'Você levou pra casa' : prize > 0 ? 'Você ganhou' : 'Não ganhou nada'}
                </span>
                <span className={`mil-prize-value${milWon ? ' mil-prize-value--won' : ''}`}>
                  {formatMilPrize(prize)}
                </span>
              </div>
              <div className="game-over-stats">
                <div className="game-over-stat-row">
                  <span className="game-over-stat-label">Nível</span>
                  <span className="game-over-stat-value">{levelReached}/{MILIONARIO_TOTAL_LEVELS}</span>
                </div>
                <div className="game-over-stat-row">
                  <span className="game-over-stat-label">Pulos usados</span>
                  <span className="game-over-stat-value">{stats.milSkipsUsed ?? 0}/3</span>
                </div>
                <div className="game-over-stat-row">
                  <span className="game-over-stat-label">Ajudas usadas</span>
                  <span className="game-over-stat-value">{stats.milHelpsUsed ?? 0}/3</span>
                </div>
                <div className="game-over-stat-row">
                  <span className="game-over-stat-label">Tempo</span>
                  <span className="game-over-stat-value">{durationLabel}</span>
                </div>
                <div className="game-over-stat-row">
                  <span className="game-over-stat-label">Tema</span>
                  <span className="game-over-stat-value game-over-stat-value--small">{disciplinaLabel}</span>
                </div>
                {personalBestInfo && personalBestInfo.newBest > 0 && (
                  <div className={`game-over-stat-row${personalBestInfo.isNewRecord ? ' game-over-stat-row--record' : ''}`}>
                    <span className="game-over-stat-label">
                      {personalBestInfo.isNewRecord ? '🏆 Novo recorde' : 'Seu recorde'}
                    </span>
                    <span className="game-over-stat-value">{personalBestInfo.newBest}</span>
                  </div>
                )}
              </div>
              <div className="game-over-actions">
                <button
                  type="button"
                  className="home-area-pill home-area-pill--primary"
                  onClick={() => startGame('milionario', stats.disciplina)}
                >
                  Jogar de novo
                </button>
                <button
                  type="button"
                  className="home-area-pill"
                  onClick={exitGame}
                >
                  Voltar
                </button>
              </div>
              {!token && (
                <div className="game-over-guest-cta">
                  <p className="game-over-guest-cta-text">
                    <span className="game-over-guest-cta-badge">✨</span>
                    Crie sua conta pra salvar o resultado e acessar a plataforma
                  </p>
                  <div className="game-over-guest-cta-actions">
                    <button
                      type="button"
                      className="home-area-pill home-area-pill--primary"
                      onClick={() => {
                        setAuthMode('register')
                        pendingResultSaveRef.current = true
                        setPhase('login')
                      }}
                    >
                      Criar conta
                    </button>
                    <button
                      type="button"
                      className="home-area-pill"
                      onClick={() => {
                        setAuthMode('login')
                        pendingResultSaveRef.current = true
                        setPhase('login')
                      }}
                    >
                      Já tenho conta
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="app-shell">
        <div className="game-over-screen">
          <div className="game-over-card">
            <span className={`game-over-icon game-over-icon--${stats.mode}`}>
              {isStreak ? '🔥' : '⚡'}
            </span>
            <h1 className="game-over-title">
              {isStreak ? 'Streak encerrado' : 'Blitz finalizado'}
            </h1>
            <div className="game-over-stats">
              {isStreak ? (
                <div className="game-over-stat-row">
                  <span className="game-over-stat-label">Acertos seguidos</span>
                  <span className="game-over-stat-value">{stats.streak}</span>
                </div>
              ) : (
                <>
                  <div className="game-over-stat-row">
                    <span className="game-over-stat-label">Acertos</span>
                    <span className="game-over-stat-value">{stats.correct}</span>
                  </div>
                  <div className="game-over-stat-row">
                    <span className="game-over-stat-label">Erros</span>
                    <span className="game-over-stat-value">{stats.wrongs}</span>
                  </div>
                </>
              )}
              <div className="game-over-stat-row">
                <span className="game-over-stat-label">Tempo</span>
                <span className="game-over-stat-value">{durationLabel}</span>
              </div>
              <div className="game-over-stat-row">
                <span className="game-over-stat-label">Tema</span>
                <span className="game-over-stat-value game-over-stat-value--small">{disciplinaLabel}</span>
              </div>
              {personalBestInfo && personalBestInfo.newBest > 0 && (
                <div className={`game-over-stat-row${personalBestInfo.isNewRecord ? ' game-over-stat-row--record' : ''}`}>
                  <span className="game-over-stat-label">
                    {personalBestInfo.isNewRecord
                      ? '🏆 Novo recorde'
                      : isStreak ? 'Seu recorde' : `Recorde · ${stats.blitzMinutes ?? blitzMinutes} min`}
                  </span>
                  <span className="game-over-stat-value">{personalBestInfo.newBest}</span>
                </div>
              )}
            </div>
            <div className="game-over-actions">
              <button
                type="button"
                className="home-area-pill home-area-pill--primary"
                onClick={() => startGame(stats.mode, stats.disciplina, stats.mode === 'blitz' ? { blitzMinutes: stats.blitzMinutes ?? blitzMinutes } : {})}
              >
                Jogar de novo
              </button>
              <button
                type="button"
                className="home-area-pill"
                onClick={exitGame}
              >
                Voltar
              </button>
            </div>
            {!token && (
              <div className="game-over-guest-cta">
                <p className="game-over-guest-cta-text">
                  <span className="game-over-guest-cta-badge">✨</span>
                  Crie sua conta pra salvar o resultado e acessar a plataforma
                </p>
                <div className="game-over-guest-cta-actions">
                  <button
                    type="button"
                    className="home-area-pill home-area-pill--primary"
                    onClick={() => {
                      setAuthMode('register')
                      pendingResultSaveRef.current = true
                      setPhase('login')
                    }}
                  >
                    Criar conta
                  </button>
                  <button
                    type="button"
                    className="home-area-pill"
                    onClick={() => {
                      setAuthMode('login')
                      pendingResultSaveRef.current = true
                      setPhase('login')
                    }}
                  >
                    Já tenho conta
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (!question) return <div className="center">Carregando...</div>

  // Pause/resume only makes sense for a full ENEM/UFSC exam.
  const isFullExamMode = !gameMode
    && !isDailyChallenge
    && !selectedArea
    && !!selectedTest && selectedTest !== 'Integrar'
    && selectedYear != null
    && typeof selectedDay === 'number'

  const letters = Object.keys(question.alternatives)
  const images = question.images ?? []
  const hasStemImg = images.length > 0 && images.length === letters.length + 1
  const altImgsOnly = images.length > 0 && images.length === letters.length
  const isPrevDisabled = questionIndex <= 0
  const isNextDisabled = questionIndex >= sortedQuestions.length - 1
  const altImageFor = (index) => hasStemImg ? images[index + 1] : altImgsOnly ? images[index] : null
  const attempt = attempts[attemptKey(question)]
  const selected = attempt?.selected ?? null

  // ── Summary ───────────────────────────────────────────────────────────────
  if (phase === 'summary') {
    const annulledKeys = new Set(sortedQuestions.filter((q) => q.answer === 'annulled').map(attemptKey))
    const scorableQuestions = sortedQuestions.filter((q) => !annulledKeys.has(attemptKey(q)))
    const answeredCount = Object.entries(attempts).filter(([k]) => !annulledKeys.has(k)).length
    const correctCount = Object.values(attempts).filter((a) => a.correct).length
    const wrongCount = answeredCount - correctCount
    const unansweredCount = scorableQuestions.length - answeredCount
    const avgTime = answeredCount > 0
      ? Math.round(Object.values(questionTimes).reduce((s, t) => s + t, 0) / answeredCount)
      : 0

    // ── Popup result (sessões leves) ─────────────────────────────────────
    const isProvaCompleta = (
      !isDailyChallenge
      && !selectedArea
      && !gameMode
      && selectedTest === 'ENEM'
      && selectedYear != null
      && typeof selectedDay === 'number'
    )

    if (summaryView === 'popup' && !isProvaCompleta) {
      const total = sortedQuestions.length
      const hitRate = total > 0 ? Math.round((correctCount / total) * 100) : 0
      const mins = Math.floor(totalElapsed / 60)
      const secs = totalElapsed % 60
      const timeLabel = `${mins}:${String(secs).padStart(2, '0')}`

      let sessionIcon = '📝'
      let sessionTitle = 'Resultado'
      if (isDailyChallenge) { sessionIcon = '✨'; sessionTitle = 'Desafio Diário' }
      else if (selectedArea) { sessionIcon = '🎯'; sessionTitle = AREA_LABELS[selectedArea] ?? 'Área' }
      else if (selectedTest === 'Integrar') { sessionIcon = '🎯'; sessionTitle = 'Integrar' }
      else if (selectedTest && selectedYear) {
        sessionTitle = `${selectedTest} ${selectedYear}${selectedDay ? ' · Dia ' + selectedDay : ''}`
      }

      const peekItems = sortedQuestions.slice(0, 10).map((q) => {
        const att = attempts[attemptKey(q)]
        if (!att) return 'skip'
        return att.correct ? 'ok' : 'bad'
      })
      const hasMore = sortedQuestions.length > 10
      const canRefazer = !(isDailyChallenge && !dailyChallengePractice)

      const handlePopupSair = () => {
        clearPausedSession()
        setAttempts({})
        saveAttemptsToSession({})
        setQuestions([])
        setQuestion(null)
        setTriScores(null)
        if (isDailyChallenge) {
          setIsDailyChallenge(false)
          if (!dailyChallengePractice) {
            setDailyChallengeResult({ score: correctCount, total: sortedQuestions.length })
          }
          setDailyChallengePractice(false)
        }
        setPhase('home')
      }
      const handleRefazer = () => {
        setAttempts({})
        saveAttemptsToSession({})
        setQuestionTimes({})
        setTotalElapsed(0)
        startTimeRef.current = Date.now()
        setSummaryView('popup')
        setQuestion(sortedQuestions[0])
        setPhase('question')
      }

      return (
        <div className="app-shell">
          <div className="result-popup-overlay">
            <div className="result-popup-card">
              <span className="result-popup-icon" aria-hidden>{sessionIcon}</span>
              <h1 className="result-popup-title">{sessionTitle}</h1>
              <div className="result-popup-stats">
                <div className="result-popup-stat-row">
                  <span className="result-popup-stat-label">Acertos</span>
                  <span className="result-popup-stat-value">{correctCount} / {total}</span>
                </div>
                <div className="result-popup-stat-row">
                  <span className="result-popup-stat-label">Tempo</span>
                  <span className="result-popup-stat-value">{timeLabel}</span>
                </div>
                <div className="result-popup-stat-row">
                  <span className="result-popup-stat-label">Taxa</span>
                  <span className="result-popup-stat-value">{hitRate}%</span>
                </div>
              </div>
              {peekItems.length > 0 && (
                <div className="result-popup-peek" aria-label="Resultado por questão">
                  {peekItems.map((kind, i) => (
                    <span key={i} className={`result-popup-peek-dot result-popup-peek-dot--${kind}`} />
                  ))}
                  {hasMore && <span className="result-popup-peek-more">…</span>}
                </div>
              )}
              <div className="result-popup-actions">
                <button type="button" className="home-start-btn result-popup-btn--primary" onClick={() => setSummaryView('full')}>
                  Ver gabarito
                </button>
                {canRefazer && (
                  <button type="button" className="btn--ghost result-popup-btn" onClick={handleRefazer}>
                    Refazer
                  </button>
                )}
                <button type="button" className="btn--ghost result-popup-btn" onClick={handlePopupSair}>
                  Sair
                </button>
              </div>
            </div>
          </div>
        </div>
      )
    }

    // ── Subject breakdown ────────────────────────────────────────────────
    const tagStats = {}
    scorableQuestions.forEach((q) => {
      const qk = attemptKey(q)
      const att = attempts[qk]
      const t = questionTimes[qk] || 0
      ;(q.tags || []).forEach((tag) => {
        if (!tagStats[tag]) tagStats[tag] = { total: 0, answered: 0, correct: 0, time: 0 }
        tagStats[tag].total++
        if (att) {
          tagStats[tag].answered++
          if (att.correct) tagStats[tag].correct++
          tagStats[tag].time += t
        }
      })
    })

    const tagList = Object.entries(tagStats)
      .filter(([, s]) => s.answered >= 1)
      .map(([tag, s]) => ({
        tag,
        total: s.total,
        answered: s.answered,
        correct: s.correct,
        time: s.time,
        hitRate: Math.round((s.correct / s.answered) * 100),
        avgTime: Math.round(s.time / s.answered),
      }))
      .sort((a, b) => a.hitRate - b.hitRate)

    // ── Disciplina breakdown ──────────────────────────────────────────────
    const discStats = {}
    scorableQuestions.forEach((q) => {
      const qk = attemptKey(q)
      const att = attempts[qk]
      const t = questionTimes[qk] || 0
      ;(q.disciplinas || []).forEach((slug) => {
        if (!discStats[slug]) discStats[slug] = { total: 0, answered: 0, correct: 0, time: 0 }
        discStats[slug].total++
        if (att) {
          discStats[slug].answered++
          if (att.correct) discStats[slug].correct++
          discStats[slug].time += t
        }
      })
    })

    const discList = Object.entries(discStats)
      .filter(([, s]) => s.answered >= 1)
      .map(([slug, s]) => ({
        slug,
        label: DISCIPLINA_LABELS[slug] ?? slug,
        total: s.total,
        answered: s.answered,
        correct: s.correct,
        time: s.time,
        hitRate: Math.round((s.correct / s.answered) * 100),
        avgTime: Math.round(s.time / s.answered),
      }))
      .sort((a, b) => a.hitRate - b.hitRate)

    const weakTags = tagList.filter((t) => t.hitRate < 60)

    // ── Subject diagnosis ────────────────────────────────────────────────────
    // Reference: 1.5× the session average time (min 120s) marks "slow"
    const slowThreshold = Math.max(120, Math.round(avgTime * 1.5))
    const diagnosis = {
      mastery: [],    // ≥ 70% correct AND not slow
      slow:    [],    // ≥ 70% correct BUT slow
      weak:    [],    // < 70% correct (sorted worst first)
    }
    tagList.forEach((t) => {
      if (t.hitRate >= 70) {
        if (t.avgTime > slowThreshold) diagnosis.slow.push(t)
        else diagnosis.mastery.push(t)
      } else {
        diagnosis.weak.push(t)
      }
    })
    // mastery sorted best first; weak sorted worst first (tagList already ascending hitRate)
    diagnosis.mastery.sort((a, b) => b.hitRate - a.hitRate)
    diagnosis.weak.sort((a, b) => a.hitRate - b.hitRate)

    const insights = []

    // ── Completion insight ───────────────────────────────────────────────────
    if (answeredCount === 0) {
      insights.push({ type: 'improve', msg: 'Você saiu sem responder nenhuma questão. Na próxima, tente ir até o fim — cada questão respondida conta para o seu resultado!' })
    } else if (unansweredCount > 0) {
      insights.push({ type: 'improve', msg: `Você deixou ${unansweredCount} ${unansweredCount === 1 ? 'questão sem resposta' : 'questões sem resposta'}. Tente concluir o simulado completo da próxima vez — responder todas as questões maximiza suas chances no dia da prova!` })
    } else if (correctCount === sortedQuestions.length) {
      insights.push({ type: 'great', msg: 'Parabéns! Você acertou todas as questões. Desempenho impecável!' })
    } else if (weakTags.length === 0) {
      const bottom = tagList.slice(0, 2).map((t) => t.tag)
      insights.push({
        type: 'good',
        msg: `Bom trabalho! Seu desempenho foi sólido em todos os tópicos. Para chegar ainda mais alto, vale reforçar: ${bottom.join(' e ')}.`,
      })
    } else {
      const names = weakTags.slice(0, 4).map((t) => t.tag)
      const last = names.pop()
      const list = names.length > 0 ? `${names.join(', ')} e ${last}` : last
      insights.push({
        type: 'improve',
        msg: `Você tem maior potencial de melhoria em ${list}. Dedique um tempo extra a esses tópicos — pequenos avanços aqui vão refletir diretamente na sua nota.`,
      })
    }

    // ── Time insight ─────────────────────────────────────────────────────────
    if (answeredCount > 0) {
      if (avgTime < 45) {
        insights.push({ type: 'improve', msg: `Você levou em média apenas ${avgTime}s por questão — bem abaixo do ideal. Leia os enunciados com calma; a pressa pode custar acertos que você sabe fazer.` })
      } else if (avgTime < 90) {
        insights.push({ type: 'good', msg: `Boa velocidade! Média de ${avgTime}s por questão. Continue assim, mas certifique-se de que está lendo os enunciados por completo.` })
      } else if (avgTime > 300) {
        insights.push({ type: 'improve', msg: `Sua média foi de ${Math.round(avgTime / 60)}min por questão. No ENEM você tem cerca de 3,5 min por questão — treinar para ganhar velocidade vai ajudar a terminar a prova no tempo.` })
      } else if (avgTime > 210) {
        insights.push({ type: 'improve', msg: `Sua média foi de ${Math.round(avgTime / 60)}min por questão. Tente ganhar um pouco de velocidade — no ENEM o tempo é apertado e cada minuto economizado conta.` })
      }
    }

    return (
      <div className="app-shell">
        <header className="app-header">
          <span className="app-header-title">
            {isDailyChallenge ? 'Desafio Diário — Resultado' : 'Resultado'}
          </span>
          <div className="app-header-actions">
            <button
              type="button"
              className="home-start-btn summary-restart-btn"
              onClick={() => {
                clearPausedSession()
                setAttempts({})
                saveAttemptsToSession({})
                setQuestions([])
                setQuestion(null)
                setTriScores(null)
                if (isDailyChallenge) {
                  setIsDailyChallenge(false)
                  // Practice retake: keep original score banner intact
                  if (!dailyChallengePractice) {
                    const score = Object.values(attempts).filter((a) => a.correct).length
                    setDailyChallengeResult({ score, total: sortedQuestions.length })
                  }
                  setDailyChallengePractice(false)
                }
                setPhase('home')
              }}
            >
              {isDailyChallenge ? 'Voltar ao início' : 'Sair'}
            </button>
            <button
              type="button"
              className="theme-toggle"
              onClick={() => setDark((d) => !d)}
              aria-label="Alternar tema"
            >
              {dark ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </header>

        <div className="summary-screen">
          {/* Fixed top: overall stats */}
          <div className="summary-stats">
            <div className="summary-stat summary-stat--correct">
              <span className="summary-stat-value">{correctCount}</span>
              <span className="summary-stat-label">Corretas</span>
            </div>
            <div className="summary-stat summary-stat--wrong">
              <span className="summary-stat-value">{wrongCount}</span>
              <span className="summary-stat-label">Incorretas</span>
            </div>
            <div className="summary-stat summary-stat--skip">
              <span className="summary-stat-value">{unansweredCount}</span>
              <span className="summary-stat-label">Não respondidas</span>
            </div>
            <div className="summary-stat summary-stat--time">
              <span className="summary-stat-value">{formatTime(totalElapsed)}</span>
              <span className="summary-stat-label">Tempo total</span>
            </div>
            <div className="summary-stat summary-stat--avg">
              <span className="summary-stat-value">{formatTime(avgTime)}</span>
              <span className="summary-stat-label">Média por questão</span>
            </div>
          </div>

          <div className="summary-score-bar-wrap">
            <div className="summary-score-bar">
              {correctCount > 0 && (
                <div
                  className="summary-score-bar-fill summary-score-bar-fill--ok"
                  style={{ width: `${(correctCount / sortedQuestions.length) * 100}%` }}
                />
              )}
              {wrongCount > 0 && (
                <div
                  className="summary-score-bar-fill summary-score-bar-fill--bad"
                  style={{ width: `${(wrongCount / sortedQuestions.length) * 100}%` }}
                />
              )}
              {unansweredCount > 0 && (
                <div
                  className="summary-score-bar-fill summary-score-bar-fill--skip"
                  style={{ width: `${(unansweredCount / sortedQuestions.length) * 100}%` }}
                />
              )}
            </div>
            <span className="summary-score-pct">
              <span className="summary-score-frac">{correctCount}/{answeredCount}/{scorableQuestions.length}</span>
              <span className="summary-score-pct-val">
                {sortedQuestions.length > 0
                  ? Math.round((correctCount / sortedQuestions.length) * 100)
                  : 0}%
              </span>
            </span>
          </div>

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

          {/* Scrollable body: insight + subjects + question table */}
          <div className="summary-body">

            {insights.map((insight, i) => (
              <div key={i} className={`summary-insight summary-insight--${insight.type}`}>
                <span className="summary-insight-icon">
                  {insight.type === 'great' ? '🏆' : insight.type === 'good' ? '👍' : '🎯'}
                </span>
                <p className="summary-insight-msg">{insight.msg}</p>
              </div>
            ))}

            {tagList.length > 0 && (
              <div className="summary-diagnosis">
                <h2 className="summary-section-title">Diagnóstico de assuntos</h2>

                {diagnosis.mastery.length > 0 && (
                  <div className="diag-group diag-group--mastery">
                    <div className="diag-group-header">
                      <span className="diag-group-icon">✓</span>
                      <span className="diag-group-label">Você domina</span>
                    </div>
                    <div className="diag-chips">
                      {diagnosis.mastery.map(({ tag, hitRate, avgTime: at }) => (
                        <span key={tag} className="diag-chip diag-chip--mastery">
                          <span className="diag-chip-tag">{tag}</span>
                          <span className="diag-chip-meta">{hitRate}% · {formatTime(at)}/q</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {diagnosis.slow.length > 0 && (
                  <div className="diag-group diag-group--slow">
                    <div className="diag-group-header">
                      <span className="diag-group-icon">⏱</span>
                      <span className="diag-group-label">Acerta mas demora</span>
                    </div>
                    <div className="diag-chips">
                      {diagnosis.slow.map(({ tag, hitRate, avgTime: at }) => (
                        <span key={tag} className="diag-chip diag-chip--slow">
                          <span className="diag-chip-tag">{tag}</span>
                          <span className="diag-chip-meta">{hitRate}% · {formatTime(at)}/q</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {diagnosis.weak.length > 0 && (
                  <div className="diag-group diag-group--weak">
                    <div className="diag-group-header">
                      <span className="diag-group-icon">↗</span>
                      <span className="diag-group-label">Para reforçar</span>
                    </div>
                    <div className="diag-chips">
                      {diagnosis.weak.map(({ tag, hitRate, avgTime: at }) => (
                        <span key={tag} className="diag-chip diag-chip--weak">
                          <span className="diag-chip-tag">{tag}</span>
                          <span className="diag-chip-meta">{hitRate}% · {formatTime(at)}/q</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {diagnosis.mastery.length === 0 && diagnosis.slow.length === 0 && diagnosis.weak.length === 0 && (
                  <p className="diag-empty">Responda mais questões para ver seu diagnóstico.</p>
                )}
              </div>
            )}

            {discList.length > 0 && (
              <div className="summary-subjects-wrap">
                <h2 className="summary-section-title">Desempenho por disciplina</h2>
                <div className="summary-subjects">
                  {discList.map(({ slug, label, answered, correct, hitRate, avgTime: at }) => (
                    <div
                      key={slug}
                      className={`summary-subject-card ${hitRate < 50 ? 'summary-subject-card--weak' : hitRate >= 80 ? 'summary-subject-card--strong' : ''}`}
                    >
                      <div className="summary-subject-header">
                        <span className="summary-subject-name">{label}</span>
                        <span className={`summary-subject-rate ${hitRate < 50 ? 'rate--bad' : hitRate >= 80 ? 'rate--ok' : 'rate--mid'}`}>
                          {hitRate}%
                        </span>
                      </div>
                      <div className="summary-subject-bar">
                        <div
                          className="summary-subject-bar-fill"
                          style={{
                            width: `${hitRate}%`,
                            background: hitRate < 50
                              ? 'var(--rail-bad)'
                              : hitRate >= 80
                                ? 'var(--rail-ok)'
                                : 'var(--accent)',
                          }}
                        />
                      </div>
                      <div className="summary-subject-meta">
                        <span>{correct}/{answered} corretas</span>
                        {at > 0 && <span>~{formatTime(at)}/questão</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tagList.length > 0 && (
              <div className="summary-subjects-wrap">
                <h2 className="summary-section-title">Desempenho por assunto</h2>
                <div className="summary-subjects">
                  {tagList.map(({ tag, answered, total, correct, hitRate, avgTime: at }) => (
                    <div
                      key={tag}
                      className={`summary-subject-card ${hitRate < 50 ? 'summary-subject-card--weak' : hitRate >= 80 ? 'summary-subject-card--strong' : ''}`}
                    >
                      <div className="summary-subject-header">
                        <span className="summary-subject-name">{tag}</span>
                        <span className={`summary-subject-rate ${hitRate < 50 ? 'rate--bad' : hitRate >= 80 ? 'rate--ok' : 'rate--mid'}`}>
                          {hitRate}%
                        </span>
                      </div>
                      <div className="summary-subject-bar">
                        <div
                          className="summary-subject-bar-fill"
                          style={{
                            width: `${hitRate}%`,
                            background: hitRate < 50
                              ? 'var(--rail-bad)'
                              : hitRate >= 80
                                ? 'var(--rail-ok)'
                                : 'var(--accent)',
                          }}
                        />
                      </div>
                      <div className="summary-subject-meta">
                        <span>{correct}/{answered} corretas</span>
                        {at > 0 && <span>~{formatTime(at)}/questão</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="summary-questions-wrap">
              <h2 className="summary-section-title">Questão a questão</h2>
              <table className="summary-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Sua resposta</th>
                    <th>Gabarito</th>
                    <th>Resultado</th>
                    <th>Tempo</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedQuestions.map((q) => {
                    const qk = attemptKey(q)
                    const att = attempts[qk]
                    const t = questionTimes[qk]
                    const rowClass = att ? (att.correct ? 'summary-row--ok' : 'summary-row--bad') : 'summary-row--skip'
                    return (
                      <tr key={qk} className={rowClass}>
                        <td className="summary-td-num">{q.number}</td>
                        <td>{att?.selected?.toUpperCase() ?? <span className="summary-dash summary-dash--skip">—</span>}</td>
                        <td>{q.answer.toUpperCase()}</td>
                        <td className="summary-td-result">
                          {att
                            ? att.correct
                              ? <span className="summary-tick">✓</span>
                              : <span className="summary-cross">✗</span>
                            : <span className="summary-dash summary-dash--skip">○</span>}
                        </td>
                        <td className="summary-td-time">{t ? formatTime(t) : <span className="summary-dash">—</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

          </div>
        </div>
      </div>
    )
  }

  // ── Quiz ──────────────────────────────────────────────────────────────────
  const allAnswered = Object.keys(attempts).length >= sortedQuestions.length
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-left">
          <button
            type="button"
            className="app-header-title app-header-title--btn"
            onClick={pauseQuiz}
            aria-label="Voltar ao início"
            title="Voltar ao início"
          >
            <img
              src="/figuras/logos/integrar-logo-transparent.png"
              alt="Integrar"
              className="app-header-logo"
            />
          </button>
          <button
            type="button"
            className={`header-icon-btn${timerDrawerOpen ? ' active' : ''}`}
            onClick={() => setTimerDrawerOpen(o => !o)}
            aria-label="Temporizador"
          >
            <ClockIcon />
          </button>
        </div>

        <div className="app-header-right">
          <button
            type="button"
            className={`notebook-toggle${notebookOpen ? ' active' : ''}`}
            onClick={() => setNotebookOpen((o) => !o)}
            aria-label={notebookOpen ? 'Fechar caderno' : 'Abrir caderno'}
          >
            <NotebookIcon />
          </button>

          {/* Desktop: icon-only buttons */}
          <div className="app-header-actions app-header-actions--desktop">
            {isFullExamMode && (
              <button type="button" className="header-icon-btn" onClick={pauseQuiz} aria-label="Pausar">
                <PauseIcon />
              </button>
            )}
            <button
              type="button"
              className="header-finish-btn"
              onClick={() => gameMode ? endGame() : setFinishConfirmOpen(true)}
              aria-label={gameMode ? 'Desistir' : (allAnswered ? 'Finalizar' : 'Sair')}
            >
              {gameMode ? <ExitIcon /> : (allAnswered ? <FinishIcon /> : <ExitIcon />)}
            </button>
            <button
              type="button"
              className="notebook-toggle header-icon-btn--report"
              onClick={() => { setFeedbackQuestion(question ? { number: question.number, year: question.year, test: question.test, area: question.area } : null); setFeedbackOpen(true) }}
              aria-label="Reportar"
            >
              <WarnIcon />
            </button>
          </div>

        {/* Mobile: ⋮ dropdown */}
        <div className="app-header-actions app-header-actions--mobile">
          {headerMenuOpen && (
            <div className="header-menu-overlay" onClick={() => setHeaderMenuOpen(false)} />
          )}
          <button
            type="button"
            className={`header-menu-btn${headerMenuOpen ? ' active' : ''}`}
            onClick={() => setHeaderMenuOpen(o => !o)}
            aria-label="Menu"
          >
            <MenuDotsIcon />
          </button>
          {headerMenuOpen && (
            <div className="header-menu-dropdown">
              <button type="button" className="header-menu-item header-menu-item--report" onClick={() => { setHeaderMenuOpen(false); setFeedbackQuestion(question ? { number: question.number, year: question.year, test: question.test, area: question.area } : null); setFeedbackOpen(true) }}>
                <WarnIcon /> <span>Reportar problema</span>
              </button>
              <div className="header-menu-divider" />
              {gameMode ? (
                <button type="button" className="header-menu-item header-menu-item--finish" onClick={() => { setHeaderMenuOpen(false); endGame() }}>
                  <ExitIcon /> <span>Desistir</span>
                </button>
              ) : (
                <>
                  {isFullExamMode && (
                    <button type="button" className="header-menu-item" onClick={() => { setHeaderMenuOpen(false); pauseQuiz() }}>
                      <PauseIcon /> <span>Pausar</span>
                    </button>
                  )}
                  <button type="button" className="header-menu-item header-menu-item--finish" onClick={() => { setHeaderMenuOpen(false); setFinishConfirmOpen(true) }}>
                    {allAnswered ? <FinishIcon /> : <ExitIcon />} <span>{allAnswered ? 'Finalizar' : 'Sair'}</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        </div>
      </header>

      <div className="app-main">
        <div className="content-center">
          <div className="question-content">
            <div className="question-scroll">
              <div className="container">
                <header className="header">
                  <div className="badges">
                    {gameMode === 'streak' && (
                      <span className="badge badge-game-streak">🔥 Streak {gameStreak}</span>
                    )}
                    {gameMode === 'blitz' && (
                      <>
                        <span className="badge badge-game-blitz">
                          ⏱ {Math.floor(gameTimeLeft / 60)}:{String(gameTimeLeft % 60).padStart(2, '0')}
                        </span>
                        <span className="badge badge-game-score">✓ {gameCorrect}</span>
                        <span className="badge badge-game-lives">❤ {3 - gameWrongs}</span>
                      </>
                    )}
                    {gameMode === 'milionario' && (
                      <span className="badge badge-game-mil-level">
                        Nível {Math.min(milLevel + 1, MILIONARIO_TOTAL_LEVELS)}/{MILIONARIO_TOTAL_LEVELS}
                      </span>
                    )}
                    {!gameMode && (
                      <span className="badge badge-progress">
                        {questionIndex + 1} / {sortedQuestions.length}
                      </span>
                    )}
                    {(isDailyChallenge || selectedArea || gameMode) && (
                      <span className="badge badge-qnum">Q{question.number}</span>
                    )}
                    {question.test != null && String(question.test).trim() !== '' && (
                      <span className="badge badge-test">{question.test}</span>
                    )}
                    <span className="badge badge-year">{question.year}</span>
                    {areaLabel(question.area) && (
                      <span className="badge badge-area">{areaLabel(question.area)}</span>
                    )}
                    {showDifficulty && question.difficulty != null && (() => {
                      const d = question.difficulty
                      let label, cls
                      if (typeof d === 'string') {
                        label = d === 'easy' ? 'Fácil' : d === 'hard' ? 'Difícil' : 'Médio'
                        cls   = d === 'easy' ? 'easy'  : d === 'hard' ? 'hard'    : 'medium'
                      } else {
                        label = d <= 3 ? 'Fácil' : d <= 6 ? 'Médio' : 'Difícil'
                        cls   = d <= 3 ? 'easy'  : d <= 6 ? 'medium' : 'hard'
                      }
                      return <span className={`badge badge-difficulty badge-difficulty--${cls}`}>{label}</span>
                    })()}
                  </div>
                  {(() => {
                    if (!question.language) return null
                    const variants = langVariantsRef.current[question.number]
                    // Only show the toggle when BOTH language variants are present in
                    // the current quiz pool — single-language sessions (e.g. the
                    // "Inglês"/"Espanhol" disciplina quiz) shouldn't expose a dead button.
                    if (!variants?.en || !variants?.es) return null
                    return (
                      <div className="lang-toggle" aria-label="Escolha o idioma">
                        <button
                          type="button"
                          className={`lang-toggle-btn ${foreignLang === 'en' ? 'active' : ''}`}
                          onClick={() => switchLang('en')}
                          disabled={!!attempts[attemptKey(question)]}
                          title="Inglês"
                        >
                          🇺🇸
                        </button>
                        <button
                          type="button"
                          className={`lang-toggle-btn ${foreignLang === 'es' ? 'active' : ''}`}
                          onClick={() => switchLang('es')}
                          disabled={!!attempts[attemptKey(question)]}
                          title="Espanhol"
                        >
                          🇪🇸
                        </button>
                      </div>
                    )
                  })()}
                </header>

                {gameMode === 'milionario' && (() => {
                  const playingFor = MILIONARIO_PRIZES[Math.min(milLevel, MILIONARIO_TOTAL_LEVELS - 1)]
                  const lossPrize = getMilLossPrize(milLevel)
                  const stopPrize = getMilStopPrize(milLevel)
                  const hasNext = milLevel + 1 < MILIONARIO_TOTAL_LEVELS
                  const nextPrize = hasNext ? MILIONARIO_PRIZES[milLevel + 1] : null
                  const canStop = milLevel > 0
                  return (
                    <div className="mil-prize-banner" aria-label="Prêmio em jogo">
                      <span className="mil-prize-banner-label">Valendo</span>
                      <span className="mil-prize-banner-value">
                        {formatMilPrize(playingFor)}
                      </span>
                      <div className="mil-prize-banner-row mil-prize-banner-row--3col">
                        <span className="mil-prize-banner-cell mil-prize-banner-cell--left">
                          <span className="mil-prize-banner-tiny">Se errar</span>
                          {formatMilPrize(lossPrize)}
                        </span>
                        <span className="mil-prize-banner-cell mil-prize-banner-cell--mid">
                          <span className="mil-prize-banner-tiny">Se parar</span>
                          {formatMilPrize(stopPrize)}
                        </span>
                        <span className="mil-prize-banner-cell mil-prize-banner-cell--right">
                          <span className="mil-prize-banner-tiny">
                            {hasNext ? 'Próximo' : 'Última!'}
                          </span>
                          {hasNext ? formatMilPrize(nextPrize) : '🏆'}
                        </span>
                      </div>
                      {canStop && (
                        <button
                          type="button"
                          className="mil-stop-btn"
                          onClick={() => setMilStopConfirmOpen(true)}
                        >
                          🛑 Parar e levar {formatMilPrize(stopPrize)}
                        </button>
                      )}
                    </div>
                  )
                })()}

                {getContextIds(question).map((cid) => {
                  const ctx = contexts[cid]
                  if (!ctx) return null
                  const ctxObj = typeof ctx === 'object' ? ctx : { text: ctx }
                  const isExpanded = contextExpanded[cid] !== false
                  return (
                    <div key={cid} className="question-context">
                      <button
                        type="button"
                        className="question-context-toggle"
                        onClick={() => setContextExpanded((prev) => ({ ...prev, [cid]: !isExpanded }))}
                        aria-expanded={isExpanded}
                      >
                        <span className="question-context-chevron">{isExpanded ? '▲' : '▼'}</span>
                        <span className="question-context-title" dangerouslySetInnerHTML={{ __html: richHtml(ctxObj.title ?? 'Texto de referência') }} />
                        <span className="question-context-chevron">{isExpanded ? '▲' : '▼'}</span>
                      </button>
                      {isExpanded && (
                        <div className="question-context-body">
                          {ctxObj.subtitle && <p className="ctx-subtitle" dangerouslySetInnerHTML={{ __html: richHtml(ctxObj.subtitle) }} />}
                          {parseStemSegments(ctxObj.text ?? '', ctxObj.images ?? []).map((seg, i) =>
                            seg.type === 'text' ? (
                              <div key={i} className="ctx-text" dangerouslySetInnerHTML={{ __html: richHtml(seg.text) }} />
                            ) : (
                              <figure key={i} className="q-figure">
                                <img
                                  src={publicImageSrc(seg.src)}
                                  alt={seg.caption ? String(seg.caption).slice(0, 200) : ''}
                                  loading="lazy"
                                  decoding="async"
                                />
                                <button
                                  type="button"
                                  className="figure-zoom-btn"
                                  aria-label="Ampliar imagem"
                                  onClick={() => setLightboxImage({ src: publicImageSrc(seg.src), caption: seg.caption || '' })}
                                >
                                  <ZoomInIcon />
                                </button>
                                {seg.caption != null && seg.caption !== '' && (
                                  <figcaption className="q-figure-caption" dangerouslySetInnerHTML={{ __html: richHtmlBr(seg.caption) }} />
                                )}
                              </figure>
                            )
                          )}
                          {ctxObj.reference && <p className="ctx-reference" dangerouslySetInnerHTML={{ __html: richHtmlBr(ctxObj.reference) }} />}
                        </div>
                      )}
                    </div>
                  )
                })}

                <div className="card">
                  <div className="question-stem" aria-label="Enunciado">
                    {stemSegments.map((seg, i) =>
                      seg.type === 'text' ? (
                        <div key={i} className="question-text-block" dangerouslySetInnerHTML={{ __html: richHtml(seg.text) }} />
                      ) : (
                        <figure key={i} className="q-figure">
                          <img
                            src={publicImageSrc(seg.src)}
                            alt={seg.caption ? String(seg.caption).slice(0, 200) : 'Figura do enunciado'}
                            loading="lazy"
                            decoding="async"
                          />
                          <button
                            type="button"
                            className="figure-zoom-btn"
                            aria-label="Ampliar imagem"
                            onClick={() => setLightboxImage({ src: publicImageSrc(seg.src), caption: seg.caption || '' })}
                          >
                            <ZoomInIcon />
                          </button>
                          {seg.caption != null && seg.caption !== '' && (
                            <figcaption className="q-figure-caption" dangerouslySetInnerHTML={{ __html: richHtmlBr(seg.caption) }} />
                          )}
                        </figure>
                      ),
                    )}
                  </div>

                  {gameMode === 'milionario' && (
                    <div className="mil-lifelines" aria-label="Ajudas do Milhão">
                      <button
                        type="button"
                        className={`mil-life-btn mil-life-btn--cartas${milCardsLeft <= 0 ? ' is-used' : ''}`}
                        onClick={() => milUseHelp('cartas')}
                        disabled={milCardsLeft <= 0 || !!selected}
                        title="Elimina 2 alternativas erradas"
                      >
                        <span className="mil-life-icon">🃏</span>
                        <span className="mil-life-label">Cartas</span>
                      </button>
                      <button
                        type="button"
                        className={`mil-life-btn mil-life-btn--univ${milUnivLeft <= 0 ? ' is-used' : ''}`}
                        onClick={() => milUseHelp('univ')}
                        disabled={milUnivLeft <= 0 || !!selected}
                        title="3 universitários opinam"
                      >
                        <span className="mil-life-icon">🎓</span>
                        <span className="mil-life-label">Universitários</span>
                      </button>
                      <button
                        type="button"
                        className={`mil-life-btn mil-life-btn--placas${milPlacasLeft <= 0 ? ' is-used' : ''}`}
                        onClick={() => milUseHelp('placas')}
                        disabled={milPlacasLeft <= 0 || !!selected}
                        title="Placas — votação por letra"
                      >
                        <span className="mil-life-icon">🪧</span>
                        <span className="mil-life-label">Placas</span>
                      </button>
                      <button
                        type="button"
                        className={`mil-life-btn mil-life-btn--skip${milSkipsLeft <= 0 ? ' is-used' : ''}`}
                        onClick={milSkipQuestion}
                        disabled={milSkipsLeft <= 0 || !!selected}
                        title="Pulo Integrar — pular esta questão"
                      >
                        <span className="mil-life-icon">⏭</span>
                        <span className="mil-life-label">Pulo Integrar ({milSkipsLeft})</span>
                      </button>
                    </div>
                  )}

                  <ul className="alternatives">
                    {displayAlts.map(({ displayLabel, origLetter, rawContent, altImg }) => {
                      const isPending = !selected && pendingSelection === origLetter
                      const isConfirmedCorrect = showAnswer && selected !== null && question.answer !== 'annulled' && origLetter === question.answer
                      const isConfirmedWrong = showAnswer && selected !== null && question.answer !== 'annulled' && origLetter === selected && !attempt?.correct
                      const isMilEliminated = gameMode === 'milionario' && milEliminatedLetters.includes(origLetter)
                      const stacked = Boolean(altImg)
                      const altCaption = stacked ? captionFromBracketText(rawContent) : ''
                      const altLabel = alternativeLabelForDisplay(rawContent, stacked)
                      return (
                        <li key={origLetter}>
                          <button
                            type="button"
                            className={`alt-btn ${isConfirmedCorrect ? 'alt-btn--confirmed-correct' : ''} ${isConfirmedWrong ? 'alt-btn--confirmed-wrong' : ''} ${isPending ? 'alt-btn--pending' : ''} ${stacked ? 'alt-btn--stack' : ''}${isMilEliminated ? ' alt-btn--mil-out' : ''}`}
                            onClick={() => {
                              if (selected) return
                              if (isMilEliminated) return
                              if (gameMode) commitGameAnswer(origLetter)
                              else setPendingSelection(origLetter)
                            }}
                            disabled={selected !== null || isMilEliminated}
                          >
                            <div className="alt-row">
                              <span className="alt-letter">{displayLabel.toUpperCase()}</span>
                              {altLabel !== '' && <span className="alt-text" dangerouslySetInnerHTML={{ __html: richHtml(altLabel) }} />}
                            </div>
                            {altImg && (
                              <figure className="alt-figure">
                                <img
                                  className="alt-figure-img"
                                  src={publicImageSrc(altImg)}
                                  alt={altCaption || 'Figura da alternativa'}
                                  loading="lazy"
                                  decoding="async"
                                />
                                {/* span+role to avoid invalid nested <button> */}
                                <span
                                  role="button"
                                  tabIndex={0}
                                  className="figure-zoom-btn"
                                  aria-label="Ampliar imagem"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    e.preventDefault()
                                    setLightboxImage({ src: publicImageSrc(altImg), caption: altCaption || '' })
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.stopPropagation()
                                      e.preventDefault()
                                      setLightboxImage({ src: publicImageSrc(altImg), caption: altCaption || '' })
                                    }
                                  }}
                                >
                                  <ZoomInIcon />
                                </span>
                                {altCaption && (
                                  <figcaption className="alt-figure-caption" dangerouslySetInnerHTML={{ __html: richHtmlBr(altCaption) }} />
                                )}
                              </figure>
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>

                  {showAnswer && selected && attempt && (() => {
                    if (question.answer === 'annulled') {
                      return (
                        <div className="feedback feedback--annulled" role="status">
                          Esta questão foi <strong>anulada</strong> pelo ENEM e não conta para sua pontuação.
                        </div>
                      )
                    }
                    const correctLabel = (displayAlts.find(a => a.origLetter === question.answer)?.displayLabel ?? question.answer ?? '').toUpperCase()
                    const selectedLabel = (displayAlts.find(a => a.origLetter === selected)?.displayLabel ?? selected ?? '').toUpperCase()
                    return (
                      <div
                        className={`feedback ${attempt.correct ? 'feedback--correct' : 'feedback--wrong'}`}
                        role="status"
                      >
                        {attempt.correct
                          ? 'Correto.'
                          : `Incorreto. A alternativa correta é ${correctLabel}.`}
                        {' '}Sua resposta: <strong>{selectedLabel}</strong>.
                      </div>
                    )
                  })()}

                  {showAnswer && attempt && (() => {
                    const expKey = `${question.area}:${question.year}:${question.test}:${question.number}`
                    const currentText = explanationOverrides[expKey] ?? question.explanation ?? ''
                    const canEdit = user?.role === 'prof' || user?.role === 'admin'
                    return (
                      <ExplanationBlock
                        text={currentText}
                        canEdit={canEdit}
                        onSave={async (newText) => {
                          const res = await fetch('/api/explanations', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                            body: JSON.stringify({
                              area: question.area,
                              year: question.year,
                              test: question.test,
                              number: question.number,
                              explanation: newText,
                            }),
                          })
                          if (!res.ok) throw new Error('Falha ao salvar')
                          setExplanationOverrides((prev) => ({ ...prev, [expKey]: newText }))
                        }}
                      />
                    )
                  })()}
                </div>

                <div className="tags">
                  {question.tags.map((tag) => (
                    <span key={tag} className="tag">{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <aside
            id="session-notebook"
            className={`notebook-panel ${notebookOpen ? 'is-open' : ''}`}
            aria-label="Bloco de notas da sessão"
            aria-hidden={!notebookOpen}
          >
            <div className="notebook-panel-inner">
              <div className="notebook-panel-head">
                <h2 className="notebook-panel-title">Caderno</h2>
                <button type="button" className="notebook-close" onClick={() => setNotebookOpen(false)} aria-label="Fechar caderno">×</button>
              </div>
              <p className="notebook-hint">Anotações nesta aba até fechá-la.</p>
              <div className="notebook-toolbar" role="toolbar" aria-label="Formatação do texto">
                <button type="button" className="notebook-tool" onMouseDown={applyNotebookFormat('bold')} aria-label="Negrito" title="Negrito"><strong>B</strong></button>
                <button type="button" className="notebook-tool" onMouseDown={applyNotebookFormat('italic')} aria-label="Itálico" title="Itálico"><em>I</em></button>
                <button type="button" className="notebook-tool" onMouseDown={applyNotebookFormat('underline')} aria-label="Sublinhado" title="Sublinhado"><span className="notebook-tool-u">U</span></button>
              </div>
              <div
                ref={notebookEditorRef}
                className="notebook-editor"
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-multiline="true"
                spellCheck
                onInput={syncNotebookFromEditor}
              />
            </div>
          </aside>
        </div>

        <nav className={`question-rail ${railOpen ? 'is-open' : ''}`} ref={railRef} aria-label="Lista de questões">
          <button type="button" className="rail-arrow-btn" onClick={() => scrollRail(-1)} aria-label="Rolar para cima">↑</button>
          <div className="question-rail-scroll" ref={railInnerRef}>
            {sortedQuestions.map((q, idx) => {
              const qk = attemptKey(q)
              const att = attempts[qk]
              const isCurrent = qk === attemptKey(question)
              let stateClass = 'question-rail-btn--idle'
              if (att && showAnswer) stateClass = att.correct ? 'question-rail-btn--ok' : 'question-rail-btn--bad'
              else if (att) stateClass = 'question-rail-btn--answered'
              return (
                <button
                  key={qk}
                  type="button"
                  data-qnum={q.number}
                  className={`question-rail-btn ${stateClass} ${isCurrent ? 'question-rail-btn--current' : ''}`}
                  onClick={() => goToQuestion(q)}
                  aria-current={isCurrent ? 'true' : undefined}
                  aria-label={`Questão ${q.number}${att ? (showAnswer ? (att.correct ? ', correta' : ', incorreta') : ', respondida') : ', não respondida'}`}
                >
                  {att ? (showAnswer ? (att.correct ? '✓' : '✗') : '·') : (isDailyChallenge || selectedArea) ? idx + 1 : q.number}
                </button>
              )
            })}
          </div>
          <button type="button" className="rail-arrow-btn" onClick={() => scrollRail(1)} aria-label="Rolar para baixo">↓</button>
        </nav>
      </div>

      <footer className="question-footer">
        <button
          type="button"
          className={`footer-nav-btn${optionsOpen ? ' active' : ''}`}
          onClick={() => setOptionsOpen((o) => !o)}
          aria-label="Opções"
        >
          <GearIcon />
        </button>
        <button type="button" className="footer-nav-btn" onClick={prev} disabled={isPrevDisabled || !!gameMode} aria-label="Questão anterior">←</button>
        {gameMode ? (
          <div className="footer-game-hud" aria-live="polite">
            {gameMode === 'streak' && (
              <span className="footer-game-hud-streak">🔥 {gameStreak}</span>
            )}
            {gameMode === 'blitz' && (
              <>
                <span className="footer-game-hud-timer">
                  ⏱ {Math.floor(gameTimeLeft / 60)}:{String(gameTimeLeft % 60).padStart(2, '0')}
                </span>
                <span className="footer-game-hud-score">✓ {gameCorrect}</span>
                <span className="footer-game-hud-lives">
                  {['❤️', '❤️', '❤️'].map((h, i) => i < 3 - gameWrongs ? h : '🖤').join('')}
                </span>
              </>
            )}
          </div>
        ) : selected ? (
          <button type="button" className="footer-responder-btn footer-responder-btn--next" onClick={next} disabled={isNextDisabled}>
            Próxima →
          </button>
        ) : (
          <button type="button" className="footer-responder-btn" onClick={confirmAnswer} disabled={!pendingSelection}>
            Responder
          </button>
        )}
        <button type="button" className="footer-nav-btn" onClick={next} disabled={isNextDisabled || !!gameMode} aria-label="Próxima questão">→</button>
        <button
          type="button"
          className={`footer-nav-btn footer-rail-toggle ${railOpen ? 'active' : ''}`}
          onClick={() => setRailOpen((o) => !o)}
          aria-label={railOpen ? 'Ocultar lista de questões' : 'Mostrar lista de questões'}
          title={railOpen ? 'Ocultar lista' : 'Mostrar lista'}
        >
          <NumberedListIcon />
        </button>
      </footer>

      {feedbackOpen && (
        <FeedbackModal
          questionInfo={feedbackQuestion}
          token={token}
          onClose={() => setFeedbackOpen(false)}
        />
      )}

      {lightboxImage && (
        <div className="lightbox-overlay" role="dialog" aria-modal="true" onClick={() => setLightboxImage(null)}>
          <button
            type="button"
            className="lightbox-close"
            onClick={(e) => { e.stopPropagation(); setLightboxImage(null) }}
            aria-label="Fechar"
          >×</button>
          <img
            src={lightboxImage.src}
            alt={lightboxImage.caption || 'Imagem ampliada'}
            className="lightbox-image"
            onClick={(e) => e.stopPropagation()}
          />
          {lightboxImage.caption && (
            <div
              className="lightbox-caption"
              onClick={(e) => e.stopPropagation()}
              dangerouslySetInnerHTML={{ __html: richHtmlBr(lightboxImage.caption) }}
            />
          )}
        </div>
      )}

      {milActiveHelp && question && (() => {
        // Bridge from the data's original letter (used by help generators) to
        // the on-screen label (which may be shuffled by `randomizeAlts`).
        // Without this, the modal says "C 90%" but the C on screen is a
        // different alternative — the player gets misled.
        const origToDisplay = Object.fromEntries(
          displayAlts.map((a) => [a.origLetter, a.displayLabel])
        )
        const labelFor = (orig) => (origToDisplay[orig] ?? orig).toUpperCase()
        return (
        <div className="mil-help-overlay" role="dialog" aria-modal="true" onClick={() => setMilActiveHelp(null)}>
          <div className="mil-help-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="mil-help-close"
              onClick={() => setMilActiveHelp(null)}
              aria-label="Fechar"
            >×</button>

            {milActiveHelp === 'cartas' && (() => {
              const picked = milCartasPickedPos !== null
              const pickedCard = picked ? milCartasDeck[milCartasPickedPos] : null
              const pickedValue = pickedCard?.value ?? null
              const numEliminated = pickedValue ? (MIL_CARTAS_ELIMINATES[pickedValue] ?? 0) : 0
              let subText
              if (!picked) {
                subText = 'Escolha 1 carta. O valor diz quantas erradas saem.'
              } else if (pickedValue === 'K') {
                subText = 'Que zica! Carta K — nenhuma alternativa eliminada.'
              } else if (pickedValue === '4') {
                subText = 'Cartão premiado! Só sobrou a resposta certa.'
              } else if (pickedValue === 'A') {
                subText = 'Tirou o Ás — 1 alternativa errada eliminada.'
              } else {
                subText = `Tirou ${pickedValue} — ${numEliminated} alternativas erradas eliminadas.`
              }
              const renderPips = (value, suit) => {
                if (value === 'A') {
                  return <span className="mil-pip mil-pip--big">{suit}</span>
                }
                if (value === 'K') {
                  return (
                    <>
                      <span className="mil-king-letter">K</span>
                      <span className="mil-pip mil-king-suit">{suit}</span>
                    </>
                  )
                }
                if (value === '2') {
                  return (
                    <>
                      <span className="mil-pip">{suit}</span>
                      <span className="mil-pip mil-pip--flip">{suit}</span>
                    </>
                  )
                }
                if (value === '3') {
                  return (
                    <>
                      <span className="mil-pip">{suit}</span>
                      <span className="mil-pip">{suit}</span>
                      <span className="mil-pip mil-pip--flip">{suit}</span>
                    </>
                  )
                }
                if (value === '4') {
                  return (
                    <>
                      <span className="mil-pip">{suit}</span>
                      <span className="mil-pip">{suit}</span>
                      <span className="mil-pip mil-pip--flip">{suit}</span>
                      <span className="mil-pip mil-pip--flip">{suit}</span>
                    </>
                  )
                }
                return null
              }
              return (
                <>
                  <div className="mil-help-head">
                    <span className="mil-help-icon">🃏</span>
                    <h2 className="mil-help-title">Ajuda das Cartas</h2>
                    <p className="mil-help-sub">{subText}</p>
                  </div>
                  <div className="mil-cards-deck">
                    {milCartasDeck.map((card, p) => {
                      const { value, suit } = card
                      const isRed = suit === '♥' || suit === '♦'
                      const isPicked = milCartasPickedPos === p
                      const isOtherPicked = picked && !isPicked
                      const cls = `mil-card${isPicked ? ' mil-card--flipped' : ''}${isOtherPicked ? ' mil-card--dim' : ''}`
                      const frontCls = `mil-card-face mil-card-face--front${isRed ? ' is-red' : ''}`
                      return (
                        <button
                          key={p}
                          type="button"
                          className={cls}
                          onClick={() => milPickCartasCard(p)}
                          disabled={picked}
                          aria-label={isPicked ? `Carta ${value} de ${suit}` : 'Virar carta'}
                        >
                          <span className="mil-card-inner">
                            <span className="mil-card-face mil-card-face--back" aria-hidden>
                              <span className="mil-card-back-mark">★</span>
                            </span>
                            <span className={frontCls} aria-hidden>
                              <span className="mil-card-corner mil-card-corner--tl">
                                <span className="mil-card-corner-value">{value}</span>
                                <span className="mil-card-corner-suit">{suit}</span>
                              </span>
                              <span className={`mil-card-pip-area mil-card-pip-area--${value}`}>
                                {renderPips(value, suit)}
                              </span>
                              <span className="mil-card-corner mil-card-corner--br">
                                <span className="mil-card-corner-value">{value}</span>
                                <span className="mil-card-corner-suit">{suit}</span>
                              </span>
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </>
              )
            })()}

            {milActiveHelp === 'univ' && milUnivVotes && (
              <>
                <div className="mil-help-head">
                  <span className="mil-help-icon">🎓</span>
                  <h2 className="mil-help-title">Ajuda dos Universitários</h2>
                  <p className="mil-help-sub">3 alunos comentaram</p>
                </div>
                <ul className="mil-help-univ-list">
                  {milUnivVotes.map((u, i) => (
                    <li key={i} className={`mil-help-univ-item${u.isExpert ? ' mil-help-univ-item--expert' : ''}`}>
                      <span className="mil-help-univ-emoji">{u.emoji}</span>
                      <div className="mil-help-univ-info">
                        <span className="mil-help-univ-name">{u.name}</span>
                        <span className="mil-help-univ-course">{u.course}</span>
                        {u.isExpert && (
                          <span className="mil-help-univ-expert">✨ É a minha área!</span>
                        )}
                      </div>
                      <div className="mil-help-univ-vote">
                        <span className="mil-help-univ-letter">{labelFor(u.answer)}</span>
                        <span className="mil-help-univ-sure">
                          {u.sureness >= 0.8 ? 'tenho certeza'
                            : u.sureness >= 0.6 ? 'eu acho'
                            : 'chuto isso'}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {milActiveHelp === 'placas' && milPlacasVotes && (() => {
              const entries = Object.entries(milPlacasVotes)
              const total = entries.reduce((s, [, v]) => s + v, 0) || 1
              // Stable audience size keyed off the question — doesn't flicker between renders.
              const audience = 100 + (((question.number * 2654435761) >>> 0) % 200)
              // Sort by the on-screen label (display label), not the original JSON letter.
              const sorted = [...entries].sort(([a], [b]) => labelFor(a).localeCompare(labelFor(b)))
              return (
                <>
                  <div className="mil-help-head">
                    <span className="mil-help-icon">🪧</span>
                    <h2 className="mil-help-title">Ajuda das Placas</h2>
                    <p className="mil-help-sub">{audience} pessoas levantaram suas placas</p>
                  </div>
                  <ul className="mil-help-placas-list">
                    {sorted.map(([letter, pct]) => {
                      const widthPct = Math.round((pct / total) * 100)
                      return (
                        <li key={letter} className="mil-help-placas-item">
                          <span className="mil-help-placas-letter">{labelFor(letter)}</span>
                          <div className="mil-help-placas-bar">
                            <div
                              className="mil-help-placas-fill"
                              style={{ width: `${widthPct}%` }}
                            />
                          </div>
                          <span className="mil-help-placas-pct">{widthPct}%</span>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )
            })()}

            {(() => {
              const cartasUnpicked = milActiveHelp === 'cartas' && milCartasPickedPos === null
              return (
                <button
                  type="button"
                  className="mil-help-confirm"
                  onClick={() => setMilActiveHelp(null)}
                  disabled={cartasUnpicked}
                >
                  {cartasUnpicked ? 'Escolha uma carta' : 'Entendi'}
                </button>
              )
            })()}
          </div>
        </div>
        )
      })()}

      {milStopConfirmOpen && (() => {
        const stopPrize = getMilStopPrize(milLevel)
        return (
          <div className="fb-overlay" onClick={() => setMilStopConfirmOpen(false)}>
            <div className="fb-modal mil-stop-modal" onClick={(e) => e.stopPropagation()}>
              <div className="fb-head">
                <h2 className="fb-title">Parar agora?</h2>
                <button type="button" className="notebook-close" onClick={() => setMilStopConfirmOpen(false)}>×</button>
              </div>
              <p className="finish-confirm-msg">
                Você sai com <strong>{formatMilPrize(stopPrize)}</strong> garantidos.
                {milLevel + 1 <= MILIONARIO_TOTAL_LEVELS && (
                  <> A próxima pergunta valeria {formatMilPrize(MILIONARIO_PRIZES[Math.min(milLevel, MILIONARIO_TOTAL_LEVELS - 1)])}.</>
                )}
              </p>
              <div className="finish-confirm-actions">
                <button type="button" className="btn--ghost" onClick={() => setMilStopConfirmOpen(false)}>Continuar jogando</button>
                <button
                  type="button"
                  className="home-start-btn"
                  style={{ margin: 0 }}
                  onClick={() => { setMilStopConfirmOpen(false); milStopGame() }}
                >
                  Parar e levar
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {finishConfirmOpen && (() => {
        const incomplete = sortedQuestions.length - Object.keys(attempts).length
        const isFinish = incomplete === 0
        return (
          <div className="fb-overlay" onClick={() => setFinishConfirmOpen(false)}>
            <div className="fb-modal" onClick={e => e.stopPropagation()}>
              <div className="fb-head">
                <h2 className="fb-title">{isFinish ? 'Finalizar prova?' : 'Sair da prova?'}</h2>
                <button type="button" className="notebook-close" onClick={() => setFinishConfirmOpen(false)}>×</button>
              </div>
              {incomplete > 0 ? (
                <p className="finish-confirm-msg">
                  Você ainda tem <strong>{incomplete} {incomplete === 1 ? 'questão não respondida' : 'questões não respondidas'}</strong>. {incomplete === 1 ? 'Ela será' : 'Elas serão'} contabilizada{incomplete === 1 ? '' : 's'} como errada{incomplete === 1 ? '' : 's'}.
                </p>
              ) : (
                <p className="finish-confirm-msg">Todas as questões foram respondidas. Deseja finalizar?</p>
              )}
              <div className="finish-confirm-actions">
                <button type="button" className="btn--ghost" onClick={() => setFinishConfirmOpen(false)}>Cancelar</button>
                <button type="button" className="home-start-btn" style={{ margin: 0 }} onClick={() => { setFinishConfirmOpen(false); finishQuiz() }}>{isFinish ? 'Finalizar' : 'Sair'}</button>
              </div>
            </div>
          </div>
        )
      })()}

      {timerDrawerOpen && (
        <div className="timer-drawer-overlay" onClick={() => setTimerDrawerOpen(false)} />
      )}
      <div className={`timer-drawer${timerDrawerOpen ? ' open' : ''}`}>
        <div className="timer-drawer-row">
          <span className="timer-drawer-label">Questão</span>
          <span className="timer-drawer-value">{formatTime(questionElapsed)}</span>
        </div>
        <div className="timer-drawer-row">
          <span className="timer-drawer-label">Total</span>
          <span className="timer-drawer-value">{formatTime(totalElapsed)}</span>
        </div>
      </div>

      {optionsOpen && (
        <div className="options-overlay" onClick={() => setOptionsOpen(false)} />
      )}
      {optionsOpen && (
        <div className="options-popover options-popover--footer">
          <label className="options-toggle-row">
            <span className="options-toggle-label">Mostrar resposta</span>
            <span className={`options-toggle-switch${showAnswer ? ' on' : ''}`}>
              <input type="checkbox" checked={showAnswer} onChange={(e) => { setShowAnswer(e.target.checked); localStorage.setItem('show-answer', e.target.checked); if (!e.target.checked) { setSoundMuted(true); localStorage.setItem('sound-muted', true) } }} />
              <span className="options-toggle-thumb" />
            </span>
          </label>
          <label className="options-toggle-row">
            <span className="options-toggle-label">Mostrar dificuldade</span>
            <span className={`options-toggle-switch${showDifficulty ? ' on' : ''}`}>
              <input type="checkbox" checked={showDifficulty} onChange={(e) => { setShowDifficulty(e.target.checked); localStorage.setItem('show-difficulty', e.target.checked) }} />
              <span className="options-toggle-thumb" />
            </span>
          </label>
          <div className="options-divider" />
          <label className="options-toggle-row">
            <span className="options-toggle-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>{soundMuted ? <SoundOffIcon /> : <SoundOnIcon />} Som</span>
            <span className={`options-toggle-switch${!soundMuted ? ' on' : ''}`}>
              <input type="checkbox" checked={!soundMuted} onChange={(e) => {
                setSoundMuted(!e.target.checked)
                localStorage.setItem('sound-muted', !e.target.checked)
                if (e.target.checked && !showAnswer) { setShowAnswer(true); localStorage.setItem('show-answer', true) }
              }} />
              <span className="options-toggle-thumb" />
            </span>
          </label>
          <label className="options-toggle-row">
            <span className="options-toggle-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>{dark ? <MoonIcon /> : <SunIcon />} {dark ? 'Modo escuro' : 'Modo claro'}</span>
            <span className={`options-toggle-switch options-toggle-switch--theme${dark ? ' on' : ''}`}>
              <input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} />
              <span className="options-toggle-thumb" />
            </span>
          </label>
          <div className="options-divider" />
          <button type="button" className="options-admin-btn options-admin-btn--danger" onClick={handleLogout}>
            Sair
          </button>
        </div>
      )}
    </div>
  )
}

function AdminPanel({ stats, onBack, dark, setDark, token, embedded = false, explanationOverrides = {}, questionsCount = 0, onExplanationsCleared }) {
  const { users, testResults, dailyResults, feedback, questionSets: initialQuestionSets = [] } = stats
  const [tab, setTab] = useState('students')
  const [clearingExp, setClearingExp] = useState(false)
  const [freezingExp, setFreezingExp] = useState(false)
  const [freezeResult, setFreezeResult] = useState('')

  // Title + favicon overrides are full-screen-only; the home header owns those when embedded.
  useEffect(() => {
    if (embedded) return
    const prevTitle = document.title
    document.title = 'Admin'
    const links = Array.from(document.querySelectorAll("link[rel*='icon']"))
    const prevHrefs = links.map(l => l.href)
    links.forEach(l => { l.href = '/admin-favicon-32.png' })
    return () => {
      document.title = prevTitle
      links.forEach((l, i) => { l.href = prevHrefs[i] })
    }
  }, [embedded])
  const [deleteTarget, setDeleteTarget] = useState(null) // { id, username }
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [deletedIds, setDeletedIds] = useState(new Set())
  const [roleOverrides, setRoleOverrides] = useState({}) // { [userId]: role }
  const [roleLoading, setRoleLoading] = useState(null) // userId being updated
  const [questionSets, setQuestionSets] = useState(initialQuestionSets)
  const [deleteListTarget, setDeleteListTarget] = useState(null) // { id, name, teacher }
  const [deleteListLoading, setDeleteListLoading] = useState(false)
  const [deleteListError, setDeleteListError] = useState('')

  async function handleSetRole(userId, newRole) {
    setRoleLoading(userId)
    try {
      const res = await fetch('/api/admin/set-role', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, role: newRole }),
      })
      if (res.ok) setRoleOverrides(prev => ({ ...prev, [userId]: newRole }))
    } finally {
      setRoleLoading(null)
    }
  }

  async function handleDeleteUser() {
    if (!deleteTarget) return
    setDeleteLoading(true)
    setDeleteError('')
    try {
      const res = await fetch(`/api/admin/delete-user?userId=${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) { setDeleteError(data.error ?? 'Erro ao deletar'); return }
      setDeletedIds(prev => new Set([...prev, deleteTarget.id]))
      setDeleteTarget(null)
    } catch {
      setDeleteError('Erro de rede')
    } finally {
      setDeleteLoading(false)
    }
  }

  async function handleDeleteList() {
    if (!deleteListTarget) return
    setDeleteListLoading(true)
    setDeleteListError('')
    try {
      const res = await fetch(`/api/admin/delete-list?setId=${deleteListTarget.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) { setDeleteListError(data.error ?? 'Erro ao deletar'); return }
      setQuestionSets(prev => prev.filter(s => s.id !== deleteListTarget.id))
      setDeleteListTarget(null)
    } catch {
      setDeleteListError('Erro de rede')
    } finally {
      setDeleteListLoading(false)
    }
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  }

  // Aggregate per-user stats
  const userMap = {}
  for (const u of users) {
    userMap[u.id] = {
      ...u,
      testCount: 0,
      dailyCount: 0,
      bestScore: null,
      totalCorrect: 0,
      totalQuestions: 0,
    }
  }
  for (const r of testResults) {
    if (userMap[r.user_id]) {
      userMap[r.user_id].testCount++
      userMap[r.user_id].totalCorrect += r.score
      userMap[r.user_id].totalQuestions += r.total
      const pct = r.total > 0 ? Math.round((r.score / r.total) * 100) : 0
      if (userMap[r.user_id].bestScore === null || pct > userMap[r.user_id].bestScore) {
        userMap[r.user_id].bestScore = pct
      }
    }
  }
  for (const d of dailyResults) {
    if (userMap[d.user_id]) userMap[d.user_id].dailyCount++
  }

  const sortedUsers = Object.values(userMap).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  const panelInner = (
    <div className={`admin-panel${embedded ? ' admin-panel--embedded' : ''}`}>
      {!embedded && (
        <div className="admin-header">
          <button type="button" className="btn--ghost" onClick={onBack}>← Voltar</button>
          <h1 className="admin-title">Admin</h1>
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setDark((d) => !d)}
            aria-label="Alternar tema"
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      )}

      <div className="admin-summary-cards">
          <div className="admin-card">
            <span className="admin-card-value">{users.length}</span>
            <span className="admin-card-label">Alunos</span>
          </div>
          <div className="admin-card">
            <span className="admin-card-value">{testResults.length}</span>
            <span className="admin-card-label">Simulados feitos</span>
          </div>
          <div className="admin-card">
            <span className="admin-card-value">{dailyResults.length}</span>
            <span className="admin-card-label">Desafios diários</span>
          </div>
          <div className="admin-card">
            <span className="admin-card-value">{feedback.length}</span>
            <span className="admin-card-label">Feedbacks</span>
          </div>
          <div className="admin-card">
            <span className="admin-card-value">{questionsCount}</span>
            <span className="admin-card-label">Questões</span>
          </div>
          <div className="admin-card">
            <span className="admin-card-value">{Object.keys(explanationOverrides).length}</span>
            <span className="admin-card-label">Explicações no banco</span>
          </div>
        </div>

        <div className="admin-tabs">
          {[
            { key: 'students', label: 'Alunos' },
            { key: 'tests', label: 'Simulados' },
            { key: 'daily', label: 'Desafios Diários' },
            { key: 'feedback', label: 'Feedbacks' },
            { key: 'lists', label: 'Listas' },
            { key: 'explanations', label: 'Explicações' },
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`admin-tab ${tab === key ? 'active' : ''}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="admin-table-wrap">
          {tab === 'students' && (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Papel</th>
                  <th>Cadastrado em</th>
                  <th>Simulados</th>
                  <th>Desafios</th>
                  <th>Acertos totais</th>
                  <th>Melhor nota</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedUsers.filter(u => u.role !== 'admin' && !deletedIds.has(u.id)).map((u) => {
                  const currentRole = roleOverrides[u.id] ?? u.role
                  const isProf = currentRole === 'prof'
                  return (
                    <tr key={u.id}>
                      <td><strong>{u.username}</strong></td>
                      <td>
                        <span className={`admin-role-badge admin-role-badge--${currentRole}`}>
                          {isProf ? 'Professor' : 'Aluno'}
                        </span>
                        <button
                          type="button"
                          className="admin-role-toggle-btn"
                          disabled={roleLoading === u.id}
                          onClick={() => handleSetRole(u.id, isProf ? 'user' : 'prof')}
                        >
                          {roleLoading === u.id ? '…' : isProf ? '↓ Remover' : '↑ Professor'}
                        </button>
                      </td>
                      <td>{formatDate(u.created_at)}</td>
                      <td>{u.testCount}</td>
                      <td>{u.dailyCount}</td>
                      <td>
                        {u.totalQuestions > 0
                          ? `${u.totalCorrect}/${u.totalQuestions} (${Math.round((u.totalCorrect / u.totalQuestions) * 100)}%)`
                          : '—'}
                      </td>
                      <td>{u.bestScore !== null ? `${u.bestScore}%` : '—'}</td>
                      <td>
                        <button
                          type="button"
                          className="admin-delete-btn"
                          onClick={() => { setDeleteTarget({ id: u.id, username: u.username }); setDeleteError('') }}
                        >
                          Deletar
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {tab === 'tests' && (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Aluno</th>
                  <th>Prova</th>
                  <th>Ano</th>
                  <th>Dia</th>
                  <th>Nota</th>
                  <th>%</th>
                  <th>Tempo</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {testResults.map((r) => (
                  <tr key={r.id}>
                    <td>{r.username}</td>
                    <td>{r.test}</td>
                    <td>{r.year}</td>
                    <td>{r.day}</td>
                    <td>{r.score}/{r.total}</td>
                    <td>{r.total > 0 ? `${Math.round((r.score / r.total) * 100)}%` : '—'}</td>
                    <td>{formatTime(r.elapsed_secs)}</td>
                    <td>{formatDate(r.answered_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'daily' && (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Aluno</th>
                  <th>Data do desafio</th>
                  <th>Nota</th>
                  <th>%</th>
                  <th>Tempo</th>
                  <th>Concluído em</th>
                </tr>
              </thead>
              <tbody>
                {dailyResults.map((r) => (
                  <tr key={r.id}>
                    <td>{r.username}</td>
                    <td>{r.challenge_date}</td>
                    <td>{r.score}/{r.total}</td>
                    <td>{r.total > 0 ? `${Math.round((r.score / r.total) * 100)}%` : '—'}</td>
                    <td>{formatTime(r.elapsed_secs)}</td>
                    <td>{formatDate(r.completed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'lists' && (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Professor</th>
                  <th>Nome da lista</th>
                  <th>Ano</th>
                  <th>Questões</th>
                  <th>Criada em</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {questionSets.map((s) => (
                  <tr key={s.id}>
                    <td><strong>{s.teacher}</strong></td>
                    <td>{s.name}</td>
                    <td>{s.year ?? '—'}</td>
                    <td>{s.question_count}</td>
                    <td>{formatDate(s.created_at)}</td>
                    <td>
                      <button
                        type="button"
                        className="admin-delete-btn"
                        onClick={() => { setDeleteListTarget({ id: s.id, name: s.name, teacher: s.teacher }); setDeleteListError('') }}
                      >
                        Deletar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'feedback' && (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Aluno</th>
                  <th>Tipo</th>
                  <th>Questão</th>
                  <th>Prova</th>
                  <th>Mensagem</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {feedback.map((f) => (
                  <tr key={f.id}>
                    <td>{f.username ?? 'anônimo'}</td>
                    <td>
                      <span className={`admin-badge admin-badge--${f.type}`}>{f.type}</span>
                    </td>
                    <td>{f.question_number ?? '—'}</td>
                    <td>
                      {[f.question_test, f.question_year, f.question_area ? (AREA_LABELS[f.question_area] ?? f.question_area) : null]
                        .filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="admin-feedback-body">{f.body}</td>
                    <td>{formatDate(f.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'explanations' && (
            <div className="admin-explanations">
              <div className="admin-explanations-step">
                <h3 className="admin-explanations-step-title">1. Congelar para os arquivos JSON</h3>
                <p className="admin-explanations-hint">
                  Lê as <strong>{Object.keys(explanationOverrides).length}</strong> explicação(ões) do banco
                  e escreve em <code>public/*_enem_*.json</code> localmente. Em produção este passo só roda
                  via <code>npm run dev</code>. Depois, revise com <code>git diff</code> e comite.
                </p>
                <button
                  type="button"
                  className="admin-explanations-btn"
                  disabled={freezingExp || Object.keys(explanationOverrides).length === 0}
                  onClick={async () => {
                    setFreezingExp(true); setFreezeResult('')
                    try {
                      const res = await fetch('/api/explanations/freeze', {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}` },
                      })
                      if (res.status === 404) {
                        throw new Error('Freeze só roda localmente. Use npm run dev e clique de novo, ou rode node scripts/freeze-explanations.js no terminal.')
                      }
                      const data = await res.json().catch(() => ({}))
                      if (!res.ok) throw new Error(data.error ?? 'Falha')
                      setFreezeResult(`Congeladas ${data.totalUpdated} questão(ões) em ${data.filesTouched} arquivo(s).`)
                    } catch (err) {
                      setFreezeResult(`Erro: ${err.message ?? 'falha'}`)
                    } finally {
                      setFreezingExp(false)
                    }
                  }}
                >
                  {freezingExp ? 'Congelando…' : 'Rodar freeze script'}
                </button>
                {freezeResult && <p className="admin-explanations-result">{freezeResult}</p>}
              </div>

              <div className="admin-explanations-step">
                <h3 className="admin-explanations-step-title">2. Limpar banco</h3>
                <p className="admin-explanations-hint">
                  Use apenas <strong>depois</strong> de congelar e comitar os JSONs atualizados.
                </p>
                <button
                  type="button"
                  className="admin-delete-btn"
                  disabled={clearingExp || Object.keys(explanationOverrides).length === 0}
                  onClick={async () => {
                    const count = Object.keys(explanationOverrides).length
                    if (count === 0) return
                    if (!window.confirm(`Limpar ${count} explicação(ões) do banco?`)) return
                    setClearingExp(true)
                    try {
                      const res = await fetch('/api/explanations', {
                        method: 'DELETE',
                        headers: { Authorization: `Bearer ${token}` },
                      })
                      if (!res.ok) throw new Error('falha')
                      const data = await res.json().catch(() => ({}))
                      onExplanationsCleared?.()
                      alert(`${data.deleted ?? count} explicação(ões) removida(s) do banco.`)
                    } catch {
                      alert('Falha ao limpar o banco.')
                    } finally {
                      setClearingExp(false)
                    }
                  }}
                >
                  {clearingExp ? 'Limpando…' : 'Limpar banco de explicações'}
                </button>
              </div>
            </div>
          )}
        </div>

      {/* Delete list warning modal — fixed-positioned overlay, inside admin-panel after embed refactor */}
      {deleteListTarget && (
        <div className="admin-modal-overlay" onClick={() => !deleteListLoading && setDeleteListTarget(null)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-warning">
              <span className="admin-modal-warning-icon">⚠️</span>
              <strong>Ação irreversível</strong>
              <p>
                Esta operação irá deletar permanentemente a lista <strong>{deleteListTarget.name}</strong> de <strong>{deleteListTarget.teacher}</strong> e todas as suas questões. Não há como desfazer.
              </p>
            </div>
            <p className="admin-modal-confirm-label">
              Deseja realmente deletar a lista <strong>{deleteListTarget.name}</strong>?
            </p>
            {deleteListError && <p className="auth-error">{deleteListError}</p>}
            <div className="admin-modal-actions">
              <button
                type="button"
                className="admin-modal-btn admin-modal-btn--danger"
                onClick={handleDeleteList}
                disabled={deleteListLoading}
              >
                {deleteListLoading ? 'Deletando…' : 'Deletar permanentemente'}
              </button>
              <button
                type="button"
                className="admin-modal-btn"
                onClick={() => setDeleteListTarget(null)}
                disabled={deleteListLoading}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete user warning modal */}
      {deleteTarget && (
        <div className="admin-modal-overlay" onClick={() => !deleteLoading && setDeleteTarget(null)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-warning">
              <span className="admin-modal-warning-icon">⚠️</span>
              <strong>Ação irreversível</strong>
              <p>
                Esta operação irá deletar permanentemente o usuário <strong>{deleteTarget.username}</strong> e todos os seus dados:
                simulados, desafios diários e feedbacks. Não há como desfazer.
              </p>
            </div>
            <p className="admin-modal-confirm-label">
              Deseja realmente deletar <strong>{deleteTarget.username}</strong>?
            </p>
            {deleteError && <p className="auth-error">{deleteError}</p>}
            <div className="admin-modal-actions">
              <button
                type="button"
                className="admin-modal-btn admin-modal-btn--danger"
                onClick={handleDeleteUser}
                disabled={deleteLoading}
              >
                {deleteLoading ? 'Deletando…' : 'Deletar permanentemente'}
              </button>
              <button
                type="button"
                className="admin-modal-btn"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteLoading}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  return embedded ? panelInner : <div className="app-shell">{panelInner}</div>
}

function FeedbackModal({ questionInfo, token, onClose }) {
  const [type, setType] = useState('bug')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!body.trim()) return
    setSubmitting(true)
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          question_number: questionInfo?.number ?? null,
          question_year: questionInfo?.year ?? null,
          question_test: questionInfo?.test ?? null,
          question_area: questionInfo?.area ?? null,
          type,
          body,
        }),
      })
      setDone(true)
      setTimeout(onClose, 1500)
    } catch {
      // ignore
    } finally {
      setSubmitting(false)
    }
  }

  const titleLine = questionInfo
    ? `Questão ${questionInfo.number}`
    : 'Feedback geral'
  const subtitleLine = questionInfo
    ? [questionInfo.test, questionInfo.year, questionInfo.area ? AREA_LABELS[questionInfo.area] ?? questionInfo.area : null]
        .filter(Boolean).join(' · ')
    : null

  return (
    <div className="fb-overlay" onClick={onClose}>
      <div className="fb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fb-head">
          <div>
            <h2 className="fb-title">{titleLine}</h2>
            {subtitleLine && <p className="fb-subtitle">{subtitleLine}</p>}
          </div>
          <button type="button" className="notebook-close" onClick={onClose}>×</button>
        </div>
        {done ? (
          <p className="fb-done">Enviado! Obrigado.</p>
        ) : (
          <form onSubmit={handleSubmit} className="fb-form">
            <div className="fb-type-row">
              <button
                type="button"
                className={`fb-type-btn ${type === 'bug' ? 'active' : ''}`}
                onClick={() => setType('bug')}
              >
                Problema
              </button>
              <button
                type="button"
                className={`fb-type-btn ${type === 'feedback' ? 'active' : ''}`}
                onClick={() => setType('feedback')}
              >
                Sugestão
              </button>
            </div>
            <textarea
              className="fb-textarea"
              placeholder="Descreva aqui…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              required
            />
            <button
              type="submit"
              className="home-start-btn"
              disabled={submitting || !body.trim()}
            >
              {submitting ? 'Enviando…' : 'Enviar'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
