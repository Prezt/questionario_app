#!/usr/bin/env node
// Pulls every explanation from the DB and writes it into the corresponding
// public/<area>_enem_<year>.json question.
// Usage: node scripts/freeze-explanations.js
// Requires DATABASE_URL.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { neon } from '@neondatabase/serverless'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PUBLIC_DIR = path.join(ROOT, 'public')

const sql = neon(process.env.DATABASE_URL)

const rows = await sql`
  SELECT area, year, test, number, explanation
  FROM explanations
`

if (rows.length === 0) {
  console.log('No explanations in DB. Nothing to do.')
  process.exit(0)
}

// Group by JSON file (area + year)
const byFile = new Map()
for (const r of rows) {
  const filename = `${r.area}_enem_${r.year}.json`
  if (!byFile.has(filename)) byFile.set(filename, new Map())
  // key by (test, number) — area/year are implicit in the filename
  byFile.get(filename).set(`${r.test}:${r.number}`, r.explanation)
}

let totalUpdated = 0
let filesTouched = 0
const missing = []

for (const [filename, edits] of byFile) {
  const filepath = path.join(PUBLIC_DIR, filename)
  if (!fs.existsSync(filepath)) {
    console.warn(`!! missing file: ${filename} (${edits.size} edits dropped)`)
    for (const k of edits.keys()) missing.push(`${filename}#${k}`)
    continue
  }
  const data = JSON.parse(fs.readFileSync(filepath, 'utf8'))
  let changed = 0
  for (const q of data) {
    const k = `${q.test}:${q.number}`
    if (edits.has(k) && q.explanation !== edits.get(k)) {
      q.explanation = edits.get(k)
      changed++
    }
  }
  if (changed > 0) {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2) + '\n', 'utf8')
    console.log(`updated ${filename} (${changed} questions)`)
    filesTouched++
    totalUpdated += changed
  }
}

console.log('')
console.log(`Total questions frozen : ${totalUpdated}`)
console.log(`Files touched          : ${filesTouched}`)
if (missing.length > 0) {
  console.log(`Skipped (file missing) : ${missing.length}`)
  missing.forEach((m) => console.log(`  ${m}`))
}
console.log('')
console.log('Next steps:')
console.log('  1. Review with: git diff public/*_enem_*.json')
console.log('  2. Commit: git add public/*_enem_*.json && git commit')
console.log('  3. After deploy, clear DB from the app (Ensine > Limpar banco de explicações)')
