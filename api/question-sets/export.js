import { neon } from '@neondatabase/serverless'
import { verifyToken } from '../_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const payload = verifyToken(req)
  if (!payload) return res.status(401).json({ error: 'Não autorizado' })
  if (payload.role !== 'prof' && payload.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado' })
  }

  const sql = neon(process.env.DATABASE_URL)

  const targetUserId =
    payload.role === 'admin' && req.query?.userId
      ? Number(req.query.userId)
      : payload.userId

  const [set] = await sql`SELECT id, name, year FROM question_sets WHERE created_by = ${targetUserId}`
  if (!set) return res.status(404).json({ error: 'Nenhuma lista encontrada' })

  const questions = await sql`
    SELECT number, stem, images, alternatives, correct, tags, difficulty
    FROM custom_questions WHERE set_id = ${set.id} ORDER BY number
  `
  if (!questions.length) return res.status(400).json({ error: 'A lista não tem questões' })

  const output = questions.map((q) => {
    const imgs = q.images ?? []
    // Replace [Imagem N] tags in stem with [Figura: src caption] for the renderer
    const stem = q.stem.replace(/\[Imagem (\d+)\]/g, (_, n) => {
      const img = imgs[Number(n) - 1]
      if (!img) return ''
      return img.caption ? `[Figura: ${img.src} ${img.caption}]` : `[Figura: ${img.src}]`
    })
    // Images without a tag in stem go into the images array (rendered after stem)
    const taggedIndexes = new Set([...q.stem.matchAll(/\[Imagem (\d+)\]/g)].map(m => Number(m[1]) - 1))
    const remainingImages = imgs.filter((_, i) => !taggedIndexes.has(i))

    return {
      number:       q.number,
      test:         'Integrar',
      year:         set.year ?? null,
      day:          set.name,
      area:         null,
      tags:         q.tags ?? [],
      difficulty:   q.difficulty ?? 'medium',
      stem,
      images:       remainingImages,
      alternatives: q.alternatives ?? {},
      correct:      q.correct,
    }
  })

  const slug = set.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
  const filename = `integrar_${slug}.json`

  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(JSON.stringify(output, null, 2))
}
