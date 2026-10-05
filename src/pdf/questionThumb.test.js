import { describe, it, expect } from 'vitest'
import { questionThumb } from './questionThumb.js'

const q = (over = {}) => ({ alternatives: { a: 'texto a', b: 'texto b' }, context_keys: [], ...over })

describe('questionThumb', () => {
  it('usa a figura do enunciado quando existe', () => {
    const thumb = questionThumb(q({ images: ['figuras/stem.png'] }), {})
    expect(thumb).toEqual({ src: '/figuras/stem.png', caption: '', from: 'questao' })
  })

  it('NAO usa figura de alternativa como miniatura', () => {
    // 5 imagens para 5 alternativas vazias: sao das alternativas, nao do enunciado.
    const alts = { a: '', b: '', c: '', d: '', e: '' }
    const images = ['a.png', 'b.png', 'c.png', 'd.png', 'e.png']
    expect(questionThumb(q({ alternatives: alts, images }), {})).toBeNull()
  })

  it('com figura de enunciado + alternativas-imagem, usa a do enunciado', () => {
    const alts = { a: '', b: '', c: '', d: '', e: '' }
    const images = ['stem.png', 'a.png', 'b.png', 'c.png', 'd.png', 'e.png']
    expect(questionThumb(q({ alternatives: alts, images }), {}).src).toBe('/stem.png')
  })

  it('cai para a imagem do contexto quando a questao nao tem figura propria', () => {
    const contexts = { ctx1: { images: ['figuras/ctx.png'] } }
    const thumb = questionThumb(q({ context_keys: ['ctx1'] }), contexts)
    expect(thumb).toEqual({ src: '/figuras/ctx.png', caption: '', from: 'contexto' })
  })

  it('percorre os contextos ate achar um com imagem', () => {
    const contexts = { a: { images: [] }, b: { images: ['figuras/b.png'] } }
    expect(questionThumb(q({ context_keys: ['a', 'b'] }), contexts).src).toBe('/figuras/b.png')
  })

  it('devolve null quando nao ha imagem em lugar nenhum', () => {
    expect(questionThumb(q(), {})).toBeNull()
    expect(questionThumb(q({ context_keys: ['x'] }), {})).toBeNull()
    expect(questionThumb(null, {})).toBeNull()
  })

  it('aceita imagem no formato objeto e preserva a legenda', () => {
    const thumb = questionThumb(q({ images: [{ src: 'figuras/o.png', caption: 'mapa' }] }), {})
    expect(thumb).toEqual({ src: '/figuras/o.png', caption: 'mapa', from: 'questao' })
  })

  it('nao mexe em URL absoluta nem data URI', () => {
    expect(questionThumb(q({ images: ['https://x/y.png'] }), {}).src).toBe('https://x/y.png')
  })
})

describe('questionThumb · contextIds do JSON publico', () => {
  // O banco chama a coluna de context_keys; os arquivos em public/ usam
  // contextIds. O EnemPicker le os arquivos, entao a busca precisa dos dois.
  it('cai para a imagem do contexto quando a questao usa contextIds', () => {
    const contexts = { ctx1: { images: ['figuras/ctx.png'] } }
    const question = { alternatives: { a: 'a', b: 'b' }, contextIds: ['ctx1'] }
    expect(questionThumb(question, contexts)).toEqual({
      src: '/figuras/ctx.png', caption: '', from: 'contexto',
    })
  })

  it('aceita contextId singular (formato antigo)', () => {
    const contexts = { ctx1: { images: ['figuras/ctx.png'] } }
    const question = { alternatives: { a: 'a' }, contextId: 'ctx1' }
    expect(questionThumb(question, contexts).src).toBe('/figuras/ctx.png')
  })
})
