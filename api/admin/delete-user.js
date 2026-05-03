import { neon } from '@neondatabase/serverless'
import { verifyToken } from '../_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).end()

  const payload = verifyToken(req)
  if (!payload) return res.status(401).json({ error: 'Não autorizado' })
  if (payload.username !== 'admin') return res.status(403).json({ error: 'Acesso negado' })

  const userId = Number(req.query?.userId)
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'userId inválido' })
  }

  const sql = neon(process.env.DATABASE_URL)

  // Safety: never allow deleting the admin account
  const [target] = await sql`SELECT username FROM users WHERE id = ${userId}`
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado' })
  if (target.username === 'admin') return res.status(403).json({ error: 'Não é possível deletar o admin' })

  await sql`DELETE FROM feedback WHERE user_id = ${userId}`
  await sql`DELETE FROM daily_challenge_results WHERE user_id = ${userId}`
  await sql`DELETE FROM test_results WHERE user_id = ${userId}`
  await sql`DELETE FROM users WHERE id = ${userId}`

  return res.status(200).json({ ok: true })
}
