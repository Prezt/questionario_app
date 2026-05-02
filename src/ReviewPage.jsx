// src/ReviewPage.jsx
import { useState, useEffect, useCallback, useMemo } from 'react'
import './ReviewPage.css'

const AREA_TO_DAY = {
  linguagens: 'd1',
  humanas: 'd1',
  nature: 'd2',
  math: 'd2',
}
const FLAGS_KEY = 'review-flags'
const ALL_FILES = [
  'humanas_enem_2018','humanas_enem_2019','humanas_enem_2020','humanas_enem_2021',
  'humanas_enem_2022','humanas_enem_2023','humanas_enem_2024','humanas_enem_2025',
  'linguagens_enem_2018','linguagens_enem_2019','linguagens_enem_2020','linguagens_enem_2021',
  'linguagens_enem_2022','linguagens_enem_2023','linguagens_enem_2024','linguagens_enem_2025',
  'math_enem_2018','math_enem_2019','math_enem_2020','math_enem_2021',
  'math_enem_2022','math_enem_2023','math_enem_2024','math_enem_2025',
  'nature_enem_2018','nature_enem_2019','nature_enem_2020','nature_enem_2021',
  'nature_enem_2022','nature_enem_2023','nature_enem_2024','nature_enem_2025',
].map(f => f + '.json')

function loadFlags() {
  try { return JSON.parse(localStorage.getItem(FLAGS_KEY) || '{}') } catch { return {} }
}
function saveFlags(flags) {
  localStorage.setItem(FLAGS_KEY, JSON.stringify(flags))
}
function flagKey(file, questionNumber) {
  return `${file.replace('.json', '')}_${questionNumber}`
}
function pageMapKey(year, area, number) {
  return `${year}_${AREA_TO_DAY[area] ?? 'd1'}_${number}`
}
function getAuditIssues(auditReport, file, questionNumber) {
  const fr = auditReport?.byFile?.[file]
  if (!fr) return []
  const qi = fr.questionIssues.find(qi => qi.number === questionNumber)
  return qi ? qi.issues : []
}

