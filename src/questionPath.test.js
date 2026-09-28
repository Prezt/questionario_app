import { describe, it, expect } from 'vitest'
import { parseQuestionPath, questionPath } from './questionPath.js'

describe('parseQuestionPath', () => {
  it('reconhece /ano/numero', () => {
    expect(parseQuestionPath('/2023/10')).toEqual({ year: 2023, number: 10, lang: null })
  })

  it('tolera barras sobrando', () => {
    expect(parseQuestionPath('2023/10')).toEqual({ year: 2023, number: 10, lang: null })
    expect(parseQuestionPath('/2023/10/')).toEqual({ year: 2023, number: 10, lang: null })
  })

  it('aceita o desempate de idioma', () => {
    expect(parseQuestionPath('/2023/1/ingles')).toEqual({ year: 2023, number: 1, lang: 'ingles' })
    expect(parseQuestionPath('/2023/1/espanhol')).toEqual({ year: 2023, number: 1, lang: 'espanhol' })
  })

  it('recusa idioma desconhecido', () => {
    expect(parseQuestionPath('/2023/1/frances')).toBeNull()
  })

  it('nao colide com as abas existentes', () => {
    expect(parseQuestionPath('/questoes-sorteio')).toBeNull()
    expect(parseQuestionPath('/inicio')).toBeNull()
    expect(parseQuestionPath('/jogos/milhao')).toBeNull()
    expect(parseQuestionPath('/')).toBeNull()
    expect(parseQuestionPath('')).toBeNull()
  })

  it('recusa ano ou numero fora de faixa', () => {
    expect(parseQuestionPath('/1800/10')).toBeNull()
    expect(parseQuestionPath('/2023/0')).toBeNull()
    expect(parseQuestionPath('/2023/1000')).toBeNull()
    expect(parseQuestionPath('/23/10')).toBeNull()
  })
})

describe('questionPath', () => {
  it('monta o caminho de uma questao comum', () => {
    expect(questionPath({ year: 2023, number: 10 })).toBe('/2023/10')
  })

  it('inclui o idioma quando a questao tem um', () => {
    expect(questionPath({ year: 2023, number: 1, language: 'ingles' })).toBe('/2023/1/ingles')
    expect(questionPath({ year: 2023, number: 1, language: 'es' })).toBe('/2023/1/espanhol')
  })

  it('devolve vazio sem ano ou numero', () => {
    expect(questionPath({ year: 2023 })).toBe('')
    expect(questionPath(null)).toBe('')
  })

  it('ida e volta com parseQuestionPath', () => {
    const q = { year: 2019, number: 3, language: 'espanhol' }
    expect(parseQuestionPath(questionPath(q))).toEqual({ year: 2019, number: 3, lang: 'espanhol' })
  })
})
