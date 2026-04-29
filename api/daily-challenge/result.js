import { neon } from '@neondatabase/serverless'
import { verifyToken } from '../_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const payload = verifyToken(req)
  if (!payload) return res.status(401).json({ error: 'Não autorizado' })

  const sql = neon(process.env.DATABASE_URL)
  const today = new Date().toISOString().split('T')[0]

  const { score, total, elapsed_secs, answers } = req.body ?? {}

  await sql`
    INSERT INTO daily_challenge_results (user_id, challenge_date, score, total, elapsed_secs, answers)
    VALUES (${payload.userId}, ${today}, ${score}, ${total}, ${elapsed_secs}, ${JSON.stringify(answers ?? {})})
    ON CONFLICT (user_id, challenge_date) DO NOTHING
  `

  return res.status(201).json({ ok: true })
}
