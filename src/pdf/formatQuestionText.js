// Divide o enunciado bruto em blocos de texto, imagem e tabela.
//
// A convencao do projeto usa marcadores inline `[Image: figuras/xxx.png]` ou
// `[Figura: descricao]`. Reconhecemos ambos, mas so o primeiro (com path) vira
// bloco de imagem no PDF — o segundo eh omitido (nao ha caminho pra renderizar).
//
// Tabelas sao markdown de pipe (`|a|b|`), o mesmo formato que o richHtml
// renderiza na web. No PDF elas viram bloco `{ type: 'table', grid }`, porque
// o @react-pdf/renderer nao tem <table> nativo — quem desenha eh PdfTable.jsx.
// Sem isso as linhas de pipe saem literais no PDF (83 blocos no banco).
//
// KaTeX inline (`\(...\)`) e ambiente ($$...$$) sao mantidos como texto puro
// nesta v1 do exportador — versao com renderizacao de math fica pra iteracao.
//
// Retorna Array<{ type: 'text', text }|{ type: 'image', path }|{ type: 'table', grid }>.

import { parseTableGrid, isTableLine } from '../richHtml.js'
import { STEM_FIGURE_MARKER_RE } from '../parseQuestionFigures.js'

const IMG_INLINE = /\[Image:\s*([^\]|]+?)(?:\s*\|[^\]]*)?\]/gi

// Marcador de figura sem imagem correspondente. Usa o mesmo conjunto do app web
// ([Figura], [Imagem], [Gráfico], [Esquema], …) porque as formas sem dois-pontos
// sao a maioria — 358 ocorrencias no banco, que antes saiam literais no PDF.
const figureMarkerRe = () => new RegExp(STEM_FIGURE_MARKER_RE.source, 'g')

/** Quebra um trecho ja sem marcadores de imagem em blocos de texto e tabela. */
function splitTables(raw) {
  const out = []
  let plain = []
  let table = []

  const flushPlain = () => {
    const text = plain.join('\n').replace(figureMarkerRe(), '').trim()
    if (text) out.push({ type: 'text', text })
    plain = []
  }
  const flushTable = () => {
    if (table.length) {
      const grid = parseTableGrid(table)
      if (grid) out.push({ type: 'table', grid })
    }
    table = []
  }

  for (const line of raw.split('\n')) {
    if (isTableLine(line)) { flushPlain(); table.push(line) }
    else { flushTable(); plain.push(line) }
  }
  flushPlain()
  flushTable()
  return out
}

export function formatQuestionText(raw) {
  if (!raw || typeof raw !== 'string') return []

  const parts = []
  let cursor = 0
  const matches = [...raw.matchAll(IMG_INLINE)]

  for (const match of matches) {
    const start = match.index
    if (start > cursor) parts.push(...splitTables(raw.slice(cursor, start)))
    parts.push({ type: 'image', path: match[1].trim() })
    cursor = start + match[0].length
  }

  parts.push(...splitTables(raw.slice(cursor)))
  return parts
}
