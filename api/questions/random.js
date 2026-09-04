// GET /api/questions/random
// Sorteia N questoes com filtros mais restritos que /search (conforme decisao
// da v3.0.0: sorteio eh o "estudar agora" — poucos parametros pra baixa friccao).
//
// Query params:
//   count: 5 | 10 | 20  (default 10)
//   area:  'math' | 'nature' | 'humanas' | 'linguagens'  (opcional, default = todas)
//
// Resposta: { questions: [...], contexts: { [key]: row } }

import { neon } from '@neondatabase/serverless'
import { verifyToken } from '../_auth.js'
import { extractContextKeys, loadContextsMap } from './_helpers.js'

const ALLOWED_COUNTS = new Set([5, 10, 20])
const ALLOWED_AREAS = new Set(['math', 'nature', 'humanas', 'linguagens'])

export default async function handler(req, res) {
  if (!verifyToken(req)) return res.status(401).json({ error: 'Não autorizado' })
  if (req.method !== 'GET') return res.status(405).end()

  const rawCount = Number.parseInt(req.query?.count ?? '10', 10)
  const count = ALLOWED_COUNTS.has(rawCount) ? rawCount : 10
  const area = req.query?.area && ALLOWED_AREAS.has(req.query.area) ? req.query.area : null

  const sql = neon(process.env.DATABASE_URL)

  try {
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
  } catch (err) {
    console.error('[random] fatal:', err)
    res.status(500).json({ error: 'Erro interno' })
  }
}
