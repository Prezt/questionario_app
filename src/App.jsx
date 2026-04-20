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

function loadAttemptsFromSession() {
  if (typeof sessionStorage === 'undefined') return {}
  try {
    const raw = sessionStorage.getItem(ATTEMPTS_SESSION_KEY)
    if (!raw) return {}
    const o = JSON.parse(raw)
    if (typeof o !== 'object' || o === null) return {}
    /** Chaves do JSON viram string; normalizamos para número da questão. */
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
  } catch {
    /* ignore */
  }
}

const AREA_LABELS = {
  math:    'Matemática',
  nature:  'Ciências da Natureza',
  lang:    'Linguagens',
  social:  'Ciências Humanas',
}

function areaLabel(area) {
  return AREA_LABELS[area] ?? area ?? null
}

/** Paths in JSON are like `figuras/name.png`; serve from /public via Vite. */
function publicImageSrc(path) {
  if (!path) return ''
  return path.startsWith('/') ? path : `/${path}`
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
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
      <line x1="8" y1="7" x2="16" y2="7"/>
      <line x1="8" y1="11" x2="16" y2="11"/>
      <line x1="8" y1="15" x2="12" y2="15"/>
    </svg>
  )
}

const SESSION_NOTES_KEY = 'questionario-caderno'

function readNotesFromSession() {
  if (typeof sessionStorage === 'undefined') return ''
  try {
    return sessionStorage.getItem(SESSION_NOTES_KEY) ?? ''
  } catch {
    return ''
  }
}

function writeNotesToSession(value) {
  try {
    sessionStorage.setItem(SESSION_NOTES_KEY, value)
  } catch {
    /* ignore quota / private mode */
  }
}

