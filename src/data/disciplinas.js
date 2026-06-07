// Discipline taxonomy. See docs/superpowers/specs/2026-06-07-discipline-tagging-design.md
// Slugs are ascii lowercase; labels keep accents for display.

export const DISCIPLINAS_BY_AREA = {
  linguagens: ['portugues', 'literatura', 'ingles', 'espanhol', 'artes', 'educacao_fisica'],
  humanas:    ['historia', 'geografia', 'filosofia', 'sociologia'],
  nature:     ['fisica', 'quimica', 'biologia'],
  math:       ['matematica'],
}

export const DISCIPLINA_LABELS = {
  portugues:          'Português',
  literatura:         'Literatura',
  ingles:             'Inglês',
  espanhol:           'Espanhol',
  artes:              'Artes',
  educacao_fisica:    'Educação Física',
  historia:           'História',
  geografia:          'Geografia',
  filosofia:          'Filosofia',
  sociologia:         'Sociologia',
  fisica:             'Física',
  quimica:            'Química',
  biologia:           'Biologia',
  matematica:         'Matemática',
}

export const ALL_DISCIPLINAS = Object.values(DISCIPLINAS_BY_AREA).flat()

export const DISCIPLINA_AREA = Object.fromEntries(
  Object.entries(DISCIPLINAS_BY_AREA).flatMap(
    ([area, slugs]) => slugs.map((slug) => [slug, area])
  )
)

export function disciplinaLabel(slug) {
  if (slug == null) return null
  return DISCIPLINA_LABELS[slug] ?? slug
}

export function areaForDisciplina(slug) {
  return DISCIPLINA_AREA[slug] ?? null
}
