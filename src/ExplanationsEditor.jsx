import { useState, useMemo, useEffect, useRef } from 'react'
import './QuestionEditor.css'
import { richHtml, richHtmlBr } from './richHtml.js'

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return deduped.filter((it) => {
      if (filterArea !== 'all' && it.area !== filterArea) return false
      if (filterYear !== 'all' && it.year !== Number(filterYear)) return false
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
  }, [deduped, filterArea, filterYear, search, showOnlyEmpty, explanationOverrides])

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
        <select
          className="explainer-filter"
          value={filterArea}
          onChange={(e) => { setFilterArea(e.target.value); setSelectedKey(null) }}
        >
          <option value="all">Todas as áreas</option>
          {Object.entries(AREA_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          className="explainer-filter"
          value={filterYear}
          onChange={(e) => { setFilterYear(e.target.value); setSelectedKey(null) }}
        >
          <option value="all">Todos os anos</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <input
          type="search"
          className="explainer-filter"
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
