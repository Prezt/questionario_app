// Miniatura que identifica a questao na tela de montagem de lista.
//
// Nao basta pegar `images[0]`: em 44 questoes do banco as imagens sao as
// proprias alternativas, e a primeira seria a figura da alternativa A — uma
// miniatura que engana. Por isso a escolha passa por splitQuestionImages.
//
// Como 575 questoes tem contexto e a figura frequentemente mora la (a regra do
// projeto e que imagem com fonte pertence ao contexto), o fallback para a
// imagem do contexto e o que da miniatura a maioria das questoes de linguagens.

import { splitQuestionImages } from '../alternativeImages.js'

function publicImageSrc(path) {
  const src = typeof path === 'string' ? path : path?.src
  if (!src) return ''
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) return src
  return src.startsWith('/') ? src : `/${src}`
}

/**
 * Retorna { src, caption, from: 'questao' | 'contexto' } ou null.
 * `from` existe para a UI poder sinalizar que a figura veio do texto-base.
 */
export function questionThumb(q, contexts = {}) {
  if (!q) return null

  const { stemImages } = splitQuestionImages(q)
  if (stemImages.length) {
    return { src: publicImageSrc(stemImages[0].src), caption: stemImages[0].caption ?? '', from: 'questao' }
  }

  for (const key of q.context_keys ?? []) {
    const images = contexts?.[key]?.images ?? []
    for (const img of images) {
      const src = publicImageSrc(img)
      if (src) return { src, caption: typeof img === 'string' ? '' : (img.caption ?? ''), from: 'contexto' }
    }
  }

  return null
}
