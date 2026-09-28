// Decide se as imagens de uma questao pertencem ao enunciado ou as alternativas.
//
// O banco nao tem campo dizendo isso — a unica informacao e a posicao no array
// `images`. A convencao historica (ver App.jsx:3063, `displayAlts`) olha so a
// contagem, e erra na q168/2024: 5 graficos de enunciado com 5 alternativas que
// sao frases inteiras acabam virando "uma figura por alternativa".
//
// Levantamento sobre as 1.491 questoes de multiple_choice_questions — das 45
// que batem na contagem, 44 sao mesmo alternativa-imagem:
//   19  alternativas vazias           ["", "", "", "", ""]
//   15  so descritor entre colchetes  ["[Gráfico - opção A]", ...]
//   10  texto e apenas a letra        ["A", "B", "C", "D", "E"]
//    1  frases de verdade             q168/2024  <- a excecao
//
// Dai a regra: alem da contagem bater, toda alternativa precisa ser vazia ou
// uma letra sozinha depois de remover os blocos [...].

const BRACKET_BLOCK = /\[[^\]]*\]/g
const SINGLE_LETTER = /^[a-e]$/i

/** Letras das alternativas, em ordem alfabetica e estavel. */
export function alternativeLetters(q) {
  return Object.keys(q?.alternatives ?? {}).sort()
}

/** Normaliza string | { src, caption } para { src, caption }. */
function normalizeImage(img) {
  if (!img) return null
  if (typeof img === 'string') return { src: img, caption: '' }
  return { src: img.src ?? '', caption: img.caption ?? '' }
}

/** Primeiro descritor entre colchetes do texto da alternativa, sem os colchetes. */
function captionFromAlternative(text) {
  const m = String(text ?? '').match(/\[([^\]]+)\]/)
  return m ? m[1].trim() : ''
}

/**
 * Verdadeiro quando as imagens da questao sao as proprias alternativas.
 * Exige contagem compativel E alternativas sem conteudo textual proprio.
 */
export function alternativesAreImages(q) {
  const letters = alternativeLetters(q)
  const images = q?.images ?? []
  if (!letters.length || !images.length) return false
  if (images.length !== letters.length && images.length !== letters.length + 1) return false

  return letters.every((letter) => {
    const stripped = String(q.alternatives[letter] ?? '').replace(BRACKET_BLOCK, '').trim()
    return stripped === '' || SINGLE_LETTER.test(stripped)
  })
}

/**
 * Separa `images` entre figura(s) de enunciado e figura por alternativa.
 *
 * Retorna { stemImages: Array<{src, caption}>, altImages: { [letra]: {src, caption} } }.
 * Quando nao ha alternativa-imagem, todas as imagens sao do enunciado e
 * `altImages` volta vazio.
 */
export function splitQuestionImages(q) {
  const images = (q?.images ?? []).map(normalizeImage).filter((i) => i && i.src)
  if (!images.length) return { stemImages: [], altImages: {} }
  if (!alternativesAreImages(q)) return { stemImages: images, altImages: {} }

  const letters = alternativeLetters(q)
  const hasStemImage = images.length === letters.length + 1
  const offset = hasStemImage ? 1 : 0

  const altImages = {}
  letters.forEach((letter, i) => {
    const img = images[i + offset]
    if (!img) return
    // A legenda do colchete tem precedencia: e ela que descreve a figura.
    const caption = captionFromAlternative(q.alternatives[letter]) || img.caption
    altImages[letter] = { src: img.src, caption }
  })

  return { stemImages: hasStemImage ? [images[0]] : [], altImages }
}
