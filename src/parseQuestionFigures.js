/**
 * Marcadores de figura no enunciado: [Infográfico …], [Figura …], [Gráfico …], [Esquema …]
 */
export const STEM_FIGURE_MARKER_RE =
  /\[(Infográfico[^\]]*|Figuras?[^\]]*|Gráfico[^\]]*|Esquema[^\]]*)\]/g

/**
 * Segmenta o texto do enunciado e intercala figuras na ordem dos marcadores.
 * Quando há mais marcadores do que imagens e resta uma única imagem, ela substitui
 * o bloco inteiro de marcadores consecutivos (legenda com todos os textos, em linhas).
 */
export function parseStemSegments(text, imagePaths) {
  const paths = [...(imagePaths ?? [])]
  const re = new RegExp(STEM_FIGURE_MARKER_RE.source, 'g')
  const markers = []
  let m
  while ((m = re.exec(text))) {
    markers.push({
      inner: m[1],
      start: m.index,
      end: m.index + m[0].length,
    })
  }

  if (markers.length === 0) {
    const out = []
    if (text) out.push({ type: 'text', text })
    for (const src of paths) {
      out.push({ type: 'figure', src, caption: null })
    }
    return out
  }

  const segments = []
  let pos = 0
  let mi = 0
  let ii = 0

  while (mi < markers.length && ii < paths.length) {
    const before = text.slice(pos, markers[mi].start)
    if (before) segments.push({ type: 'text', text: before })

    if (paths.length - ii === 1 && markers.length - mi > 1) {
      const inners = markers.slice(mi).map((x) => x.inner.trim())
      segments.push({
        type: 'figure',
        src: paths[ii],
        caption: inners.join('\n'),
      })
      pos = markers[markers.length - 1].end
      mi = markers.length
      ii++
    } else {
      segments.push({
        type: 'figure',
        src: paths[ii],
        caption: markers[mi].inner.trim(),
      })
      pos = markers[mi].end
      mi++
      ii++
    }
  }

  const after = text.slice(pos)
  if (after) segments.push({ type: 'text', text: after })

  while (ii < paths.length) {
    segments.push({ type: 'figure', src: paths[ii], caption: null })
    ii++
  }

  return segments
}

/** Texto da alternativa sem o bloco [ … ] quando a figura carrega a legenda. */
export function alternativeLabelForDisplay(altText, hasImage) {
  if (!hasImage || !altText) return altText
  const trimmed = altText.trim()
  if (/^\[[^\]]+\]$/.test(trimmed)) return ''
  return trimmed.replace(/\[[^\]]+\]/g, '').trim() || altText
}

/** Primeiro descritor entre colchetes, para legenda da alternativa. */
export function captionFromBracketText(altText) {
  if (!altText) return ''
  const m = altText.match(/\[([^\]]+)\]/)
  return m ? m[1].trim() : ''
}
