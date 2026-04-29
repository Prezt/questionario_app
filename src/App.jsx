import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react'
import './App.css'
import {
  parseStemSegments,
  alternativeLabelForDisplay,
  captionFromBracketText,
} from './parseQuestionFigures.js'

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
    return window.matchMedia('(prefers-color-scheme: dark)').matches
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

  const [isDailyChallenge, setIsDailyChallenge] = useState(false)
  const [dailyChallengeLoading, setDailyChallengeLoading] = useState(false)
  const [dailyChallengeResult, setDailyChallengeResult] = useState(null) // {score, total} if already done today

  // Phase: 'home' | 'quiz' | 'summary' | 'login' | 'admin'
  const [phase, setPhase] = useState('login')

  const [adminStats, setAdminStats] = useState(null)
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminError, setAdminError] = useState('')

  // Homepage filters (step-by-step single select)
  const [selectedTest, setSelectedTest] = useState(null)   // 'ENEM' | 'UFSC' | …
  const [selectedYear, setSelectedYear] = useState(null)   // number
  const [selectedDay, setSelectedDay] = useState(null)     // 1 | 2

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
          manifest.map((file) => fetch(`/${file}`).then((r) => r.json()))
        )
        const all = datasets.flat().sort((a, b) => a.number - b.number)
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
            const sorted   = [...deduped].sort((a, b) => a.number - b.number)
            const currentQ = sorted.find((q) => q.number === saved.currentNumber) ?? sorted[0]
            if (sorted.length > 0 && currentQ) {
              const restoredAttempts = saved.attempts ?? {}
              setForeignLang(lang)
              setQuestions(sorted)
              setQuestion(currentQ)
              setAttempts(restoredAttempts)
              saveAttemptsToSession(restoredAttempts)
              setTotalElapsed(saved.totalElapsed ?? 0)
              setQuestionTimes(saved.questionTimes ?? {})
              accQuestionTimesRef.current = { ...(saved.questionTimes ?? {}) }
              const now = Date.now()
              startTimeRef.current     = now - (saved.totalElapsed ?? 0) * 1000
              questionStartRef.current = now
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
                questionStartRef.current = now
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
    () => [...questions].sort((a, b) => a.number - b.number),
    [questions],
  )

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
      setQuestionElapsed(0)
    }
    prevQuestionNumRef.current = question.number
  }, [question, phase])

  // Timer tick
  useEffect(() => {
    if (phase !== 'quiz') return
    const id = setInterval(() => {
      if (startTimeRef.current) setTotalElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
      if (questionStartRef.current) setQuestionElapsed(Math.floor((Date.now() - questionStartRef.current) / 1000))
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

  const questionIndex = useMemo(() => {
    if (!question) return -1
    return sortedQuestions.findIndex((q) => q.number === question.number)
  }, [question, sortedQuestions])

  const railRef = useRef(null)
  const railInnerRef = useRef(null)

  useLayoutEffect(() => {
    if (!question || !railRef.current || !railInnerRef.current) return
    const railHeight = railRef.current.getBoundingClientRect().height
    const firstBtn = railInnerRef.current.querySelector('.question-rail-btn')
    if (!firstBtn) return
    const btnHeight = firstBtn.getBoundingClientRect().height
    const gap = parseFloat(getComputedStyle(railInnerRef.current).gap) || 0
    const idx = sortedQuestions.findIndex((q) => q.number === question.number)
    if (idx < 0) return
    const translateY = railHeight / 2 - (idx * (btnHeight + gap) + btnHeight / 2)
    railInnerRef.current.style.transform = `translateY(${translateY}px)`
  }, [question, sortedQuestions])

  const next = useCallback(() => {
    if (!question || sortedQuestions.length === 0) return
    const idx = sortedQuestions.findIndex((q) => q.number === question.number)
    if (idx < 0 || idx >= sortedQuestions.length - 1) return
    setQuestion(sortedQuestions[idx + 1])
  }, [question, sortedQuestions])

  const prev = useCallback(() => {
    if (!question || sortedQuestions.length === 0) return
    const idx = sortedQuestions.findIndex((q) => q.number === question.number)
    if (idx <= 0) return
    setQuestion(sortedQuestions[idx - 1])
  }, [question, sortedQuestions])

  const goToQuestion = useCallback((q) => setQuestion(q), [])

  const pickAlternative = useCallback((letter) => {
    if (!question) return
    setAttempts((a) => {
      if (a[question.number]) return a
      const correct = letter === question.answer
      const next = { ...a, [question.number]: { selected: letter, correct } }
      saveAttemptsToSession(next)
      return next
    })
  }, [question])

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
    setPhase('home')
  }, [question, totalElapsed, attempts, selectedTest, selectedYear, selectedDay, foreignLang])

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
      const deduped = resolved.filter((q) => !q.language || q.language === lang)
      sorted = [...deduped].sort((a, b) => a.number - b.number)
    } else {
      const areas    = DAY_AREAS[saved.selectedDay]
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

    if (!saved.isDailyChallenge) {
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
  }, [])

  const startQuiz = useCallback(() => {
    if (!selectedTest || !selectedYear || !selectedDay) return
    const areas = DAY_AREAS[selectedDay]
    const filtered = allQuestions
      .filter((q) => q.test === selectedTest)
      .filter((q) => q.year === selectedYear)
      .filter((q) => areas.includes(q.area))
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
      const deduped = resolved.filter((q) => !q.language || q.language === foreignLang)
      const sorted  = [...deduped].sort((a, b) => a.number - b.number)
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
    clearPausedSession()

    // Persist result to DB (fire-and-forget — never blocks UI)
    if (token) {
      const score = Object.values(attempts).filter((a) => a.correct).length
      if (isDailyChallenge) {
        fetch('/api/daily-challenge/result', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            score,
            total: questions.length,
            elapsed_secs: finalTotal,
            answers: attempts,
          }),
        }).catch(() => {})
      } else {
        fetch('/api/results', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            test: selectedTest,
            year: selectedYear,
            day: selectedDay,
            score,
            total: questions.length,
            elapsed_secs: finalTotal,
            question_times: accQuestionTimesRef.current,
          }),
        }).catch(() => {})
      }
    }

    setPhase('summary')
  }, [question, totalElapsed, token, attempts, questions, selectedTest, selectedYear, selectedDay])

  const stemSegments = useMemo(() => {
    if (!question) return []
    const imgs = question.images ?? []
    const letters = Object.keys(question.alternatives)
    const splitStemAndAlts = imgs.length > 1 && imgs.length === letters.length + 1
    const paths = splitStemAndAlts ? [imgs[0]] : imgs.length > 0 ? imgs : []
    return parseStemSegments(question.text, paths)
  }, [question])

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
            <button
              type="button"
              className="theme-toggle home-theme-btn"
              onClick={() => setDark((d) => !d)}
              aria-label="Alternar tema"
            >
              {dark ? <SunIcon /> : <MoonIcon />}
            </button>
            <div className="home-card">
              <div className="home-logo-wrap">
                <img
                  src={dark ? '/figuras/logos/integrar-logo-dark.png' : '/figuras/logos/integrar-logo-light.png'}
                  alt="Integrar"
                  className="home-logo"
                />
              </div>
              <h1 className="home-title">Prova em andamento</h1>
              <div className="paused-info">
                <p className="paused-info-line">
                  <strong>{pausedSession.selectedTest} {pausedSession.selectedYear}</strong>
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

    const availableTests = [...new Set(allQuestions.map((q) => q.test).filter(Boolean))].sort()
    const availableYears = [...new Set(
      allQuestions
        .filter((q) => !selectedTest || q.test === selectedTest)
        .map((q) => q.year)
    )].sort((a, b) => b - a)

    const canStart = selectedTest && selectedYear && selectedDay

    return (
      <div className="app-shell">
        <div className="home-screen">
          <button
            type="button"
            className="theme-toggle home-theme-btn"
            onClick={() => setDark((d) => !d)}
            aria-label="Alternar tema"
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>

          <div className="home-card">
            <div className="home-logo-wrap">
              <img
                src={dark ? '/figuras/logos/integrar-logo-dark.png' : '/figuras/logos/integrar-logo-light.png'}
                alt="Integrar"
                className="home-logo"
              />
            </div>
            <h1 className="home-title">Questionário</h1>

            <div className="home-filters">
              {/* Step 1 — Prova */}
              <div className="home-filter-group">
                <span className="home-filter-label">Prova</span>
                <div className="home-filter-pills">
                  {availableTests.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`home-filter-pill ${selectedTest === t ? 'active' : ''}`}
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
              <div className={`home-filter-group ${!selectedTest ? 'home-filter-group--locked' : ''}`}>
                <span className="home-filter-label">Ano</span>
                <div className="home-filter-pills">
                  {availableYears.map((y) => (
                    <button
                      key={y}
                      type="button"
                      className={`home-filter-pill ${selectedYear === y ? 'active' : ''}`}
                      disabled={!selectedTest}
                      onClick={() => {
                        setSelectedYear(y)
                        setSelectedDay(null)
                      }}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 3 — Dia */}
              <div className={`home-filter-group ${!selectedYear ? 'home-filter-group--locked' : ''}`}>
                <span className="home-filter-label">Dia</span>
                <div className="home-filter-pills">
                  <button
                    type="button"
                    className={`home-filter-pill home-filter-pill--wide ${selectedDay === 1 ? 'active' : ''}`}
                    disabled={!selectedYear}
                    onClick={() => setSelectedDay(1)}
                  >
                    Dia 1 · Linguagens e Ciências Humanas
                  </button>
                  <button
                    type="button"
                    className={`home-filter-pill home-filter-pill--wide ${selectedDay === 2 ? 'active' : ''}`}
                    disabled={!selectedYear}
                    onClick={() => setSelectedDay(2)}
                  >
                    Dia 2 · Matemática e Ciências da Natureza
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              className="home-start-btn"
              onClick={startQuiz}
              disabled={!canStart}
            >
              Iniciar
            </button>

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

            {user?.username === 'admin' && (
              <button
                type="button"
                className="btn--ghost admin-btn"
                onClick={openAdminPanel}
                disabled={adminLoading}
              >
                {adminLoading ? 'Carregando…' : 'Painel Admin'}
              </button>
            )}
            {adminError && <p className="auth-error">{adminError}</p>}

            <button
              type="button"
              className="btn--ghost"
              onClick={handleLogout}
            >
              Sair
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'admin' && adminStats) {
    return <AdminPanel stats={adminStats} onBack={() => setPhase('home')} dark={dark} setDark={setDark} />
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
  const splitStemAndAlts = images.length > 1 && images.length === letters.length + 1
  const isPrevDisabled = questionIndex <= 0
  const isNextDisabled = questionIndex >= sortedQuestions.length - 1
  const altImageFor = (index) => splitStemAndAlts ? images[index + 1] : null
  const attempt = attempts[question.number]
  const selected = attempt?.selected ?? null

  // ── Summary ───────────────────────────────────────────────────────────────
  if (phase === 'summary') {
    const answeredCount = Object.keys(attempts).length
    const correctCount = Object.values(attempts).filter((a) => a.correct).length
    const wrongCount = answeredCount - correctCount
    const unansweredCount = sortedQuestions.length - answeredCount
    const avgTime = answeredCount > 0
      ? Math.round(Object.values(questionTimes).reduce((s, t) => s + t, 0) / answeredCount)
      : 0

    // ── Subject breakdown ────────────────────────────────────────────────
    const tagStats = {}
    sortedQuestions.forEach((q) => {
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
        <span className="app-header-title">Questionário ENEM</span>

        <div className="header-timers">
          <div className="header-timer">
            <span className="header-timer-label">Total</span>
            <span className="header-timer-value">{formatTime(totalElapsed)}</span>
          </div>
          <div className="header-timer">
            <span className="header-timer-label">Questão</span>
            <span className="header-timer-value">{formatTime(questionElapsed)}</span>
          </div>
        </div>

        <div className="app-header-actions">
          <button type="button" className="btn--ghost header-pause-btn" onClick={pauseQuiz}>
            Pausar
          </button>
          <button type="button" className="header-finish-btn" onClick={finishQuiz}>
            Finalizar
          </button>
          <button
            type="button"
            className="notebook-toggle"
            onClick={() => { setFeedbackQuestion(question?.number ?? null); setFeedbackOpen(true) }}
            aria-label="Enviar feedback ou reportar problema"
          >
            <span className="notebook-toggle-text">Feedback</span>
          </button>
          <button
            type="button"
            className={`notebook-toggle ${notebookOpen ? 'active' : ''}`}
            onClick={() => setNotebookOpen((o) => !o)}
            aria-expanded={notebookOpen}
            aria-controls="session-notebook"
            aria-label={notebookOpen ? 'Fechar caderno' : 'Abrir caderno'}
          >
            <NotebookIcon />
            <span className="notebook-toggle-text">Caderno</span>
          </button>
          <button type="button" className="theme-toggle" onClick={() => setDark((d) => !d)} aria-label="Alternar tema">
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
          <button type="button" className="btn--ghost" onClick={handleLogout} aria-label="Alternar tema">
            {<LogoutIcon />}
          </button>
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
                    {question.test != null && String(question.test).trim() !== '' && (
                      <span className="badge badge-test">{question.test}</span>
                    )}
                    <span className="badge badge-year">{question.year}</span>
                    {areaLabel(question.area) && (
                      <span className="badge badge-area">{areaLabel(question.area)}</span>
                    )}
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
                        EN
                      </button>
                      <button
                        type="button"
                        className={`lang-toggle-btn ${foreignLang === 'es' ? 'active' : ''}`}
                        onClick={() => switchLang('es')}
                        disabled={!!attempts[question.number]}
                        title="Espanhol"
                      >
                        ES
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
                        <span className="question-context-title">{ctxObj.title ?? 'Texto de referência'}</span>
                        <span className="question-context-chevron">{isExpanded ? '▲' : '▼'}</span>
                      </button>
                      {isExpanded && (
                        <div className="question-context-body">
                          {ctxObj.subtitle && <p className="ctx-subtitle">{ctxObj.subtitle}</p>}
                          {ctxObj.images && ctxObj.images.length > 0 ? (
                            <>
                              {ctxObj.images.map((src, i) => (
                                <figure key={i} className="q-figure">
                                  <img
                                    src={publicImageSrc(src)}
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                  />
                                </figure>
                              ))}
                              {ctxObj.text && <p className="ctx-text ctx-text--caption">{ctxObj.text}</p>}
                            </>
                          ) : (
                            ctxObj.text && <p className="ctx-text">{ctxObj.text}</p>
                          )}
                          {ctxObj.reference && <p className="ctx-reference">{ctxObj.reference}</p>}
                        </div>
                      )}
                    </div>
                  )
                })}

                <div className="card">
                  <div className="question-stem" aria-label="Enunciado">
                    {stemSegments.map((seg, i) =>
                      seg.type === 'text' ? (
                        <div key={i} className="question-text-block">{seg.text}</div>
                      ) : (
                        <figure key={i} className="q-figure">
                          <img
                            src={publicImageSrc(seg.src)}
                            alt={seg.caption ? String(seg.caption).slice(0, 200) : 'Figura do enunciado'}
                            loading="lazy"
                            decoding="async"
                          />
                          {seg.caption != null && seg.caption !== '' && (
                            <figcaption className="q-figure-caption">{seg.caption}</figcaption>
                          )}
                        </figure>
                      ),
                    )}
                  </div>

                  <ul className="alternatives">
                    {letters.map((letter, index) => {
                      const isPending = !selected && pendingSelection === letter
                      const isConfirmedCorrect = selected !== null && letter === question.answer
                      const isConfirmedWrong = selected !== null && letter === selected && !attempt?.correct
                      const altImg = altImageFor(index)
                      const stacked = Boolean(altImg)
                      const rawAlt = question.alternatives[letter]
                      const altCaption = stacked ? captionFromBracketText(rawAlt) : ''
                      const altLabel = alternativeLabelForDisplay(rawAlt, stacked)
                      return (
                        <li key={letter}>
                          <button
                            type="button"
                            className={`alt-btn ${isConfirmedCorrect ? 'alt-btn--confirmed-correct' : ''} ${isConfirmedWrong ? 'alt-btn--confirmed-wrong' : ''} ${isPending ? 'alt-btn--pending' : ''} ${stacked ? 'alt-btn--stack' : ''}`}
                            onClick={() => !selected && setPendingSelection(letter)}
                            disabled={selected !== null}
                          >
                            <div className="alt-row">
                              <span className="alt-letter">{letter.toUpperCase()}</span>
                              {altLabel !== '' && <span className="alt-text">{altLabel}</span>}
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
                                  <figcaption className="alt-figure-caption">{altCaption}</figcaption>
                                )}
                              </figure>
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>

                  {selected && attempt && (
                    <div
                      className={`feedback ${attempt.correct ? 'feedback--correct' : 'feedback--wrong'}`}
                      role="status"
                    >
                      {attempt.correct
                        ? 'Correto.'
                        : `Incorreto. A alternativa correta é ${String(question.answer).toUpperCase()}.`}
                      {' '}Sua resposta: <strong>{selected.toUpperCase()}</strong>.
                    </div>
                  )}
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
          <div className="question-rail-scroll" ref={railInnerRef}>
            {sortedQuestions.map((q, idx) => {
              const att = attempts[q.number]
              const isCurrent = q.number === question.number
              let stateClass = 'question-rail-btn--idle'
              if (att) stateClass = att.correct ? 'question-rail-btn--ok' : 'question-rail-btn--bad'
              let groupClass = ''
              const primaryCid = getContextIds(q)[0] ?? null
              if (primaryCid) {
                const prev = sortedQuestions[idx - 1]
                const next = sortedQuestions[idx + 1]
                const isStart = primaryCid !== (getContextIds(prev)[0] ?? null)
                const isEnd   = primaryCid !== (getContextIds(next)[0] ?? null)
                groupClass = isStart && isEnd ? 'question-rail-btn--group-only'
                           : isStart          ? 'question-rail-btn--group-start'
                           : isEnd            ? 'question-rail-btn--group-end'
                           :                    'question-rail-btn--group-mid'
              }
              return (
                <button
                  key={q.number}
                  type="button"
                  data-qnum={q.number}
                  className={`question-rail-btn ${stateClass} ${isCurrent ? 'question-rail-btn--current' : ''} ${groupClass}`}
                  onClick={() => goToQuestion(q)}
                  aria-current={isCurrent ? 'true' : undefined}
                  aria-label={`Questão ${q.number}${att ? (att.correct ? ', correta' : ', incorreta') : ', não respondida'}`}
                >
                  {att ? (att.correct ? '✓' : '✗') : q.number}
                </button>
              )
            })}
          </div>
        </nav>
      </div>

      <footer className="question-footer">
        <button
          type="button"
          className={`footer-nav-btn footer-rail-toggle ${railOpen ? 'active' : ''}`}
          onClick={() => setRailOpen((o) => !o)}
          aria-label={railOpen ? 'Ocultar lista de questões' : 'Mostrar lista de questões'}
          title={railOpen ? 'Ocultar lista' : 'Mostrar lista'}
        >
          ☰
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
      </footer>

      {feedbackOpen && (
        <FeedbackModal
          questionNumber={feedbackQuestion}
          token={token}
          onClose={() => setFeedbackOpen(false)}
        />
      )}
    </div>
  )
}

function AdminPanel({ stats, onBack, dark, setDark }) {
  const { users, testResults, dailyResults, feedback } = stats
  const [tab, setTab] = useState('students')

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
          <h1 className="admin-title">Painel Administrativo</h1>
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
                  <th>Cadastrado em</th>
                  <th>Simulados</th>
                  <th>Desafios</th>
                  <th>Acertos totais</th>
                  <th>Melhor nota</th>
                </tr>
              </thead>
              <tbody>
                {sortedUsers.filter(u => u.username !== 'admin').map((u) => (
                  <tr key={u.id}>
                    <td><strong>{u.username}</strong></td>
                    <td>{formatDate(u.created_at)}</td>
                    <td>{u.testCount}</td>
                    <td>{u.dailyCount}</td>
                    <td>
                      {u.totalQuestions > 0
                        ? `${u.totalCorrect}/${u.totalQuestions} (${Math.round((u.totalCorrect / u.totalQuestions) * 100)}%)`
                        : '—'}
                    </td>
                    <td>{u.bestScore !== null ? `${u.bestScore}%` : '—'}</td>
                  </tr>
                ))}
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
    </div>
  )
}

function FeedbackModal({ questionNumber, token, onClose }) {
  const [type, setType] = useState('feedback')
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
                className={`fb-type-btn ${type === 'feedback' ? 'active' : ''}`}
                onClick={() => setType('feedback')}
              >
                Sugestão
              </button>
              <button
                type="button"
                className={`fb-type-btn ${type === 'bug' ? 'active' : ''}`}
                onClick={() => setType('bug')}
              >
                Problema
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
