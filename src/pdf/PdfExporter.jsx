// Tela do professor: monta uma selecao de questoes a partir de listas salvas
// ou de busca avulsa no banco unificado, e gera dois PDFs (lista + gabarito).
//
// Regras (v3.0.0):
// - Modo A: escolher uma question_set salva -> todas as questoes dela entram
//   na selecao (dedupe por id).
// - Modo B: buscar no banco (multiple_choice_questions) -> [+] adiciona
//   uma questao por clique.
// - Os dois modos coexistem: da pra basear numa lista e adicionar avulsas.
// - Ordem no PDF = ordem em que entrou na selecao.
// - Nome do PDF: herda da primeira lista adicionada; editavel.
// - Ainda vive dentro da aba Ensine, sera reposicionada em task #2/#4.

import React, { useEffect, useMemo, useState } from 'react'
import { pdf } from '@react-pdf/renderer'
import PrintableList from './PrintableList.jsx'
import PrintableAnswerKey from './PrintableAnswerKey.jsx'
import './PdfExporter.css'

const AREAS = [
  { value: '', label: 'Todas' },
  { value: 'math', label: 'Matemática' },
  { value: 'nature', label: 'Ciências da Natureza' },
  { value: 'humanas', label: 'Humanas' },
  { value: 'linguagens', label: 'Linguagens' },
]

// Normaliza questao vinda de /api/question-sets/all pro shape que os templates
// PDF esperam (mesmo shape de multiple_choice_questions). Extrai path das
// imagens `{src, caption}[]` para `src[]`.
function normalizeIntegrarQuestion(q, listKey) {
  const images = Array.isArray(q.images)
    ? q.images.map((img) => (typeof img === 'string' ? img : img?.src)).filter(Boolean)
    : []
  return {
    id: `integrar::${listKey}::${q.number}`,
    source: 'teacher_list',
    source_list: listKey,
    area: q.area,
    test: q.test ?? 'Integrar',
    year: q.year,
    number: q.number,
    text: q.text ?? q.stem ?? '',
    alternatives: q.alternatives ?? {},
    answer: q.answer,
    images,
    tags: q.tags ?? [],
    disciplinas: [],
    difficulty: typeof q.difficulty === 'number' ? q.difficulty : null,
    context_keys: [],
    language: null,
    review: false,
    _fromList: listKey, // metadata pra UI
    _listName: q.day,
    _teacher: q.teacher,
  }
}

