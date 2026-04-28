import { neon } from '@neondatabase/serverless'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { username, password } = req.body ?? {}
  if (!username || !password) {
    return res.status(400).json({ error: 'Nome de usuário e senha são obrigatórios' })
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' })
  }

  try {
    const sql = neon(process.env.DATABASE_URL)
    const hash = await bcrypt.hash(password, 10)
    const rows = await sql`
      INSERT INTO users (username, password_hash)
      VALUES (${username.toLowerCase().trim()}, ${hash})
      RETURNING id, username
    `
    const user = rows[0]

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    )
    res.status(201).json({ token, user: { id: user.id, username: user.username } })
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Nome de usuário já está em uso' })
    }
    console.error('register error:', err)
    res.status(500).json({ error: 'Erro interno' })
  }
}
