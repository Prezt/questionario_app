import { describe, it, expect } from 'vitest'
import {
  disciplinasForTag,
  disciplinasForQuestion,
} from './disciplinaFromTag.js'

describe('disciplinasForTag', () => {
  it('maps unambiguous nature tags', () => {
    expect(disciplinasForTag('nature', 'termologia')).toEqual(['fisica'])
    expect(disciplinasForTag('nature', 'estequiometria')).toEqual(['quimica'])
    expect(disciplinasForTag('nature', 'ecologia')).toEqual(['biologia'])
  })

  it('maps unambiguous humanas tags', () => {
    expect(disciplinasForTag('humanas', 'história moderna')).toEqual(['historia'])
    expect(disciplinasForTag('humanas', 'cartografia')).toEqual(['geografia'])
    expect(disciplinasForTag('humanas', 'ética e política')).toEqual(['filosofia'])
    expect(disciplinasForTag('humanas', 'sociologia e estrutura social')).toEqual(['sociologia'])
  })

  it('maps unambiguous linguagens tags', () => {
    expect(disciplinasForTag('linguagens', 'interpretação de texto')).toEqual(['portugues'])
    expect(disciplinasForTag('linguagens', 'literatura brasileira')).toEqual(['literatura'])
    expect(disciplinasForTag('linguagens', 'língua inglesa')).toEqual(['ingles'])
    expect(disciplinasForTag('linguagens', 'língua espanhola')).toEqual(['espanhol'])
    expect(disciplinasForTag('linguagens', 'artes visuais')).toEqual(['artes'])
  })

  it('resolves cross-cutting tags by area', () => {
    expect(disciplinasForTag('humanas', 'meio ambiente e sustentabilidade')).toEqual(['geografia'])
    expect(disciplinasForTag('nature',  'meio ambiente e sustentabilidade')).toEqual(['biologia'])
    expect(disciplinasForTag('humanas', 'climatologia')).toEqual(['geografia'])
    expect(disciplinasForTag('nature',  'climatologia')).toEqual(['biologia'])
    expect(disciplinasForTag('humanas', 'história da cultura e arte')).toEqual(['historia'])
    expect(disciplinasForTag('linguagens', 'história da cultura e arte')).toEqual(['artes'])
    expect(disciplinasForTag('humanas', 'cultura e identidade')).toEqual(['sociologia'])
    expect(disciplinasForTag('humanas', 'comunicação e mídia')).toEqual(['sociologia'])
  })

  it('returns [] for unmapped tags', () => {
    expect(disciplinasForTag('linguagens', 'totally-made-up')).toEqual([])
    expect(disciplinasForTag('humanas', 'totally-made-up')).toEqual([])
  })

  it('maps linguagens::comunicação e mídia to portugues', () => {
    expect(disciplinasForTag('linguagens', 'comunicação e mídia')).toEqual(['portugues'])
  })
})

describe('disciplinasForQuestion', () => {
  it('returns ["matematica"] for any math question regardless of tags', () => {
    expect(disciplinasForQuestion({
      area: 'math', tags: ['geometria plana'],
    })).toEqual(['matematica'])
    expect(disciplinasForQuestion({
      area: 'math', tags: [],
    })).toEqual(['matematica'])
  })

  it('combines multiple tags into a sorted unique list', () => {
    expect(disciplinasForQuestion({
      area: 'nature',
      tags: ['química orgânica', 'fisiologia humana'],
    })).toEqual(['biologia', 'quimica'])
  })

  it('deduplicates when multiple tags resolve to the same disciplina', () => {
    expect(disciplinasForQuestion({
      area: 'nature',
      tags: ['ecologia', 'fisiologia humana'],
    })).toEqual(['biologia'])
  })

  it('adds ingles when language is en, espanhol when language is es', () => {
    expect(disciplinasForQuestion({
      area: 'linguagens',
      tags: [],
      language: 'en',
    })).toEqual(['ingles'])
    expect(disciplinasForQuestion({
      area: 'linguagens',
      tags: [],
      language: 'es',
    })).toEqual(['espanhol'])
    expect(disciplinasForQuestion({
      area: 'linguagens',
      tags: ['interpretação de texto'],
      language: 'es',
    })).toEqual(['espanhol', 'portugues'])
  })

  it('returns [] when no tag maps and no language hint', () => {
    expect(disciplinasForQuestion({
      area: 'linguagens',
      tags: ['totally-made-up'],
    })).toEqual([])
  })

  it('tolerates missing tags field', () => {
    expect(disciplinasForQuestion({ area: 'math' })).toEqual(['matematica'])
    expect(disciplinasForQuestion({ area: 'linguagens' })).toEqual([])
  })

  it('handles Title-Case tags via case-insensitive fallback', () => {
    expect(disciplinasForQuestion({
      area: 'nature',
      tags: ['Química geral e inorgânica', 'Eletroquímica'],
    })).toEqual(['quimica'])
    expect(disciplinasForQuestion({
      area: 'humanas',
      tags: ['Geografia física e geologia', 'Meio ambiente e sustentabilidade'],
    })).toEqual(['geografia'])
  })
})
