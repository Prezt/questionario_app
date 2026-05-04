import { neon } from '@neondatabase/serverless'
import { verifyToken } from '../_auth.js'

export default async function handler(req, res) {
  const payload = verifyToken(req)
  if (!payload) return res.status(401).json({ error: 'Não autorizado' })
  if (payload.role !== 'prof' && payload.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado' })
  }

  const sql = neon(process.env.DATABASE_URL)

  const [set] = await sql`SELECT id FROM question_sets WHERE created_by = ${payload.userId}`
  if (!set) return res.status(404).json({ error: 'Nenhuma lista encontrada. Crie uma lista primeiro.' })

  // POST — add a question
  if (req.method === 'POST') {
    const { stem = '', images = [], alternatives = {}, correct = 'a', tags = [], difficulty = 'medium' } = req.body ?? {}

    const [{ max }] = await sql`SELECT COALESCE(MAX(number), 0) AS max FROM custom_questions WHERE set_id = ${set.id}`
    const number = max + 1

    const [q] = await sql`
      INSERT INTO custom_questions (set_id, number, stem, images, alternatives, correct, tags, difficulty)
      VALUES (${set.id}, ${number}, ${stem}, ${JSON.stringify(images)}, ${JSON.stringify(alternatives)}, ${correct}, ${JSON.stringify(tags)}, ${difficulty})
      RETURNING id, number, stem, images, alternatives, correct, tags, difficulty
    `
    return res.status(201).json(q)
  }

  // PUT — update a question
  if (req.method === 'PUT') {
    const questionId = Number(req.query?.questionId)
    if (!Number.isInteger(questionId)) return res.status(400).json({ error: 'questionId inválido' })

    const { stem, images, alternatives, correct, tags, difficulty } = req.body ?? {}

    const [q] = await sql`
      UPDATE custom_questions
      SET stem         = COALESCE(${stem ?? null}, stem),
          images       = COALESCE(${images != null ? JSON.stringify(images) : null}::jsonb, images),
          alternatives = COALESCE(${alternatives != null ? JSON.stringify(alternatives) : null}::jsonb, alternatives),
          correct      = COALESCE(${correct ?? null}, correct),
          tags         = COALESCE(${tags != null ? JSON.stringify(tags) : null}::jsonb, tags),
          difficulty   = COALESCE(${difficulty ?? null}, difficulty)
      WHERE id = ${questionId} AND set_id = ${set.id}
      RETURNING id, number, stem, images, alternatives, correct, tags, difficulty
    `
    if (!q) return res.status(404).json({ error: 'Questão não encontrada' })
    return res.json(q)
  }

  // DELETE — remove a question and renumber
  if (req.method === 'DELETE') {
    const questionId = Number(req.query?.questionId)
    if (!Number.isInteger(questionId)) return res.status(400).json({ error: 'questionId inválido' })

    const [deleted] = await sql`
      DELETE FROM custom_questions WHERE id = ${questionId} AND set_id = ${set.id} RETURNING number
    `
    if (!deleted) return res.status(404).json({ error: 'Questão não encontrada' })

    await sql`
      UPDATE custom_questions SET number = number - 1
      WHERE set_id = ${set.id} AND number > ${deleted.number}
    `
    return res.json({ ok: true })
  }

  return res.status(405).end()
}
