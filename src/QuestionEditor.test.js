// A miniatura do ImageInput so renderizava quando o src era data: URL — e as
// questoes importadas do ENEM guardam caminho ("figuras/q108_2025_fig1.png",
// todas as 513 referencias do banco). Resultado: preview que nunca aparecia.

import { describe, it, expect } from 'vitest'
import { imagePreviewSrc } from './QuestionEditor.jsx'

describe('imagePreviewSrc', () => {
  it('prefixa "/" no caminho relativo guardado pelo banco', () => {
    expect(imagePreviewSrc('figuras/q108_2025_fig1.png')).toBe('/figuras/q108_2025_fig1.png')
  })

  it('preserva data: URL do arquivo recem-carregado', () => {
    expect(imagePreviewSrc('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA')
  })

  it('preserva URL absoluta', () => {
    expect(imagePreviewSrc('https://exemplo.com/a.png')).toBe('https://exemplo.com/a.png')
  })

  it('nao duplica a barra quando ja vem com "/"', () => {
    expect(imagePreviewSrc('/figuras/a.png')).toBe('/figuras/a.png')
  })

  it('devolve vazio quando nao ha src', () => {
    expect(imagePreviewSrc('')).toBe('')
    expect(imagePreviewSrc(undefined)).toBe('')
  })
})
