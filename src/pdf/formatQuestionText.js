// Divide o enunciado bruto em blocos alternados de texto e imagem.
// A convencao do projeto usa marcadores inline `[Image: figuras/xxx.png]` ou
// `[Figura: descricao]`. Reconhecemos ambos, mas so o primeiro (com path) vira
// bloco de imagem no PDF — o segundo eh omitido (nao ha caminho pra renderizar).
//
// KaTeX inline (`\(...\)`) e ambiente ($$...$$) sao mantidos como texto puro
// nesta v1 do exportador — versao com renderizacao de math fica pra iteracao.
//
// Retorna Array<{ type: 'text', text }|{ type: 'image', path }>.

const IMG_INLINE = /\[Image:\s*([^\]|]+?)(?:\s*\|[^\]]*)?\]/gi
const FIG_INLINE = /\[Figura:[^\]]*\]/gi

export function formatQuestionText(raw) {
  if (!raw || typeof raw !== 'string') return []

  const parts = []
  let cursor = 0
  const matches = [...raw.matchAll(IMG_INLINE)]

  for (const match of matches) {
    const start = match.index
    if (start > cursor) {
      const before = raw.slice(cursor, start).replace(FIG_INLINE, '').trim()
      if (before) parts.push({ type: 'text', text: before })
    }
    parts.push({ type: 'image', path: match[1].trim() })
    cursor = start + match[0].length
  }

  const tail = raw.slice(cursor).replace(FIG_INLINE, '').trim()
  if (tail) parts.push({ type: 'text', text: tail })

  return parts
}
