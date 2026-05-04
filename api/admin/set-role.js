import { neon } from '@neondatabase/serverless'
import { verifyToken } from '../_auth.js'

const ALLOWED_ROLES = ['user', 'prof']

export default async function handler(req, res) {
  if (req.method !== 'PATCH') return res.status(405).end()

  const payload = verifyToken(req)
  if (!payload) return res.status(401).json({ error: 'Não autorizado' })
  if (payload.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' })

  const userId = Number(req.body?.userId)
  const role = req.body?.role

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'userId inválido' })
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ error: `Papel inválido. Valores permitidos: ${ALLOWED_ROLES.join(', ')}` })
  }

  const sql = neon(process.env.DATABASE_URL)

  const [target] = await sql`SELECT username, role FROM users WHERE id = ${userId}`
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado' })
  if (target.role === 'admin') return res.status(403).json({ error: 'Não é possível alterar o papel do admin' })

  await sql`UPDATE users SET role = ${role} WHERE id = ${userId}`

  return res.status(200).json({ ok: true, userId, role })
}
