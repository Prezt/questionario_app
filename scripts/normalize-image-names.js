#!/usr/bin/env node
/**
 * Normalize image filenames to qNNN_YYYY_figX.png
 * Renames files in public/figuras/ and updates all references in question JSON files.
 *
 * Run: node scripts/normalize-image-names.js [--dry-run]
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC = path.resolve(__dirname, '../public')
const FIGURAS = path.join(PUBLIC, 'figuras')
const DRY_RUN = process.argv.includes('--dry-run')

const STANDARD = /^figuras\/q\d{3}_\d{4}_fig\d+\.png$/

// ── Collect all non-standard image references ──────────────────────────────

const questionFiles = fs.readdirSync(PUBLIC).filter(f => /^[a-z]+_enem_\d{4}\.json$/.test(f))

// renameMap: old path → new path (e.g. "figuras/q1_quotes.png" → "figuras/q001_2024_fig1.png")
const renameMap = {}

for (const file of questionFiles) {
  const year = file.match(/(\d{4})/)[1]
  const questions = JSON.parse(fs.readFileSync(path.join(PUBLIC, file), 'utf8'))

  for (const q of questions) {
    if (!Array.isArray(q.images) || q.images.length === 0) continue

    const nonStandard = q.images.filter(img => !STANDARD.test(img))
    if (nonStandard.length === 0) continue

    // Determine starting fig number (skip already-standard images for this question)
    const existingFigs = q.images
      .filter(img => STANDARD.test(img))
      .map(img => { const m = img.match(/_fig(\d+)\.png$/); return m ? parseInt(m[1]) : 0 })
    let nextFig = existingFigs.length > 0 ? Math.max(...existingFigs) + 1 : 1

    // Assign fig numbers in the order they appear in the array
    const num = String(q.number).padStart(3, '0')
    for (const img of q.images) {
      if (STANDARD.test(img)) continue
      if (renameMap[img]) continue  // already assigned (same file referenced by multiple questions — unlikely but safe)
      const newName = `q${num}_${year}_fig${nextFig}.png`
      renameMap[img] = `figuras/${newName}`
      nextFig++
    }
  }
}

if (Object.keys(renameMap).length === 0) {
  console.log('Nothing to normalize — all image names already standard.')
  process.exit(0)
}

console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Renaming ${Object.keys(renameMap).length} image(s):\n`)
for (const [from, to] of Object.entries(renameMap)) {
  console.log(`  ${from}`)
  console.log(`  → ${to}\n`)
}

if (DRY_RUN) {
  console.log('Run without --dry-run to apply.')
  process.exit(0)
}

// ── Rename files ───────────────────────────────────────────────────────────

let filesMissing = 0
for (const [oldPath, newPath] of Object.entries(renameMap)) {
  const oldFile = path.join(PUBLIC, oldPath)
  const newFile = path.join(PUBLIC, newPath)
  if (!fs.existsSync(oldFile)) {
    console.warn(`  WARN: file not found, skipping: ${oldPath}`)
    filesMissing++
    continue
  }
  if (fs.existsSync(newFile) && oldFile !== newFile) {
    console.warn(`  WARN: target already exists, skipping: ${newPath}`)
    filesMissing++
    continue
  }
  fs.renameSync(oldFile, newFile)
}

console.log(`✓ Renamed ${Object.keys(renameMap).length - filesMissing} file(s) in public/figuras/`)

// ── Update question JSON files ─────────────────────────────────────────────

let filesChanged = 0
for (const file of questionFiles) {
  const filePath = path.join(PUBLIC, file)
  const questions = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  let changed = false

  for (const q of questions) {
    if (!Array.isArray(q.images)) continue
    const updated = q.images.map(img => renameMap[img] ?? img)
    if (updated.some((img, i) => img !== q.images[i])) {
      q.images = updated
      changed = true
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, JSON.stringify(questions, null, 2), 'utf8')
    filesChanged++
    console.log(`✓ ${file}`)
  }
}

console.log(`\nDone. ${filesChanged} question file(s) updated.`)
