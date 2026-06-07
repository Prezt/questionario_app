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

  it('linguagens has five disciplinas (Português, Literatura, Língua Estrangeira, Artes, Educação Física)', () => {
    expect(DISCIPLINAS_BY_AREA.linguagens).toEqual([
      'portugues', 'literatura', 'lingua_estrangeira', 'artes', 'educacao_fisica',
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
  it('is the flat 13-entry slug list', () => {
    expect(ALL_DISCIPLINAS).toHaveLength(13)
    expect(new Set(ALL_DISCIPLINAS).size).toBe(13)
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
    expect(DISCIPLINA_LABELS.lingua_estrangeira).toBe('Língua Estrangeira')
  })
})

describe('DISCIPLINA_AREA reverse lookup', () => {
  it('maps each disciplina back to its area', () => {
    expect(DISCIPLINA_AREA.quimica).toBe('nature')
    expect(DISCIPLINA_AREA.historia).toBe('humanas')
    expect(DISCIPLINA_AREA.portugues).toBe('linguagens')
    expect(DISCIPLINA_AREA.matematica).toBe('math')
  })
})

describe('helpers', () => {
  it('disciplinaLabel returns label or the slug if unknown', () => {
    expect(disciplinaLabel('quimica')).toBe('Química')
    expect(disciplinaLabel('zzz')).toBe('zzz')
    expect(disciplinaLabel(null)).toBe(null)
  })

  it('areaForDisciplina returns the area', () => {
    expect(areaForDisciplina('biologia')).toBe('nature')
    expect(areaForDisciplina('zzz')).toBe(null)
  })
})
