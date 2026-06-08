import { useState, useMemo, useEffect, useRef } from 'react'
import './QuestionEditor.css'
import { richHtml, richHtmlBr } from './richHtml.js'
import { DISCIPLINA_LABELS } from './data/disciplinas.js'

function publicImageSrc(path) {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) return path
  return path.startsWith('/') ? path : `/${path}`
}

const AREA_LABELS = {
  linguagens: 'Linguagens',
  humanas: 'Humanas',
  nature: 'Natureza',
  math: 'Matemática',
}

function makeKey(q) {
  return `${q.area}:${q.year}:${q.test}:${q.number}`
}

export default function ExplanationsEditor({
  allQuestions,
  contexts = {},
  explanationOverrides,
  setExplanationOverrides,
  token,
  onClose,
}) {
  const [filterArea, setFilterArea] = useState('all')
  const [filterYear, setFilterYear] = useState('all')
  const [filterDisciplina, setFilterDisciplina] = useState('all')
  const [selectedTags, setSelectedTags] = useState([])
  const [search, setSearch] = useState('')
  const [showOnlyEmpty, setShowOnlyEmpty] = useState(false)
  const [hideAnswer, setHideAnswer] = useState(false)
  const [selectedKey, setSelectedKey] = useState(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedFlash, setSavedFlash] = useState('')
  const dirtyRef = useRef(false)

  const years = useMemo(() => {
    const set = new Set(allQuestions.map((q) => q.year).filter(Boolean))
    return [...set].sort((a, b) => b - a)
  }, [allQuestions])

  // Dedupe language variants — show only one row per (area, year, test, number)
  const deduped = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const q of allQuestions) {
      const k = makeKey(q)
      if (seen.has(k)) continue
      seen.add(k)
      out.push(q)
    }
    return out
  }, [allQuestions])

  // Disciplinas available, scoped to current área/ano filters
  const disciplinaOptions = useMemo(() => {
    const set = new Set()
    for (const it of deduped) {
      if (filterArea !== 'all' && it.area !== filterArea) continue
      if (filterYear !== 'all' && it.year !== Number(filterYear)) continue
      for (const d of it.disciplinas ?? []) set.add(d)
    }
    return [...set].sort((a, b) => (DISCIPLINA_LABELS[a] ?? a).localeCompare(DISCIPLINA_LABELS[b] ?? b, 'pt-BR'))
  }, [deduped, filterArea, filterYear])

  // Tags available, scoped to current área/ano/disciplina filters
  const tagOptions = useMemo(() => {
    const set = new Set()
    for (const it of deduped) {
      if (filterArea !== 'all' && it.area !== filterArea) continue
      if (filterYear !== 'all' && it.year !== Number(filterYear)) continue
      if (filterDisciplina !== 'all' && !(it.disciplinas ?? []).includes(filterDisciplina)) continue
      for (const t of it.tags ?? []) set.add(t)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [deduped, filterArea, filterYear, filterDisciplina])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return deduped.filter((it) => {
      if (filterArea !== 'all' && it.area !== filterArea) return false
      if (filterYear !== 'all' && it.year !== Number(filterYear)) return false
      if (filterDisciplina !== 'all' && !(it.disciplinas ?? []).includes(filterDisciplina)) return false
      if (selectedTags.length > 0) {
        const qt = it.tags ?? []
        if (!qt.some((t) => selectedTags.includes(t))) return false
      }
      if (showOnlyEmpty) {
        const k = makeKey(it)
        const text = (explanationOverrides[k] ?? it.explanation ?? '').trim()
        if (text && text !== 'Sem explicação ainda.') return false
      }
      if (q) {
        if (!String(it.number).includes(q) &&
            !(it.text ?? '').toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [deduped, filterArea, filterYear, filterDisciplina, selectedTags, search, showOnlyEmpty, explanationOverrides])

  // Reset child filters when parents change to an incompatible value
  useEffect(() => {
    if (filterDisciplina !== 'all' && !disciplinaOptions.includes(filterDisciplina)) {
      setFilterDisciplina('all')
    }
  }, [disciplinaOptions, filterDisciplina])
  useEffect(() => {
    setSelectedTags((prev) => prev.filter((t) => tagOptions.includes(t)))
  }, [tagOptions])

  const toggleTag = (tag) => {
    setSelectedTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])
    setSelectedKey(null)
  }

  const tagSummary = selectedTags.length === 0
    ? 'Todos'
    : selectedTags.length <= 2
      ? selectedTags.join(', ')
      : `${selectedTags.length} selecionados`

  const selectedQ = useMemo(
    () => selectedKey ? deduped.find((it) => makeKey(it) === selectedKey) : null,
    [selectedKey, deduped]
  )

  function selectQuestion(q) {
    if (dirtyRef.current && !window.confirm('Você tem alterações não salvas. Descartar?')) return
    const k = makeKey(q)
    const text = explanationOverrides[k] ?? q.explanation ?? ''
    setSelectedKey(k)
    setDraft(text)
    setError('')
    setSavedFlash('')
    dirtyRef.current = false
  }

  useEffect(() => {
    const currentText = selectedQ ? (explanationOverrides[makeKey(selectedQ)] ?? selectedQ.explanation ?? '') : ''
    dirtyRef.current = selectedQ != null && draft !== currentText
  }, [draft, selectedQ, explanationOverrides])

  async function save() {
    if (!selectedQ) return
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/explanations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          area: selectedQ.area,
          year: selectedQ.year,
          test: selectedQ.test,
          number: selectedQ.number,
          explanation: draft,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Falha ao salvar')
      }
      const k = makeKey(selectedQ)
      setExplanationOverrides((prev) => ({ ...prev, [k]: draft }))
      setSavedFlash('Salvo.')
      dirtyRef.current = false
      setTimeout(() => setSavedFlash(''), 1500)
    } catch (err) {
      setError(err.message ?? 'Erro')
    } finally {
      setSaving(false)
    }
  }

  function nextEmpty() {
    if (dirtyRef.current && !window.confirm('Alterações não salvas. Descartar?')) return
    const startIdx = selectedKey ? filtered.findIndex((q) => makeKey(q) === selectedKey) : -1
    for (let i = startIdx + 1; i < filtered.length; i++) {
      const k = makeKey(filtered[i])
      const text = (explanationOverrides[k] ?? filtered[i].explanation ?? '').trim()
      if (!text || text === 'Sem explicação ainda.') {
        selectQuestion(filtered[i])
        return
      }
    }
    setError('Nenhuma questão sem explicação encontrada após essa.')
  }

  const totalCount = deduped.length
  const filledCount = useMemo(
    () => deduped.filter((q) => {
      const k = makeKey(q)
      const t = (explanationOverrides[k] ?? q.explanation ?? '').trim()
      return t && t !== 'Sem explicação ainda.'
    }).length,
    [deduped, explanationOverrides]
  )

  return (
    <div className="explainer">
      <header className="explainer-header">
        <button type="button" className="qe-back-btn" onClick={() => onClose?.()}>← Voltar</button>
        <h2 className="explainer-title">Explicar questões</h2>
        <div className="explainer-progress">
          <strong>{filledCount}</strong> de {totalCount} explicadas
          <span className="explainer-progress-bar">
            <span
              className="explainer-progress-bar-fill"
              style={{ width: totalCount ? `${(filledCount / totalCount) * 100}%` : '0%' }}
            />
          </span>
        </div>
      </header>

      <div className="explainer-filters">
        <details className="home-dropdown explainer-dropdown">
          <summary className="home-dropdown-summary">
            <span className="home-dropdown-label">Área</span>
            <span className={`home-dropdown-value${filterArea !== 'all' ? ' home-dropdown-value--filled' : ''}`}>
              {filterArea === 'all' ? 'Todas' : AREA_LABELS[filterArea]}
            </span>
          </summary>
          <div className="home-dropdown-panel">
            <div className="home-dropdown-group">
              <label className="home-dropdown-option">
                <input
                  type="radio"
                  name="explainer-area"
                  checked={filterArea === 'all'}
                  onChange={(e) => {
                    setFilterArea('all'); setSelectedKey(null)
                    e.currentTarget.closest('details')?.removeAttribute('open')
                  }}
                />
                <span>Todas as áreas</span>
              </label>
              {Object.entries(AREA_LABELS).map(([k, v]) => (
                <label key={k} className="home-dropdown-option">
                  <input
                    type="radio"
                    name="explainer-area"
                    checked={filterArea === k}
                    onChange={(e) => {
                      setFilterArea(k); setSelectedKey(null)
                      e.currentTarget.closest('details')?.removeAttribute('open')
                    }}
                  />
                  <span>{v}</span>
                </label>
              ))}
            </div>
          </div>
        </details>

        <details className="home-dropdown explainer-dropdown">
          <summary className="home-dropdown-summary">
            <span className="home-dropdown-label">Ano</span>
            <span className={`home-dropdown-value${filterYear !== 'all' ? ' home-dropdown-value--filled' : ''}`}>
              {filterYear === 'all' ? 'Todos' : filterYear}
            </span>
          </summary>
          <div className="home-dropdown-panel">
            <div className="home-dropdown-group home-dropdown-group--cols-2">
              <label className="home-dropdown-option">
                <input
                  type="radio"
                  name="explainer-year"
                  checked={filterYear === 'all'}
                  onChange={(e) => {
                    setFilterYear('all'); setSelectedKey(null)
                    e.currentTarget.closest('details')?.removeAttribute('open')
                  }}
                />
                <span>Todos</span>
              </label>
              {years.map((y) => (
                <label key={y} className="home-dropdown-option">
                  <input
                    type="radio"
                    name="explainer-year"
                    checked={filterYear === String(y)}
                    onChange={(e) => {
                      setFilterYear(String(y)); setSelectedKey(null)
                      e.currentTarget.closest('details')?.removeAttribute('open')
                    }}
                  />
                  <span>{y}</span>
                </label>
              ))}
            </div>
          </div>
        </details>

        <details
          className="home-dropdown explainer-dropdown"
          {...(disciplinaOptions.length === 0 ? { 'data-disabled': 'true' } : {})}
        >
          <summary
            className="home-dropdown-summary"
            onClick={(e) => { if (disciplinaOptions.length === 0) e.preventDefault() }}
          >
            <span className="home-dropdown-label">Matéria</span>
            <span className={`home-dropdown-value${filterDisciplina !== 'all' ? ' home-dropdown-value--filled' : ''}`}>
              {filterDisciplina === 'all' ? 'Todas' : (DISCIPLINA_LABELS[filterDisciplina] ?? filterDisciplina)}
            </span>
          </summary>
          <div className="home-dropdown-panel">
            <div className="home-dropdown-group">
              <label className="home-dropdown-option">
                <input
                  type="radio"
                  name="explainer-disciplina"
                  checked={filterDisciplina === 'all'}
                  onChange={(e) => {
                    setFilterDisciplina('all'); setSelectedKey(null)
                    e.currentTarget.closest('details')?.removeAttribute('open')
                  }}
                />
                <span>Todas as matérias</span>
              </label>
              {disciplinaOptions.map((slug) => (
                <label key={slug} className="home-dropdown-option">
                  <input
                    type="radio"
                    name="explainer-disciplina"
                    checked={filterDisciplina === slug}
                    onChange={(e) => {
                      setFilterDisciplina(slug); setSelectedKey(null)
                      e.currentTarget.closest('details')?.removeAttribute('open')
                    }}
                  />
                  <span>{DISCIPLINA_LABELS[slug] ?? slug}</span>
                </label>
              ))}
            </div>
          </div>
        </details>

        <details
          className="home-dropdown explainer-dropdown"
          {...(tagOptions.length === 0 ? { 'data-disabled': 'true' } : {})}
        >
          <summary
            className="home-dropdown-summary"
            onClick={(e) => { if (tagOptions.length === 0) e.preventDefault() }}
          >
            <span className="home-dropdown-label">Assuntos</span>
            <span className={`home-dropdown-value${selectedTags.length > 0 ? ' home-dropdown-value--filled' : ''}`}>
              {tagSummary}
            </span>
          </summary>
          <div className="home-dropdown-panel">
            <div className="home-dropdown-group home-dropdown-group--cols-2">
              {tagOptions.map((tag) => (
                <label key={tag} className="home-dropdown-option">
                  <input
                    type="checkbox"
                    checked={selectedTags.includes(tag)}
                    onChange={() => toggleTag(tag)}
                  />
                  <span>{tag}</span>
                </label>
              ))}
            </div>
          </div>
        </details>

        <input
          type="search"
          className="explainer-filter explainer-search"
          placeholder="Número ou texto…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="explainer-toggle">
          <input
            type="checkbox"
            checked={showOnlyEmpty}
            onChange={(e) => setShowOnlyEmpty(e.target.checked)}
          />
          <span>Só sem explicação</span>
        </label>
      </div>

      <div className="explainer-body">
        <ul className="explainer-list">
          {filtered.length === 0 && <li className="explainer-empty">Nenhuma questão.</li>}
          {filtered.slice(0, 200).map((q) => {
            const k = makeKey(q)
            const text = (explanationOverrides[k] ?? q.explanation ?? '').trim()
            const isEmpty = !text || text === 'Sem explicação ainda.'
            const active = selectedKey === k
            return (
              <li key={k}>
                <button
                  type="button"
                  className={`explainer-list-item${active ? ' active' : ''}${isEmpty ? ' explainer-list-item--empty' : ''}`}
                  onClick={() => selectQuestion(q)}
                >
                  <span className="explainer-list-num">#{q.number}</span>
                  <span className="explainer-list-meta">{q.year} · {AREA_LABELS[q.area] ?? q.area}</span>
                  <span className="explainer-list-state">{isEmpty ? '○' : '●'}</span>
                </button>
              </li>
            )
          })}
          {filtered.length > 200 && <li className="explainer-empty">Mostrando 200 de {filtered.length} — refine o filtro.</li>}
        </ul>

        {selectedQ && (() => {
          const ctxIds = selectedQ.contextIds ?? (selectedQ.contextId ? [selectedQ.contextId] : [])
          const letters = Object.keys(selectedQ.alternatives ?? {})
          const images = selectedQ.images ?? []
          const hasStemImg = images.length > 0 && images.length === letters.length + 1
          const altImgsOnly = images.length > 0 && images.length === letters.length
          const stemImage = hasStemImg ? images[0] : null
          const altImageFor = (index) => hasStemImg ? images[index + 1] : altImgsOnly ? images[index] : null
          return (
              <div className="explainer-question">
                <div className="explainer-question-meta">
                  <span>
                    Questão #{selectedQ.number} · {selectedQ.year} · {AREA_LABELS[selectedQ.area]}
                    {selectedQ.language && <> · {selectedQ.language.toUpperCase()}</>}
                  </span>
                  <label className="explainer-question-meta-toggle">
                    <input
                      type="checkbox"
                      checked={hideAnswer}
                      onChange={(e) => setHideAnswer(e.target.checked)}
                    />
                    <span>Ocultar gabarito</span>
                  </label>
                </div>

                {ctxIds.map((id) => {
                  const ctx = contexts[id]
                  if (!ctx) return null
                  return (
                    <div key={id} className="explainer-context">
                      {ctx.title && (
                        <div
                          className="explainer-context-title"
                          dangerouslySetInnerHTML={{ __html: richHtml(ctx.title) }}
                        />
                      )}
                      {ctx.subtitle && (
                        <div
                          className="explainer-context-subtitle"
                          dangerouslySetInnerHTML={{ __html: richHtml(ctx.subtitle) }}
                        />
                      )}
                      {ctx.text && (
                        <div
                          className="explainer-context-text"
                          dangerouslySetInnerHTML={{ __html: richHtml(ctx.text) }}
                        />
                      )}
                      {(ctx.images ?? []).map((img, i) => (
                        <img
                          key={i}
                          className="explainer-image"
                          src={publicImageSrc(typeof img === 'string' ? img : img?.src)}
                          alt={typeof img === 'string' ? '' : (img?.caption ?? '')}
                        />
                      ))}
                      {ctx.reference && (
                        <div
                          className="explainer-context-ref"
                          dangerouslySetInnerHTML={{ __html: richHtmlBr(ctx.reference) }}
                        />
                      )}
                    </div>
                  )
                })}

                {stemImage && (
                  <img
                    className="explainer-image"
                    src={publicImageSrc(typeof stemImage === 'string' ? stemImage : stemImage?.src)}
                    alt=""
                  />
                )}

                <div
                  className="explainer-question-text"
                  dangerouslySetInnerHTML={{ __html: richHtml(selectedQ.text ?? '') }}
                />

                {letters.length > 0 && (
                  <ul className="explainer-alts">
                    {letters.map((letter, i) => {
                      const altText = selectedQ.alternatives[letter]
                      const isCorrect = !hideAnswer && letter === selectedQ.answer
                      const altImg = altImageFor(i)
                      return (
                        <li
                          key={letter}
                          className={`explainer-alt${isCorrect ? ' explainer-alt--correct' : ''}`}
                        >
                          <span className="explainer-alt-letter">{letter.toUpperCase()}</span>
                          <div className="explainer-alt-body">
                            {altText && (
                              <span
                                className="explainer-alt-text"
                                dangerouslySetInnerHTML={{ __html: richHtml(altText) }}
                              />
                            )}
                            {altImg && (
                              <img
                                className="explainer-alt-image"
                                src={publicImageSrc(typeof altImg === 'string' ? altImg : altImg?.src)}
                                alt={letter.toUpperCase()}
                              />
                            )}
                          </div>
                          {isCorrect && <span className="explainer-alt-check">✓</span>}
                        </li>
                      )
                    })}
                  </ul>
                )}

                {!hideAnswer && (
                  <div className="explainer-answer">
                    Gabarito: <strong>{(selectedQ.answer ?? '').toUpperCase() || '—'}</strong>
                  </div>
                )}
              </div>
          )
        })()}

        <div className="explainer-editor">
          {!selectedQ && (
            <p className="explainer-hint">Selecione uma questão à esquerda para editar a explicação.</p>
          )}
          {selectedQ && (
            <>
              <label className="explainer-label">Explicação</label>
              <textarea
                className="explainer-textarea"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={10}
                placeholder="Escreva a explicação da questão…"
              />

              {error && <p className="explainer-error">{error}</p>}
              {savedFlash && <p className="explainer-saved">{savedFlash}</p>}

              <div className="explainer-actions">
                <button type="button" className="btn--ghost" onClick={nextEmpty}>
                  Pular para próxima sem explicação
                </button>
                <button
                  type="button"
                  className="home-start-btn"
                  onClick={save}
                  disabled={saving || !dirtyRef.current}
                >
                  {saving ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
