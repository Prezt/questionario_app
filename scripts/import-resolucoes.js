#!/usr/bin/env node
// Importa as resolucoes fundidas de data/transcricoes/combinado/_merge_completo.json
// para a tabela `explanations` na Neon.
//
// Uso:
//   node --env-file=.env scripts/import-resolucoes.js          # grava
//   node --env-file=.env scripts/import-resolucoes.js --dry    # so relata
//   node --env-file=.env scripts/import-resolucoes.js --local  # grava e espelha
//
// Sobre --local: em desenvolvimento a rota GET /api/explanations NAO toca o
// banco. O scripts/local-api.js a desvia para scripts/explanations-local.js,
// que le public/explanations.json — um stub para rodar sem Postgres. Sem esse
// arquivo o mapa volta vazio e o app nao mostra explicacao nenhuma no dev,
// mesmo com a tabela cheia. `--local` regrava esse espelho a partir do banco.
//
// A chave do merge e (year, fonte_b.number). A tabela `explanations` e chaveada
// por (area, year, test, number), sem `area` no merge — entao a area vem de
// multiple_choice_questions, casando por (year, number).
//
// AMBIGUIDADE CONHECIDA: nas questoes 1 a 5 de linguagens, ingles e espanhol
// dividem o mesmo numero (40 casos no banco). Como a PK de `explanations` nao
// tem `language`, as duas questoes cairiam na mesma linha. Essas sao PULADAS e
// listadas no relatorio — gravar uma delas sobrescreveria a resolucao da outra.
// Resolver isso exige uma coluna `language` em `explanations` (e ajuste no
// api/explanations/index.js, que monta a chave sem idioma).

import { neon } from '@neondatabase/serverless'
import fs from 'node:fs'
import path from 'node:path'

const MERGE_FILE = path.resolve('data/transcricoes/combinado/_merge_completo.json')
const TEST = 'ENEM'
const dryRun = process.argv.includes('--dry')
const mirrorLocal = process.argv.includes('--local')
const LOCAL_STORE = path.resolve('public/explanations.json')

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL ausente. Rode com: node --env-file=.env scripts/import-resolucoes.js')
  process.exit(1)
}

const sql = neon(process.env.DATABASE_URL)

const merge = JSON.parse(fs.readFileSync(MERGE_FILE, 'utf8'))
const fundidas = merge.itens.filter((i) => i.origem === 'par' && i.resolucao_fundida)

if (!fundidas.length) {
  console.log('Nenhuma resolucao fundida no arquivo. Nada a importar.')
  process.exit(0)
}

// Mapa (year#number) -> linhas do banco, para descobrir a area e detectar ambiguidade.
const questoes = await sql`SELECT year, number, area, language FROM multiple_choice_questions`
const porChave = new Map()
for (const q of questoes) {
  const k = `${q.year}#${q.number}`
  if (!porChave.has(k)) porChave.set(k, [])
  porChave.get(k).push(q)
}

const paraGravar = []
const semCorrespondencia = []
const ambiguas = []

for (const item of fundidas) {
  const chave = `${item.year}#${item.fonte_b.number}`
  const linhas = porChave.get(chave)

  if (!linhas) { semCorrespondencia.push(chave); continue }
  if (linhas.length > 1) { ambiguas.push(chave); continue }

  paraGravar.push({
    area: linhas[0].area,
    year: item.year,
    test: TEST,
    number: item.fonte_b.number,
    explanation: item.resolucao_fundida,
  })
}

console.log(`fundidas no arquivo : ${fundidas.length}`)
console.log(`prontas para gravar : ${paraGravar.length}`)
console.log(`ambiguas (puladas)  : ${ambiguas.length}${ambiguas.length ? ' -> ' + ambiguas.join(', ') : ''}`)
console.log(`sem correspondencia : ${semCorrespondencia.length}${semCorrespondencia.length ? ' -> ' + semCorrespondencia.join(', ') : ''}`)

if (dryRun) {
  console.log('\n--dry: nada foi gravado.')
  process.exit(0)
}

// Upsert em lotes. `updated_by` fica NULL: a autoria de IA e declarada no proprio
// texto da resolucao, que e o que o aluno le (metadado some na renderizacao).
let gravadas = 0
const TAMANHO_LOTE = 100

for (let i = 0; i < paraGravar.length; i += TAMANHO_LOTE) {
  const lote = paraGravar.slice(i, i + TAMANHO_LOTE)
  for (const r of lote) {
    await sql`
      INSERT INTO explanations (area, year, test, number, explanation, updated_by, updated_at)
      VALUES (${r.area}, ${r.year}, ${r.test}, ${r.number}, ${r.explanation}, NULL, NOW())
      ON CONFLICT (area, year, test, number)
      DO UPDATE SET explanation = EXCLUDED.explanation, updated_at = NOW()
    `
    gravadas++
  }
  console.log(`  ${gravadas}/${paraGravar.length}`)
}

const [{ total }] = await sql`SELECT count(*)::int AS total FROM explanations`
console.log(`\ngravadas: ${gravadas}`)
console.log(`total na tabela explanations: ${total}`)

if (mirrorLocal) {
  const linhas = await sql`SELECT area, year, test, number, explanation FROM explanations`
  const mapa = {}
  for (const l of linhas) mapa[`${l.area}:${l.year}:${l.test}:${l.number}`] = l.explanation
  fs.writeFileSync(LOCAL_STORE, JSON.stringify(mapa, null, 2) + '\n', 'utf8')
  console.log(`espelho local: ${LOCAL_STORE} (${Object.keys(mapa).length} entradas)`)
}
