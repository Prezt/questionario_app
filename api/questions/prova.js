// GET /api/questions/prova
// Retorna todas as questoes ENEM de uma prova especifica (area + year), na
// ordem oficial (ORDER BY number, language). Language ordena para que a
// versao ingles apareca antes da espanhol nas questoes 1-5 de linguagens.
//
// Query params (obrigatorios):
//   area: 'math' | 'nature' | 'humanas' | 'linguagens'
//   year: inteiro (ex: 2024)
//
// Resposta: { questions: [...], contexts: { [key]: row } }
// 400 se area ou year invalidos.

import { neon } from '@neondatabase/serverless'
import { verifyToken } from '../_auth.js'
import { extractContextKeys, loadContextsMap } from './_helpers.js'

const ALLOWED_AREAS = new Set(['math', 'nature', 'humanas', 'linguagens'])

export default async function handler(req, res) {
  if (!verifyToken(req)) return res.status(401).json({ error: 'Não autorizado' })
  if (req.method !== 'GET') return res.status(405).end()

  const area = req.query?.area
  const year = Number.parseInt(req.query?.year ?? '', 10)

  if (!ALLOWED_AREAS.has(area)) {
    return res.status(400).json({ error: 'area obrigatoria (math|nature|humanas|linguagens)' })
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ error: 'year obrigatorio (inteiro entre 2000 e 2100)' })
  }

  const sql = neon(process.env.DATABASE_URL)

  try {
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
  } catch (err) {
    console.error('[prova] fatal:', err)
    res.status(500).json({ error: 'Erro interno' })
  }
}
