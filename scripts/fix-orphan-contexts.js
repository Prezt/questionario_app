#!/usr/bin/env node
/**
 * Fix orphan contexts that couldn't be auto-normalized (no refs, no extractable number).
 * Matches them by content, renames keys, and links them to their questions.
 *
 * Run: node scripts/fix-orphan-contexts.js [--dry-run]
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC = path.resolve(__dirname, '../public')
const DRY_RUN = process.argv.includes('--dry-run')

// Manually determined matches: oldKey → { newKey, links: [{file, questionNumber}] }
const FIXES = [
  // 2025 linguagens ctx3-ctx9 matched by text content to questions
  { old: 'enem_2025_linguagens_ctx3',  newKey: 'enem_2025_linguagens_q12_ctx1', links: [{ file: 'linguagens_enem_2025.json', number: 12 }] },
  { old: 'enem_2025_linguagens_ctx4',  newKey: 'enem_2025_linguagens_q13_ctx1', links: [{ file: 'linguagens_enem_2025.json', number: 13 }] },
  { old: 'enem_2025_linguagens_ctx5',  newKey: 'enem_2025_linguagens_q16_ctx1', links: [{ file: 'linguagens_enem_2025.json', number: 16 }] },
  { old: 'enem_2025_linguagens_ctx6',  newKey: 'enem_2025_linguagens_q17_ctx1', links: [{ file: 'linguagens_enem_2025.json', number: 17 }] },
  { old: 'enem_2025_linguagens_ctx7',  newKey: 'enem_2025_linguagens_q18_ctx1', links: [{ file: 'linguagens_enem_2025.json', number: 18 }] },
  { old: 'enem_2025_linguagens_ctx8',  newKey: 'enem_2025_linguagens_q18_ctx2', links: [{ file: 'linguagens_enem_2025.json', number: 18 }] },
  { old: 'enem_2025_linguagens_ctx9',  newKey: 'enem_2025_linguagens_q19_ctx1', links: [{ file: 'linguagens_enem_2025.json', number: 19 }] },
  // 2020 nature ctx1 matches Q108 exactly
  { old: 'enem_2020_nature_ctx1', newKey: 'enem_2020_nature_q108_ctx1', links: [{ file: 'nature_enem_2020.json', number: 108 }] },
]

// ── Report ─────────────────────────────────────────────────────────────────

console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Applying ${FIXES.length} fix(es):\n`)
for (const { old, newKey, links } of FIXES) {
  const linkStr = links.map(l => `${l.file} Q${l.number}`).join(', ')
  console.log(`  ${old}`)
  console.log(`  → ${newKey}  [link: ${linkStr}]\n`)
}

if (DRY_RUN) { console.log('Run without --dry-run to apply.'); process.exit(0) }

// ── Apply to contexts.json ─────────────────────────────────────────────────

const ctxPath = path.join(PUBLIC, 'contexts.json')
const contexts = JSON.parse(fs.readFileSync(ctxPath, 'utf8'))

for (const { old, newKey } of FIXES) {
  if (!(old in contexts)) { console.warn(`WARN: key not found in contexts.json: ${old}`); continue }
  if (newKey in contexts) { console.warn(`WARN: target key already exists: ${newKey}`); continue }
  contexts[newKey] = contexts[old]
  delete contexts[old]
}

fs.writeFileSync(ctxPath, JSON.stringify(contexts, null, 2), 'utf8')
console.log('✓ contexts.json updated')

// ── Link contexts to questions ─────────────────────────────────────────────

// Group fixes by file
const byFile = {}
for (const { old, newKey, links } of FIXES) {
  for (const { file, number } of links) {
    if (!byFile[file]) byFile[file] = []
    byFile[file].push({ old, newKey, number })
  }
}

for (const [file, fixes] of Object.entries(byFile)) {
  const filePath = path.join(PUBLIC, file)
  const questions = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  let changed = false

  for (const { old, newKey, number } of fixes) {
    const q = questions.find(q => q.number === number)
    if (!q) { console.warn(`WARN: Q${number} not found in ${file}`); continue }

    // Normalise to contextIds array
    const existing = Array.isArray(q.contextIds) ? [...q.contextIds]
                   : q.contextId ? [q.contextId] : []

    // Replace old key if present, otherwise add new key
    let updated
    if (existing.includes(old)) {
      updated = existing.map(id => id === old ? newKey : id)
    } else if (!existing.includes(newKey)) {
      updated = [...existing, newKey]
    } else {
      continue  // already linked
    }

    q.contextIds = updated
    delete q.contextId
    changed = true
  }

  if (changed) {
    fs.writeFileSync(filePath, JSON.stringify(questions, null, 2), 'utf8')
    console.log(`✓ ${file}`)
  }
}

console.log('\nDone.')
