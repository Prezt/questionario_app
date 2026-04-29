import { neon } from '@neondatabase/serverless'
import { verifyToken } from '../_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const payload = verifyToken(req)
  if (!payload) return res.status(401).json({ error: 'Não autorizado' })
  if (payload.username !== 'admin') return res.status(403).json({ error: 'Acesso negado' })

  const sql = neon(process.env.DATABASE_URL)

  const [users, testResults, dailyResults, feedbackRows] = await Promise.all([
    sql`
      SELECT id, username, created_at
      FROM users
      ORDER BY created_at DESC
    `,
    sql`
      SELECT tr.id, tr.user_id, u.username, tr.test, tr.year, tr.day,
             tr.score, tr.total, tr.elapsed_secs, tr.answered_at
      FROM test_results tr
      JOIN users u ON u.id = tr.user_id
      ORDER BY tr.answered_at DESC
    `,
    sql`
      SELECT dcr.id, dcr.user_id, u.username, dcr.challenge_date,
             dcr.score, dcr.total, dcr.elapsed_secs, dcr.completed_at
      FROM daily_challenge_results dcr
      JOIN users u ON u.id = dcr.user_id
      ORDER BY dcr.completed_at DESC
    `,
    sql`
      SELECT f.id, f.user_id, u.username, f.question_number,
             f.type, f.body, f.created_at
      FROM feedback f
      LEFT JOIN users u ON u.id = f.user_id
      ORDER BY f.created_at DESC
    `,
  ])

  res.json({ users, testResults, dailyResults, feedback: feedbackRows })
}
