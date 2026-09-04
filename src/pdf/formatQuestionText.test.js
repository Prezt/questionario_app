import { describe, it, expect } from 'vitest'
import { formatQuestionText } from './formatQuestionText.js'

describe('formatQuestionText', () => {
  it('returns [] for empty/nullish input', () => {
    expect(formatQuestionText('')).toEqual([])
    expect(formatQuestionText(null)).toEqual([])
    expect(formatQuestionText(undefined)).toEqual([])
  })

  it('returns a single text block when there is no marker', () => {
    expect(formatQuestionText('Enunciado simples.')).toEqual([
      { type: 'text', text: 'Enunciado simples.' },
    ])
  })

  it('splits text around a single [Image: path]', () => {
    const parts = formatQuestionText('Antes. [Image: figuras/q1.png] Depois.')
    expect(parts).toEqual([
      { type: 'text', text: 'Antes.' },
      { type: 'image', path: 'figuras/q1.png' },
      { type: 'text', text: 'Depois.' },
    ])
  })

  it('handles [Image: path | caption] by keeping only the path', () => {
    const parts = formatQuestionText('X [Image: figuras/q2.png | <center>Legenda</center>] Y')
    expect(parts[1]).toEqual({ type: 'image', path: 'figuras/q2.png' })
  })

  it('strips [Figura: descricao] markers with no path', () => {
    const parts = formatQuestionText('Início [Figura: Esquema] meio.')
    expect(parts).toEqual([{ type: 'text', text: 'Início  meio.' }])
  })

  it('handles multiple images interleaved with text', () => {
    const parts = formatQuestionText('A [Image: a.png] B [Image: b.png] C')
    expect(parts).toEqual([
      { type: 'text', text: 'A' },
      { type: 'image', path: 'a.png' },
      { type: 'text', text: 'B' },
      { type: 'image', path: 'b.png' },
      { type: 'text', text: 'C' },
    ])
  })

  it('emits an image block when the whole input is just an image marker', () => {
    const parts = formatQuestionText('[Image: only.png]')
    expect(parts).toEqual([{ type: 'image', path: 'only.png' }])
  })

  it('keeps KaTeX delimiters as plain text (renderizacao fica pra iteracao)', () => {
    const parts = formatQuestionText('Cálculo: \\(x^2 + 1\\).')
    expect(parts).toEqual([{ type: 'text', text: 'Cálculo: \\(x^2 + 1\\).' }])
  })
})
