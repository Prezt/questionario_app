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
const ReviewPage  = lazy(() => import('./ReviewPage.jsx'))
const QuestionEditor = lazy(() => import('./QuestionEditor.jsx'))

// Render text with <b> (bold) and <i> (italic) support.
// All other HTML is escaped, so this is safe even for user-edited content.
function escapeInline(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&lt;b&gt;/gi, '<strong>')
    .replace(/&lt;\/b&gt;/gi, '</strong>')
    .replace(/&lt;i&gt;/gi, '<em>')
    .replace(/&lt;\/i&gt;/gi, '</em>')
    .replace(/&lt;sub&gt;/gi, '<sub>')
    .replace(/&lt;\/sub&gt;/gi, '</sub>')
    .replace(/&lt;sup&gt;/gi, '<sup>')
    .replace(/&lt;\/sup&gt;/gi, '</sup>')
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
    .replace(/&lt;left&gt;/gi, '<span class="txt-left">')
    .replace(/&lt;\/left&gt;/gi, '</span>')
    .replace(/&lt;center&gt;/gi, '<span class="txt-center">')
    .replace(/&lt;\/center&gt;/gi, '</span>')
    .replace(/&lt;right&gt;/gi, '<span class="txt-right">')
    .replace(/&lt;\/right&gt;/gi, '</span>')
    .replace(/&lt;justify&gt;/gi, '<span class="txt-justify">')
    .replace(/&lt;\/justify&gt;/gi, '</span>')
    .replace(/<sup>(.*?)<\/sup><sub>(.*?)<\/sub>/g, '<span class="supsub"><sup>$1</sup><sub>$2</sub></span>')
}
function parseMarkdownTable(tableLines) {
  const dataRows = tableLines.filter(l => !/^\|[\s\-:|]+\|$/.test(l.trim()))
  if (!dataRows.length) return ''
  const parseRow = l => l.split('|').slice(1, -1).map(c => c.trim())
  // Build a row of <th> or <td> elements, merging cells whose content is ">"
  const buildCells = (cells, tag) => {
    const out = []
    let i = 0
    while (i < cells.length) {
      let span = 1
      while (i + span < cells.length && cells[i + span] === '>') span++
      const attr = span > 1 ? ` colspan="${span}"` : ''
      out.push(`<${tag}${attr}>${escapeInline(cells[i])}</${tag}>`)
      i += span
    }
    return out.join('')
  }
  const [header, ...body] = dataRows
  const ths = buildCells(parseRow(header), 'th')
  const trs = body.map(l => `<tr>${buildCells(parseRow(l), 'td')}</tr>`).join('')
  return `<table class="q-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`
}
function richHtmlBr(text) {
  if (!text) return ''
  return richHtml(text).replace(/\n/g, '<br>')
}
function richHtml(text) {
  if (!text) return ''
  const lines = text.split('\n')
  const parts = []
  let tableLines = [], plainLines = []
  const flushPlain = () => { if (plainLines.length) { parts.push(escapeInline(plainLines.join('\n'))); plainLines = [] } }
  const flushTable = () => { if (tableLines.length) { parts.push(parseMarkdownTable(tableLines)); tableLines = [] } }
  for (const line of lines) {
    if (line.trim().startsWith('|')) { flushPlain(); tableLines.push(line) }
    else { flushTable(); plainLines.push(line) }
  }
  flushPlain(); flushTable()
  return parts.join('')
}

const ATTEMPTS_SESSION_KEY = 'questionario-tentativas'
const PAUSED_SESSION_KEY   = 'questionario-sessao'

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