/** Texto puro antigo → HTML; HTML já salvo é mantido. */
function legacyPlainToHtml(raw) {
  if (!raw || !String(raw).trim()) return '<p><br></p>'
  const t = String(raw).trim()
  if (t.startsWith('<')) return raw
  const esc = String(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<p>${esc.replace(/\n/g, '<br>')}</p>`
}

export default function App() {
  const [questions, setQuestions] = useState([])
  const [question, setQuestion] = useState(null)
  /** { [numeroQuestao]: { selected: 'a'|'b'..., correct: boolean } } */
  const [attempts, setAttempts] = useState(loadAttemptsFromSession)
  const [loading, setLoading] = useState(true)
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('dark')
    if (saved !== null) return saved === 'true'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  const [notebookOpen, setNotebookOpen] = useState(false)
  const [pendingSelection, setPendingSelection] = useState(null)
  const notebookEditorRef = useRef(null)
  const notebookEditorHydrated = useRef(false)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('dark', dark)
  }, [dark])

  useEffect(() => {
    fetch('/math_enem_2025.json')
      .then((r) => r.json())
      .then((data) => {
        const sorted = [...data].sort((a, b) => a.number - b.number)
        setQuestions(sorted)
        setQuestion(sorted[0] ?? null)
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (!notebookOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') setNotebookOpen(false)
    }
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

  useEffect(() => {
    if (notebookOpen && notebookEditorRef.current) {
      notebookEditorRef.current.focus({ preventScroll: true })
    }
  }, [notebookOpen])

  const sortedQuestions = useMemo(
    () => [...questions].sort((a, b) => a.number - b.number),
    [questions],
  )

  useEffect(() => {
    setPendingSelection(null)
  }, [question])

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
    const btnCenterNatural = idx * (btnHeight + gap) + btnHeight / 2
    const translateY = railHeight / 2 - btnCenterNatural
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

  const goToQuestion = useCallback((q) => {
    setQuestion(q)
  }, [])

  const pickAlternative = useCallback((letter) => {
    if (!question) return
    setAttempts((a) => {
      if (a[question.number]) return a
      const correct = letter === question.answer
      const next = {
        ...a,
        [question.number]: { selected: letter, correct },
      }
      saveAttemptsToSession(next)
      return next
    })
  }, [question])

  const confirmAnswer = useCallback(() => {
    if (!pendingSelection) return
    pickAlternative(pendingSelection)
    setPendingSelection(null)
  }, [pendingSelection, pickAlternative])

  const stemSegments = useMemo(() => {
    if (!question) return []
    const imgs = question.images ?? []
    const letters = Object.keys(question.alternatives)
    const splitStemAndAlts =
      imgs.length > 1 && imgs.length === letters.length + 1
    const paths = splitStemAndAlts
      ? [imgs[0]]
      : imgs.length > 0
        ? imgs
        : []
    return parseStemSegments(question.text, paths)
  }, [question])

  if (loading || !question) return <div className="center">Carregando...</div>

  const letters = Object.keys(question.alternatives)
  const images = question.images ?? []
  /** Uma figura no enunciado e uma por alternativa (ex.: questão 138). */
  const splitStemAndAlts =
    images.length > 1 && images.length === letters.length + 1

  const isPrevDisabled = questionIndex <= 0
  const isNextDisabled = questionIndex >= sortedQuestions.length - 1
  const altImageFor = (index) =>
    splitStemAndAlts ? images[index + 1] : null

  const attempt = attempts[question.number]
  const selected = attempt?.selected ?? null

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-header-title">Questionário ENEM</span>
        <div className="app-header-actions">
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
      </header>

      <div className="card">
        <div className="question-stem" aria-label="Enunciado">
          {stemSegments.map((seg, i) =>
            seg.type === 'text' ? (
              <div key={i} className="question-text-block">
                {seg.text}
              </div>
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
            const isSelected = selected === letter
            const isPending = !selected && pendingSelection === letter
            const altImg = altImageFor(index)
            const stacked = Boolean(altImg)
            const rawAlt = question.alternatives[letter]
            const altCaption = stacked ? captionFromBracketText(rawAlt) : ''
            const altLabel = alternativeLabelForDisplay(rawAlt, stacked)
            return (
              <li key={letter}>
                <button
                  type="button"
                  className={`alt-btn ${isSelected ? 'selected' : ''} ${isPending ? 'alt-btn--pending' : ''} ${stacked ? 'alt-btn--stack' : ''}`}
                  onClick={() => !selected && setPendingSelection(letter)}
                  disabled={selected !== null}
                >
                  <div className="alt-row">
                    <span className="alt-letter">{letter.toUpperCase()}</span>
                    {altLabel !== '' && (
                      <span className="alt-text">{altLabel}</span>
                    )}
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
            {' '}
            Sua resposta: <strong>{selected.toUpperCase()}</strong>.
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
              <button
                type="button"
                className="notebook-close"
                onClick={() => setNotebookOpen(false)}
                aria-label="Fechar caderno"
              >
                ×
              </button>
            </div>
            <p className="notebook-hint">
              Anotações nesta aba até fechá-la. Você pode usar o restante da página com o caderno aberto.
            </p>
            <div className="notebook-toolbar" role="toolbar" aria-label="Formatação do texto">
              <button
                type="button"
                className="notebook-tool"
                onMouseDown={applyNotebookFormat('bold')}
                aria-label="Negrito"
                title="Negrito"
              >
                <strong>B</strong>
              </button>
              <button
                type="button"
                className="notebook-tool"
                onMouseDown={applyNotebookFormat('italic')}
                aria-label="Itálico"
                title="Itálico"
              >
                <em>I</em>
              </button>
              <button
                type="button"
                className="notebook-tool"
                onMouseDown={applyNotebookFormat('underline')}
                aria-label="Sublinhado"
                title="Sublinhado"
              >
                <span className="notebook-tool-u">U</span>
              </button>
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

        <nav className="question-rail" ref={railRef} aria-label="Lista de questões">
          <div className="question-rail-scroll" ref={railInnerRef}>
            {sortedQuestions.map((q) => {
              const att = attempts[q.number]
              const isCurrent = q.number === question.number
              let stateClass = 'question-rail-btn--idle'
              if (att) stateClass = att.correct ? 'question-rail-btn--ok' : 'question-rail-btn--bad'
              return (
                <button
                  key={q.number}
                  type="button"
                  data-qnum={q.number}
                  className={`question-rail-btn ${stateClass} ${isCurrent ? 'question-rail-btn--current' : ''}`}
                  onClick={() => goToQuestion(q)}
                  aria-current={isCurrent ? 'true' : undefined}
                  aria-label={`Questão ${q.number}${att ? (att.correct ? ', correta' : ', incorreta') : ', não respondida'}`}
                >
                  {q.number}
                </button>
              )
            })}
          </div>
        </nav>
      </div>

      <footer className="question-footer">
        <button
          type="button"
          className="footer-nav-btn"
          onClick={prev}
          disabled={isPrevDisabled}
          aria-label="Questão anterior"
        >
          ←
        </button>
        <button
          type="button"
          className="footer-responder-btn"
          onClick={confirmAnswer}
          disabled={!pendingSelection || !!selected}
        >
          {selected ? 'Respondida' : 'Responder'}
        </button>
        <button
          type="button"
          className="footer-nav-btn"
          onClick={next}
          disabled={isNextDisabled}
          aria-label="Próxima questão"
        >
          →
        </button>
      </footer>
    </div>
  )
}
