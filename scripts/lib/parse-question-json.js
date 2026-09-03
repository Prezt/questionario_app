// Normaliza uma questão bruta de JSON (ENEM ou lista de professor) para o shape
// da linha da tabela `multiple_choice_questions`.

export function parseQuestion(raw, sourceMeta) {
  const contextIds = Array.isArray(raw.contextIds) ? raw.contextIds : []
  let context_key = null
  if (contextIds.length === 1) {
    context_key = contextIds[0]
  } else if (contextIds.length > 1) {
    console.warn(
      `[parseQuestion] question year=${raw.year} number=${raw.number} has multiple contextIds; keeping first (${contextIds[0]})`
    )
    context_key = contextIds[0]
  }

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
    context_key,
    review: raw.review === true,
  }
}
