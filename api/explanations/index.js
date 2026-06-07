import { neon } from '@neondatabase/serverless'
import { verifyToken } from '../_auth.js'

const key = (area, year, test, number) => `${area}:${year}:${test}:${number}`

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL)

  // GET — public read of all overrides as a flat map
  if (req.method === 'GET') {
    const rows = await sql`
      SELECT area, year, test, number, explanation
      FROM explanations
    `
    const map = {}
    for (const r of rows) {
      map[key(r.area, r.year, r.test, r.number)] = r.explanation
    }
    return res.json(map)
  }

  // Writes require teacher or admin role
  const payload = verifyToken(req)
  if (!payload) return res.status(401).json({ error: 'Não autorizado' })
  if (payload.role !== 'prof' && payload.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas professores e admin podem editar' })
  }

  if (req.method === 'POST') {
    const { area, year, test, number, explanation } = req.body ?? {}
    if (!area || !Number.isInteger(year) || !test || !Number.isInteger(number) || typeof explanation !== 'string') {
      return res.status(400).json({ error: 'Campos inválidos' })
    }
    await sql`
      INSERT INTO explanations (area, year, test, number, explanation, updated_by, updated_at)
      VALUES (${area}, ${year}, ${test}, ${number}, ${explanation}, ${payload.userId}, NOW())
      ON CONFLICT (area, year, test, number)
      DO UPDATE SET explanation = EXCLUDED.explanation,
                    updated_by = EXCLUDED.updated_by,
                    updated_at = NOW()
    `
    return res.json({ ok: true, key: key(area, year, test, number), explanation })
  }

  // DELETE — admin only, optional ?area=&year=&test=&number= for one row, otherwise wipes all
  if (req.method === 'DELETE') {
    if (payload.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas admin pode limpar' })
    }
    const { area, year, test, number } = req.query ?? {}
    if (area && year && test && number) {
      await sql`
        DELETE FROM explanations
        WHERE area = ${area} AND year = ${Number(year)}
          AND test = ${test} AND number = ${Number(number)}
      `
      return res.json({ ok: true, deleted: 1 })
    }
    const rows = await sql`DELETE FROM explanations RETURNING area`
    return res.json({ ok: true, deleted: rows.length })
  }

  res.status(405).end()
}
