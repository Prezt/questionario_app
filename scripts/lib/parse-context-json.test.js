import { describe, it, expect } from 'vitest'
import { parseContext } from './parse-context-json.js'

describe('parseContext', () => {
  it('normalizes a full context with all fields', () => {
    const raw = {
      title: 'De próprio punho',
      subtitle: 'A escrita e suas tecnologias',
      text: 'Estranhei muito na primeira vez...',
      reference: 'Fulano de tal. Livro X, 2020.',
      images: ['figuras/ctx_2025_lang_q6_img1.png'],
    }
    const row = parseContext('enem_2025_linguagens_q6_q10_ctx1', raw)
    expect(row).toEqual({
      key: 'enem_2025_linguagens_q6_q10_ctx1',
      title: 'De próprio punho',
      subtitle: 'A escrita e suas tecnologias',
      text: 'Estranhei muito na primeira vez...',
      reference: 'Fulano de tal. Livro X, 2020.',
      images: ['figuras/ctx_2025_lang_q6_img1.png'],
    })
  })

  it('defaults title/subtitle to null when missing', () => {
    const raw = {
      text: 'Passagem sem titulo.',
      reference: 'ref',
    }
    const row = parseContext('ctx_x', raw)
    expect(row.title).toBeNull()
    expect(row.subtitle).toBeNull()
  })

  it('defaults images to empty array when missing', () => {
    const raw = {
      text: 't', reference: 'r',
    }
    const row = parseContext('ctx_x', raw)
    expect(row.images).toEqual([])
  })

  it('preserves subtitle when title is missing (they are independent)', () => {
    const raw = {
      subtitle: 'apenas subtitulo',
      text: 't', reference: 'r',
    }
    const row = parseContext('ctx_x', raw)
    expect(row.title).toBeNull()
    expect(row.subtitle).toBe('apenas subtitulo')
  })

  it('returns a fresh images array (no aliasing of raw.images)', () => {
    const raw = {
      text: 't', reference: 'r',
      images: ['img_a.png'],
    }
    const row = parseContext('ctx_x', raw)
    row.images.push('mutation.png')
    expect(raw.images).toEqual(['img_a.png'])
  })

  it('preserves null text and reference (image-only contexts)', () => {
    const raw = {
      title: null,
      subtitle: null,
      text: '',
      reference: null,
      images: ['figuras/q099_2020_fig1.png'],
    }
    const row = parseContext('enem_2020_nature_q99_ctx1', raw)
    expect(row.text).toBe('')
    expect(row.reference).toBeNull()
    expect(row.images).toEqual(['figuras/q099_2020_fig1.png'])
  })
})
