import { useState, useEffect, useCallback } from 'react'
import './App.css'

function getRandomQuestion(questions) {
  return questions[Math.floor(Math.random() * questions.length)]
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

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('dark', dark)
  }, [dark])

  useEffect(() => {
    fetch('/math_2025.json')
      .then((r) => r.json())
      .then((data) => {
        setQuestions(data)
        setQuestion(getRandomQuestion(data))
        setLoading(false)
      })
  }, [])

  const next = useCallback(() => {
    setSelected(null)
    setQuestion(getRandomQuestion(questions))
  }, [questions])

  if (loading) return <div className="center">Carregando...</div>

  const letters = Object.keys(question.alternatives)

  return (
    <div className="container">
      <header className="header">
        <div className="badges">
          <span className="badge">Questão {question.number}</span>
          <span className="badge badge-year">{question.year}</span>
        </div>
        <button className="theme-toggle" onClick={() => setDark((d) => !d)} aria-label="Alternar tema">
          {dark ? <SunIcon /> : <MoonIcon />}
        </button>
      </header>

      <div className="card">
        <p className="question-text">{question.text}</p>

        <ul className="alternatives">
          {letters.map((letter) => {
            const isSelected = selected === letter
            return (
              <li key={letter}>
                <button
                  className={`alt-btn ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelected(letter)}
                  disabled={selected !== null}
                >
                  <span className="alt-letter">{letter.toUpperCase()}</span>
                  <span className="alt-text">{question.alternatives[letter]}</span>
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
  )
}
