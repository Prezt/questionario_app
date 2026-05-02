#!/usr/bin/env node
/**
 * Normalize context keys in contexts.json and update all references
 * in the 32 question JSON files.
 *
 * Normalizations applied:
 *   1. Replace "_lang_" area segment with "_linguagens_"
 *   2. Strip leading zeros from embedded question numbers
 *      e.g. _055_ → _55_  |  _085_ctx → _85_ctx  |  _070_ctx → _70_ctx
 *
 * Run: node scripts/normalize-context-keys.js [--dry-run]
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC = path.resolve(__dirname, '../public')
const DRY_RUN = process.argv.includes('--dry-run')

// ── Normalization rules ────────────────────────────────────────────────────

function normalizeKey(key) {
  let k = key

  // 1. lang → linguagens
  k = k.replace(/_lang_/, '_linguagens_')

  // 2. Strip leading zeros from embedded numbers (between underscores or before _ctx/_q/_end)
  //    Matches: _0N  where the segment is purely numeric and starts with 0
  k = k.replace(/_0+(\d+)/g, (match, digits) => `_${digits}`)

  return k
}

// ── Build rename map ───────────────────────────────────────────────────────

const ctxPath = path.join(PUBLIC, 'contexts.json')
const contexts = JSON.parse(fs.readFileSync(ctxPath, 'utf8'))

const renameMap = {} // oldKey → newKey (only entries that actually change)
for (const key of Object.keys(contexts)) {
  const normalized = normalizeKey(key)
  if (normalized !== key) renameMap[key] = normalized
}

if (Object.keys(renameMap).length === 0) {
  console.log('Nothing to normalize — all keys already clean.')
  process.exit(0)
}

console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Renaming ${Object.keys(renameMap).length} context keys:\n`)
for (const [from, to] of Object.entries(renameMap)) {
  console.log(`  ${from}`)
  console.log(`  → ${to}\n`)
}

if (DRY_RUN) {
  console.log('Run without --dry-run to apply.')
  process.exit(0)
}

// ── Apply to contexts.json ─────────────────────────────────────────────────

// Check for collisions (new key must not already exist unless it's being renamed)
for (const [from, to] of Object.entries(renameMap)) {
  if (to in contexts && !(to in renameMap)) {
    console.error(`ERROR: target key "${to}" already exists in contexts.json. Aborting.`)
    process.exit(1)
  }
}

const newContexts = {}
for (const [key, value] of Object.entries(contexts)) {
  const newKey = renameMap[key] ?? key
  newContexts[newKey] = value
}

fs.writeFileSync(ctxPath, JSON.stringify(newContexts, null, 2), 'utf8')
console.log(`✓ contexts.json updated`)

// ── Update all question files ─────────────────────────────────────────────

const questionFiles = fs.readdirSync(PUBLIC).filter(f => /^[a-z]+_enem_\d{4}\.json$/.test(f))
let filesChanged = 0

for (const file of questionFiles) {
  const filePath = path.join(PUBLIC, file)
  const questions = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  let changed = false

  for (const q of questions) {
    // contextId (singular string)
    if (q.contextId && renameMap[q.contextId]) {
      q.contextId = renameMap[q.contextId]
      changed = true
    }
    // contextIds (array)
    if (Array.isArray(q.contextIds)) {
      const updated = q.contextIds.map(id => renameMap[id] ?? id)
      if (updated.some((id, i) => id !== q.contextIds[i])) {
        q.contextIds = updated
        changed = true
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
