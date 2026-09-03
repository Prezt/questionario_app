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
    review: raw.review === true,
  }
}
