// Filtro e facetas do seletor de questoes do ENEM.
//
// A regra que da nome ao arquivo: cada dropdown so oferece valores que ainda
// levam a alguma questao. Para isso as opcoes de um filtro sao calculadas
// ignorando ele mesmo — senao, assim que voce marca "biologia" o dropdown de
// disciplinas passaria a listar so "biologia" e nao daria mais pra trocar.

const DIACRITICS_RE = /\p{Diacritic}/gu

export function norm(s) {
  return (s ?? '').toString().normalize('NFD').replace(DIACRITICS_RE, '').toLowerCase()
}

/**
 * Questoes que passam nos filtros ativos.
 *
 * `exceto` pula um dos filtros ('disciplinas' | 'assuntos'), que e como as
 * opcoes de cada dropdown sao levantadas.
 */
export function applyFilters(questions, filters = {}, exceto = null) {
  const { disciplinas = [], assuntos = [], queryNorm = '' } = filters
  return (questions ?? []).filter((q) => {
    if (exceto !== 'disciplinas' && disciplinas.length) {
      if (!(q.disciplinas ?? []).some((d) => disciplinas.includes(d))) return false
    }
    if (exceto !== 'assuntos' && assuntos.length) {
      if (!(q.tags ?? []).some((t) => assuntos.includes(t))) return false
    }
    if (queryNorm && !norm(q.text ?? q.stem ?? '').includes(queryNorm)) return false
    return true
  })
}

function valoresDe(questions, campo) {
  const set = new Set()
  for (const q of questions) for (const v of (q[campo] ?? [])) set.add(v)
  return set
}

/**
 * Opcoes que sobraram para cada dropdown, ja ordenadas.
 *
 * O que esta marcado entra sempre, mesmo que tenha ficado sem questao: sumir
 * a opcao marcada tira do usuario o jeito de desmarcar.
 */
export function facetOptions(questions, filters = {}) {
  const { disciplinas = [], assuntos = [] } = filters
  const ordena = (arr) => [...arr].sort((a, b) => String(a).localeCompare(String(b), 'pt'))

  const disponiveisDisc = valoresDe(applyFilters(questions, filters, 'disciplinas'), 'disciplinas')
  for (const d of disciplinas) disponiveisDisc.add(d)

  const disponiveisAss = valoresDe(applyFilters(questions, filters, 'assuntos'), 'tags')
  for (const a of assuntos) disponiveisAss.add(a)

  return { disciplinas: ordena(disponiveisDisc), assuntos: ordena(disponiveisAss) }
}

/** Pares (area, ano) a carregar. Vazio/null em qualquer um significa "todos". */
export function paresParaCarregar(area, year, areas, years) {
  const as = area ? [area] : areas
  const ys = year ? [year] : years
  const out = []
  for (const a of as) for (const y of ys) out.push([a, y])
  return out
}
