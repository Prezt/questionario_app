import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import './QuestionEditor.css'
import { disciplinaLabel } from './data/disciplinas.js'
import { questionThumb } from './pdf/questionThumb.js'
import { applyFilters, facetOptions, paresParaCarregar, norm } from './pickerFacets.js'

export const ENEM_AREAS = [
  { key: 'math',       label: 'Matemática' },
  { key: 'nature',     label: 'C. Natureza' },
  { key: 'linguagens', label: 'Linguagens' },
  { key: 'humanas',    label: 'C. Humanas' },
]
export const ENEM_YEARS = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018]

export function diffLabel(d) {
  if (typeof d === 'string') return d
  return d <= 3 ? 'easy' : d <= 6 ? 'medium' : 'hard'
}

export default function EnemPicker({
  actionLabel = 'Usar',
  onSelect,
  onCancel,
  allQuestions,
  contexts: contextsProp,
}) {
  const useCache = Array.isArray(allQuestions) && allQuestions.length > 0

  // '' e null sao "Todas"/"Todos" — a busca deixa de filtrar por esse campo.
  const [area, setArea] = useState('math')
  const [year, setYear] = useState(2025)
  const [questions, setQuestions] = useState([])
  const [fetching, setFetching] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedDisciplinas, setSelectedDisciplinas] = useState([])
  const [selectedAssuntos, setSelectedAssuntos] = useState([])
  const [mode, setMode] = useState('search') // 'search' | 'number'
  const [selectedNum, setSelectedNum] = useState('')
  const [fetchedContexts, setFetchedContexts] = useState({})
  const listRef = useRef(null)

  const contexts = contextsProp ?? fetchedContexts

  useEffect(() => {
    if (contextsProp) return
    fetch('/contexts.json').then(r => r.ok ? r.json() : {}).catch(() => {}).then(c => setFetchedContexts(c ?? {}))
  }, [contextsProp])

  // Load questions for the current (area, year). Either from the in-memory cache or a per-file fetch.
  useEffect(() => {
    setSelectedNum('')
    setSearch('')
    setSelectedDisciplinas([])
    setSelectedAssuntos([])
    if (useCache) {
      const matched = allQuestions.filter(q =>
        q.test === 'ENEM' && (!year || q.year === year) && (!area || q.area === area)
      )
      setQuestions(matched)
      setFetching(false)
      return
    }
    setFetching(true)
    setQuestions([])
    let cancelado = false
    const pares = paresParaCarregar(area, year, ENEM_AREAS.map(a => a.key), ENEM_YEARS)
    Promise.all(pares.map(([a, y]) =>
      fetch(`/${a}_enem_${y}.json`).then(r => (r.ok ? r.json() : [])).catch(() => []),
    )).then(listas => {
      if (cancelado) return
      setQuestions(listas.flat())
      setFetching(false)
    })
    return () => { cancelado = true }
  }, [area, year, useCache, allQuestions])

  useLayoutEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0
  }, [search, selectedDisciplinas, selectedAssuntos])

  const queryNorm = norm(search.trim())

  // Cada dropdown so oferece o que ainda leva a alguma questao, levando em
  // conta os outros filtros ativos — ver src/pickerFacets.js.
  const filtros = useMemo(
    () => ({ disciplinas: selectedDisciplinas, assuntos: selectedAssuntos, queryNorm }),
    [selectedDisciplinas, selectedAssuntos, queryNorm],
  )
  const facetas = useMemo(() => facetOptions(questions, filtros), [questions, filtros])
  const areaDisciplinas = facetas.disciplinas
  const assuntoVocab = facetas.assuntos

  const filtered = useMemo(() => applyFilters(questions, filtros), [questions, filtros])

  const toggleDisciplina = (slug) => {
    setSelectedDisciplinas(prev =>
      prev.includes(slug) ? prev.filter(d => d !== slug) : [...prev, slug]
    )
  }
  const toggleAssunto = (tag) => {
    setSelectedAssuntos(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }

  // Com "Todos" ativo convivem varias provas, entao `number` sozinho repete:
  // a identidade de uma questao e area+ano+numero+idioma.
  const chaveDe = (q) => `${q.area ?? ''}-${q.year ?? ''}-${q.number}-${q.language ?? ''}`
  const selectedQuestion = mode === 'number' && selectedNum
    ? questions.find(q => chaveDe(q) === selectedNum)
    : null

  const handleSelect = (q) => onSelect?.(q, contexts)

  const areaLabel = area ? (ENEM_AREAS.find(a => a.key === area)?.label ?? '') : 'Todas'
  const summarizeMulti = (selected, labelFor, total, allWord) => {
    if (selected.length === 0) return total != null ? `${allWord} (${total})` : allWord
    if (selected.length <= 2) return selected.map(labelFor).join(', ')
    return `${selected.length} selecionad${allWord.endsWith('s') ? 'os' : 'as'}`
  }

  return (
    <div className="qe-picker">
      <div className="qe-picker-filters">
        {/* Buscar / Por número — top-level mode toggle, ENEM/Listas style */}
        <div className="home-test-seg">
          <button
            type="button"
            className={`home-test-seg-btn${mode === 'search' ? ' active' : ''}`}
            onClick={() => setMode('search')}
          >Buscar</button>
          <button
            type="button"
            className={`home-test-seg-btn${mode === 'number' ? ' active' : ''}`}
            onClick={() => setMode('number')}
          >Por número</button>
        </div>

        {/* Área dropdown (always visible) */}
        <details className="home-dropdown">
          <summary className="home-dropdown-summary">
            <span className="home-dropdown-label">Área</span>
            <span className="home-dropdown-value home-dropdown-value--filled">{areaLabel}</span>
          </summary>
          <div className="home-dropdown-panel">
            <div className="home-dropdown-group">
              {[{ key: '', label: 'Todas' }, ...ENEM_AREAS].map(a => (
                <label key={a.key || 'todas'} className="home-dropdown-option">
                  <input
                    type="radio"
                    name="enem-picker-area"
                    checked={area === a.key}
                    onChange={(e) => {
                      setArea(a.key)
                      e.currentTarget.closest('details')?.removeAttribute('open')
                    }}
                  />
                  <span>{a.label}</span>
                </label>
              ))}
            </div>
          </div>
        </details>

        {/* Ano dropdown (always visible) */}
        <details className="home-dropdown">
          <summary className="home-dropdown-summary">
            <span className="home-dropdown-label">Ano</span>
            <span className="home-dropdown-value home-dropdown-value--filled">{year ?? 'Todos'}</span>
          </summary>
          <div className="home-dropdown-panel">
            <div className="home-dropdown-group home-dropdown-group--cols-2">
              {[null, ...ENEM_YEARS].map(y => (
                <label key={y ?? 'todos'} className="home-dropdown-option">
                  <input
                    type="radio"
                    name="enem-picker-year"
                    checked={year === y}
                    onChange={(e) => {
                      setYear(y)
                      e.currentTarget.closest('details')?.removeAttribute('open')
                    }}
                  />
                  <span>{y ?? 'Todos'}</span>
                </label>
              ))}
            </div>
          </div>
        </details>

        {mode === 'search' && (
          <>
            {/* Disciplinas dropdown — only if the area has multiple disciplinas */}
            {areaDisciplinas.length > 1 && (
              <details className="home-dropdown">
                <summary className="home-dropdown-summary">
                  <span className="home-dropdown-label">Disciplinas</span>
                  <span className={`home-dropdown-value${selectedDisciplinas.length > 0 ? ' home-dropdown-value--filled' : ''}`}>
                    {summarizeMulti(selectedDisciplinas, disciplinaLabel, null, 'Todas')}
                  </span>
                </summary>
                <div className="home-dropdown-panel">
                  <div className="home-dropdown-group">
                    {areaDisciplinas.map(slug => (
                      <label key={slug} className="home-dropdown-option">
                        <input
                          type="checkbox"
                          checked={selectedDisciplinas.includes(slug)}
                          onChange={() => toggleDisciplina(slug)}
                        />
                        <span>{disciplinaLabel(slug)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </details>
            )}

            {/* Assuntos dropdown — vocabulary built from currently loaded questions */}
            {assuntoVocab.length > 0 && (
              <details className="home-dropdown">
                <summary className="home-dropdown-summary">
                  <span className="home-dropdown-label">Assuntos</span>
                  <span className={`home-dropdown-value${selectedAssuntos.length > 0 ? ' home-dropdown-value--filled' : ''}`}>
                    {summarizeMulti(selectedAssuntos, (t) => t, assuntoVocab.length, 'Todos')}
                  </span>
                </summary>
                <div className="home-dropdown-panel">
                  <div className="home-dropdown-group home-dropdown-group--cols-2">
                    {assuntoVocab.map(tag => (
                      <label key={tag} className="home-dropdown-option">
                        <input
                          type="checkbox"
                          checked={selectedAssuntos.includes(tag)}
                          onChange={() => toggleAssunto(tag)}
                        />
                        <span>{tag}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </details>
            )}

            {/* Free-text search */}
            <input
              className="qe-input"
              placeholder="Buscar no enunciado…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </>
        )}

        {mode === 'number' && (
          <>
            <details className="home-dropdown">
              <summary className="home-dropdown-summary">
                <span className="home-dropdown-label">Questão</span>
                <span className={`home-dropdown-value${selectedNum ? ' home-dropdown-value--filled' : ''}`}>
                  {fetching
                    ? 'Carregando…'
                    : selectedQuestion
                      ? `Q${selectedQuestion.number} · ${selectedQuestion.year}`
                      : 'Selecionar…'}
                </span>
              </summary>
              <div className="home-dropdown-panel">
                <div className="home-dropdown-group home-dropdown-group--cols-2">
                  {questions.map(q => (
                    <label key={chaveDe(q)} className="home-dropdown-option">
                      <input
                        type="radio"
                        name="enem-picker-question"
                        checked={selectedNum === chaveDe(q)}
                        onChange={(e) => {
                          setSelectedNum(chaveDe(q))
                          e.currentTarget.closest('details')?.removeAttribute('open')
                        }}
                      />
                      <span>Q{q.number}{!year || !area ? ` · ${q.year}` : ''}</span>
                    </label>
                  ))}
                </div>
              </div>
            </details>
            <button
              type="button"
              className="qe-btn qe-btn--primary"
              disabled={!selectedQuestion}
              onClick={() => selectedQuestion && handleSelect(selectedQuestion)}
            >
              {actionLabel || 'Selecionar'}
            </button>
          </>
        )}
      </div>

      {mode === 'search' && (
        <div key={`${area}-${year}-${fetching ? 'loading' : filtered.length === 0 ? 'empty' : 'has'}`} className="qe-picker-list" ref={listRef}>
          {fetching && <p key="loading" className="qe-picker-empty">Carregando…</p>}
          {!fetching && filtered.length === 0 && <p key="empty" className="qe-picker-empty">Nenhuma questão encontrada.</p>}
          {filtered.map(q => {
            const rowClickable = !actionLabel
            const thumb = questionThumb(q, contexts)
            const rowProps = rowClickable
              ? {
                  role: 'button',
                  tabIndex: 0,
                  onClick: () => handleSelect(q),
                  onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelect(q) } },
                }
              : {}
            return (
              <div
                key={chaveDe(q)}
                className={`qe-picker-item${rowClickable ? ' qe-picker-item--clickable' : ''}`}
                {...rowProps}
              >
                {thumb && (
                  <img
                    className="qe-picker-item-thumb"
                    src={thumb.src}
                    alt={thumb.caption || 'Figura da questão'}
                    title={thumb.from === 'contexto' ? 'Figura do texto-base' : 'Figura da questão'}
                    loading="lazy"
                  />
                )}
                <div className="qe-picker-item-meta">
                  <span className="qe-picker-item-num">Q{q.number}</span>
                  {q.tags?.slice(0, 2).map(t => (
                    <span key={t} className="qe-picker-item-tag">{t}</span>
                  ))}
                </div>
                <p className="qe-picker-item-stem">
                  {(q.text ?? q.stem ?? '').slice(0, 120)}…
                </p>
                {!rowClickable && (
                  <button
                    type="button"
                    className="qe-btn qe-btn--primary qe-picker-use-btn"
                    onClick={() => handleSelect(q)}
                  >
                    {actionLabel}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {onCancel && (
        <div className="qe-form-actions">
          <button type="button" className="qe-btn qe-btn--ghost" onClick={onCancel}>Cancelar</button>
        </div>
      )}
    </div>
  )
}
