import { neon } from '@neondatabase/serverless'
import { verifyToken } from '../_auth.js'

export default async function handler(req, res) {
  const payload = verifyToken(req)
  if (!payload) return res.status(401).json({ error: 'Não autorizado' })
  if (payload.role !== 'prof' && payload.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado' })
  }

  const sql = neon(process.env.DATABASE_URL)

  // GET — return this prof's current draft set (with questions)
  if (req.method === 'GET') {
    const [set] = await sql`
      SELECT id, name, year, created_at FROM question_sets WHERE created_by = ${payload.userId}
    `
    if (!set) return res.json(null)

    const questions = await sql`
      SELECT id, number, stem, images, alternatives, correct, tags, difficulty
      FROM custom_questions WHERE set_id = ${set.id} ORDER BY number
    `
    return res.json({ ...set, questions })
  }

  // POST — create new set, wiping existing questions
  if (req.method === 'POST') {
    const { name, year } = req.body ?? {}
    if (!name?.trim()) return res.status(400).json({ error: 'Nome da lista é obrigatório' })
    const yearVal = year ? Number(year) : null

    const [existing] = await sql`SELECT id FROM question_sets WHERE created_by = ${payload.userId}`

    let setId
    if (existing) {
      await sql`UPDATE question_sets SET name = ${name.trim()}, year = ${yearVal}, created_at = NOW() WHERE id = ${existing.id}`
      await sql`DELETE FROM custom_questions WHERE set_id = ${existing.id}`
      setId = existing.id
    } else {
      const [row] = await sql`
        INSERT INTO question_sets (name, year, created_by) VALUES (${name.trim()}, ${yearVal}, ${payload.userId}) RETURNING id
      `
      setId = row.id
    }

    return res.status(200).json({ id: setId, name: name.trim(), year: yearVal })
  }

  // PATCH — rename/update only, keep questions intact
  if (req.method === 'PATCH') {
    const { name, year } = req.body ?? {}
    if (!name?.trim()) return res.status(400).json({ error: 'Nome da lista é obrigatório' })
    const yearVal = year !== undefined ? (year ? Number(year) : null) : undefined

    const [existing] = await sql`SELECT id FROM question_sets WHERE created_by = ${payload.userId}`
    if (!existing) return res.status(404).json({ error: 'Nenhuma lista encontrada' })

    if (yearVal !== undefined) {
      await sql`UPDATE question_sets SET name = ${name.trim()}, year = ${yearVal} WHERE id = ${existing.id}`
    } else {
      await sql`UPDATE question_sets SET name = ${name.trim()} WHERE id = ${existing.id}`
    }
    return res.status(200).json({ id: existing.id, name: name.trim(), year: yearVal ?? existing.year })
  }

  return res.status(405).end()
}
