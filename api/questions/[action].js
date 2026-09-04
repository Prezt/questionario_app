// Dispatcher unico para os endpoints de leitura da v3.0.0.
// Segue o mesmo padrao de api/admin/[action].js — uma unica Vercel Function
// serve 4 acoes distintas, controladas via `req.query.action`.
//
// Rotas expostas:
//   GET /api/questions/search    — busca paginada em multiple_choice_questions
//   GET /api/questions/random    — sorteio (count + area)
//   GET /api/questions/prova     — prova ENEM completa (area + year)
//   GET /api/questions/contexts  — batch fetch de contextos por keys (comma-separated)
//
// Contexto: contextos ficam sob /api/questions/contexts em vez de /api/contexts
// pra ficarem no mesmo file/function e nao consumir slot separado no plano
// Hobby da Vercel (limite historico de 12 functions).

import { neon } from '@neondatabase/serverless'
import { verifyToken } from '../_auth.js'
import { parseSearchQuery, extractContextKeys, loadContextsMap } from './_helpers.js'

const ALLOWED_COUNTS = new Set([5, 10, 20])
const ALLOWED_AREAS = new Set(['math', 'nature', 'humanas', 'linguagens'])

async function handleSearch(req, res, sql) {
  const { where, params, limit, offset } = parseSearchQuery(req.query ?? {})
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const questions = await sql.query(
    `SELECT id, source, source_list, area, test, year, number,
            text, alternatives, answer, images, tags, disciplinas,
            difficulty, context_keys, language, review
     FROM multiple_choice_questions
     ${whereSql}
     ORDER BY id
     LIMIT $${params.length + 1}
     OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  )

  const [{ total }] = await sql.query(
    `SELECT COUNT(*)::int AS total FROM multiple_choice_questions ${whereSql}`,
    params,
  )

  const contexts = await loadContextsMap(sql, extractContextKeys(questions))
  res.json({ questions, contexts, meta: { total, limit, offset } })
}

async function handleRandom(req, res, sql) {
  const rawCount = Number.parseInt(req.query?.count ?? '10', 10)
  const count = ALLOWED_COUNTS.has(rawCount) ? rawCount : 10
  const area = req.query?.area && ALLOWED_AREAS.has(req.query.area) ? req.query.area : null

  const params = []
  let where = ''
  if (area) {
    params.push(area)
    where = 'WHERE area = $1'
  }
  params.push(count)
  const limitPos = `$${params.length}`

  const questions = await sql.query(
    `SELECT id, source, source_list, area, test, year, number,
            text, alternatives, answer, images, tags, disciplinas,
            difficulty, context_keys, language, review
     FROM multiple_choice_questions
     ${where}
     ORDER BY random()
     LIMIT ${limitPos}`,
    params,
  )

  const contexts = await loadContextsMap(sql, extractContextKeys(questions))
  res.json({ questions, contexts })
}

async function handleProva(req, res, sql) {
  const area = req.query?.area
  const year = Number.parseInt(req.query?.year ?? '', 10)

  if (!ALLOWED_AREAS.has(area)) {
    return res.status(400).json({ error: 'area obrigatoria (math|nature|humanas|linguagens)' })
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ error: 'year obrigatorio (inteiro entre 2000 e 2100)' })
  }

  const questions = await sql.query(
    `SELECT id, source, source_list, area, test, year, number,
            text, alternatives, answer, images, tags, disciplinas,
            difficulty, context_keys, language, review
     FROM multiple_choice_questions
     WHERE source = 'enem' AND area = $1 AND year = $2
     ORDER BY number, language NULLS FIRST`,
    [area, year],
  )

  if (!questions.length) {
    return res.status(404).json({ error: 'Prova nao encontrada para essa area+ano' })
  }

  const contexts = await loadContextsMap(sql, extractContextKeys(questions))
  res.json({ questions, contexts })
}

async function handleContexts(req, res, sql) {
  const raw = req.query?.keys
  if (!raw || typeof raw !== 'string') {
    return res.status(400).json({ error: 'keys obrigatorio (comma-separated)' })
  }
  const keys = raw.split(',').map((k) => k.trim()).filter(Boolean)
  if (!keys.length) {
    return res.status(400).json({ error: 'keys nao pode ser vazio' })
  }

  const rows = await sql.query(
    'SELECT key, title, subtitle, text, reference, images FROM contexts WHERE key = ANY($1)',
    [keys],
  )
  const map = {}
  for (const row of rows) map[row.key] = row
  res.json({ contexts: map })
}

export default async function handler(req, res) {
  if (!verifyToken(req)) return res.status(401).json({ error: 'Não autorizado' })
  if (req.method !== 'GET') return res.status(405).end()

  const sql = neon(process.env.DATABASE_URL)
  const { action } = req.query

  try {
    if (action === 'search') return handleSearch(req, res, sql)
    if (action === 'random') return handleRandom(req, res, sql)
    if (action === 'prova') return handleProva(req, res, sql)
    if (action === 'contexts') return handleContexts(req, res, sql)
    return res.status(404).json({ error: 'Rota nao encontrada' })
  } catch (err) {
    console.error(`[questions/${action}] fatal:`, err)
    res.status(500).json({ error: 'Erro interno' })
  }
}
