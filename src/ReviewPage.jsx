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
  const [auditReport, setAuditReport] = useState(null)
  const [pageMap, setPageMap] = useState({})
  const [flags, setFlags] = useState(loadFlags)
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const [auditRes, pageMapRes, ...questionResults] = await Promise.all([
          fetch('/audit-report.json'),
          fetch('/question-pages.json'),
          ...ALL_FILES.map(f => fetch(`/${f}`)),
        ])

        if (!auditRes.ok) throw new Error('Could not load audit-report.json — run: npm run audit')
        const audit = await auditRes.json()
        setAuditReport(audit)

        const pm = pageMapRes.ok ? await pageMapRes.json() : {}
        setPageMap(pm)

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

  const initDraft = useCallback(() => {
    if (!currentQuestion) return
    setDraft({
      text: currentQuestion.text ?? '',
      alternatives: { ...currentQuestion.alternatives },
      answer: currentQuestion.answer ?? 'a',
    })
    setSaveError(null)
  }, [currentQuestion])

  const saveFix = useCallback(async () => {
    if (!currentQuestion || !draft) return
    setSaving(true)
    setSaveError(null)

    const patch = {}
    if (draft.text !== currentQuestion.text) patch.text = draft.text
    if (draft.answer !== currentQuestion.answer) patch.answer = draft.answer
    const altChanged = ['a','b','c','d','e'].some(k => draft.alternatives[k] !== currentQuestion.alternatives?.[k])
    if (altChanged) patch.alternatives = { ...draft.alternatives }

    if (Object.keys(patch).length === 0) {
      setDraft(null)
      setSaving(false)
      return
    }

    try {
      const res = await fetch('/api/review/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file: currentQuestion._file,
          questionNumber: currentQuestion.number,
          patch,
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? 'Save failed')

      setDatasets(prev => {
        const fileQuestions = prev[currentQuestion._file].map(q =>
          q.number === currentQuestion.number ? { ...q, ...patch } : q
        )
        return { ...prev, [currentQuestion._file]: fileQuestions }
      })

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
                          <label className="rp-edit-label">
                            Text
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
