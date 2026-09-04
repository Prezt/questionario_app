// scripts/migrate-questions-to-db.js
//
// Lê todos os JSONs de questões em public/ e faz upsert (INSERT ... ON CONFLICT
// DO NOTHING) em multiple_choice_questions.
//
// Uso:
//   npm run migrate:questions            # roda de verdade
//   npm run migrate:questions -- --dry-run   # só conta e reporta, não escreve

import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'
import { parseQuestion, annotateLinguagensLanguage } from './lib/parse-question-json.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public')

const dryRun = process.argv.includes('--dry-run')

const TEACHER_LISTS = ['ricardo_lista1'] // adicionar aqui novas listas quando surgirem

function loadEnemJsons() {
  const files = readdirSync(PUBLIC_DIR).filter((name) => /_enem_\d{4}\.json$/.test(name))
  return files.map((name) => {
    const filePath = path.join(PUBLIC_DIR, name)
    const raw = JSON.parse(readFileSync(filePath, 'utf8'))
    // Linguagens 1-5 aparecem duas vezes por ano (ingles + espanhol). Anota
    // language antes de passar pro parser pra preservar as duas versoes.
    const questions = name.startsWith('linguagens_') ? annotateLinguagensLanguage(raw) : raw
    return { file: name, sourceMeta: { source: 'enem', source_list: null }, questions }
  })
}

function loadTeacherLists() {
  return TEACHER_LISTS.flatMap((slug) => {
    const filePath = path.join(PUBLIC_DIR, `${slug}.json`)
    let raw
    try {
      raw = JSON.parse(readFileSync(filePath, 'utf8'))
    } catch (err) {
      console.warn(`[migrate] skipping ${slug}: ${err.message}`)
      return []
    }
    return [{ file: `${slug}.json`, sourceMeta: { source: 'teacher_list', source_list: slug }, questions: raw }]
  })
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required (use `node --env-file=.env`)')
    process.exit(1)
  }

  const bundles = [...loadEnemJsons(), ...loadTeacherLists()]

  console.log(`[migrate] found ${bundles.length} JSON bundles`)

  const rows = []
  for (const bundle of bundles) {
    for (const raw of bundle.questions) {
      try {
        rows.push(parseQuestion(raw, bundle.sourceMeta))
      } catch (err) {
        console.error(`[migrate] parse error in ${bundle.file} q=${raw.number}:`, err.message)
      }
    }
  }

  console.log(`[migrate] parsed ${rows.length} questions total`)

  if (dryRun) {
    const bySource = rows.reduce((acc, r) => {
      const key = r.source_list ? `${r.source}/${r.source_list}` : r.source
      acc[key] = (acc[key] ?? 0) + 1
      return acc
    }, {})
    console.log('[migrate] DRY RUN — breakdown por origem:')
    for (const [key, count] of Object.entries(bySource)) {
      console.log(`  ${key}: ${count}`)
    }
    console.log('[migrate] no rows inserted. Rerun without --dry-run to persist.')
    return
  }

  const sql = neon(process.env.DATABASE_URL)
  let inserted = 0
  let skipped = 0

  for (const r of rows) {
    const result = await sql`
      INSERT INTO multiple_choice_questions
        (source, source_list, area, test, year, number,
         text, alternatives, answer, images, tags, disciplinas,
         difficulty, context_keys, language, review)
      VALUES
        (${r.source}, ${r.source_list}, ${r.area}, ${r.test}, ${r.year}, ${r.number},
         ${r.text}, ${r.alternatives}, ${r.answer}, ${r.images}, ${r.tags}, ${r.disciplinas},
         ${r.difficulty}, ${r.context_keys}, ${r.language}, ${r.review})
      ON CONFLICT (source, source_list, area, test, year, number, language) DO NOTHING
      RETURNING id
    `
    if (result.length === 1) inserted++
    else skipped++
  }

  console.log(`[migrate] inserted=${inserted} skipped(duplicates)=${skipped}`)
}

main().catch((err) => {
  console.error('[migrate] fatal:', err)
  process.exit(1)
})
