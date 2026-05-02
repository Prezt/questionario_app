// src/ReviewPage.jsx
import { useState, useEffect, useCallback } from 'react'
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

  if (loadError) return <div className="rp-shell"><div className="rp-loading rp-error">{loadError}</div></div>
  if (!ready) return <div className="rp-shell"><div className="rp-loading">Loading {Object.keys(datasets).length} / {ALL_FILES.length} files…</div></div>

  const totalQuestions = Object.values(datasets).reduce((s, qs) => s + qs.length, 0)

  return (
    <div className="rp-shell">
      <div className="rp-loading">
        ✓ Loaded {totalQuestions} questions across {ALL_FILES.length} files.
        Audit: {auditReport?.summary?.totalIssues ?? '?'} issues.
        Page map: {Object.keys(pageMap).length} entries.
      </div>
    </div>
  )
}
