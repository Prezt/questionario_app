import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseQuestion } from './parse-question-json.js'

describe('parseQuestion', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

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
      context_key: null,
      review: false,
    })
  })

  it('takes first contextIds element into context_key when array has 1 item', () => {
    const raw = {
      number: 46,
      text: 't',
      alternatives: { a: '1', b: '2', c: '3', d: '4', e: '5' },
      year: 2021, test: 'ENEM', area: 'humanas', answer: 'a',
      contextIds: ['enem_2021_humanas_q46_ctx1'],
    }
    const row = parseQuestion(raw, { source: 'enem', source_list: null })
    expect(row.context_key).toBe('enem_2021_humanas_q46_ctx1')
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('warns and keeps first when contextIds has multiple items', () => {
    const raw = {
      number: 47, text: 't',
      alternatives: { a: '1', b: '2', c: '3', d: '4', e: '5' },
      year: 2021, test: 'ENEM', area: 'humanas', answer: 'b',
      contextIds: ['ctx_A', 'ctx_B'],
    }
    const row = parseQuestion(raw, { source: 'enem', source_list: null })
    expect(row.context_key).toBe('ctx_A')
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('multiple contextIds')
    )
  })

  it('normalizes a teacher-list question with source_list', () => {
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
    expect(row.context_key).toBe('enem_2023_math_q150_ctx1')
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
})
