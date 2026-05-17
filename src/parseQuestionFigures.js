/**
 * Marcadores de figura no enunciado: [Infográfico …], [Figura …], [Gráfico …], [Esquema …]
 */
export const STEM_FIGURE_MARKER_RE =
  /\[(Imagem[^\]]*|Fotografias?[^\]]*|Fotos?[^\]]*|Diagramas?[^\]]*|Infogr[aá]fico[^\]]*|Figuras?[^\]]*|Gr[aá]fico[^\]]*|Esquema[^\]]*)\]/g

/**
 * Segmenta o texto do enunciado e intercala figuras na ordem dos marcadores.
 * Quando há mais marcadores do que imagens e resta uma única imagem, ela substitui
 * o bloco inteiro de marcadores consecutivos (legenda com todos os textos, em linhas).
 *
 * imagePaths aceita strings ou objetos { src, caption }.
 * Quando o objeto tem caption, ele tem precedência sobre o texto do marcador.
 */
export function parseStemSegments(text, imagePaths) {
  // Normalise: accept plain strings or { src, caption } objects
  const paths = (imagePaths ?? []).map(p =>
    p == null ? { src: '', caption: null }
    : typeof p === 'string' ? { src: p, caption: null }
    : { src: p.src ?? '', caption: p.caption ?? null }
  )
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
    for (const p of paths) {
      out.push({ type: 'figure', src: p.src, caption: p.caption })
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
        src: paths[ii].src,
        caption: paths[ii].caption ?? inners.join('\n'),
      })
      pos = markers[markers.length - 1].end
      mi = markers.length
      ii++
    } else {
      segments.push({
        type: 'figure',
        src: paths[ii].src,
        caption: paths[ii].caption ?? markers[mi].inner.trim(),
      })
      pos = markers[mi].end
      mi++
      ii++
    }
  }

  // Handle remaining markers that have no corresponding path but may carry an inline URL
  while (mi < markers.length) {
    const before = text.slice(pos, markers[mi].start)
    if (before) segments.push({ type: 'text', text: before })
    const inner = markers[mi].inner.trim()
    const urlMatch = inner.match(/https?:\/\/\S+/)
    if (urlMatch) {
      const url = urlMatch[0]
      const caption = inner.replace(url, '').replace(/^[:\s]+/, '').trim()
      segments.push({ type: 'figure', src: url, caption: caption || null })
    } else {
      segments.push({ type: 'text', text: `[${markers[mi].inner}]` })
    }
    pos = markers[mi].end
    mi++
  }

  const after = text.slice(pos)
  if (after) segments.push({ type: 'text', text: after })

  while (ii < paths.length) {
    segments.push({ type: 'figure', src: paths[ii].src, caption: paths[ii].caption })
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
