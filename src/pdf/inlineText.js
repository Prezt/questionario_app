// Converte a marcacao inline do projeto (<b>, <i>, <sub>, <sup>, <br>) em
// segmentos que o @react-pdf/renderer consegue desenhar com <Text> aninhado.
//
// Sem isso as tags saem literais no PDF: 72 enunciados, 47 contextos e 24
// alternativas usam marcacao, alem de 10 blocos de tabela com <i> na celula.
//
// As tags de alinhamento (<center>, <left>, <right>, <justify>) sao descartadas
// preservando o conteudo — alinhamento por trecho nao se traduz em <Text> inline.
//
// Retorna Array<{ text, bold?, italic?, sub?, sup? }>.

const STYLE_TAGS = { b: 'bold', strong: 'bold', i: 'italic', em: 'italic', sub: 'sub', sup: 'sup' }
const TAG_RE = /<\s*(\/?)\s*([a-z]+)\s*\/?\s*>/gi

export function inlineSegments(raw) {
  if (!raw || typeof raw !== 'string') return []

  const segments = []
  const open = []
  let cursor = 0

  const push = (text) => {
    if (!text) return
    const seg = { text }
    for (const style of open) seg[style] = true
    // Junta com o anterior quando o estilo e o mesmo, pra nao picotar o texto.
    const prev = segments[segments.length - 1]
    if (prev && sameStyle(prev, seg)) prev.text += text
    else segments.push(seg)
  }

  for (const match of raw.matchAll(TAG_RE)) {
    push(raw.slice(cursor, match.index))
    cursor = match.index + match[0].length

    const closing = match[1] === '/'
    const tag = match[2].toLowerCase()

    if (tag === 'br') { push('\n'); continue }

    const style = STYLE_TAGS[tag]
    if (!style) continue // tag desconhecida ou de alinhamento: some, conteudo fica

    if (closing) {
      const i = open.lastIndexOf(style)
      if (i !== -1) open.splice(i, 1)
    } else {
      open.push(style)
    }
  }

  push(raw.slice(cursor))
  return segments
}

function sameStyle(a, b) {
  return a.bold === b.bold && a.italic === b.italic && a.sub === b.sub && a.sup === b.sup
}
