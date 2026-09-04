// GET /api/contexts?keys=key1,key2,key3
// Retorna um mapa { [key]: row } para as keys pedidas. Aceita 1 ou N keys.
// keys ausentes na tabela sao omitidas silenciosamente (nao dao erro).
//
// Motivo: complementa o mapa embutido em /api/questions/* — o front pode
// precisar rebuscar um contexto individualmente (ex: expandir depois de fechar,
// cache invalidado, etc) ou lote (ex: um dashboard mostrando contextos avulsos).

import { neon } from '@neondatabase/serverless'
import { verifyToken } from './_auth.js'

export default async function handler(req, res) {
  if (!verifyToken(req)) return res.status(401).json({ error: 'Não autorizado' })
  if (req.method !== 'GET') return res.status(405).end()

  const raw = req.query?.keys
  if (!raw || typeof raw !== 'string') {
    return res.status(400).json({ error: 'keys obrigatorio (comma-separated)' })
  }

  const keys = raw.split(',').map((k) => k.trim()).filter(Boolean)
  if (!keys.length) {
    return res.status(400).json({ error: 'keys nao pode ser vazio' })
  }

  const sql = neon(process.env.DATABASE_URL)

  try {
    const rows = await sql.query(
      'SELECT key, title, subtitle, text, reference, images FROM contexts WHERE key = ANY($1)',
      [keys],
    )
    const map = {}
    for (const row of rows) map[row.key] = row
    res.json({ contexts: map })
  } catch (err) {
    console.error('[contexts] fatal:', err)
    res.status(500).json({ error: 'Erro interno' })
  }
}
