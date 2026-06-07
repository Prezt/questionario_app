// Local-only /api/explanations handler. Mirrors the prod DB-backed handler at api/explanations/index.js
// but stores the overrides in public/explanations.json so a Postgres instance isn't required for dev.
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyToken } from '../api/_auth.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STORE_PATH = resolve(__dirname, '../public/explanations.json')

const keyFor = (area, year, test, number) => `${area}:${year}:${test}:${number}`

async function readStore() {
  try {
    const raw = await readFile(STORE_PATH, 'utf8')
    const obj = JSON.parse(raw)
    return obj && typeof obj === 'object' ? obj : {}
  } catch (err) {
    if (err.code === 'ENOENT') return {}
    throw err
  }
}

async function writeStore(obj) {
  await writeFile(STORE_PATH, JSON.stringify(obj, null, 2) + '\n', 'utf8')
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const store = await readStore()
    return res.json(store)
  }

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
    const store = await readStore()
    const k = keyFor(area, year, test, number)
    store[k] = explanation
    await writeStore(store)
    return res.json({ ok: true, key: k, explanation })
  }

  if (req.method === 'DELETE') {
    if (payload.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas admin pode limpar' })
    }
    const { area, year, test, number } = req.query ?? {}
    const store = await readStore()
    if (area && year && test && number) {
      const k = keyFor(area, Number(year), test, Number(number))
      const had = k in store
      delete store[k]
      await writeStore(store)
      return res.json({ ok: true, deleted: had ? 1 : 0 })
    }
    const count = Object.keys(store).length
    await writeStore({})
    return res.json({ ok: true, deleted: count })
  }

  return res.status(405).end()
}
