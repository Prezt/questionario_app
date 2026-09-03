import { describe, it, expect } from 'vitest'
import { parseQuestion, annotateLinguagensLanguage } from './parse-question-json.js'

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
      language: null,
      review: false,
    })
  })

  it('preserves language from raw when present', () => {
    const raw = {
      number: 3, text: 't',
      alternatives: { a: '1', b: '2', c: '3', d: '4', e: '5' },
      year: 2024, test: 'ENEM', area: 'linguagens', answer: 'a',
      language: 'espanhol',
    }
    const row = parseQuestion(raw, { source: 'enem', source_list: null })
    expect(row.language).toBe('espanhol')
  })

  it('defaults language to null when raw omits it', () => {
    const raw = {
      number: 1, text: 't',
      alternatives: { a: '1', b: '2', c: '3', d: '4', e: '5' },
      year: 2020, test: 'ENEM', area: 'math', answer: 'a',
    }
    const row = parseQuestion(raw, { source: 'enem', source_list: null })
    expect(row.language).toBeNull()
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

describe('annotateLinguagensLanguage', () => {
  const base = (number, area, tags = []) => ({
    number, text: 't',
    alternatives: { a: '1', b: '2', c: '3', d: '4', e: '5' },
    year: 2024, test: 'ENEM', area, answer: 'a', tags,
  })

  it('leaves non-linguagens questions untouched', () => {
    const input = [base(1, 'math'), base(2, 'humanas')]
    const out = annotateLinguagensLanguage(input)
    expect(out[0].language).toBeUndefined()
    expect(out[1].language).toBeUndefined()
  })

  it('leaves linguagens questions with number > 5 untouched', () => {
    const input = [base(6, 'linguagens'), base(45, 'linguagens')]
    const out = annotateLinguagensLanguage(input)
    expect(out[0].language).toBeUndefined()
    expect(out[1].language).toBeUndefined()
  })

  it('uses tags when they explicitly mark língua inglesa or espanhola', () => {
    const input = [
      base(1, 'linguagens', ['língua espanhola']),
      base(1, 'linguagens', ['língua inglesa']),
    ]
    const out = annotateLinguagensLanguage(input)
    expect(out[0].language).toBe('espanhol')
    expect(out[1].language).toBe('ingles')
  })

  it('falls back to order when tags are silent (first occurrence = ingles)', () => {
    const input = [
      base(1, 'linguagens', ['interpretação de texto']),
      base(1, 'linguagens', ['literatura mundial']),
      base(2, 'linguagens', []),
      base(2, 'linguagens', []),
    ]
    const out = annotateLinguagensLanguage(input)
    expect(out[0].language).toBe('ingles')
    expect(out[1].language).toBe('espanhol')
    expect(out[2].language).toBe('ingles')
    expect(out[3].language).toBe('espanhol')
  })

  it('when one of a pair is tag-detected, the other becomes the opposite', () => {
    const input = [
      base(1, 'linguagens', ['língua espanhola']),
      base(1, 'linguagens', []),
      base(2, 'linguagens', []),
      base(2, 'linguagens', ['língua inglesa']),
    ]
    const out = annotateLinguagensLanguage(input)
    expect(out[0].language).toBe('espanhol')
    expect(out[1].language).toBe('ingles')
    expect(out[2].language).toBe('espanhol')
    expect(out[3].language).toBe('ingles')
  })

  it('leaves language null for singleton linguagens 1-5 questions without tag hint', () => {
    // Should not happen in real data, but be defensive: a lone question that
    // has no matching pair and no tag stays null.
    const input = [base(1, 'linguagens', [])]
    const out = annotateLinguagensLanguage(input)
    expect(out[0].language).toBeNull()
  })

  it('does not mutate the input array or its items', () => {
    const q = base(1, 'linguagens')
    const input = [q]
    const out = annotateLinguagensLanguage(input)
    expect(q.language).toBeUndefined()
    expect(out[0]).not.toBe(q)
  })
})