function slugify(str) {
  return String(str || 'lista')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'lista'
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function PdfExporter({ token, onClose }) {
  const [availableLists, setAvailableLists] = useState([]) // [{ key, name, teacher, year, questions: [] }]
  const [listsLoading, setListsLoading] = useState(true)
  const [listsError, setListsError] = useState(null)
  const [pickedListKey, setPickedListKey] = useState('')

  // Individual search state
  const [srcArea, setSrcArea] = useState('')
  const [srcYear, setSrcYear] = useState('')
  const [srcTag, setSrcTag] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [searchResults, setSearchResults] = useState([])
  const [searchContexts, setSearchContexts] = useState({})

  // Global selection state
  const [selected, setSelected] = useState([]) // ordered array of normalized questions
  const [contextMap, setContextMap] = useState({}) // { key: contextRow }
  const [listName, setListName] = useState('')

  const [busy, setBusy] = useState(false)
  const [genError, setGenError] = useState(null)

  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/question-sets/all', { headers: authHeaders })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const rows = await res.json()
        if (cancelled) return
        const byKey = new Map()
        for (const q of rows) {
          const key = `${q.teacher ?? '?'}::${q.day ?? '?'}`
          if (!byKey.has(key)) {
            byKey.set(key, {
              key,
              name: q.day ?? key,
              teacher: q.teacher ?? '',
              year: q.year ?? null,
              questions: [],
            })
          }
          byKey.get(key).questions.push(q)
        }
        setAvailableLists([...byKey.values()])
      } catch (err) {
        if (!cancelled) setListsError(err.message)
      } finally {
        if (!cancelled) setListsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [authHeaders])

  function selectedIds() {
    return new Set(selected.map((q) => q.id))
  }

  function addQuestions(newQs, fallbackName) {
    setSelected((prev) => {
      const existing = new Set(prev.map((q) => q.id))
      const additions = newQs.filter((q) => !existing.has(q.id))
      return [...prev, ...additions]
    })
    if (!listName && fallbackName) setListName(fallbackName)
  }

  function addList() {
    if (!pickedListKey) return
    const list = availableLists.find((l) => l.key === pickedListKey)
    if (!list) return
    const normalized = list.questions.map((q) => normalizeIntegrarQuestion(q, list.key))
    addQuestions(normalized, list.name)
    setPickedListKey('')
  }

  async function runSearch() {
    setSearching(true)
    setSearchError(null)
    try {
      const params = new URLSearchParams()
      if (srcArea) params.set('area', srcArea)
      if (srcYear) params.set('year', srcYear)
      if (srcTag) params.set('tag', srcTag)
      params.set('limit', '50')
      const res = await fetch(`/api/questions/search?${params.toString()}`, { headers: authHeaders })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setSearchResults(data.questions ?? [])
      setSearchContexts(data.contexts ?? {})
    } catch (err) {
      setSearchError(err.message)
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  function addSearchResult(q) {
    if (selectedIds().has(q.id)) return
    const withMeta = { ...q, _fromList: null }
    setSelected((prev) => [...prev, withMeta])
    // Merge in referenced contexts
    if (Array.isArray(q.context_keys) && q.context_keys.length) {
      const additions = {}
      for (const key of q.context_keys) {
        if (searchContexts[key]) additions[key] = searchContexts[key]
      }
      setContextMap((prev) => ({ ...prev, ...additions }))
    }
  }

  function removeSelected(id) {
    setSelected((prev) => prev.filter((q) => q.id !== id))
  }

  function clearSelection() {
    setSelected([])
    setListName('')
  }

  async function generatePdf(kind) {
    if (!selected.length) return
    setBusy(true)
    setGenError(null)
    try {
      const title = listName || 'Lista de Exercícios'
      const slug = slugify(listName || title)
      if (kind === 'list') {
        const blob = await pdf(
          <PrintableList title={title} questions={selected} contexts={contextMap} />
        ).toBlob()
        downloadBlob(blob, `${slug}-questoes.pdf`)
      } else {
        const blob = await pdf(
          <PrintableAnswerKey title={title} questions={selected} />
        ).toBlob()
        downloadBlob(blob, `${slug}-gabarito.pdf`)
      }
    } catch (err) {
      setGenError(err.message ?? String(err))
    } finally {
      setBusy(false)
    }
  }

  const alreadyIn = selectedIds()

  return (
    <div className="qe-shell qe-shell--embedded pdf-exporter">
      <div className="qe-header">
        <button type="button" className="qe-back-btn" onClick={() => onClose?.()}>← Voltar</button>
        <h2 className="qe-title">Gerar Lista para Impressão</h2>
      </div>

      <p className="pdf-exporter-hint">
        Monte a seleção adicionando <strong>listas salvas</strong> e/ou <strong>questões avulsas</strong>.
        A ordem no PDF segue a ordem em que você adicionou.
      </p>

      <div className="pdf-exporter-columns">
        {/* ── Coluna esquerda: fontes ─────────────────────────── */}
        <div className="pdf-exporter-sources">
          <section className="qe-section">
            <h3 className="qe-section-title">Adicionar lista salva</h3>
            {listsError && <p className="qe-error">{listsError}</p>}
            <div className="pdf-exporter-inline">
              <select
                className="qe-input"
                value={pickedListKey}
                onChange={(e) => setPickedListKey(e.target.value)}
                disabled={listsLoading || busy}
              >
                <option value="">{listsLoading ? 'Carregando…' : '— escolha uma lista —'}</option>
                {availableLists.map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.name} · {l.teacher}{l.year ? ` · ${l.year}` : ''} ({l.questions.length})
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="qe-btn qe-btn--primary"
                onClick={addList}
                disabled={!pickedListKey || busy}
              >
                Adicionar
              </button>
            </div>
          </section>

          <section className="qe-section">
            <h3 className="qe-section-title">Buscar questões avulsas</h3>
            <div className="pdf-exporter-grid">
              <label className="pdf-exporter-field">
                <span className="pdf-exporter-field-label">Área</span>
                <select className="qe-input" value={srcArea} onChange={(e) => setSrcArea(e.target.value)} disabled={busy}>
                  {AREAS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </label>
              <label className="pdf-exporter-field">
                <span className="pdf-exporter-field-label">Ano</span>
                <input
                  className="qe-input"
                  type="number"
                  min="2000"
                  max="2100"
                  value={srcYear}
                  onChange={(e) => setSrcYear(e.target.value)}
                  placeholder="ex: 2024"
                  disabled={busy}
                />
              </label>
              <label className="pdf-exporter-field pdf-exporter-field--full">
                <span className="pdf-exporter-field-label">Tag (uma por vez)</span>
                <input
                  className="qe-input"
                  type="text"
                  value={srcTag}
                  onChange={(e) => setSrcTag(e.target.value)}
                  placeholder="ex: álgebra"
                  disabled={busy}
                />
              </label>
            </div>
            <button
              type="button"
              className="qe-btn qe-btn--primary"
              onClick={runSearch}
              disabled={searching || busy}
              style={{ marginTop: '0.6rem' }}
            >
              {searching ? 'Buscando…' : 'Buscar'}
            </button>
            {searchError && <p className="qe-error" style={{ marginTop: '0.6rem' }}>{searchError}</p>}

            {searchResults.length > 0 && (
              <ul className="pdf-exporter-results">
                {searchResults.map((q) => {
                  const already = alreadyIn.has(q.id)
                  const preview = String(q.text ?? '').slice(0, 70).replace(/\s+/g, ' ')
                  return (
                    <li key={q.id} className="pdf-exporter-result">
                      <div className="pdf-exporter-result-meta">
                        <strong>#{q.number}</strong> · {q.area ?? '?'} · {q.year ?? '?'}
                        {q.language ? ` · ${q.language}` : ''}
                      </div>
                      <div className="pdf-exporter-result-text">{preview}…</div>
                      <button
                        type="button"
                        className="qe-btn qe-btn--ghost pdf-exporter-add"
                        onClick={() => addSearchResult(q)}
                        disabled={already || busy}
                      >
                        {already ? 'já adicionada' : '+ adicionar'}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>

        {/* ── Coluna direita: seleção ────────────────────────── */}
        <div className="pdf-exporter-basket">
          <section className="qe-section">
            <div className="qe-section-header">
              <h3 className="qe-section-title">Seleção ({selected.length})</h3>
              {selected.length > 0 && (
                <button
                  type="button"
                  className="qe-btn qe-btn--ghost"
                  onClick={clearSelection}
                  disabled={busy}
                >
                  Limpar
                </button>
              )}
            </div>

            <label className="pdf-exporter-field">
              <span className="pdf-exporter-field-label">Nome do PDF</span>
              <input
                className="qe-input"
                type="text"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                placeholder="Ex: Matemática ENEM 2024"
                disabled={busy}
              />
            </label>

            {selected.length === 0 ? (
              <p className="pdf-exporter-empty">Nenhuma questão selecionada ainda.</p>
            ) : (
              <ol className="pdf-exporter-selected">
                {selected.map((q, i) => {
                  const origin = q._fromList
                    ? `lista: ${q._listName ?? q._fromList}`
                    : `${q.source ?? ''}${q.area ? ` · ${q.area}` : ''}${q.year ? ` · ${q.year}` : ''}`
                  return (
                    <li key={q.id} className="pdf-exporter-selected-item">
                      <span className="pdf-exporter-selected-num">{i + 1}.</span>
                      <div className="pdf-exporter-selected-body">
                        <div className="pdf-exporter-selected-title">
                          #{q.number} — {String(q.text ?? '').slice(0, 60)}…
                        </div>
                        <div className="pdf-exporter-selected-origin">{origin}</div>
                      </div>
                      <button
                        type="button"
                        className="qe-btn qe-btn--danger pdf-exporter-remove"
                        onClick={() => removeSelected(q.id)}
                        disabled={busy}
                        title="Remover"
                      >
                        −
                      </button>
                    </li>
                  )
                })}
              </ol>
            )}

            {genError && <p className="qe-error" style={{ marginTop: '0.8rem' }}>{genError}</p>}

            <div className="pdf-exporter-actions">
              <button
                type="button"
                className="qe-btn qe-btn--primary"
                onClick={() => generatePdf('list')}
                disabled={busy || !selected.length}
              >
                {busy ? 'Gerando…' : `Baixar Lista (${selected.length})`}
              </button>
              <button
                type="button"
                className="qe-btn qe-btn--ghost"
                onClick={() => generatePdf('key')}
                disabled={busy || !selected.length}
              >
                Baixar Gabarito
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
