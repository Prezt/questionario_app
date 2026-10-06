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
// IDIOMA: nas questoes 1 a 5 de linguagens, ingles e espanhol dividem o mesmo
// numero (40 casos no banco). A tabela `explanations` ganhou a coluna
// `language` na migracao 011, entao as duas versoes convivem. De qual delas e
// a resolucao sai do nome do arquivo da fonte — ".../3-ingles.json".
// Quando o numero e ambiguo e o idioma nao da pra deduzir, ou nao casa com
// nenhuma linha do banco, a questao continua sendo PULADA e listada.

import { neon } from '@neondatabase/serverless'
import { explanationKey } from '../src/explanationKey.js'
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

// Marca de procedencia das de fonte unica. NAO e a marca de IA: esse texto e
// o da propria fonte, palavra por palavra — dizer que foi produzido por IA
// seria mentira. A fonte nunca e nomeada, como no resto do projeto.
const MARCA_FONTE_UNICA = '(Resolução de fonte externa.)'

/** Texto a gravar, com a marca certa para a procedencia do item. */
function textoDoItem(item) {
  if (item.origem === 'par') return item.resolucao_fundida
  const bruto = item.fonte_b?.resolucao
  if (!bruto) return null
  const texto = String(bruto).trim()
  // Idempotente: rodar de novo nao empilha a marca.
  return texto.endsWith(MARCA_FONTE_UNICA) ? texto : `${texto}\n\n${MARCA_FONTE_UNICA}`
}

const merge = JSON.parse(fs.readFileSync(MERGE_FILE, 'utf8'))
// Dois grupos: as fundidas (duas fontes, texto escrito por IA) e as de fonte
// unica, que entram com o texto da propria fonte. Sem as segundas, 2018 inteiro
// e as 35 questoes de espanhol ficam sem resolucao nenhuma — nenhuma delas tem
// par para fundir.
const fundidas = merge.itens.filter((i) => i.origem === 'par' && i.resolucao_fundida)
// So `so_fonte_b`. Os itens `so_fonte_a` ficam de fora: cada cor da prova
// numera as questoes de um jeito, e a numeracao do banco segue a da fonte_b —
// nos pares, fonte_a #5 casa com fonte_b #3. Usar o numero da fonte_a grudaria
// a resolucao na questao errada. Sao 2 itens, e os dois ja tem versao fundida.
const unicas = merge.itens.filter((i) => i.origem === 'so_fonte_b' && textoDoItem(i))
const entradas = [...fundidas, ...unicas]

if (!entradas.length) {
  console.log('Nenhuma resolucao utilizavel no arquivo. Nada a importar.')
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

/** Idioma declarado no nome do arquivo da fonte: ".../3-ingles.json". */
function idiomaDaFonte(item) {
  for (const arquivo of [item.fonte_b?.arquivo, item.fonte_a?.arquivo]) {
    const m = String(arquivo ?? '').match(/-(ingles|espanhol)\.json$/)
    if (m) return m[1]
  }
  return null
}

const paraGravar = []
const semCorrespondencia = []
const ambiguas = []

for (const item of entradas) {
  const numero = item.fonte_b.number
  const chave = `${item.year}#${numero}`
  const linhas = porChave.get(chave)

  if (!linhas) { semCorrespondencia.push(chave); continue }

  let linha = linhas[0]
  if (linhas.length > 1) {
    const idioma = idiomaDaFonte(item)
    linha = idioma ? linhas.find((l) => l.language === idioma) : null
    if (!linha) { ambiguas.push(chave); continue }
  }

  paraGravar.push({
    area: linha.area,
    year: item.year,
    test: TEST,
    number: numero,
    // Sempre o idioma da linha casada, nao o deduzido: e ele que o front usa
    // para montar a chave a partir da questao.
    language: linha.language ?? null,
    explanation: textoDoItem(item),
  })
}

console.log(`fundidas (duas fontes): ${fundidas.length}`)
console.log(`fonte unica          : ${unicas.length}`)
console.log(`prontas para gravar : ${paraGravar.length}`)
console.log(`ambiguas (puladas)  : ${ambiguas.length}${ambiguas.length ? ' -> ' + ambiguas.join(', ') : ''}`)
console.log(`sem correspondencia : ${semCorrespondencia.length}${semCorrespondencia.length ? ' -> ' + semCorrespondencia.join(', ') : ''}`)

if (dryRun) {
  console.log('\n--dry: nada foi gravado.')
  process.exit(0)
}

// Upsert em lotes. `updated_by` fica NULL: a autoria de IA e declarada no proprio
// texto da resolucao, que e o que o aluno le (metadado some na renderizacao).
//
// NAO sobrescreve explicacao escrita por pessoa (`updated_by IS NOT NULL`).
// Sem essa guarda o import apagou a resolucao de professor da math 2022#147 —
// o DO UPDATE trocava o texto sem olhar quem tinha escrito. Resolucao de IA
// nunca deve passar por cima de uma humana: a humana e a boa.
let gravadas = 0
const TAMANHO_LOTE = 100

for (let i = 0; i < paraGravar.length; i += TAMANHO_LOTE) {
  const lote = paraGravar.slice(i, i + TAMANHO_LOTE)
  for (const r of lote) {
    await sql`
      INSERT INTO explanations (area, year, test, number, language, explanation, updated_by, updated_at)
      VALUES (${r.area}, ${r.year}, ${r.test}, ${r.number}, ${r.language}, ${r.explanation}, NULL, NOW())
      ON CONFLICT (area, year, test, number, language)
      DO UPDATE SET explanation = EXCLUDED.explanation, updated_at = NOW()
      WHERE explanations.updated_by IS NULL
    `
    gravadas++
  }
  console.log(`  ${gravadas}/${paraGravar.length}`)
}

const [{ total }] = await sql`SELECT count(*)::int AS total FROM explanations`
console.log(`\ngravadas: ${gravadas}`)
console.log(`total na tabela explanations: ${total}`)

if (mirrorLocal) {
  const linhas = await sql`SELECT area, year, test, number, language, explanation FROM explanations`
  const mapa = {}
  for (const l of linhas) mapa[explanationKey(l)] = l.explanation
  fs.writeFileSync(LOCAL_STORE, JSON.stringify(mapa, null, 2) + '\n', 'utf8')
  console.log(`espelho local: ${LOCAL_STORE} (${Object.keys(mapa).length} entradas)`)
}
