// Local-only POST /api/explanations/freeze handler.
// Pulls explanations from public/explanations.json (local store) and writes
// them into the matching public/<area>_enem_<year>.json question files.
// Not wired up in production (Vercel filesystem is read-only).

import { readFile, writeFile, readdir } from 'node:fs/promises'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyToken } from '../api/_auth.js'
import { explanationKey } from '../src/explanationKey.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = resolve(__dirname, '../public')
const STORE_PATH = join(PUBLIC_DIR, 'explanations.json')

function isQuestionFile(name) {
  return /^(linguagens|humanas|nature|math)_enem_\d{4}\.json$/.test(name)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end()
    return
  }
  const payload = verifyToken(req)
  if (!payload) return res.status(401).json({ error: 'Não autorizado' })
  if (payload.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas admin pode rodar freeze' })
  }

  let store
  try {
    const raw = await readFile(STORE_PATH, 'utf8')
    store = JSON.parse(raw)
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.json({ ok: true, totalUpdated: 0, filesTouched: 0, missing: [] })
    }
    return res.status(500).json({ error: 'Falha ao ler explanations.json' })
  }

  // Agrupa por `${area}_enem_${year}.json`. A chave guardada no Map e a propria
  // chave da explicacao, que ja carrega o idioma — sem ele, linguagens 1-5
  // colava ingles e espanhol na mesma entrada.
  const byFile = new Map()
  for (const [k, text] of Object.entries(store)) {
    const [area, year] = k.split(':')
    const filename = `${area}_enem_${year}.json`
    if (!byFile.has(filename)) byFile.set(filename, new Map())
    byFile.get(filename).set(k, text)
  }

  const files = (await readdir(PUBLIC_DIR)).filter(isQuestionFile)
  let totalUpdated = 0
  let filesTouched = 0
  const missing = []

  for (const [filename, edits] of byFile) {
    if (!files.includes(filename)) {
      for (const k of edits.keys()) missing.push(`${filename}#${k}`)
      continue
    }
    const filepath = join(PUBLIC_DIR, filename)
    const data = JSON.parse(await readFile(filepath, 'utf8'))
    let changed = 0
    for (const q of data) {
      const k = explanationKey(q)
      if (edits.has(k) && q.explanation !== edits.get(k)) {
        q.explanation = edits.get(k)
        changed++
      }
    }
    if (changed > 0) {
      await writeFile(filepath, JSON.stringify(data, null, 2) + '\n', 'utf8')
      filesTouched++
      totalUpdated += changed
    }
  }

  res.json({ ok: true, totalUpdated, filesTouched, missing })
}
