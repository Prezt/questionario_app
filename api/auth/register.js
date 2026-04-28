import { neon } from '@neondatabase/serverless'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { email, password } = req.body ?? {}
  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' })
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' })
  }

  try {
    const sql = neon(process.env.DATABASE_URL)
    const hash = await bcrypt.hash(password, 10)
    const rows = await sql`
      INSERT INTO users (email, password_hash)
      VALUES (${email.toLowerCase().trim()}, ${hash})
      RETURNING id, email
    `
    const user = rows[0]

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    )
    res.status(201).json({ token, user: { id: user.id, email: user.email } })
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email já cadastrado' })
    }
    console.error('register error:', err)
    res.status(500).json({ error: 'Erro interno' })
  }
}
