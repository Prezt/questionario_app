import { describe, it, expect } from 'vitest'
import { alternativesAreImages, splitQuestionImages, alternativeLetters } from './alternativeImages.js'

const alts = (...values) => Object.fromEntries(values.map((v, i) => [String.fromCharCode(97 + i), v]))
const imgs = (n, prefix = 'figuras/fig') => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}.png`)

describe('alternativeLetters', () => {
  it('devolve as letras em ordem alfabetica', () => {
    expect(alternativeLetters({ alternatives: { c: '', a: '', b: '' } })).toEqual(['a', 'b', 'c'])
  })

  it('tolera questao sem alternativas', () => {
    expect(alternativeLetters(null)).toEqual([])
    expect(alternativeLetters({})).toEqual([])
  })
})

describe('alternativesAreImages', () => {
  // Grupo 1 dos dados: 19 questoes com alternativas vazias (ex: q126/2018).
  it('reconhece alternativas vazias', () => {
    expect(alternativesAreImages({ alternatives: alts('', '', '', '', ''), images: imgs(5) })).toBe(true)
  })

  // Grupo 2: 15 questoes so com descritor entre colchetes (ex: q139/2019).
  it('reconhece alternativas que so tem descritor entre colchetes', () => {
    const q = {
      alternatives: alts('[Gráfico - opção A]', '[Gráfico - opção B]', '[Gráfico - opção C]', '[Gráfico - opção D]', '[Gráfico - opção E]'),
      images: imgs(5),
    }
    expect(alternativesAreImages(q)).toBe(true)
  })

  // Grupo 3: 10 questoes em que o texto e so a letra (ex: q175/2020).
  it('reconhece alternativas cujo texto e apenas a letra', () => {
    expect(alternativesAreImages({ alternatives: alts('A', 'B', 'C', 'D', 'E'), images: imgs(6) })).toBe(true)
  })

  // q127/2024: letras fora de ordem, ainda e alternativa-imagem.
  it('reconhece letras fora de ordem', () => {
    expect(alternativesAreImages({ alternatives: alts('D', 'A', 'B', 'E', 'C'), images: imgs(6) })).toBe(true)
  })

  // Grupo 4: a unica excecao real, q168/2024 — 5 graficos de enunciado + 5 frases.
  it('NAO trata frases de verdade como alternativa-imagem', () => {
    const q = {
      alternatives: alts(
        'A amplitude da oscilação no asfalto é igual à amplitude na estrada de chão.',
        'O gráfico mostra uma amplitude constante em todas as superfícies.',
        'As amplitudes das ondas oscilatórias são maiores na estrada de chão.',
        'A frequência da oscilação independe da superfície.',
        'O período de oscilação é maior no asfalto.',
      ),
      images: imgs(5),
    }
    expect(alternativesAreImages(q)).toBe(false)
  })

  it('exige que a contagem de imagens bata com a de alternativas', () => {
    expect(alternativesAreImages({ alternatives: alts('', '', '', '', ''), images: imgs(3) })).toBe(false)
    expect(alternativesAreImages({ alternatives: alts('', '', '', '', ''), images: imgs(7) })).toBe(false)
  })

  it('e falso sem imagem ou sem alternativa', () => {
    expect(alternativesAreImages({ alternatives: alts('', ''), images: [] })).toBe(false)
    expect(alternativesAreImages({ alternatives: {}, images: imgs(2) })).toBe(false)
    expect(alternativesAreImages(null)).toBe(false)
  })
})

describe('splitQuestionImages', () => {
  it('sem alternativa-imagem, tudo pertence ao enunciado', () => {
    const q = { alternatives: alts('texto a', 'texto b'), images: imgs(3) }
    const { stemImages, altImages } = splitQuestionImages(q)
    expect(stemImages.map((i) => i.src)).toEqual(['figuras/fig1.png', 'figuras/fig2.png', 'figuras/fig3.png'])
    expect(altImages).toEqual({})
  })

  it('imgs == alts: nenhuma figura de enunciado', () => {
    const q = { alternatives: alts('', '', '', '', ''), images: imgs(5) }
    const { stemImages, altImages } = splitQuestionImages(q)
    expect(stemImages).toEqual([])
    expect(altImages.a.src).toBe('figuras/fig1.png')
    expect(altImages.e.src).toBe('figuras/fig5.png')
  })

  it('imgs == alts + 1: a primeira e do enunciado', () => {
    const q = { alternatives: alts('', '', '', '', ''), images: imgs(6) }
    const { stemImages, altImages } = splitQuestionImages(q)
    expect(stemImages.map((i) => i.src)).toEqual(['figuras/fig1.png'])
    expect(altImages.a.src).toBe('figuras/fig2.png')
    expect(altImages.e.src).toBe('figuras/fig6.png')
  })

  it('usa o descritor entre colchetes como legenda da alternativa', () => {
    const q = {
      alternatives: alts('[Gráfico - opção A]', '[Gráfico - opção B]'),
      images: imgs(2),
    }
    const { altImages } = splitQuestionImages(q)
    expect(altImages.a.caption).toBe('Gráfico - opção A')
    expect(altImages.b.caption).toBe('Gráfico - opção B')
  })

  it('aceita imagens no formato objeto { src, caption }', () => {
    const q = {
      alternatives: alts('', ''),
      images: [{ src: 'figuras/x.png', caption: 'legenda x' }, { src: 'figuras/y.png' }],
    }
    const { altImages } = splitQuestionImages(q)
    expect(altImages.a).toEqual({ src: 'figuras/x.png', caption: 'legenda x' })
    expect(altImages.b).toEqual({ src: 'figuras/y.png', caption: '' })
  })

  it('tolera questao sem imagem', () => {
    expect(splitQuestionImages({ alternatives: alts('a', 'b') })).toEqual({ stemImages: [], altImages: {} })
    expect(splitQuestionImages(null)).toEqual({ stemImages: [], altImages: {} })
  })
})
