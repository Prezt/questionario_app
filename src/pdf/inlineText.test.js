import { describe, it, expect } from 'vitest'
import { inlineSegments } from './inlineText.js'

describe('inlineSegments', () => {
  it('texto simples vira um segmento sem estilo', () => {
    expect(inlineSegments('Apenas texto.')).toEqual([{ text: 'Apenas texto.' }])
  })

  it('vazio vira lista vazia', () => {
    expect(inlineSegments('')).toEqual([])
    expect(inlineSegments(null)).toEqual([])
  })

  it('marca italico', () => {
    expect(inlineSegments('<i>Ascaris lumbricoides</i>')).toEqual([
      { text: 'Ascaris lumbricoides', italic: true },
    ])
  })

  it('marca negrito no meio da frase', () => {
    expect(inlineSegments('antes <b>forte</b> depois')).toEqual([
      { text: 'antes ' },
      { text: 'forte', bold: true },
      { text: ' depois' },
    ])
  })

  it('marca subscrito e sobrescrito', () => {
    expect(inlineSegments('H<sub>2</sub>O')).toEqual([
      { text: 'H' }, { text: '2', sub: true }, { text: 'O' },
    ])
    expect(inlineSegments('m<sup>2</sup>')).toEqual([
      { text: 'm' }, { text: '2', sup: true },
    ])
  })

  it('aninha negrito e italico', () => {
    expect(inlineSegments('<b><i>tudo</i></b>')).toEqual([
      { text: 'tudo', bold: true, italic: true },
    ])
  })

  it('<br> vira quebra de linha', () => {
    expect(inlineSegments('linha1<br>linha2')).toEqual([{ text: 'linha1\nlinha2' }])
  })

  it('descarta tags de alinhamento, preservando o conteudo', () => {
    expect(inlineSegments('<center>meio</center>')).toEqual([{ text: 'meio' }])
  })

  it('tag desconhecida e removida', () => {
    expect(inlineSegments('a<span>b</span>c')).toEqual([{ text: 'abc' }])
  })

  it('tag nao fechada nao perde o texto', () => {
    expect(inlineSegments('<i>sem fim')).toEqual([{ text: 'sem fim', italic: true }])
  })
})
