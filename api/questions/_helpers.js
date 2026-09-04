// Helpers puros usados pelos endpoints de leitura em api/questions/*.js.
// Nao sao expostos como endpoint (prefixo `_`).

/**
 * Extrai e valida filtros da query string do /search.
 * Retorna { where, params, limit, offset } prontos para composicao SQL.
 *
 * Filtros aceitos:
 * - area:       'math' | 'nature' | 'humanas' | 'linguagens'
 * - year:       inteiro (ex: 2024)
 * - tag:        string unica; casa via `tags @> ARRAY[tag]` (GIN)
 * - difficulty: 'N' ou 'N-M' (range inclusivo)
 * - language:   'ingles' | 'espanhol'
 * - source:     'enem' | 'teacher_list'
 *
 * Pagina via limit/offset (defaults: 20, 0; limit clamp em 100).
 */
export function parseSearchQuery(query) {
  const where = []
  const params = []
  let i = 1
  const push = (sql, value) => {
    where.push(sql.replace('?', `$${i++}`))
    params.push(value)
  }

  if (query.area) push('area = ?', String(query.area))
  if (query.year) push('year = ?', Number.parseInt(query.year, 10))
  if (query.source) push('source = ?', String(query.source))
  if (query.language) push('language = ?', String(query.language))
  if (query.tag) push('tags @> ARRAY[?]::TEXT[]', String(query.tag))

  if (query.difficulty) {
    const raw = String(query.difficulty)
    const rangeMatch = raw.match(/^(\d+)-(\d+)$/)
    if (rangeMatch) {
      push('difficulty >= ?', Number.parseInt(rangeMatch[1], 10))
      push('difficulty <= ?', Number.parseInt(rangeMatch[2], 10))
    } else if (/^\d+$/.test(raw)) {
      push('difficulty = ?', Number.parseInt(raw, 10))
    }
  }

  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit ?? '20', 10) || 20))
  const offset = Math.max(0, Number.parseInt(query.offset ?? '0', 10) || 0)

  return { where, params, limit, offset }
}

/**
 * Extrai as chaves distintas de contexto de uma lista de questoes.
 * Retorna Array<string>, deduplicado, na ordem de primeira ocorrencia.
 */
export function extractContextKeys(questions) {
  const seen = new Set()
  for (const q of questions) {
    if (!Array.isArray(q.context_keys)) continue
    for (const key of q.context_keys) seen.add(key)
  }
  return [...seen]
}

/**
 * Consulta a tabela contexts para uma lista de keys e monta um mapa
 * { [key]: row } pronto pra ser embutido na resposta.
 * Retorna {} quando keys eh vazio (sem query desnecessaria).
 */
export async function loadContextsMap(sql, keys) {
  if (!keys.length) return {}
  const rows = await sql.query(
    'SELECT key, title, subtitle, text, reference, images FROM contexts WHERE key = ANY($1)',
    [keys]
  )
  const map = {}
  for (const row of rows) map[row.key] = row
  return map
}
