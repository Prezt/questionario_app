import { neon } from '@neondatabase/serverless'
import { verifyToken } from '../_auth.js'

export default async function handler(req, res) {
  const payload = verifyToken(req)
  if (!payload) return res.status(401).json({ error: 'Não autorizado' })

  const sql = neon(process.env.DATABASE_URL)

  if (req.method === 'POST') {
    const { test, year, day, score, total, elapsed_secs } = req.body ?? {}
    await sql`
      INSERT INTO test_results (user_id, test, year, day, score, total, elapsed_secs)
      VALUES (
        ${payload.userId}, ${test}, ${year}, ${day},
        ${score}, ${total}, ${elapsed_secs}
      )
    `

    // Retention: keep top score per (test, year) + 20 most recent per user
    await sql`
      DELETE FROM test_results
      WHERE user_id = ${payload.userId}
        AND id NOT IN (
          SELECT DISTINCT ON (test, year) id
          FROM test_results
          WHERE user_id = ${payload.userId}
          ORDER BY test, year, score DESC
        )
        AND id NOT IN (
          SELECT id
          FROM test_results
          WHERE user_id = ${payload.userId}
          ORDER BY answered_at DESC
          LIMIT 20
        )
    `

    return res.status(201).json({ ok: true })
  }

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT id, test, year, day, score, total, elapsed_secs, answered_at
      FROM test_results
      WHERE user_id = ${payload.userId}
      ORDER BY answered_at DESC
    `
    return res.json(rows)
  }

  res.status(405).end()
}
