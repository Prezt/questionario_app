import { neon } from '@neondatabase/serverless'
import { verifyToken } from '../_auth.js'

// Returns all published question sets merged into a flat question array
// compatible with the static question JSON format.
// Accessible to any authenticated user.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const payload = verifyToken(req)
  if (!payload) return res.status(401).json({ error: 'Não autorizado' })

  const sql = neon(process.env.DATABASE_URL)

  const sets = await sql`
    SELECT qs.id, qs.name, qs.year, u.username AS teacher
    FROM question_sets qs
    JOIN users u ON u.id = qs.created_by
    ORDER BY qs.created_at ASC
  `
  if (!sets.length) return res.json([])

  const output = []

  for (const set of sets) {
    const questions = await sql`
      SELECT number, stem, images, alternatives, correct, tags, difficulty
      FROM custom_questions WHERE set_id = ${set.id} ORDER BY number
    `

    for (const q of questions) {
      const imgs = q.images ?? []
      const stem = q.stem.replace(/\[Imagem (\d+)\]/g, (_, n) => {
        const img = imgs[Number(n) - 1]
        if (!img) return ''
        return img.caption ? `[Figura: ${img.src} ${img.caption}]` : `[Figura: ${img.src}]`
      })
      const taggedIndexes = new Set(
        [...q.stem.matchAll(/\[Imagem (\d+)\]/g)].map(m => Number(m[1]) - 1)
      )
      const remainingImages = imgs.filter((_, i) => !taggedIndexes.has(i))

      output.push({
        number:       q.number,
        test:         'Integrar',
        year:         set.year ?? null,
        day:          set.name,
        teacher:      set.teacher,
        area:         null,
        tags:         q.tags ?? [],
        difficulty:   q.difficulty ?? 'medium',
        stem,
        images:       remainingImages,
        alternatives: q.alternatives ?? {},
        correct:      q.correct,
      })
    }
  }

  res.json(output)
}