function loadAttemptsFromSession() {
  if (typeof sessionStorage === 'undefined') return {}
  try {
    const raw = sessionStorage.getItem(ATTEMPTS_SESSION_KEY)
    if (!raw) return {}
    const o = JSON.parse(raw)
    if (typeof o !== 'object' || o === null) return {}
    const out = {}
    for (const [k, v] of Object.entries(o)) {
      const n = Number(k)
      if (!Number.isNaN(n) && v && typeof v === 'object') out[n] = v
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

const SESSION_NOTES_KEY = 'questionario-caderno'

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

export default function App() {
  if (window.location.pathname === '/review') return <Suspense fallback={null}><ReviewPage /></Suspense>
  if (window.location.pathname === '/editor') return <Suspense fallback={null}><QuestionEditor /></Suspense>

  const [user, setUser] = useState(null)
  // All questions loaded from manifest
  const [allQuestions, setAllQuestions] = useState([])
  const [contexts, setContexts] = useState({}) // { [contextId]: { title, subtitle, text, reference } }
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
  const [selectedArea, setSelectedArea] = useState(null) // 'math' | 'nature' | 'linguagens' | 'humanas'
  const [selectedTag, setSelectedTag] = useState(null)   // unified tag string | null
  const [expandedArea, setExpandedArea] = useState(null) // area panel open on home screen
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
  const [finishConfirmOpen, setFinishConfirmOpen] = useState(false)
  const [timerDrawerOpen, setTimerDrawerOpen] = useState(false)

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
        const [manifest, ctxMap] = await Promise.all([
          fetch('/questions-manifest.json').then((r) => r.json()),
          fetch('/contexts.json').then((r) => r.json()).catch(() => ({})),
        ])
        const datasets = await Promise.all(
          manifest.map((file) => fetch(`/${file}`).then((r) => r.json()).catch(() => []))
        )
        const staticQs = datasets.flat()
        const all = staticQs.sort((a, b) => a.number - b.number)
        setAllQuestions(all)
        setContexts(ctxMap)

        // Auto-restore a paused session if the user is logged in
        const savedUser  = localStorage.getItem('user')
        const savedToken = localStorage.getItem('token')
        const saved      = readPausedSession()
        if (savedUser && savedToken && saved) {
          if (saved.isDailyChallenge && saved.dailyQuestionRefs) {
            // Restore a paused daily challenge session
            const lang = saved.foreignLang ?? 'en'
            const resolved = []
            const variants = {}
            for (const qRef of saved.dailyQuestionRefs) {
              const matches = all.filter(
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
            const deduped  = resolved.filter((q) => !q.language || q.language === lang)
            const currentQ = deduped.find((q) => q.number === saved.currentNumber) ?? deduped[0]
            if (deduped.length > 0 && currentQ) {
              const restoredAttempts = saved.attempts ?? {}
              setForeignLang(lang)
              setQuestions(deduped)
              setQuestion(currentQ)
              setAttempts(restoredAttempts)
              saveAttemptsToSession(restoredAttempts)
              setTotalElapsed(saved.totalElapsed ?? 0)
              setQuestionTimes(saved.questionTimes ?? {})
              accQuestionTimesRef.current = { ...(saved.questionTimes ?? {}) }
              const now = Date.now()
              startTimeRef.current     = now - (saved.totalElapsed ?? 0) * 1000
              const savedQStart = Number(localStorage.getItem('questionario-question-start'))
              questionStartRef.current = savedQStart && savedQStart < now ? savedQStart : now
              prevQuestionNumRef.current = null
              setIsDailyChallenge(true)
              setPhase('quiz')
            }
          } else {
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
              const currentQ = sorted.find((q) => q.number === saved.currentNumber) ?? sorted[0]
              if (sorted.length > 0 && currentQ) {
                const restoredAttempts = saved.attempts ?? {}
                setSelectedTest(saved.selectedTest)
                setSelectedYear(saved.selectedYear)
                setSelectedDay(saved.selectedDay)
                setForeignLang(lang)
                setQuestions(sorted)
                setQuestion(currentQ)
                setAttempts(restoredAttempts)
                saveAttemptsToSession(restoredAttempts)
                setTotalElapsed(saved.totalElapsed ?? 0)
                setQuestionTimes(saved.questionTimes ?? {})
                accQuestionTimesRef.current = { ...(saved.questionTimes ?? {}) }
                const now = Date.now()
                startTimeRef.current   = now - (saved.totalElapsed ?? 0) * 1000
                const savedQStart = Number(localStorage.getItem('questionario-question-start'))
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
      setPhase('home')
    } catch {
      setAuthError('Erro de conexão')
    } finally {
      setAuthLoading(false)
    }
  }, [])

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
      setPhase('home')
    } catch {
      setAuthError('Erro de conexão')
    } finally {
      setAuthLoading(false)
    }
  }, [])

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
    const prevNum = prevQuestionNumRef.current
    if (prevNum !== null && prevNum !== question.number && questionStartRef.current) {
      accQuestionTimesRef.current[prevNum] =
        (accQuestionTimesRef.current[prevNum] || 0) +
        Math.floor((Date.now() - questionStartRef.current) / 1000)
      questionStartRef.current = Date.now()
      try { localStorage.setItem('questionario-question-start', String(questionStartRef.current)) } catch {}
      setQuestionElapsed(0)
    }
    prevQuestionNumRef.current = question.number
  }, [question, phase])

  // Timer tick
  useEffect(() => {
    if (phase !== 'quiz') return
    const id = setInterval(() => {
      if (startTimeRef.current) setTotalElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
      if (questionStartRef.current) {
        setQuestionElapsed(Math.floor((Date.now() - questionStartRef.current) / 1000))
        try { localStorage.setItem('questionario-question-start', String(questionStartRef.current)) } catch {}
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
    setAttempts((a) => {
      if (a[question.number]) return a
      const isAnnulled = question.answer === 'annulled'
      const correct = !isAnnulled && letter === question.answer
      const next = { ...a, [question.number]: { selected: letter, correct, annulled: isAnnulled } }
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
          dailyQuestionRefs: questions.map((q) => ({ area: q.area, year: q.year, test: q.test, number: q.number })),
        }
      : selectedArea
        ? { isAreaMode: true, selectedArea, selectedTag, areaQuestionRefs: questions.map((q) => ({ area: q.area, year: q.year, test: q.test, number: q.number })) }
        : { selectedTest, selectedYear, selectedDay }
    savePausedSession({
      ...sessionData,
      foreignLang,
      currentNumber: question.number,
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

  const openAdminPanel = useCallback(async () => {
    setAdminLoading(true)
    setAdminError('')
    try {
      const res = await fetch('/api/admin/stats', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) { setAdminError(data.error ?? 'Erro'); return }
      setAdminStats(data)
      setPhase('admin')
    } catch {
      setAdminError('Erro de conexão')
    } finally {
      setAdminLoading(false)
    }
  }, [token])

  const pauseQuiz = useCallback(() => {
    // Snapshot times before leaving
    if (questionStartRef.current && question) {
      accQuestionTimesRef.current[question.number] =
        (accQuestionTimesRef.current[question.number] || 0) +
        Math.floor((Date.now() - questionStartRef.current) / 1000)
    }
    const currentTotal = startTimeRef.current
      ? Math.floor((Date.now() - startTimeRef.current) / 1000)
      : totalElapsed
    const sessionData = isDailyChallenge
      ? {
          isDailyChallenge: true,
          dailyQuestionRefs: questions.map((q) => ({ area: q.area, year: q.year, test: q.test, number: q.number })),
        }
      : selectedArea
        ? { isAreaMode: true, selectedArea, selectedTag, areaQuestionRefs: questions.map((q) => ({ area: q.area, year: q.year, test: q.test, number: q.number })) }
        : { selectedTest, selectedYear, selectedDay }
    savePausedSession({
      ...sessionData,
      foreignLang,
      currentNumber: question?.number,
      attempts,
      totalElapsed: currentTotal,
      questionTimes: { ...accQuestionTimesRef.current },
    })
    startTimeRef.current   = null
    questionStartRef.current = null
    try { localStorage.removeItem('questionario-question-start') } catch {}
    setPhase('home')
  }, [question, totalElapsed, attempts, selectedTest, selectedYear, selectedDay, selectedArea, selectedTag, foreignLang])

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
    const currentQ = sorted.find((q) => q.number === saved.currentNumber) ?? sorted[0]
    if (!currentQ) return
    const restoredAttempts = saved.attempts ?? {}

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
    setQuestionTimes(saved.questionTimes ?? {})
    accQuestionTimesRef.current    = { ...(saved.questionTimes ?? {}) }
    const now = Date.now()
    startTimeRef.current           = now - (saved.totalElapsed ?? 0) * 1000
    questionStartRef.current       = now
    prevQuestionNumRef.current     = null
    if (saved.isDailyChallenge) setIsDailyChallenge(true)
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

  const startDailyChallenge = useCallback(async () => {
    setDailyChallengeLoading(true)
    setDailyChallengeResult(null)
    try {
      // Check if today's challenge exists and if user already completed it
      const res = await fetch('/api/daily-challenge', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()

      if (data.completed) {
        setDailyChallengeResult({ score: data.completed.score, total: data.completed.total })
        return
      }

      let questionRefs = data.questions

      if (!questionRefs) {
        // First access today — send candidates so server can create the challenge
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
        const postData = await postRes.json()

        if (postData.completed) {
          setDailyChallengeResult({ score: postData.completed.score, total: postData.completed.total })
          return
        }
        questionRefs = postData.questions
      }

      if (!questionRefs?.length) return

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
      if (sorted.length === 0) return

      clearPausedSession()
      setAttempts({})
      saveAttemptsToSession({})
      const now = Date.now()
      startTimeRef.current       = now
      questionStartRef.current   = now
      accQuestionTimesRef.current = {}
      prevQuestionNumRef.current = null
      setIsDailyChallenge(true)
      setQuestions(sorted)
      setQuestion(sorted[0])
      setTotalElapsed(0)
      setQuestionElapsed(0)
      setPhase('quiz')
    } catch (err) {
      console.error('Erro ao carregar desafio diário:', err)
    } finally {
      setDailyChallengeLoading(false)
    }
  }, [allQuestions, token, foreignLang])

  const startAreaQuiz = useCallback((area, tag = null) => {
    const pool = allQuestions.filter((q) =>
      q.area === area &&
      (tag === null || q.tags?.includes(tag))
    )
    if (pool.length === 0) return

    // Build language variant lookup
    const variants = {}
    pool.forEach((q) => {
      if (q.language) {
        if (!variants[q.number]) variants[q.number] = {}
        variants[q.number][q.language] = q
      }
    })
    langVariantsRef.current = variants

    const deduped = pool.filter((q) => !q.language || q.language === foreignLang)
    const shuffled = [...deduped]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    const picked = shuffled.slice(0, 10)

    clearPausedSession()
    setAttempts({})
    saveAttemptsToSession({})
    setSelectedArea(area)
    setSelectedTag(tag)
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

  const finishQuiz = useCallback(() => {
    if (questionStartRef.current && question) {
      accQuestionTimesRef.current[question.number] =
        (accQuestionTimesRef.current[question.number] || 0) +
        Math.floor((Date.now() - questionStartRef.current) / 1000)
    }
    const finalTotal = startTimeRef.current
      ? Math.floor((Date.now() - startTimeRef.current) / 1000)
      : totalElapsed
    setTotalElapsed(finalTotal)
    setQuestionTimes({ ...accQuestionTimesRef.current })
    startTimeRef.current = null
    questionStartRef.current = null
    try { localStorage.removeItem('questionario-question-start') } catch {}
    clearPausedSession()

    setTriScores(calcTriScores(questions, attempts))

    // Persist result to DB (fire-and-forget — never blocks UI)
    if (token) {
      const score = Object.values(attempts).filter((a) => a.correct).length
      const scorableTotal = questions.filter((q) => q.answer !== 'annulled').length
      if (isDailyChallenge) {
        fetch('/api/daily-challenge/result', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            score,
            total: scorableTotal,
            elapsed_secs: finalTotal,
          }),
        }).catch(() => {})
      } else if (!selectedArea && selectedTest !== 'Integrar') {
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

    setPhase('summary')
  }, [question, totalElapsed, token, attempts, questions, selectedTest, selectedYear, selectedDay, selectedArea])

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
    const pausedSession = readPausedSession()

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
                  <strong>{pausedSession.isAreaMode ? areaLabel(pausedSession.selectedArea) : `${pausedSession.selectedTest} ${pausedSession.selectedYear}`}</strong>
                  {pausedSession.isAreaMode && pausedSession.selectedTag && <>{' '}— {pausedSession.selectedTag}</>}
                  {!pausedSession.isAreaMode && <>{' '}— Dia {pausedSession.selectedDay}</>}
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
                Abandonar simulado
              </button>
              <button type="button" className="btn--ghost" onClick={handleLogout}>
                Sair
              </button>
            </div>
          </div>
        </div>
      )
    }

    const availableTests = [...new Set(['ENEM', 'UFSC', ...allQuestions.map((q) => q.test).filter(Boolean)])]
    const isIntegrar = selectedTest === 'Integrar'

    const availableYears = [...new Set(
      allQuestions
        .filter((q) => !selectedTest || q.test === selectedTest)
        .map((q) => q.year)
    )].sort((a, b) => b - a)

    // For Integrar: build unique {day, teacher, year} entries
    const integrarQs = isIntegrar ? allQuestions.filter(q => q.test === 'Integrar') : []
    const integrarYears = isIntegrar
      ? [...new Set(integrarQs.map(q => q.year).filter(Boolean))].sort((a, b) => b - a)
      : []
    // Unique sets filtered by optional year selection
    const integrarSetsFiltered = isIntegrar
      ? (() => {
          const seen = new Set()
          return integrarQs
            .filter(q => !selectedIntegrarYear || q.year === selectedIntegrarYear)
            .reduce((acc, q) => {
              const key = `${q.teacher}::${q.day}`
              if (!seen.has(key)) { seen.add(key); acc.push({ name: q.day, teacher: q.teacher, year: q.year }) }
              return acc
            }, [])
        })()
      : []

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

    return (
      <div className="app-shell">
        <div className="home-screen">
          <div className="home-topbar">
            <span className="home-greeting">Olá, {user?.username}</span>
            <button
              type="button"
              className="theme-toggle home-theme-btn"
              onClick={() => setDark((d) => !d)}
              aria-label="Alternar tema"
            >
              {dark ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>

          <div className="home-card">
            <div className="home-logo-wrap">
              <img
                src="/figuras/logos/integrar-logo-transparent.png"
                alt="Integrar"
                className="home-logo"
              />
            </div>
            <h1 className="home-title">Questionário</h1>

            <div className="home-filters">
              {/* Step 1 — Prova */}
              <div className="home-filter-group">
                <span className="home-filter-label">Prova</span>
                <div className="home-test-seg">
                  {availableTests.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`home-test-seg-btn${selectedTest === t ? ' active' : ''}`}
                      onClick={() => {
                        setSelectedTest(t)
                        setSelectedYear(null)
                        setSelectedDay(null)
                        setSelectedIntegrarYear(null)
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 2 — Integrar: optional year filter */}
              {isIntegrar && integrarYears.length > 0 && (
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

              {/* Step 3 — Integrar: choose list */}
              {isIntegrar && (
                <div className="home-filter-group">
                  <span className="home-filter-label">Lista</span>
                  <div className="home-filter-pills">
                    {integrarSetsFiltered.length === 0 && (
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-soft)' }}>Nenhuma lista disponível</span>
                    )}
                    {integrarSetsFiltered.map(({ name, teacher, year }) => {
                      const setKey = `${teacher}::${name}`
                      const isActive = selectedDay === setKey
                      return (
                        <button
                          key={setKey}
                          type="button"
                          className={`home-filter-pill home-filter-pill--wide home-day-pill ${isActive ? 'active' : ''}`}
                          onClick={() => { setSelectedYear(year ?? null); setSelectedDay(setKey) }}
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
              )}

              {/* Step 2 — Ano (non-Integrar tests) */}
              {!isIntegrar && (
              <div className="home-filter-group">
                <span className="home-filter-label">Ano</span>
                <div className="home-filter-pills home-year-grid">
                  {availableYears.map((y) => {
                    const tier = yearTier(y)
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
                        <span>{y}</span>
                        {tier === 'perfect' && <span className="home-year-star">★</span>}
                        {tier === 'great'   && <span className="home-year-star">✓</span>}
                        {tier === 'done'    && <span className="home-year-check">●</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
              )}

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
            </div>

            <button
              type="button"
              className="home-start-btn"
              onClick={startQuiz}
              disabled={!canStart}
            >
              Iniciar
            </button>

            {selectedTest === 'ENEM' && (
              <>
                <div className="home-divider" />

                {dailyChallengeResult ? (
                  <div className="daily-done-banner">
                    <span className="daily-done-icon">★</span>
                    <span>
                      Desafio de hoje concluído!{' '}
                      <strong>{dailyChallengeResult.score}/{dailyChallengeResult.total}</strong> corretas
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="home-daily-btn"
                    onClick={startDailyChallenge}
                    disabled={dailyChallengeLoading}
                  >
                    {dailyChallengeLoading ? 'Carregando…' : '★ Desafio Diário'}
                  </button>
                )}

                <div className="home-divider" />

                <div className="home-area-section">
                  <span className="home-filter-label">Estudar por área</span>
                  <div className="home-area-day-group">
                    <span className="home-area-day-label">Dia 1</span>
                    <div className="home-area-grid">
                      {(['linguagens', 'humanas']).map((area) => (
                        <button
                          key={area}
                          type="button"
                          className="home-area-pill"
                          onClick={() => startAreaQuiz(area)}
                        >
                          {areaLabel(area)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="home-area-day-group">
                    <span className="home-area-day-label">Dia 2</span>
                    <div className="home-area-grid">
                      {(['math', 'nature']).map((area) => (
                        <button
                          key={area}
                          type="button"
                          className="home-area-pill"
                          onClick={() => startAreaQuiz(area)}
                        >
                          {areaLabel(area)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            <button
              type="button"
              className="btn--ghost"
              onClick={handleLogout}
            >
              Sair
            </button>
          </div>
        </div>

        {/* ── Gear options FAB ── */}
        {optionsOpen && (
          <div className="options-overlay" onClick={() => setOptionsOpen(false)} />
        )}
        <div className="options-fab-wrap">
          {optionsOpen && (
            <div className="options-popover">
              <label className="options-toggle-row">
                <span className="options-toggle-label">Embaralhar alternativas</span>
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
              <label className="options-toggle-row">
                <span className="options-toggle-label">Mostrar resposta</span>
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
              <label className="options-toggle-row">
                <span className="options-toggle-label">Mostrar dificuldade</span>
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
              {(user?.role === 'prof' || user?.role === 'admin') && (
                <button
                  type="button"
                  className="options-admin-btn"
                  onClick={() => { window.location.href = '/editor' }}
                >
                  Criar
                </button>
              )}
              {user?.role === 'admin' && (
                <button
                  type="button"
                  className="options-admin-btn"
                  onClick={() => { setOptionsOpen(false); openAdminPanel() }}
                  disabled={adminLoading}
                >
                  {adminLoading ? 'Carregando…' : 'Painel Admin'}
                </button>
              )}
              {adminError && <p className="auth-error" style={{ margin: 0 }}>{adminError}</p>}
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
              {clearHistoryConfirm ? (
                <div className="options-confirm-row">
                  <span className="options-confirm-label">Tem certeza?</span>
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
                  className="options-admin-btn options-admin-btn--danger"
                  onClick={() => setClearHistoryConfirm(true)}
                >
                  Limpar histórico
                </button>
              )}
            </div>
          )}
          <button
            type="button"
            className={`options-fab${optionsOpen ? ' active' : ''}`}
            onClick={() => setOptionsOpen((o) => !o)}
            aria-label="Opções"
          >
            <GearIcon />
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'admin' && adminStats) {
    return <AdminPanel stats={adminStats} onBack={() => setPhase('home')} dark={dark} setDark={setDark} token={token} />
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

  if (!question) return <div className="center">Carregando...</div>

  const letters = Object.keys(question.alternatives)
  const images = question.images ?? []
  const hasStemImg = images.length > 0 && images.length === letters.length + 1
  const altImgsOnly = images.length > 0 && images.length === letters.length
  const isPrevDisabled = questionIndex <= 0
  const isNextDisabled = questionIndex >= sortedQuestions.length - 1
  const altImageFor = (index) => hasStemImg ? images[index + 1] : altImgsOnly ? images[index] : null
  const attempt = attempts[question.number]
  const selected = attempt?.selected ?? null

  // ── Summary ───────────────────────────────────────────────────────────────
  if (phase === 'summary') {
    const annulledNumbers = new Set(sortedQuestions.filter((q) => q.answer === 'annulled').map((q) => q.number))
    const scorableQuestions = sortedQuestions.filter((q) => !annulledNumbers.has(q.number))
    const answeredCount = Object.entries(attempts).filter(([num]) => !annulledNumbers.has(Number(num))).length
    const correctCount = Object.values(attempts).filter((a) => a.correct).length
    const wrongCount = answeredCount - correctCount
    const unansweredCount = scorableQuestions.length - answeredCount
    const avgTime = answeredCount > 0
      ? Math.round(Object.values(questionTimes).reduce((s, t) => s + t, 0) / answeredCount)
      : 0

    // ── Subject breakdown ────────────────────────────────────────────────
    const tagStats = {}
    scorableQuestions.forEach((q) => {
      const att = attempts[q.number]
      const t = questionTimes[q.number] || 0
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
                  // Show the completed banner on home
                  const score = Object.values(attempts).filter((a) => a.correct).length
                  setDailyChallengeResult({ score, total: sortedQuestions.length })
                }
                setPhase('home')
              }}
            >
              {isDailyChallenge ? 'Voltar ao início' : 'Reiniciar'}
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
            </div>
            <span className="summary-score-pct">
              {sortedQuestions.length > 0
                ? Math.round((correctCount / sortedQuestions.length) * 100)
                : 0}%
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
                    const att = attempts[q.number]
                    const t = questionTimes[q.number]
                    const rowClass = att ? (att.correct ? 'summary-row--ok' : 'summary-row--bad') : ''
                    return (
                      <tr key={q.number} className={rowClass}>
                        <td className="summary-td-num">{q.number}</td>
                        <td>{att?.selected?.toUpperCase() ?? <span className="summary-dash">—</span>}</td>
                        <td>{q.answer.toUpperCase()}</td>
                        <td className="summary-td-result">
                          {att
                            ? att.correct
                              ? <span className="summary-tick">✓</span>
                              : <span className="summary-cross">✗</span>
                            : <span className="summary-dash">—</span>}
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
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-left">
          <span className="app-header-title">
            <img
              src="/figuras/logos/integrar-logo-transparent.png"
              alt="Integrar"
              className="app-header-logo"
            />
          </span>
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
            <button type="button" className="header-icon-btn" onClick={pauseQuiz} aria-label="Pausar">
              <PauseIcon />
            </button>
            <button type="button" className="header-finish-btn" onClick={() => setFinishConfirmOpen(true)} aria-label="Finalizar">
              <FinishIcon />
            </button>
            <button
              type="button"
              className="notebook-toggle header-icon-btn--report"
              onClick={() => { setFeedbackQuestion(question?.number ?? null); setFeedbackOpen(true) }}
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
              <button type="button" className="header-menu-item header-menu-item--report" onClick={() => { setHeaderMenuOpen(false); setFeedbackQuestion(question?.number ?? null); setFeedbackOpen(true) }}>
                <WarnIcon /> <span>Reportar problema</span>
              </button>
              <div className="header-menu-divider" />
              <button type="button" className="header-menu-item" onClick={() => { setHeaderMenuOpen(false); pauseQuiz() }}>
                <PauseIcon /> <span>Pausar</span>
              </button>
              <button type="button" className="header-menu-item header-menu-item--finish" onClick={() => { setHeaderMenuOpen(false); setFinishConfirmOpen(true) }}>
                <FinishIcon /> <span>Finalizar</span>
              </button>
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
                    <span className="badge badge-progress">
                      {questionIndex + 1} / {sortedQuestions.length}
                    </span>
                    {(isDailyChallenge || selectedArea) && (
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
                  {question.language && langVariantsRef.current[question.number] && (
                    <div className="lang-toggle" aria-label="Escolha o idioma">
                      <button
                        type="button"
                        className={`lang-toggle-btn ${foreignLang === 'en' ? 'active' : ''}`}
                        onClick={() => switchLang('en')}
                        disabled={!!attempts[question.number]}
                        title="Inglês"
                      >
                        🇬🇧
                      </button>
                      <button
                        type="button"
                        className={`lang-toggle-btn ${foreignLang === 'es' ? 'active' : ''}`}
                        onClick={() => switchLang('es')}
                        disabled={!!attempts[question.number]}
                        title="Espanhol"
                      >
                        🇪🇸
                      </button>
                    </div>
                  )}
                </header>

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
                          {seg.caption != null && seg.caption !== '' && (
                            <figcaption className="q-figure-caption" dangerouslySetInnerHTML={{ __html: richHtmlBr(seg.caption) }} />
                          )}
                        </figure>
                      ),
                    )}
                  </div>

                  <ul className="alternatives">
                    {displayAlts.map(({ displayLabel, origLetter, rawContent, altImg }) => {
                      const isPending = !selected && pendingSelection === origLetter
                      const isConfirmedCorrect = showAnswer && selected !== null && question.answer !== 'annulled' && origLetter === question.answer
                      const isConfirmedWrong = showAnswer && selected !== null && question.answer !== 'annulled' && origLetter === selected && !attempt?.correct
                      const stacked = Boolean(altImg)
                      const altCaption = stacked ? captionFromBracketText(rawContent) : ''
                      const altLabel = alternativeLabelForDisplay(rawContent, stacked)
                      return (
                        <li key={origLetter}>
                          <button
                            type="button"
                            className={`alt-btn ${isConfirmedCorrect ? 'alt-btn--confirmed-correct' : ''} ${isConfirmedWrong ? 'alt-btn--confirmed-wrong' : ''} ${isPending ? 'alt-btn--pending' : ''} ${stacked ? 'alt-btn--stack' : ''}`}
                            onClick={() => !selected && setPendingSelection(origLetter)}
                            disabled={selected !== null}
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
              const att = attempts[q.number]
              const isCurrent = q.number === question.number
              let stateClass = 'question-rail-btn--idle'
              if (att && showAnswer) stateClass = att.correct ? 'question-rail-btn--ok' : 'question-rail-btn--bad'
              else if (att) stateClass = 'question-rail-btn--answered'
              return (
                <button
                  key={q.number}
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
        <button type="button" className="footer-nav-btn" onClick={prev} disabled={isPrevDisabled} aria-label="Questão anterior">←</button>
        {selected ? (
          <button type="button" className="footer-responder-btn footer-responder-btn--next" onClick={next} disabled={isNextDisabled}>
            Próxima →
          </button>
        ) : (
          <button type="button" className="footer-responder-btn" onClick={confirmAnswer} disabled={!pendingSelection}>
            Responder
          </button>
        )}
        <button type="button" className="footer-nav-btn" onClick={next} disabled={isNextDisabled} aria-label="Próxima questão">→</button>
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
          questionNumber={feedbackQuestion}
          token={token}
          onClose={() => setFeedbackOpen(false)}
        />
      )}

      {finishConfirmOpen && (() => {
        const incomplete = sortedQuestions.length - Object.keys(attempts).length
        return (
          <div className="fb-overlay" onClick={() => setFinishConfirmOpen(false)}>
            <div className="fb-modal" onClick={e => e.stopPropagation()}>
              <div className="fb-head">
                <h2 className="fb-title">Finalizar prova?</h2>
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
                <button type="button" className="home-start-btn" style={{ margin: 0 }} onClick={() => { setFinishConfirmOpen(false); finishQuiz() }}>Finalizar</button>
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

function AdminPanel({ stats, onBack, dark, setDark, token }) {
  const { users, testResults, dailyResults, feedback } = stats
  const [tab, setTab] = useState('students')

  useEffect(() => {
    const prevTitle = document.title
    document.title = 'Admin'
    const links = Array.from(document.querySelectorAll("link[rel*='icon']"))
    const prevHrefs = links.map(l => l.href)
    links.forEach(l => { l.href = '/admin-favicon-32.png' })
    return () => {
      document.title = prevTitle
      links.forEach((l, i) => { l.href = prevHrefs[i] })
    }
  }, [])
  const [deleteTarget, setDeleteTarget] = useState(null) // { id, username }
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [deletedIds, setDeletedIds] = useState(new Set())
  const [roleOverrides, setRoleOverrides] = useState({}) // { [userId]: role }
  const [roleLoading, setRoleLoading] = useState(null) // userId being updated

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

  return (
    <div className="app-shell">
      <div className="admin-panel">
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
        </div>

        <div className="admin-tabs">
          {[
            { key: 'students', label: 'Alunos' },
            { key: 'tests', label: 'Simulados' },
            { key: 'daily', label: 'Desafios Diários' },
            { key: 'feedback', label: 'Feedbacks' },
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

          {tab === 'feedback' && (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Aluno</th>
                  <th>Tipo</th>
                  <th>Questão</th>
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
                    <td className="admin-feedback-body">{f.body}</td>
                    <td>{formatDate(f.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

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
}

function FeedbackModal({ questionNumber, token, onClose }) {
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
        body: JSON.stringify({ question_number: questionNumber, type, body }),
      })
      setDone(true)
      setTimeout(onClose, 1500)
    } catch {
      // ignore
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fb-overlay" onClick={onClose}>
      <div className="fb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fb-head">
          <h2 className="fb-title">
            {questionNumber ? `Questão ${questionNumber}` : 'Feedback geral'}
          </h2>
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
