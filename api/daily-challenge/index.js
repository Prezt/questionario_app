import { neon } from '@neondatabase/serverless'
import { verifyToken } from '../_auth.js'

// Mulberry32 seeded PRNG
function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function dateToSeed(dateStr) {
  return parseInt(dateStr.replace(/-/g, ''), 10)
}

function seededShuffle(arr, rand) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function selectDailyQuestions(candidates, dateStr) {
  const rand = mulberry32(dateToSeed(dateStr))
  const areas = ['math', 'nature', 'humanas', 'linguagens']
  const selected = []

  for (const area of areas) {
    // Deduplicate language variants — questions with the same number count as one slot
    const seen = new Set()
    const pool = candidates.filter((c) => {
      if (c.area !== area) return false
      const key = `${c.year}:${c.test}:${c.number}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    const shuffled = seededShuffle(pool, rand)
    selected.push(...shuffled.slice(0, 2))
  }

  return selected
}

export default async function handler(req, res) {
  const payload = verifyToken(req)
  if (!payload) return res.status(401).json({ error: 'Não autorizado' })

  const sql = neon(process.env.DATABASE_URL)
  // Use UTC date as the daily key
  const today = new Date().toISOString().split('T')[0]

  if (req.method === 'GET') {
    const [challengeRows, resultRows] = await Promise.all([
      sql`SELECT questions FROM daily_challenges WHERE challenge_date = ${today}`,
      sql`
        SELECT score, total, elapsed_secs, completed_at
        FROM daily_challenge_results
        WHERE user_id = ${payload.userId} AND challenge_date = ${today}
      `,
    ])

    const completed = resultRows.length > 0 ? resultRows[0] : null
    const questions = challengeRows.length > 0 ? challengeRows[0].questions : null

    return res.json({ date: today, questions, completed })
  }

  if (req.method === 'POST') {
    const { candidates } = req.body ?? {}
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return res.status(400).json({ error: 'candidates required' })
    }

    // Insert only if the day has no challenge yet
    const selected = selectDailyQuestions(candidates, today)
    await sql`
      INSERT INTO daily_challenges (challenge_date, questions)
      VALUES (${today}, ${JSON.stringify(selected)})
      ON CONFLICT (challenge_date) DO NOTHING
    `

    // Always return what is actually stored (handles race conditions)
    const [rows, resultRows] = await Promise.all([
      sql`SELECT questions FROM daily_challenges WHERE challenge_date = ${today}`,
      sql`
        SELECT score, total, elapsed_secs, completed_at
        FROM daily_challenge_results
        WHERE user_id = ${payload.userId} AND challenge_date = ${today}
      `,
    ])

    const completed = resultRows.length > 0 ? resultRows[0] : null
    return res.json({ date: today, questions: rows[0].questions, completed })
  }

  res.status(405).end()
}
