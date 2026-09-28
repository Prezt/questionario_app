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

  describe('tabelas markdown', () => {
    it('extrai a tabela como bloco proprio, entre os textos', () => {
      const raw = [
        'Observe a tabela:',
        '|Loja | Raio (cm) | Preço|',
        '|I | 5 | 60|',
        '|II | 10 | 70|',
        'Qual a melhor opção?',
      ].join('\n')
      const parts = formatQuestionText(raw)
      expect(parts.map((p) => p.type)).toEqual(['text', 'table', 'text'])
      expect(parts[0].text).toBe('Observe a tabela:')
      expect(parts[2].text).toBe('Qual a melhor opção?')
      expect(parts[1].grid.header.map((c) => c.text)).toEqual(['Loja', 'Raio (cm)', 'Preço'])
      expect(parts[1].grid.rows).toHaveLength(2)
      expect(parts[1].grid.columnCount).toBe(3)
    })

    it('descarta a linha separadora |-|-|', () => {
      const raw = ['|Ano|Valor|', '|-|-|', '|1995|5,2|'].join('\n')
      const [table] = formatQuestionText(raw)
      expect(table.type).toBe('table')
      expect(table.grid.rows).toHaveLength(1)
      expect(table.grid.rows[0].map((c) => c.text)).toEqual(['1995', '5,2'])
    })

    it('preserva colspan das celulas marcadas com >', () => {
      const raw = ['|Total|>|', '|a|b|'].join('\n')
      const [table] = formatQuestionText(raw)
      expect(table.grid.header).toEqual([{ text: 'Total', colspan: 2 }])
      expect(table.grid.columnCount).toBe(2)
    })

    it('convive com imagem no mesmo enunciado', () => {
      const raw = ['Texto. [Image: figuras/a.png]', '|H1|H2|', '|v1|v2|'].join('\n')
      const parts = formatQuestionText(raw)
      expect(parts.map((p) => p.type)).toEqual(['text', 'image', 'table'])
    })

    it('nao confunde pipe no meio da linha com tabela', () => {
      const parts = formatQuestionText('Use a notação p | q para divisibilidade.')
      expect(parts).toEqual([{ type: 'text', text: 'Use a notação p | q para divisibilidade.' }])
    })
  })
})
