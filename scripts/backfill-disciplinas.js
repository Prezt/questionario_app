// scripts/backfill-disciplinas.js
// Idempotent: writes question.disciplinas onto every public/*_enem_*.json.
// Skips questions that already have a non-empty disciplinas array.
// Prints a summary including the "empty disciplinas" list for manual follow-up.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { disciplinasForQuestion } from '../src/data/disciplinaFromTag.js'
import { ALL_DISCIPLINAS } from '../src/data/disciplinas.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PUBLIC_DIR = path.join(ROOT, 'public')

function detectIndent(raw) {
  const m = raw.match(/^\{\s*\n(\s+)"/) || raw.match(/^\[\s*\n(\s+)\{/)
  return m ? m[1] : '  '
}

function isQuestionFile(name) {
  return /^(linguagens|humanas|nature|math)_enem_\d{4}\.json$/.test(name)
}

const files = fs.readdirSync(PUBLIC_DIR)
  .filter(isQuestionFile)
  .sort()

const counts = Object.fromEntries(ALL_DISCIPLINAS.map((d) => [d, 0]))
const empties = []
let totalProcessed = 0
let totalUpdated = 0
let multidiscCount = 0

for (const filename of files) {
  const filepath = path.join(PUBLIC_DIR, filename)
  const raw = fs.readFileSync(filepath, 'utf8')
  const indent = detectIndent(raw)
  const data = JSON.parse(raw)
  if (!Array.isArray(data)) continue

  let changed = false
  for (const q of data) {
    totalProcessed++
    if (Array.isArray(q.disciplinas) && q.disciplinas.length > 0) {
      for (const d of q.disciplinas) counts[d] = (counts[d] ?? 0) + 1
      if (q.disciplinas.length > 1) multidiscCount++
      continue
    }
    const disciplinas = disciplinasForQuestion(q)
    q.disciplinas = disciplinas
    changed = true
    totalUpdated++
    if (disciplinas.length === 0) {
      empties.push(`${filename}#q${q.number}`)
    } else {
      for (const d of disciplinas) counts[d] = (counts[d] ?? 0) + 1
      if (disciplinas.length > 1) multidiscCount++
    }
  }

  if (changed) {
    fs.writeFileSync(filepath, JSON.stringify(data, null, indent) + '\n', 'utf8')
    console.log(`updated ${filename}`)
  }
}

console.log('')
console.log(`Total questions processed : ${totalProcessed}`)
console.log(`Total questions updated   : ${totalUpdated}`)
console.log(`Multidisciplinar          : ${multidiscCount}`)
console.log('Per-disciplina counts:')
for (const d of ALL_DISCIPLINAS) {
  console.log(`  ${d.padEnd(20)} ${counts[d]}`)
}
console.log(`Empty disciplinas (${empties.length}) — needs manual fixup:`)
for (const e of empties) console.log(`  ${e}`)
