import { describe, it, expect } from 'vitest'
import { explanationKey, normalizaIdioma } from './explanationKey.js'

const q = (over = {}) => ({ area: 'math', year: 2022, test: 'ENEM', number: 147, ...over })

describe('explanationKey', () => {
  it('sem idioma mantem a chave antiga, sem sufixo', () => {
    expect(explanationKey(q())).toBe('math:2022:ENEM:147')
  })

  it('trata null e string vazia como ausencia de idioma', () => {
    expect(explanationKey(q({ language: null }))).toBe('math:2022:ENEM:147')
    expect(explanationKey(q({ language: '' }))).toBe('math:2022:ENEM:147')
  })

  it('separa ingles de espanhol no mesmo numero', () => {
    const base = { area: 'linguagens', year: 2019, test: 'ENEM', number: 1 }
    const en = explanationKey({ ...base, language: 'ingles' })
    const es = explanationKey({ ...base, language: 'espanhol' })
    expect(en).toBe('linguagens:2019:ENEM:1:ingles')
    expect(es).toBe('linguagens:2019:ENEM:1:espanhol')
    expect(en).not.toBe(es)
  })
})

describe('normalizaIdioma', () => {
  // public/*.json grava "en"/"es"; o banco grava "ingles"/"espanhol".
  it('junta os dois vocabularios do projeto', () => {
    expect(normalizaIdioma('en')).toBe('ingles')
    expect(normalizaIdioma('ingles')).toBe('ingles')
    expect(normalizaIdioma('es')).toBe('espanhol')
    expect(normalizaIdioma('espanhol')).toBe('espanhol')
  })

  it('devolve null quando nao ha idioma', () => {
    expect(normalizaIdioma(null)).toBeNull()
    expect(normalizaIdioma('')).toBeNull()
    expect(normalizaIdioma(undefined)).toBeNull()
  })
})

describe('explanationKey · os dois vocabularios dao a mesma chave', () => {
  const base = { area: 'linguagens', year: 2019, test: 'ENEM', number: 1 }
  it('questao do JSON publico e a linha do banco caem na mesma chave', () => {
    expect(explanationKey({ ...base, language: 'en' }))
      .toBe(explanationKey({ ...base, language: 'ingles' }))
    expect(explanationKey({ ...base, language: 'es' }))
      .toBe(explanationKey({ ...base, language: 'espanhol' }))
  })

  it('e ingles continua diferente de espanhol', () => {
    expect(explanationKey({ ...base, language: 'en' }))
      .not.toBe(explanationKey({ ...base, language: 'es' }))
  })
})
