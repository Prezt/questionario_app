import { describe, it, expect } from 'vitest'
import { parseQuestion } from './parse-question-json.js'

describe('parseQuestion', () => {
  it('normalizes an ENEM question with all fields', () => {
    const raw = {
      number: 136,
      text: 'Enunciado.',
      alternatives: { a: 'I', b: 'II', c: 'III', d: 'IV', e: 'V' },
      images: ['figuras/q136_2024_fig1.png'],
      tags: ['estatística', 'geometria plana'],
      year: 2024,
      test: 'ENEM',
      area: 'math',
      answer: 'a',
      difficulty: 4,
      disciplinas: ['matematica'],
    }
    const row = parseQuestion(raw, { source: 'enem', source_list: null })
    expect(row).toEqual({
      source: 'enem',
      source_list: null,
      area: 'math',
      test: 'ENEM',
      year: 2024,
      number: 136,
      text: 'Enunciado.',
      alternatives: { a: 'I', b: 'II', c: 'III', d: 'IV', e: 'V' },
      answer: 'a',
      images: ['figuras/q136_2024_fig1.png'],
      tags: ['estatística', 'geometria plana'],
      disciplinas: ['matematica'],
      difficulty: 4,
      context_keys: [],
      review: false,
    })
  })

  it('preserves contextIds as context_keys array when there is one item', () => {
    const raw = {
      number: 46,
      text: 't',
      alternatives: { a: '1', b: '2', c: '3', d: '4', e: '5' },
      year: 2021, test: 'ENEM', area: 'humanas', answer: 'a',
      contextIds: ['enem_2021_humanas_q46_ctx1'],
    }
    const row = parseQuestion(raw, { source: 'enem', source_list: null })
    expect(row.context_keys).toEqual(['enem_2021_humanas_q46_ctx1'])
  })

  it('preserves all contextIds as context_keys array when there are multiple items', () => {
    const raw = {
      number: 47, text: 't',
      alternatives: { a: '1', b: '2', c: '3', d: '4', e: '5' },
      year: 2021, test: 'ENEM', area: 'humanas', answer: 'b',
      contextIds: ['ctx_A', 'ctx_B', 'ctx_C'],
    }
    const row = parseQuestion(raw, { source: 'enem', source_list: null })
    expect(row.context_keys).toEqual(['ctx_A', 'ctx_B', 'ctx_C'])
  })

  it('defaults context_keys to empty array when contextIds is missing', () => {
    const raw = {
      number: 1, text: 't',
      alternatives: { a: '1', b: '2', c: '3', d: '4', e: '5' },
      year: 2020, test: 'ENEM', area: 'math', answer: 'a',
    }
    const row = parseQuestion(raw, { source: 'enem', source_list: null })
    expect(row.context_keys).toEqual([])
  })

  it('normalizes a teacher-list question with source_list and preserves context_keys', () => {
    const raw = {
      number: 1,
      text: 'Enunciado.',
      alternatives: { a: 'A', b: 'B', c: 'C', d: 'D', e: 'E' },
      images: [],
      tags: ['álgebra'],
      year: 2026,
      test: 'Integrar',
      area: 'math',
      answer: 'a',
      difficulty: 1,
      contextIds: ['enem_2023_math_q150_ctx1'],
      day: 'Matematica e interpretacao - Enem',
      teacher: 'Ricardo',
    }
    const row = parseQuestion(raw, { source: 'teacher_list', source_list: 'ricardo_lista1' })
    expect(row.source).toBe('teacher_list')
    expect(row.source_list).toBe('ricardo_lista1')
    expect(row.test).toBe('Integrar')
    expect(row.context_keys).toEqual(['enem_2023_math_q150_ctx1'])
  })

  it('defaults images/tags/disciplinas to empty arrays when missing', () => {
    const raw = {
      number: 1, text: 't',
      alternatives: { a: '1', b: '2', c: '3', d: '4', e: '5' },
      year: 2020, test: 'ENEM', area: 'math', answer: 'a',
    }
    const row = parseQuestion(raw, { source: 'enem', source_list: null })
    expect(row.images).toEqual([])
    expect(row.tags).toEqual([])
    expect(row.disciplinas).toEqual([])
  })

  it('preserves review=true when present', () => {
    const raw = {
      number: 1, text: 't',
      alternatives: { a: '1', b: '2', c: '3', d: '4', e: '5' },
      year: 2020, test: 'ENEM', area: 'math', answer: 'a',
      review: true,
    }
    const row = parseQuestion(raw, { source: 'enem', source_list: null })
    expect(row.review).toBe(true)
  })

  it('keeps difficulty null when missing', () => {
    const raw = {
      number: 1, text: 't',
      alternatives: { a: '1', b: '2', c: '3', d: '4', e: '5' },
      year: 2020, test: 'ENEM', area: 'math', answer: 'a',
    }
    const row = parseQuestion(raw, { source: 'enem', source_list: null })
    expect(row.difficulty).toBeNull()
  })

  it('returns a fresh context_keys array (no aliasing of raw.contextIds)', () => {
    const raw = {
      number: 1, text: 't',
      alternatives: { a: '1', b: '2', c: '3', d: '4', e: '5' },
      year: 2020, test: 'ENEM', area: 'math', answer: 'a',
      contextIds: ['ctx_A'],
    }
    const row = parseQuestion(raw, { source: 'enem', source_list: null })
    row.context_keys.push('ctx_MUTATION')
    expect(raw.contextIds).toEqual(['ctx_A'])
  })
})
