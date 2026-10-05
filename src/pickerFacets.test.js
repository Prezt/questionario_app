import { describe, it, expect } from 'vitest'
import { applyFilters, facetOptions, paresParaCarregar, norm } from './pickerFacets.js'

const banco = [
  { number: 1, text: 'Função do segundo grau', disciplinas: ['matematica'], tags: ['funções'] },
  { number: 2, text: 'Célula animal', disciplinas: ['biologia'], tags: ['citologia'] },
  { number: 3, text: 'Fotossíntese nas plantas', disciplinas: ['biologia'], tags: ['fotossíntese'] },
  { number: 4, text: 'Movimento uniforme', disciplinas: ['fisica'], tags: ['cinemática'] },
]

describe('applyFilters', () => {
  it('sem filtro devolve tudo', () => {
    expect(applyFilters(banco, {})).toHaveLength(4)
  })

  it('filtra por disciplina', () => {
    expect(applyFilters(banco, { disciplinas: ['biologia'] }).map(q => q.number)).toEqual([2, 3])
  })

  it('filtra por assunto', () => {
    expect(applyFilters(banco, { assuntos: ['cinemática'] }).map(q => q.number)).toEqual([4])
  })

  it('busca textual ignora acento e caixa', () => {
    expect(applyFilters(banco, { queryNorm: norm('FUNCAO') }).map(q => q.number)).toEqual([1])
  })

  it('`exceto` pula o filtro nomeado', () => {
    const f = { disciplinas: ['biologia'] }
    expect(applyFilters(banco, f, 'disciplinas')).toHaveLength(4)
  })
})

describe('facetOptions', () => {
  it('sem filtro oferece todos os valores presentes', () => {
    const o = facetOptions(banco, {})
    expect(o.disciplinas).toEqual(['biologia', 'fisica', 'matematica'])
    expect(o.assuntos).toEqual(['cinemática', 'citologia', 'fotossíntese', 'funções'])
  })

  it('assuntos encolhem para os da disciplina marcada', () => {
    const o = facetOptions(banco, { disciplinas: ['biologia'] })
    expect(o.assuntos).toEqual(['citologia', 'fotossíntese'])
  })

  it('as disciplinas seguem inteiras para dar pra trocar de escolha', () => {
    const o = facetOptions(banco, { disciplinas: ['biologia'] })
    expect(o.disciplinas).toEqual(['biologia', 'fisica', 'matematica'])
  })

  it('a busca textual tambem encolhe as duas listas', () => {
    const o = facetOptions(banco, { queryNorm: norm('celula') })
    expect(o.disciplinas).toEqual(['biologia'])
    expect(o.assuntos).toEqual(['citologia'])
  })

  it('mantem a opcao marcada mesmo quando ela ficou sem questao', () => {
    const o = facetOptions(banco, { queryNorm: norm('celula'), assuntos: ['cinemática'] })
    expect(o.assuntos).toContain('cinemática')
  })
})

describe('paresParaCarregar', () => {
  const areas = ['math', 'nature']
  const years = [2025, 2024]

  it('area e ano escolhidos carregam um arquivo so', () => {
    expect(paresParaCarregar('math', 2025, areas, years)).toEqual([['math', 2025]])
  })

  it('ano "todos" abre um arquivo por ano', () => {
    expect(paresParaCarregar('math', null, areas, years)).toEqual([['math', 2025], ['math', 2024]])
  })

  it('area "todas" abre um arquivo por area', () => {
    expect(paresParaCarregar('', 2025, areas, years)).toEqual([['math', 2025], ['nature', 2025]])
  })

  it('tudo "todos" abre o produto das duas listas', () => {
    expect(paresParaCarregar('', null, areas, years)).toHaveLength(4)
  })
})
