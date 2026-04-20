import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import './App.css'
import {
  parseStemSegments,
  alternativeLabelForDisplay,
  captionFromBracketText,
} from './parseQuestionFigures.js'

function getRandomQuestion(questions) {
  return questions[Math.floor(Math.random() * questions.length)]
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

export default function App() {
  const [questions, setQuestions] = useState([])
  const [question, setQuestion] = useState(null)
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('dark')
    if (saved !== null) return saved === 'true'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  const [notebookOpen, setNotebookOpen] = useState(false)
  const [notes, setNotes] = useState(readNotesFromSession)
  const notebookTextareaRef = useRef(null)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('dark', dark)
  }, [dark])

  useEffect(() => {
    fetch('/math_enem_2025.json')
      .then((r) => r.json())
      .then((data) => {
        setQuestions(data)
        setQuestion(getRandomQuestion(data))
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

  useEffect(() => {
    if (notebookOpen) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [notebookOpen])

  useEffect(() => {
    if (notebookOpen && notebookTextareaRef.current) {
      notebookTextareaRef.current.focus()
    }
  }, [notebookOpen])

  const onNotesChange = useCallback((e) => {
    const v = e.target.value
    setNotes(v)
    writeNotesToSession(v)
  }, [])

  const next = useCallback(() => {
    setSelected(null)
    setQuestion(getRandomQuestion(questions))
  }, [questions])

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
  const altImageFor = (index) =>
    splitStemAndAlts ? images[index + 1] : null

  return (
    <>
    <div className="container">
      <header className="header">
        <div className="badges">
          <span className="badge">Questão {question.number}</span>
          <span className="badge badge-year">{question.year}</span>
        </div>
        <div className="header-actions">
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
            const altImg = altImageFor(index)
            const stacked = Boolean(altImg)
            const rawAlt = question.alternatives[letter]
            const altCaption = stacked ? captionFromBracketText(rawAlt) : ''
            const altLabel = alternativeLabelForDisplay(rawAlt, stacked)
            return (
              <li key={letter}>
                <button
                  type="button"
                  className={`alt-btn ${isSelected ? 'selected' : ''} ${stacked ? 'alt-btn--stack' : ''}`}
                  onClick={() => setSelected(letter)}
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

        {selected && (
          <div className="feedback">
            Você escolheu a alternativa <strong>{selected.toUpperCase()}</strong>.
          </div>
        )}
      </div>

      <div className="tags">
        {question.tags.map((tag) => (
          <span key={tag} className="tag">{tag}</span>
        ))}
      </div>

      <button className="next-btn" onClick={next}>
        Próxima questão →
      </button>
    </div>

    <div
      className={`notebook-backdrop ${notebookOpen ? 'is-open' : ''}`}
      onClick={() => setNotebookOpen(false)}
      aria-hidden={!notebookOpen}
    />
    <aside
      id="session-notebook"
      className={`notebook-panel ${notebookOpen ? 'is-open' : ''}`}
      aria-label="Bloco de notas da sessão"
      aria-hidden={!notebookOpen}
    >
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
      <p className="notebook-hint">Anotações ficam nesta aba do navegador até você fechá-la.</p>
      <textarea
        ref={notebookTextareaRef}
        className="notebook-textarea"
        value={notes}
        onChange={onNotesChange}
        placeholder="Rascunhos, contas, lembretes…"
        spellCheck
      />
    </aside>
    </>
  )
}
