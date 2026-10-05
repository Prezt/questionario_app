#!/usr/bin/env node
/**
 * Conserta as duas unicas referencias de imagem apontando para arquivo
 * inexistente. O public/*.json ja foi corrigido; isto alinha o banco, que e de
 * onde o gerador de lista le.
 *
 *   enem_2021_lang_es_q5_ctx1   figuras/q005_2021_fig1.png
 *     O arquivo existe, com sufixo de idioma: q005_2021_fig1_es.png. E a
 *     charge do ERLICH, e o contexto e quem tem a fonte — entao a figura fica
 *     no contexto e sai das imagens da propria questao, senao renderiza duas
 *     vezes (o texto do contexto e so o marcador "[Imagem]").
 *
 *   enem_2021_linguagens_q9_ctx1   figuras/q009_2021_fig1.png
 *     Nao existe arquivo q009_2021* em lugar nenhum do repositorio, e o
 *     contexto e a passagem do Guimaraes Rosa, sem marcador de figura no
 *     texto. Sobra de migracao: a referencia sai.
 *
 * Run: node --env-file=.env scripts/fix-broken-context-images.js [--dry-run]
 */
import { neon } from '@neondatabase/serverless'

const DRY_RUN = process.argv.includes('--dry-run')

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL ausente. Rode com: node --env-file=.env scripts/fix-broken-context-images.js')
  process.exit(1)
}

const sql = neon(process.env.DATABASE_URL)

const ALVO_CTX = ['enem_2021_lang_es_q5_ctx1', 'enem_2021_linguagens_q9_ctx1']

async function main() {
  const antes = await sql`SELECT key, images FROM contexts WHERE key = ANY(${ALVO_CTX})`
  const questaoAntes = await sql`
    SELECT id, number, language, images FROM multiple_choice_questions
    WHERE year = 2021 AND number = 5 AND language = 'espanhol' AND area = 'linguagens'`

  console.log('Antes:')
  for (const r of antes) console.log(`  ctx ${r.key}: ${JSON.stringify(r.images)}`)
  for (const q of questaoAntes) console.log(`  q${q.id} (2021 q5 espanhol): ${JSON.stringify(q.images)}`)

  if (DRY_RUN) {
    console.log('\n--dry-run: nada gravado.')
    return
  }

  await sql`UPDATE contexts SET images = ARRAY['figuras/q005_2021_fig1_es.png']::text[]
            WHERE key = 'enem_2021_lang_es_q5_ctx1'`
  await sql`UPDATE contexts SET images = ARRAY[]::text[]
            WHERE key = 'enem_2021_linguagens_q9_ctx1'`
  await sql`UPDATE multiple_choice_questions SET images = ARRAY[]::text[]
            WHERE year = 2021 AND number = 5 AND language = 'espanhol' AND area = 'linguagens'`

  const depois = await sql`SELECT key, images FROM contexts WHERE key = ANY(${ALVO_CTX})`
  const questaoDepois = await sql`
    SELECT id, number, language, images FROM multiple_choice_questions
    WHERE year = 2021 AND number = 5 AND language = 'espanhol' AND area = 'linguagens'`

  console.log('\nDepois:')
  for (const r of depois) console.log(`  ctx ${r.key}: ${JSON.stringify(r.images)}`)
  for (const q of questaoDepois) console.log(`  q${q.id} (2021 q5 espanhol): ${JSON.stringify(q.images)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
