import { neon } from '@neondatabase/serverless'
import { verifyToken } from '../_auth.js'

const ALLOWED_ROLES = ['user', 'prof']

async function handleStats(req, res, sql) {
  if (req.method !== 'GET') return res.status(405).end()

  const [users, testResults, dailyResults, feedbackRows] = await Promise.all([
    sql`
      SELECT id, username, role, created_at
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

async function handleDeleteUser(req, res, sql) {
  if (req.method !== 'DELETE') return res.status(405).end()

  const userId = Number(req.query?.userId)
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'userId inválido' })
  }

  const [target] = await sql`SELECT username, role FROM users WHERE id = ${userId}`
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado' })
  if (target.role === 'admin') return res.status(403).json({ error: 'Não é possível deletar o admin' })

  await sql`DELETE FROM feedback WHERE user_id = ${userId}`
  await sql`DELETE FROM daily_challenge_results WHERE user_id = ${userId}`
  await sql`DELETE FROM test_results WHERE user_id = ${userId}`
  await sql`DELETE FROM users WHERE id = ${userId}`

  return res.status(200).json({ ok: true })
}

async function handleSetRole(req, res, sql) {
  if (req.method !== 'PATCH') return res.status(405).end()

  const userId = Number(req.body?.userId)
  const role = req.body?.role

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'userId inválido' })
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ error: `Papel inválido. Valores permitidos: ${ALLOWED_ROLES.join(', ')}` })
  }

  const [target] = await sql`SELECT username, role FROM users WHERE id = ${userId}`
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado' })
  if (target.role === 'admin') return res.status(403).json({ error: 'Não é possível alterar o papel do admin' })

  await sql`UPDATE users SET role = ${role} WHERE id = ${userId}`

  return res.status(200).json({ ok: true, userId, role })
}

export default async function handler(req, res) {
  const payload = verifyToken(req)
  if (!payload) return res.status(401).json({ error: 'Não autorizado' })
  if (payload.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' })

  const sql = neon(process.env.DATABASE_URL)
  const { action } = req.query

  if (action === 'stats') return handleStats(req, res, sql)
  if (action === 'delete-user') return handleDeleteUser(req, res, sql)
  if (action === 'set-role') return handleSetRole(req, res, sql)

  return res.status(404).json({ error: 'Rota não encontrada' })
}
