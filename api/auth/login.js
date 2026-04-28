import { neon } from '@neondatabase/serverless'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { email, password } = req.body ?? {}
  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' })
  }

  try {
    const sql = neon(process.env.DATABASE_URL)
    const rows = await sql`
      SELECT id, email, password_hash FROM users
      WHERE email = ${email.toLowerCase().trim()}
    `
    const user = rows[0]

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Credenciais inválidas' })
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    )
    res.json({ token, user: { id: user.id, email: user.email } })
  } catch (err) {
    console.error('login error:', err)
    res.status(500).json({ error: 'Erro interno' })
  }
}
