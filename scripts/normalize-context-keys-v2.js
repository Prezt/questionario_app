#!/usr/bin/env node
/**
 * Normalize ALL context keys to: enem_YYYY_{area}_qNNN[_qMMM]_ctxN
 *
 * Rules:
 *  - Keys already matching the target pattern are left alone (unless they collide)
 *  - For referenced contexts: derive year/area/questions from the question files
 *    - 1 question  → enem_YYYY_area_qNNN_ctx1
 *    - 2 questions  → enem_YYYY_area_qNNN_qMMM_ctx1
 *    - 3+ questions → enem_YYYY_area_qNNN_qMMM_ctx1  (first + last question number)
 *  - For unreferenced contexts: try to extract a question number from the key itself
 *    - If found → enem_YYYY_area_qNNN_ctx1
 *    - If not    → leave key unchanged, log as skipped
 *  - ctxN is incremented automatically to avoid collisions
 *
 * Run: node scripts/normalize-context-keys-v2.js [--dry-run]
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC = path.resolve(__dirname, '../public')
const DRY_RUN = process.argv.includes('--dry-run')

const STANDARD = /^enem_\d{4}_[a-z]+_q\d+(?:_q\d+)?_ctx\d+$/

// ── Build reverse map: contextId → [{year, area, number}] ─────────────────

const questionFiles = fs.readdirSync(PUBLIC).filter(f => /^[a-z]+_enem_\d{4}\.json$/.test(f))
const refMap = {}  // contextId → [{year, area, number}]

for (const file of questionFiles) {
  const year = file.match(/(\d{4})/)[1]
  const area = file.split('_enem_')[0]
  const questions = JSON.parse(fs.readFileSync(path.join(PUBLIC, file), 'utf8'))
  for (const q of questions) {
    const ids = Array.isArray(q.contextIds) ? q.contextIds
               : q.contextId ? [q.contextId] : []
    for (const id of ids) {
      if (!refMap[id]) refMap[id] = []
      refMap[id].push({ year, area, number: q.number })
    }
  }
}

// ── Helper: extract a question number from a messy key ────────────────────

function extractQNumber(key) {
  // Strip leading enem_YYYY_area_ prefix
  const m = key.match(/^enem_\d{4}_[a-z]+_(.+)$/)
  if (!m) return null
  const rest = m[1]  // e.g. "47_ctx", "ctx73", "ctx_53", "83_ctx", "q47_ctx", "55", "169_graph"

  // Explicit q-prefixed number
  const qPrefixed = rest.match(/^q(\d+)/)
  if (qPrefixed) return parseInt(qPrefixed[1])

  // Number before _ctx or at start followed by _
  const numBefore = rest.match(/^(\d+)(?:_ctx|$)/)
  if (numBefore) return parseInt(numBefore[1])

  // ctx followed by number (e.g. ctx73, ctx_53)
  const numAfterCtx = rest.match(/^ctx_?(\d+)/)
  if (numAfterCtx) {
    const n = parseInt(numAfterCtx[1])
    // Only treat as question number if it looks like a question number (>= 1)
    // and not a small ctx sequence number (ctx1..ctx15 are probably ctx sequences)
    if (n > 15) return n
  }

  // Number somewhere in the middle (e.g. "169_graph")
  const anyNum = rest.match(/(\d{2,})/)
  if (anyNum) return parseInt(anyNum[1])

  return null
}

// ── Build target key for each context ─────────────────────────────────────

const contexts = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'contexts.json'), 'utf8'))

// Track which target bases have been used → for ctx numbering
// base = "enem_YYYY_area_qNNN[_qMMM]"  →  next ctx number
const usedBases = {}

// First pass: register already-standard keys so their ctx numbers are reserved
for (const key of Object.keys(contexts)) {
  if (STANDARD.test(key)) {
    const m = key.match(/^(.+)_ctx(\d+)$/)
    if (m) {
      const base = m[1]
      const n = parseInt(m[2])
      usedBases[base] = Math.max(usedBases[base] ?? 0, n)
    }
  }
}

function nextCtx(base) {
  usedBases[base] = (usedBases[base] ?? 0) + 1
  return usedBases[base]
}

// Build rename map
const renameMap = {}   // oldKey → newKey
const skipped = []

for (const key of Object.keys(contexts)) {
  if (STANDARD.test(key)) continue  // already standard

  const refs = refMap[key] ?? []

  let year, area, nums

  if (refs.length > 0) {
    // All refs guaranteed to share year/area (verified earlier)
    year = refs[0].year
    area = refs[0].area
    nums = [...new Set(refs.map(r => r.number))].sort((a, b) => a - b)
  } else {
    // Unreferenced: extract from key
    const m = key.match(/^enem_(\d{4})_([a-z]+)_/)
    if (!m) { skipped.push({ key, reason: 'cannot parse year/area' }); continue }
    year = m[1]
    area = m[2]
    const qn = extractQNumber(key)
    if (!qn) { skipped.push({ key, reason: 'no question number found' }); continue }
    nums = [qn]
  }

  // Build base
  const qPart = nums.length === 1
    ? `q${nums[0]}`
    : `q${nums[0]}_q${nums[nums.length - 1]}`
  const base = `enem_${year}_${area}_${qPart}`
  const newKey = `${base}_ctx${nextCtx(base)}`

  if (newKey !== key) renameMap[key] = newKey
}

// ── Report ─────────────────────────────────────────────────────────────────

console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Renaming ${Object.keys(renameMap).length} context key(s):\n`)
for (const [from, to] of Object.entries(renameMap)) {
  console.log(`  ${from}`)
  console.log(`  → ${to}\n`)
}

if (skipped.length > 0) {
  console.log(`Skipped ${skipped.length} key(s) (cannot determine question number):`)
  for (const { key, reason } of skipped) console.log(`  ${key}  (${reason})`)
  console.log()
}

if (DRY_RUN) {
  console.log('Run without --dry-run to apply.')
  process.exit(0)
}

if (Object.keys(renameMap).length === 0) {
  console.log('Nothing to rename.')
  process.exit(0)
}

// ── Apply to contexts.json ─────────────────────────────────────────────────

// Check for collisions
for (const [, to] of Object.entries(renameMap)) {
  if (to in contexts && !(to in renameMap)) {
    console.error(`ERROR: target key "${to}" already exists and is not itself being renamed. Aborting.`)
    process.exit(1)
  }
}

const newContexts = {}
for (const [key, value] of Object.entries(contexts)) {
  newContexts[renameMap[key] ?? key] = value
}

fs.writeFileSync(path.join(PUBLIC, 'contexts.json'), JSON.stringify(newContexts, null, 2), 'utf8')
console.log('✓ contexts.json updated')

// ── Update question files ──────────────────────────────────────────────────

let filesChanged = 0
for (const file of questionFiles) {
  const filePath = path.join(PUBLIC, file)
  const questions = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  let changed = false

  for (const q of questions) {
    if (q.contextId && renameMap[q.contextId]) {
      q.contextId = renameMap[q.contextId]; changed = true
    }
    if (Array.isArray(q.contextIds)) {
      const updated = q.contextIds.map(id => renameMap[id] ?? id)
      if (updated.some((id, i) => id !== q.contextIds[i])) {
        q.contextIds = updated; changed = true
      }
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, JSON.stringify(questions, null, 2), 'utf8')
    filesChanged++
    console.log(`✓ ${file}`)
  }
}

console.log(`\nDone. ${filesChanged} question file(s) updated.`)
