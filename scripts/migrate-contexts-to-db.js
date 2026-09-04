// scripts/migrate-contexts-to-db.js
//
// Le public/contexts.json e faz upsert em contexts. Idempotente via
// PRIMARY KEY (key) + ON CONFLICT DO NOTHING.
//
// Uso:
//   npm run migrate:contexts             # roda de verdade
//   npm run migrate:contexts -- --dry-run   # so conta, nao escreve

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'
import { parseContext } from './lib/parse-context-json.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONTEXTS_JSON = path.resolve(__dirname, '..', 'public', 'contexts.json')

const dryRun = process.argv.includes('--dry-run')

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required (use `node --env-file=.env`)')
    process.exit(1)
  }

  const raw = JSON.parse(readFileSync(CONTEXTS_JSON, 'utf8'))
  const rows = Object.entries(raw).map(([key, value]) => parseContext(key, value))

  console.log(`[migrate-contexts] parsed ${rows.length} contexts from contexts.json`)

  if (dryRun) {
    const withImages = rows.filter((r) => r.images.length > 0).length
    const withTitle = rows.filter((r) => r.title).length
    const withSubtitle = rows.filter((r) => r.subtitle).length
    console.log('[migrate-contexts] DRY RUN:')
    console.log(`  with title:    ${withTitle}`)
    console.log(`  with subtitle: ${withSubtitle}`)
    console.log(`  with images:   ${withImages}`)
    console.log('[migrate-contexts] no rows inserted. Rerun without --dry-run to persist.')
    return
  }

  const sql = neon(process.env.DATABASE_URL)
  let inserted = 0
  let skipped = 0

  for (const r of rows) {
    const result = await sql`
      INSERT INTO contexts (key, title, subtitle, text, reference, images)
      VALUES (${r.key}, ${r.title}, ${r.subtitle}, ${r.text}, ${r.reference}, ${r.images})
      ON CONFLICT (key) DO NOTHING
      RETURNING key
    `
    if (result.length === 1) inserted++
    else skipped++
  }

  console.log(`[migrate-contexts] inserted=${inserted} skipped(duplicates)=${skipped}`)
}

main().catch((err) => {
  console.error('[migrate-contexts] fatal:', err)
  process.exit(1)
})