export default function ReviewPage() {
  // datasets: { [filename]: Question[] }
  const [datasets, setDatasets] = useState({})
  const [contexts, setContexts] = useState({})
  const [auditReport, setAuditReport] = useState(null)
  const [pageMap, setPageMap] = useState({})
  const [flags, setFlags] = useState(loadFlags)
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const [auditRes, pageMapRes, contextsRes, ...questionResults] = await Promise.all([
          fetch('/audit-report.json'),
          fetch('/question-pages.json'),
          fetch('/contexts.json'),
          ...ALL_FILES.map(f => fetch(`/${f}`)),
        ])

        if (!auditRes.ok) throw new Error('Could not load audit-report.json — run: npm run audit')
        const audit = await auditRes.json()
        setAuditReport(audit)

        const pm = pageMapRes.ok ? await pageMapRes.json() : {}
        setPageMap(pm)

        const ctxs = contextsRes.ok ? await contextsRes.json() : {}
        setContexts(ctxs)

        const ds = {}
        for (let i = 0; i < ALL_FILES.length; i++) {
          if (questionResults[i].ok) {
            ds[ALL_FILES[i]] = await questionResults[i].json()
          }
        }
        setDatasets(ds)
        setReady(true)
      } catch (err) {
        setLoadError(err.message)
      }
    }
    load()
  }, [])

  // Navigation + mode state (only used after ready)
  const [mode, setMode] = useState('queue')
  const [selectedFile, setSelectedFile] = useState(ALL_FILES[0])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [issueFilter, setIssueFilter] = useState(null)

  // Derive active question list
  const activeList = useMemo(() => {
    if (!ready) return []
    if (mode === 'queue') {
      const flagged = []
      for (const [filename, fileReport] of Object.entries(auditReport?.byFile ?? {})) {
        const qs = datasets[filename] ?? []
        const flaggedNums = new Set(fileReport.questionIssues.map(qi => qi.number))
        if (fileReport.datasetIssues.length > 0 && qs.length > 0) {
          flaggedNums.add(qs[0].number)
        }
        for (const q of qs) {
          if (!flaggedNums.has(q.number)) continue
          if (issueFilter) {
            const qi = fileReport.questionIssues.find(qi => qi.number === q.number)
            if (!qi || !qi.issues.some(i => i.type === issueFilter)) continue
          }
          flagged.push({ ...q, _file: filename })
        }
      }
      return flagged.sort((a, b) => a._file.localeCompare(b._file) || a.number - b.number)
    } else {
      return (datasets[selectedFile] ?? [])
        .map(q => ({ ...q, _file: selectedFile }))
        .sort((a, b) => a.number - b.number)
    }
  }, [mode, selectedFile, datasets, auditReport, issueFilter, ready])

  const currentQuestion = activeList[currentIndex] ?? null

  // Collect all issue types present in the audit report
  const allIssueTypes = useMemo(() => {
    const types = new Set()
    for (const fr of Object.values(auditReport?.byFile ?? {})) {
      fr.questionIssues.forEach(qi => qi.issues.forEach(i => types.add(i.type)))
      fr.datasetIssues.forEach(i => types.add(i.type))
    }
    return [...types].sort()
  }, [auditReport])

  const reviewedCount = useMemo(() =>
    activeList.filter(q => flags[flagKey(q._file, q.number)]).length,
    [activeList, flags]
  )

  // PDF page state
  const [currentPdfPage, setCurrentPdfPage] = useState(1)

  useEffect(() => {
    if (!currentQuestion) return
    const key = pageMapKey(currentQuestion.year, currentQuestion.area, currentQuestion.number)
    const stem = pageMap[key]
    if (stem) {
      const parts = stem.split('-')
      const pageNum = parseInt(parts[parts.length - 1], 10)
      setCurrentPdfPage(pageNum)
    } else {
      setCurrentPdfPage(1)
    }
  }, [currentQuestion, pageMap])

  const pdfPageSrc = currentQuestion
    ? `/Pages/page-${AREA_TO_DAY[currentQuestion.area] ?? 'd1'}-${currentQuestion.year}-${String(currentPdfPage).padStart(2, '0')}.png`
    : null

  const totalPdfPages = useMemo(() => {
    if (!currentQuestion) return 32
    const day = AREA_TO_DAY[currentQuestion.area] ?? 'd1'
    const prefix = `page-${day}-${currentQuestion.year}-`
    const stems = Object.values(pageMap).filter(s => s.startsWith(prefix))
    if (stems.length === 0) return 32
    return Math.max(...stems.map(s => parseInt(s.split('-').pop(), 10)))
  }, [currentQuestion, pageMap])

  // Flag/edit tab state
  const [activeTab, setActiveTab] = useState('flag')
  const [pendingFlag, setPendingFlag] = useState({ issues: [], note: '' })

  useEffect(() => {
    if (!currentQuestion) return
    const saved = flags[flagKey(currentQuestion._file, currentQuestion.number)]
    setPendingFlag(saved ? { issues: saved.issues ?? [], note: saved.note ?? '' } : { issues: [], note: '' })
    setActiveTab('flag')
  }, [currentQuestion])

  // Edit state
  const [draft, setDraft] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [ctxSearch, setCtxSearch] = useState('')
  const [newCtx, setNewCtx] = useState(null) // null = hidden; object = { id, title, subtitle, text, reference }

  // Suggest a context key for the current question
  const suggestContextId = useCallback(() => {
    if (!currentQuestion) return ''
    const area = { linguagens: 'lang', humanas: 'humanas', nature: 'nature', math: 'math' }[currentQuestion.area] ?? currentQuestion.area
    const base = `enem_${currentQuestion.year}_${area}_q${currentQuestion.number}`
    let key = `${base}_ctx1`
    let n = 1
    while (contexts[key]) { n++; key = `${base}_ctx${n}` }
    return key
  }, [currentQuestion, contexts])

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e) {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      if (e.key === 'ArrowLeft') {
        setCurrentIndex(i => Math.max(0, i - 1))
      } else if (e.key === 'ArrowRight') {
        setCurrentIndex(i => Math.min(activeList.length - 1, i + 1))
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [activeList.length])

  const saveFlag = useCallback(() => {
    if (!currentQuestion || pendingFlag.issues.length === 0) return
    const fk = flagKey(currentQuestion._file, currentQuestion.number)
    const updated = {
      ...flags,
      [fk]: {
        file: currentQuestion._file,
        questionNumber: currentQuestion.number,
        issues: pendingFlag.issues,
        note: pendingFlag.note,
        status: 'flagged',
        reviewedAt: new Date().toISOString(),
      },
    }
    saveFlags(updated)
    setFlags(updated)
    setCurrentIndex(i => Math.min(activeList.length - 1, i + 1))
  }, [currentQuestion, pendingFlag, flags, activeList.length])

  const markOk = useCallback(() => {
    if (!currentQuestion) return
    const fk = flagKey(currentQuestion._file, currentQuestion.number)
    const updated = {
      ...flags,
      [fk]: {
        file: currentQuestion._file,
        questionNumber: currentQuestion.number,
        issues: [],
        note: '',
        status: 'ok',
        reviewedAt: new Date().toISOString(),
      },
    }
    saveFlags(updated)
    setFlags(updated)
    setCurrentIndex(i => Math.min(activeList.length - 1, i + 1))
  }, [currentQuestion, flags, activeList.length])

  // Collect contextIds for the current question (normalised to array)
  const currentContextIds = useMemo(() => {
    if (!currentQuestion) return []
    if (Array.isArray(currentQuestion.contextIds)) return currentQuestion.contextIds
    if (currentQuestion.contextId) return [currentQuestion.contextId]
    return []
  }, [currentQuestion])

  const initDraft = useCallback(() => {
    if (!currentQuestion) return
    const linkedIds = Array.isArray(currentQuestion.contextIds)
      ? [...currentQuestion.contextIds]
      : currentQuestion.contextId ? [currentQuestion.contextId] : []
    const ctxDrafts = {}
    for (const cid of linkedIds) {
      const c = contexts[cid]
      if (c) ctxDrafts[cid] = { title: c.title ?? '', subtitle: c.subtitle ?? '', text: c.text ?? '', reference: c.reference ?? '' }
    }
    setDraft({
      text: currentQuestion.text ?? '',
      alternatives: { ...currentQuestion.alternatives },
      answer: currentQuestion.answer ?? 'a',
      linkedContextIds: linkedIds,
      contextDrafts: ctxDrafts,
    })
    setSaveError(null)
  }, [currentQuestion, contexts])

  const saveFix = useCallback(async () => {
    if (!currentQuestion || !draft) return
    setSaving(true)
    setSaveError(null)

    try {
      // 1. Save question fields if changed
      const qPatch = {}
      if (draft.text !== currentQuestion.text) qPatch.text = draft.text
      if (draft.answer !== currentQuestion.answer) qPatch.answer = draft.answer
      const altChanged = ['a','b','c','d','e'].some(k => draft.alternatives[k] !== currentQuestion.alternatives?.[k])
      if (altChanged) qPatch.alternatives = { ...draft.alternatives }

      // Context links changed?
      const origIds = Array.isArray(currentQuestion.contextIds)
        ? currentQuestion.contextIds
        : currentQuestion.contextId ? [currentQuestion.contextId] : []
      const idsChanged = JSON.stringify([...draft.linkedContextIds].sort()) !== JSON.stringify([...origIds].sort())
      if (idsChanged) {
        qPatch.contextIds = draft.linkedContextIds
        // Clear legacy singular field if it exists
        if (currentQuestion.contextId) qPatch.contextId = null
      }

      if (Object.keys(qPatch).length > 0) {
        const res = await fetch('/api/review/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: currentQuestion._file, questionNumber: currentQuestion.number, patch: qPatch }),
        })
        const json = await res.json()
        if (!json.ok) throw new Error(json.error ?? 'Question save failed')

        setDatasets(prev => {
          const fileQuestions = prev[currentQuestion._file].map(q =>
            q.number === currentQuestion.number ? { ...q, ...qPatch } : q
          )
          return { ...prev, [currentQuestion._file]: fileQuestions }
        })
      }

      // 2. Save each context if changed
      for (const [cid, ctxDraft] of Object.entries(draft.contextDrafts ?? {})) {
        const orig = contexts[cid]
        if (!orig) continue
        const cPatch = {}
        if (ctxDraft.title !== orig.title) cPatch.title = ctxDraft.title
        if (ctxDraft.subtitle !== orig.subtitle) cPatch.subtitle = ctxDraft.subtitle
        if (ctxDraft.text !== orig.text) cPatch.text = ctxDraft.text
        if (ctxDraft.reference !== orig.reference) cPatch.reference = ctxDraft.reference
        if (Object.keys(cPatch).length === 0) continue

        const res = await fetch('/api/review/save-context', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contextId: cid, patch: cPatch }),
        })
        const json = await res.json()
        if (!json.ok) throw new Error(`Context ${cid}: ${json.error ?? 'Save failed'}`)

        setContexts(prev => ({ ...prev, [cid]: { ...prev[cid], ...cPatch } }))
      }

      const fk = flagKey(currentQuestion._file, currentQuestion.number)
      const updatedFlags = {
        ...flags,
        [fk]: {
          ...flags[fk],
          file: currentQuestion._file,
          questionNumber: currentQuestion.number,
          status: 'fixed',
          reviewedAt: new Date().toISOString(),
        },
      }
      saveFlags(updatedFlags)
      setFlags(updatedFlags)
      setDraft(null)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }, [currentQuestion, draft, flags])

  const createContext = useCallback(async () => {
    if (!newCtx || !newCtx.id.trim()) return
    setSaveError(null)
    try {
      const res = await fetch('/api/review/create-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contextId: newCtx.id, context: { title: newCtx.title, subtitle: newCtx.subtitle, text: newCtx.text, reference: newCtx.reference } }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? 'Create failed')

      // Add to in-memory contexts
      const created = { title: newCtx.title, subtitle: newCtx.subtitle, text: newCtx.text, reference: newCtx.reference }
      setContexts(prev => ({ ...prev, [newCtx.id]: created }))

      // Link to draft and open its editor
      if (draft) {
        setDraft(d => ({
          ...d,
          linkedContextIds: [...d.linkedContextIds, newCtx.id],
          contextDrafts: { ...d.contextDrafts, [newCtx.id]: { ...created } },
        }))
      }
      setNewCtx(null)
    } catch (err) {
      setSaveError(err.message)
    }
  }, [newCtx, draft])

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loadError) return <div className="rp-shell"><div className="rp-loading rp-error">{loadError}</div></div>
  if (!ready) return <div className="rp-shell"><div className="rp-loading">Loading {Object.keys(datasets).length} / {ALL_FILES.length} files…</div></div>

  return (
    <div className="rp-shell">
      {/* TOP BAR */}
      <div className="rp-topbar">
        <select
          className="rp-mode-select"
          value={mode}
          onChange={e => { setMode(e.target.value); setCurrentIndex(0) }}
        >
          <option value="queue">⚠ Issue Queue ({auditReport?.summary?.totalIssues ?? '?'} flagged)</option>
          <option value="file">Browse by file</option>
        </select>

        {mode === 'file' && (
          <select
            className="rp-file-select"
            value={selectedFile}
            onChange={e => { setSelectedFile(e.target.value); setCurrentIndex(0) }}
          >
            {ALL_FILES.map(f => {
              const count = datasets[f]?.length ?? 0
              const fr = auditReport?.byFile?.[f]
              const issues = fr ? fr.datasetIssues.length + fr.questionIssues.length : 0
              return (
                <option key={f} value={f}>
                  {f.replace('.json', '')} — {count} q{issues > 0 ? ` ⚠${issues}` : ''}
                </option>
              )
            })}
          </select>
        )}

        {mode === 'queue' && (
          <select
            className="rp-filter-select"
            value={issueFilter ?? ''}
            onChange={e => { setIssueFilter(e.target.value || null); setCurrentIndex(0) }}
          >
            <option value="">All issue types</option>
            {allIssueTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}

        <span className="rp-progress">
          {reviewedCount} / {activeList.length} reviewed
        </span>

        <button
          className="rp-export-btn"
          onClick={() => {
            const blob = new Blob([JSON.stringify(flags, null, 2)], { type: 'application/json' })
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = 'review-flags.json'
            a.click()
          }}
        >
          ↓ Export flags
        </button>
      </div>

      {/* MAIN PANELS */}
      <div className="rp-main">
        {/* LEFT: PDF PAGE */}
        <div className="rp-left">
          <div className="rp-pdf-header">
            <span className="rp-pdf-label">
              {pdfPageSrc
                ? `page-${AREA_TO_DAY[currentQuestion.area] ?? 'd1'}-${currentQuestion.year}-${String(currentPdfPage).padStart(2, '0')}.png`
                : 'No page available'}
            </span>
            <div className="rp-pdf-nav">
              <button
                className="rp-pdf-nav-btn"
                onClick={() => setCurrentPdfPage(p => Math.max(1, p - 1))}
                disabled={currentPdfPage <= 1}
              >◀</button>
              <span>{currentPdfPage} / {totalPdfPages}</span>
              <button
                className="rp-pdf-nav-btn"
                onClick={() => setCurrentPdfPage(p => Math.min(totalPdfPages, p + 1))}
                disabled={currentPdfPage >= totalPdfPages}
              >▶</button>
            </div>
          </div>
          <div className="rp-pdf-body">
            {pdfPageSrc ? (
              <img
                key={pdfPageSrc}
                src={pdfPageSrc}
                alt={`PDF page ${currentPdfPage}`}
                className="rp-pdf-img"
                onError={e => { e.target.style.display = 'none' }}
              />
            ) : (
              <div className="rp-pdf-missing">No PDF page available for this question</div>
            )}
          </div>
        </div>

        {/* RIGHT: QUESTION */}
        <div className="rp-right">
          {!currentQuestion ? (
            <div className="rp-q-empty">No questions in this view</div>
          ) : (
            <>
              <div className="rp-q-header">
                <span className="rp-q-number">Q{currentQuestion.number}</span>
                <span className="rp-q-file">{currentQuestion._file.replace('.json', '')}</span>
                {(() => {
                  const fk = flagKey(currentQuestion._file, currentQuestion.number)
                  const flag = flags[fk]
                  if (!flag) return null
                  const colors = { fixed: '#16a34a', ok: '#16a34a', flagged: '#dc2626' }
                  const labels = { fixed: '✓ Fixed', ok: '✓ OK', flagged: '⚠ Flagged' }
                  return <span className="rp-q-status" style={{ color: colors[flag.status] }}>{labels[flag.status]}</span>
                })()}
                {getAuditIssues(auditReport, currentQuestion._file, currentQuestion.number).map(issue => (
                  <span key={issue.type} className="rp-audit-badge">{issue.type}</span>
                ))}
              </div>

              <div className="rp-q-body">
                {currentContextIds.length > 0 && (
                  <div className="rp-ctx-list">
                    {currentContextIds.map(cid => {
                      const c = contexts[cid]
                      if (!c) return <div key={cid} className="rp-ctx rp-ctx--missing">Context not found: {cid}</div>
                      return (
                        <div key={cid} className="rp-ctx">
                          {c.title && <div className="rp-ctx-title">{c.title}</div>}
                          {c.subtitle && <div className="rp-ctx-subtitle">{c.subtitle}</div>}
                          {c.text && <div className="rp-ctx-text">{c.text}</div>}
                          {c.reference && <div className="rp-ctx-reference">{c.reference}</div>}
                        </div>
                      )
                    })}
                  </div>
                )}
                <div className="rp-q-text">{currentQuestion.text}</div>

                {currentQuestion.images?.length > 0 && (
                  <div className="rp-q-images">
                    {currentQuestion.images.map(img => (
                      <img key={img} src={`/${img}`} alt="" className="rp-q-img" />
                    ))}
                  </div>
                )}

                <div className="rp-q-alts">
                  {['a','b','c','d','e'].map(letter => {
                    const val = currentQuestion.alternatives?.[letter] ?? ''
                    const isEmpty = !val.trim()
                    const isCorrect = currentQuestion.answer === letter
                    return (
                      <div
                        key={letter}
                        className={`rp-alt ${isEmpty ? 'rp-alt--empty' : ''} ${isCorrect ? 'rp-alt--correct' : ''}`}
                      >
                        <span className="rp-alt-letter">{letter.toUpperCase()})</span>
                        <span className="rp-alt-text">{isEmpty ? '[empty]' : val}</span>
                      </div>
                    )
                  })}
                </div>

                {/* ACTION PANEL */}
                <div className="rp-action-panel">
                  <div className="rp-tabs">
                    <button
                      className={`rp-tab ${activeTab === 'flag' ? 'rp-tab--active' : ''}`}
                      onClick={() => setActiveTab('flag')}
                    >🚩 Flag</button>
                    <button
                      className={`rp-tab ${activeTab === 'edit' ? 'rp-tab--active' : ''}`}
                      onClick={() => { setActiveTab('edit'); if (!draft) initDraft() }}
                    >✏️ Edit</button>
                  </div>

                  {activeTab === 'flag' && (
                    <div className="rp-flag-panel">
                      <div className="rp-checkboxes">
                        {['text', 'image', 'alternatives'].map(issue => (
                          <label key={issue} className="rp-checkbox-label">
                            <input
                              type="checkbox"
                              checked={pendingFlag.issues.includes(issue)}
                              onChange={e => {
                                const next = e.target.checked
                                  ? [...pendingFlag.issues, issue]
                                  : pendingFlag.issues.filter(i => i !== issue)
                                setPendingFlag(f => ({ ...f, issues: next }))
                              }}
                            />
                            {issue} not matching
                          </label>
                        ))}
                      </div>
                      <input
                        className="rp-note-input"
                        type="text"
                        placeholder="Optional note…"
                        value={pendingFlag.note}
                        onChange={e => setPendingFlag(f => ({ ...f, note: e.target.value }))}
                      />
                      <div className="rp-flag-actions">
                        <button
                          className="rp-btn rp-btn--flag"
                          onClick={saveFlag}
                          disabled={pendingFlag.issues.length === 0}
                        >Save flag</button>
                        <button className="rp-btn rp-btn--ok" onClick={markOk}>✓ Looks good</button>
                      </div>
                    </div>
                  )}

                  {activeTab === 'edit' && (
                    <div className="rp-edit-panel">
                      {!draft ? (
                        <button className="rp-btn rp-btn--edit-start" onClick={initDraft}>
                          ✏️ Start editing Q{currentQuestion?.number}
                        </button>
                      ) : (
                        <div className="rp-edit-form">
                          {/* Context linker */}
                          <div className="rp-ctx-linker">
                            <div className="rp-edit-label" style={{marginBottom:4}}>Linked contexts</div>
                            {draft.linkedContextIds.length === 0 && (
                              <div className="rp-ctx-no-links">No contexts linked</div>
                            )}
                            <div className="rp-ctx-chips">
                              {draft.linkedContextIds.map(cid => (
                                <span key={cid} className="rp-ctx-chip">
                                  <span className="rp-ctx-chip-label" title={contexts[cid]?.title}>{cid}</span>
                                  <button
                                    className="rp-ctx-chip-remove"
                                    onClick={() => setDraft(d => {
                                      const next = d.linkedContextIds.filter(id => id !== cid)
                                      const nextDrafts = { ...d.contextDrafts }
                                      delete nextDrafts[cid]
                                      return { ...d, linkedContextIds: next, contextDrafts: nextDrafts }
                                    })}
                                  >×</button>
                                </span>
                              ))}
                            </div>
                            <div className="rp-ctx-add-row">
                              <input
                                className="rp-ctx-search"
                                type="text"
                                placeholder="Search contexts…"
                                value={ctxSearch}
                                onChange={e => setCtxSearch(e.target.value)}
                              />
                              <select
                                className="rp-ctx-select"
                                size={1}
                                onChange={e => {
                                  const cid = e.target.value
                                  if (!cid || draft.linkedContextIds.includes(cid)) return
                                  const c = contexts[cid]
                                  setDraft(d => ({
                                    ...d,
                                    linkedContextIds: [...d.linkedContextIds, cid],
                                    contextDrafts: {
                                      ...d.contextDrafts,
                                      [cid]: { title: c?.title ?? '', subtitle: c?.subtitle ?? '', text: c?.text ?? '', reference: c?.reference ?? '' },
                                    },
                                  }))
                                  setCtxSearch('')
                                  e.target.value = ''
                                }}
                              >
                                <option value="">— pick a context to link —</option>
                                {Object.entries(contexts).sort(([a], [b]) => a.localeCompare(b))
                                  .filter(([cid, c]) => {
                                    if (draft.linkedContextIds.includes(cid)) return false
                                    if (!ctxSearch) return true
                                    const q = ctxSearch.toLowerCase()
                                    return cid.toLowerCase().includes(q) || (c.title ?? '').toLowerCase().includes(q)
                                  })
                                  .map(([cid, c]) => (
                                    <option key={cid} value={cid}>
                                      {cid}{c.title && c.title !== 'undefined' ? ` — ${c.title}` : ''}
                                    </option>
                                  ))
                                }
                              </select>
                            </div>

                            {!newCtx ? (
                              <button
                                className="rp-btn rp-btn--new-ctx"
                                onClick={() => setNewCtx({ id: suggestContextId(), title: '', subtitle: '', text: '', reference: '' })}
                              >+ Create new context</button>
                            ) : (
                              <div className="rp-new-ctx-form">
                                <div className="rp-edit-label" style={{marginBottom:2}}>New context key</div>
                                <input
                                  className="rp-ctx-search"
                                  type="text"
                                  value={newCtx.id}
                                  onChange={e => setNewCtx(c => ({ ...c, id: e.target.value }))}
                                  placeholder="e.g. enem_2021_humanas_q53_ctx1"
                                />
                                <input className="rp-edit-alt-input" type="text" placeholder="Title" value={newCtx.title}
                                  onChange={e => setNewCtx(c => ({ ...c, title: e.target.value }))} />
                                <input className="rp-edit-alt-input" type="text" placeholder="Subtitle" value={newCtx.subtitle}
                                  onChange={e => setNewCtx(c => ({ ...c, subtitle: e.target.value }))} />
                                <textarea className="rp-edit-textarea rp-edit-textarea--ctx" rows={5} placeholder="Context text…"
                                  value={newCtx.text} onChange={e => setNewCtx(c => ({ ...c, text: e.target.value }))} />
                                <input className="rp-edit-alt-input" type="text" placeholder="Reference / source" value={newCtx.reference}
                                  onChange={e => setNewCtx(c => ({ ...c, reference: e.target.value }))} />
                                <div className="rp-edit-actions">
                                  <button className="rp-btn rp-btn--save" onClick={createContext}>Create &amp; link</button>
                                  <button className="rp-btn rp-btn--cancel" onClick={() => setNewCtx(null)}>Cancel</button>
                                </div>
                                {saveError && <div className="rp-save-error">{saveError}</div>}
                              </div>
                            )}
                          </div>

                          {/* Context editors — one per context linked to this question */}
                          {Object.entries(draft.contextDrafts ?? {}).map(([cid, ctxDraft]) => (
                            <div key={cid} className="rp-edit-ctx-block">
                              <div className="rp-edit-ctx-id">{cid}</div>
                              <label className="rp-edit-label">
                                Title
                                <input
                                  className="rp-edit-alt-input"
                                  type="text"
                                  value={ctxDraft.title}
                                  onChange={e => setDraft(d => ({
                                    ...d,
                                    contextDrafts: { ...d.contextDrafts, [cid]: { ...d.contextDrafts[cid], title: e.target.value } }
                                  }))}
                                />
                              </label>
                              <label className="rp-edit-label">
                                Subtitle
                                <input
                                  className="rp-edit-alt-input"
                                  type="text"
                                  value={ctxDraft.subtitle}
                                  onChange={e => setDraft(d => ({
                                    ...d,
                                    contextDrafts: { ...d.contextDrafts, [cid]: { ...d.contextDrafts[cid], subtitle: e.target.value } }
                                  }))}
                                />
                              </label>
                              <label className="rp-edit-label">
                                Context text
                                <textarea
                                  className="rp-edit-textarea rp-edit-textarea--ctx"
                                  value={ctxDraft.text}
                                  rows={6}
                                  onChange={e => setDraft(d => ({
                                    ...d,
                                    contextDrafts: { ...d.contextDrafts, [cid]: { ...d.contextDrafts[cid], text: e.target.value } }
                                  }))}
                                />
                              </label>
                              <label className="rp-edit-label">
                                Reference / source
                                <input
                                  className="rp-edit-alt-input"
                                  type="text"
                                  value={ctxDraft.reference}
                                  onChange={e => setDraft(d => ({
                                    ...d,
                                    contextDrafts: { ...d.contextDrafts, [cid]: { ...d.contextDrafts[cid], reference: e.target.value } }
                                  }))}
                                />
                              </label>
                            </div>
                          ))}

                          <label className="rp-edit-label">
                            Question text
                            <textarea
                              className="rp-edit-textarea"
                              value={draft.text}
                              rows={4}
                              onChange={e => setDraft(d => ({ ...d, text: e.target.value }))}
                            />
                          </label>

                          <div className="rp-edit-alts-grid">
                            {['a','b','c','d','e'].map(letter => (
                              <label key={letter} className="rp-edit-alt-label">
                                <span className="rp-edit-alt-letter">{letter.toUpperCase()}</span>
                                <input
                                  className="rp-edit-alt-input"
                                  type="text"
                                  value={draft.alternatives[letter] ?? ''}
                                  onChange={e => setDraft(d => ({
                                    ...d,
                                    alternatives: { ...d.alternatives, [letter]: e.target.value }
                                  }))}
                                />
                              </label>
                            ))}
                          </div>

                          <label className="rp-edit-label rp-edit-answer-label">
                            Answer
                            <select
                              className="rp-edit-answer-select"
                              value={draft.answer ?? ''}
                              onChange={e => setDraft(d => ({ ...d, answer: e.target.value }))}
                            >
                              {['a','b','c','d','e','annulled'].map(v => (
                                <option key={v} value={v}>{v}</option>
                              ))}
                            </select>
                          </label>

                          {saveError && <div className="rp-save-error">{saveError}</div>}

                          <div className="rp-edit-actions">
                            <button
                              className="rp-btn rp-btn--save"
                              onClick={saveFix}
                              disabled={saving}
                            >{saving ? 'Saving…' : 'Save fix'}</button>
                            <button
                              className="rp-btn rp-btn--cancel"
                              onClick={() => { setDraft(null); setSaveError(null) }}
                              disabled={saving}
                            >Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* BOTTOM NAV */}
      <div className="rp-bottom">
        <button className="rp-nav-btn" onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}>← Prev</button>
        <button className="rp-nav-btn" onClick={() => setCurrentIndex(i => Math.min(activeList.length - 1, i + 1))}>Next →</button>
        <span className="rp-nav-hint">or use ← → keys</span>
        <span className="rp-nav-progress">
          {currentIndex + 1} of {activeList.length}
          {currentQuestion && ` — Q${currentQuestion.number} (${currentQuestion._file.replace('.json', '')})`}
        </span>
      </div>
    </div>
  )
}
