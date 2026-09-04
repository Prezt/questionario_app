import { describe, it, expect, vi } from 'vitest'
import { parseSearchQuery, extractContextKeys, loadContextsMap } from './_helpers.js'

describe('parseSearchQuery', () => {
  it('returns empty when no filters given', () => {
    const { where, params, limit, offset } = parseSearchQuery({})
    expect(where).toEqual([])
    expect(params).toEqual([])
    expect(limit).toBe(20)
    expect(offset).toBe(0)
  })

  it('accepts area/year/source/language/tag', () => {
    const { where, params } = parseSearchQuery({
      area: 'math', year: '2024', source: 'enem', language: 'ingles', tag: 'álgebra',
    })
    expect(where).toEqual([
      'area = $1',
      'year = $2',
      'source = $3',
      'language = $4',
      'tags @> ARRAY[$5]::TEXT[]',
    ])
    expect(params).toEqual(['math', 2024, 'enem', 'ingles', 'álgebra'])
  })

  it('parses difficulty as a single value', () => {
    const { where, params } = parseSearchQuery({ difficulty: '5' })
    expect(where).toEqual(['difficulty = $1'])
    expect(params).toEqual([5])
  })

  it('parses difficulty as a range', () => {
    const { where, params } = parseSearchQuery({ difficulty: '3-7' })
    expect(where).toEqual(['difficulty >= $1', 'difficulty <= $2'])
    expect(params).toEqual([3, 7])
  })

  it('ignores difficulty with unexpected format', () => {
    const { where, params } = parseSearchQuery({ difficulty: 'abc' })
    expect(where).toEqual([])
    expect(params).toEqual([])
  })

  it('clamps limit to 1..100 and defaults to 20', () => {
    expect(parseSearchQuery({ limit: '500' }).limit).toBe(100)
    expect(parseSearchQuery({ limit: '-5' }).limit).toBe(1)
    expect(parseSearchQuery({ limit: 'bad' }).limit).toBe(20)
    expect(parseSearchQuery({}).limit).toBe(20)
  })

  it('clamps offset to >= 0 and defaults to 0', () => {
    expect(parseSearchQuery({ offset: '-10' }).offset).toBe(0)
    expect(parseSearchQuery({ offset: 'bad' }).offset).toBe(0)
    expect(parseSearchQuery({ offset: '50' }).offset).toBe(50)
  })

  it('renumbers params correctly when many filters combine', () => {
    const { where, params } = parseSearchQuery({
      area: 'humanas', tag: 'sociologia', difficulty: '4-8',
    })
    expect(where).toEqual([
      'area = $1',
      'tags @> ARRAY[$2]::TEXT[]',
      'difficulty >= $3',
      'difficulty <= $4',
    ])
    expect(params).toEqual(['humanas', 'sociologia', 4, 8])
  })
})

describe('extractContextKeys', () => {
  it('returns [] for empty input', () => {
    expect(extractContextKeys([])).toEqual([])
  })

  it('flattens and dedupes context_keys from multiple questions', () => {
    const questions = [
      { context_keys: ['a', 'b'] },
      { context_keys: ['b', 'c'] },
      { context_keys: [] },
      { context_keys: ['a'] },
    ]
    expect(extractContextKeys(questions)).toEqual(['a', 'b', 'c'])
  })

  it('ignores non-array context_keys defensively', () => {
    expect(extractContextKeys([{ context_keys: null }, { context_keys: ['x'] }])).toEqual(['x'])
  })
})

describe('loadContextsMap', () => {
  it('returns {} when keys is empty (no DB call)', async () => {
    const sql = { query: vi.fn() }
    const map = await loadContextsMap(sql, [])
    expect(map).toEqual({})
    expect(sql.query).not.toHaveBeenCalled()
  })

  it('queries contexts by key list and builds a map keyed by key', async () => {
    const sql = {
      query: vi.fn().mockResolvedValue([
        { key: 'a', title: 'A', subtitle: null, text: 'ta', reference: 'ra', images: [] },
        { key: 'b', title: null, subtitle: null, text: 'tb', reference: 'rb', images: ['x.png'] },
      ]),
    }
    const map = await loadContextsMap(sql, ['a', 'b'])
    expect(sql.query).toHaveBeenCalledWith(
      'SELECT key, title, subtitle, text, reference, images FROM contexts WHERE key = ANY($1)',
      [['a', 'b']],
    )
    expect(map).toEqual({
      a: { key: 'a', title: 'A', subtitle: null, text: 'ta', reference: 'ra', images: [] },
      b: { key: 'b', title: null, subtitle: null, text: 'tb', reference: 'rb', images: ['x.png'] },
    })
  })
})
