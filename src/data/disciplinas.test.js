import { describe, it, expect } from 'vitest'
import {
  DISCIPLINAS_BY_AREA,
  ALL_DISCIPLINAS,
  DISCIPLINA_LABELS,
  DISCIPLINA_AREA,
  disciplinaLabel,
  areaForDisciplina,
} from './disciplinas.js'

describe('DISCIPLINAS_BY_AREA', () => {
  it('covers the four ENEM areas', () => {
    expect(Object.keys(DISCIPLINAS_BY_AREA).sort()).toEqual(
      ['humanas', 'linguagens', 'math', 'nature']
    )
  })

  it('linguagens has six disciplinas (Português, Literatura, Inglês, Espanhol, Artes, Educação Física)', () => {
    expect(DISCIPLINAS_BY_AREA.linguagens).toEqual([
      'portugues', 'literatura', 'ingles', 'espanhol', 'artes', 'educacao_fisica',
    ])
  })

  it('humanas has four disciplinas', () => {
    expect(DISCIPLINAS_BY_AREA.humanas).toEqual([
      'historia', 'geografia', 'filosofia', 'sociologia',
    ])
  })

  it('nature has three disciplinas', () => {
    expect(DISCIPLINAS_BY_AREA.nature).toEqual(['fisica', 'quimica', 'biologia'])
  })

  it('math has one disciplina', () => {
    expect(DISCIPLINAS_BY_AREA.math).toEqual(['matematica'])
  })
})

describe('ALL_DISCIPLINAS', () => {
  it('is the flat 14-entry slug list with no duplicates', () => {
    expect(ALL_DISCIPLINAS).toHaveLength(14)
    expect(new Set(ALL_DISCIPLINAS).size).toBe(ALL_DISCIPLINAS.length)
  })
})

describe('DISCIPLINA_LABELS', () => {
  it('has display label for every slug', () => {
    for (const slug of ALL_DISCIPLINAS) {
      expect(DISCIPLINA_LABELS[slug]).toBeTypeOf('string')
      expect(DISCIPLINA_LABELS[slug].length).toBeGreaterThan(0)
    }
  })

  it('keeps accents in labels', () => {
    expect(DISCIPLINA_LABELS.portugues).toBe('Português')
    expect(DISCIPLINA_LABELS.matematica).toBe('Matemática')
    expect(DISCIPLINA_LABELS.educacao_fisica).toBe('Educação Física')
    expect(DISCIPLINA_LABELS.ingles).toBe('Inglês')
    expect(DISCIPLINA_LABELS.espanhol).toBe('Espanhol')
  })
})

describe('DISCIPLINA_AREA reverse lookup', () => {
  it('maps each disciplina back to its area', () => {
    expect(DISCIPLINA_AREA.quimica).toBe('nature')
    expect(DISCIPLINA_AREA.historia).toBe('humanas')
    expect(DISCIPLINA_AREA.portugues).toBe('linguagens')
    expect(DISCIPLINA_AREA.matematica).toBe('math')
  })

  it('covers every disciplina', () => {
    for (const slug of ALL_DISCIPLINAS) {
      expect(DISCIPLINA_AREA[slug]).toBeTypeOf('string')
    }
  })
})

describe('helpers', () => {
  it('disciplinaLabel returns label or the slug if unknown', () => {
    expect(disciplinaLabel('quimica')).toBe('Química')
    expect(disciplinaLabel('zzz')).toBe('zzz')
    expect(disciplinaLabel(null)).toBe(null)
  })

  it('areaForDisciplina returns the area or null', () => {
    expect(areaForDisciplina('biologia')).toBe('nature')
    expect(areaForDisciplina('zzz')).toBe(null)
    expect(areaForDisciplina(null)).toBe(null)
    expect(areaForDisciplina(undefined)).toBe(null)
  })
})
