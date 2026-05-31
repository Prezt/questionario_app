import { neon } from '@neondatabase/serverless'
import { verifyToken } from '../_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const payload = verifyToken(req) // nullable — anonymous feedback allowed
  const { question_number, question_year, question_test, question_area, type, body } = req.body ?? {}

  if (!body?.trim()) {
    return res.status(400).json({ error: 'Mensagem não pode ser vazia' })
  }

  const sql = neon(process.env.DATABASE_URL)
  await sql`
    INSERT INTO feedback (user_id, question_number, question_year, question_test, question_area, type, body)
    VALUES (
      ${payload?.userId ?? null},
      ${question_number ?? null},
      ${question_year ?? null},
      ${question_test ?? null},
      ${question_area ?? null},
      ${type === 'bug' ? 'bug' : 'feedback'},
      ${body.trim()}
    )
  `
  res.status(201).json({ ok: true })
}
