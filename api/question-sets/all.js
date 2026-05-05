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

  try {
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
        const rawStem = q.stem ?? ''

        // Walk the stem in marker order, collecting which image indices are tagged
        const taggedIndices = []
        const text = rawStem.replace(/\[Imagem (\d+)\]/g, (match, n) => {
          const idx = Number(n) - 1
          if (!imgs[idx]) return ''   // image doesn't exist — remove marker
          taggedIndices.push(idx)
          return match               // keep [Imagem N] as-is for parseStemSegments
        })

        // Build images array: tagged images in text order first, then untagged
        const taggedSet = new Set(taggedIndices)
        const orderedImages = [
          ...taggedIndices.map(i => imgs[i]),
          ...imgs.filter((_, i) => !taggedSet.has(i)),
        ]
        // Each element is { src, caption } — parseStemSegments handles objects natively

        output.push({
          number:       q.number,
          test:         'Integrar',
          year:         set.year ?? null,
          day:          set.name,
          teacher:      set.teacher,
          area:         null,
          tags:         q.tags ?? [],
          difficulty:   q.difficulty ?? 'medium',
          text,
          images:       orderedImages,
          alternatives: q.alternatives ?? {},
          answer:       q.correct,
        })
      }
    }

    res.json(output)
  } catch (err) {
    console.error('[all.js]', err)
    res.status(500).json({ error: String(err) })
  }
}
