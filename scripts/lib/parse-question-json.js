// Normaliza uma questão bruta de JSON (ENEM ou lista de professor) para o shape
// da linha da tabela `multiple_choice_questions`.

export function parseQuestion(raw, sourceMeta) {
  const context_keys = Array.isArray(raw.contextIds) ? [...raw.contextIds] : []

  return {
    source: sourceMeta.source,
    source_list: sourceMeta.source_list ?? null,
    area: raw.area ?? null,
    test: raw.test ?? null,
    year: raw.year ?? null,
    number: raw.number,
    text: raw.text,
    alternatives: raw.alternatives,
    answer: raw.answer,
    images: Array.isArray(raw.images) ? raw.images : [],
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    disciplinas: Array.isArray(raw.disciplinas) ? raw.disciplinas : [],
    difficulty: raw.difficulty ?? null,
    context_keys,
    language: raw.language ?? null,
    review: raw.review === true,
  }
}

// Anota `language` em questoes de linguagens 1-5 antes de passar pro parser.
// Duas passadas: (1) detecta pela tag onde possivel; (2) para cada par de mesmo
// numero, se uma foi detectada e outra nao, a nao-detectada vira o oposto;
// se nenhuma foi detectada, usa ordem (1a ocorrencia = ingles, 2a = espanhol —
// padrao dos PDFs do ENEM). Questoes fora do escopo (area != linguagens ou
// numero > 5) nao recebem o campo `language`.
const isLinguagensLangSlot = (q) =>
  q.area === 'linguagens' && q.number >= 1 && q.number <= 5

function detectLanguageFromTags(q) {
  const tags = Array.isArray(q.tags) ? q.tags : []
  if (tags.some((t) => /l[ií]ngua inglesa/i.test(t))) return 'ingles'
  if (tags.some((t) => /l[ií]ngua espanhola/i.test(t))) return 'espanhol'
  return null
}

export function annotateLinguagensLanguage(questions) {
  const result = questions.map((q) => {
    if (!isLinguagensLangSlot(q)) return { ...q }
    return { ...q, language: detectLanguageFromTags(q) }
  })

  const indicesByNumber = new Map()
  result.forEach((q, i) => {
    if (!isLinguagensLangSlot(q)) return
    if (!indicesByNumber.has(q.number)) indicesByNumber.set(q.number, [])
    indicesByNumber.get(q.number).push(i)
  })

  for (const indices of indicesByNumber.values()) {
    if (indices.length !== 2) continue
    const [i, j] = indices
    const a = result[i]
    const b = result[j]
    if (a.language && b.language) continue
    if (a.language) {
      b.language = a.language === 'ingles' ? 'espanhol' : 'ingles'
    } else if (b.language) {
      a.language = b.language === 'ingles' ? 'espanhol' : 'ingles'
    } else {
      a.language = 'ingles'
      b.language = 'espanhol'
    }
  }

  return result
}
