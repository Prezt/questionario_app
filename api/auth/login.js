import { neon } from '@neondatabase/serverless'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { username, password } = req.body ?? {}
  if (!username || !password) {
    return res.status(400).json({ error: 'Nome de usuário e senha são obrigatórios' })
  }

  try {
    const sql = neon(process.env.DATABASE_URL)
    const rows = await sql`
      SELECT id, username, password_hash FROM users
      WHERE username = ${username.toLowerCase().trim()}
    `
    const user = rows[0]

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Credenciais inválidas' })
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    )
    res.json({ token, user: { id: user.id, username: user.username } })
  } catch (err) {
    console.error('login error:', err)
    res.status(500).json({ error: 'Erro interno' })
  }
}
