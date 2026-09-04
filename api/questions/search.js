// GET /api/questions/search
// Busca paginada em multiple_choice_questions, com contextos referenciados
// embutidos como mapa top-level `contexts: { key: {...} }`.
//
// Query params (todos opcionais, exceto quando indicado):
//   area:       'math' | 'nature' | 'humanas' | 'linguagens'
//   year:       inteiro (ex: 2024)
//   source:     'enem' | 'teacher_list'
//   tag:        casa via GIN em tags[] (uma tag por vez)
//   difficulty: 'N' ou 'N-M' (range inclusivo)
//   language:   'ingles' | 'espanhol'  (linguagens 1-5)
//   limit:      1..100 (default 20)
//   offset:     >= 0  (default 0)
//
// Resposta: { questions: [...], contexts: { [key]: row }, meta: { total, limit, offset } }

import { neon } from '@neondatabase/serverless'
import { verifyToken } from '../_auth.js'
import { parseSearchQuery, extractContextKeys, loadContextsMap } from './_helpers.js'

export default async function handler(req, res) {
  if (!verifyToken(req)) return res.status(401).json({ error: 'Não autorizado' })
  if (req.method !== 'GET') return res.status(405).end()

  const { where, params, limit, offset } = parseSearchQuery(req.query ?? {})
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const sql = neon(process.env.DATABASE_URL)

  try {
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
  } catch (err) {
    console.error('[search] fatal:', err)
    res.status(500).json({ error: 'Erro interno' })
  }
}
