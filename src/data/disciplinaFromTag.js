// Tag → disciplina mapping. Keyed by `${area}::${tag}` because some tags
// (e.g. "climatologia") mean different disciplinas in different areas.
// See docs/superpowers/specs/2026-06-07-discipline-tagging-design.md §"Tag → disciplina mapping".

const M = {}
const add = (area, tag, disciplina) => {
  M[`${area}::${tag}`] = disciplina
}

// ── Nature → Física ──────────────────────────────────────────────────────────
for (const t of [
  'eletricidade e magnetismo', 'mecânica newtoniana', 'termologia',
  'física moderna', 'óptica', 'ondulatória e acústica', 'ondulatória',
  'física nuclear e radioatividade', 'física nuclear',
  'gravitação e astronomia', 'cinemática', 'hidrostática',
  'análise de circuitos', 'transferência de calor', 'energia e conservação',
  'dispersão da luz', 'energia e trabalho', 'pressão', 'física',
]) add('nature', t, 'fisica')

// ── Nature → Química ─────────────────────────────────────────────────────────
for (const t of [
  'química geral e inorgânica', 'química orgânica',
  'termoquímica e cinética', 'termoquímica', 'estequiometria',
  'soluções e solubilidade', 'eletroquímica', 'equilíbrio químico',
  'cinética química', 'análise qualitativa', 'ligações químicas',
  'propriedades dos líquidos',
  'chemistry estrutura molecular', // sic — verbatim tag from public/nature_enem_2021.json
]) add('nature', t, 'quimica')

// ── Nature → Biologia ────────────────────────────────────────────────────────
for (const t of [
  'ecologia', 'fisiologia humana', 'genética e hereditariedade',
  'microbiologia e imunologia', 'microbiologia',
  'imunologia e microbiologia', 'citologia', 'biotecnologia',
  'evolução', 'zoologia', 'botânica', 'comportamento animal',
  'biologia molecular', 'sistema nervoso', 'fisiologia de plantas',
  'fisiologia vegetal', 'reprodução vegetal', 'epidemiologia',
  'endocrinologia', 'meio ambiente e sustentabilidade', 'biologia',
  'climatologia',
]) add('nature', t, 'biologia')

// ── Humanas → História ───────────────────────────────────────────────────────
for (const t of [
  'história moderna', 'história contemporânea',
  'história do brasil república', 'história do brasil colonial',
  'história do brasil imperial', 'história do brasil império',
  'história antiga e medieval', 'história medieval',
  'história moderna e contemporânea', 'história contemporânea do brasil',
  'história da cultura e arte', 'história das cruzadas',
]) add('humanas', t, 'historia')

// ── Humanas → Geografia ──────────────────────────────────────────────────────
for (const t of [
  'geografia humana e urbana', 'geografia física e geologia',
  'geopolítica e território', 'geopolítica e relações internacionais',
  'climatologia', 'cartografia',
  'clima e processos geomorfológicos',
  'geografia: cartografia', 'geografia: geografia humana e urbana',
  'meio ambiente e sustentabilidade',
]) add('humanas', t, 'geografia')

// ── Humanas → Filosofia ──────────────────────────────────────────────────────
for (const t of [
  'filosofia moderna e contemporânea', 'filosofia antiga e medieval',
  'ética e política', 'epistemologia e lógica',
  'filosofia e sociologia', 'filosofia e educação',
]) add('humanas', t, 'filosofia')

// ── Humanas → Sociologia ─────────────────────────────────────────────────────
for (const t of [
  'sociologia e estrutura social', 'cultura e identidade',
  'direitos humanos e cidadania', 'comunicação e mídia',
  'institucionalismo religioso', 'política e direitos humanos',
  'ciência e tecnologia', 'educação e políticas públicas',
]) add('humanas', t, 'sociologia')

// ── Linguagens → Português ───────────────────────────────────────────────────
for (const t of [
  'interpretação de texto', 'linguística e variação linguística',
  'gêneros textuais',
]) add('linguagens', t, 'portugues')

// ── Linguagens → Literatura ──────────────────────────────────────────────────
for (const t of [
  'literatura brasileira', 'literatura mundial',
]) add('linguagens', t, 'literatura')

// ── Linguagens → Língua Estrangeira ──────────────────────────────────────────
for (const t of [
  'língua espanhola', 'língua inglesa',
]) add('linguagens', t, 'lingua_estrangeira')

// ── Linguagens → Artes ───────────────────────────────────────────────────────
for (const t of [
  'artes visuais', 'música e dança', 'história da cultura e arte',
]) add('linguagens', t, 'artes')

export const TAG_TO_DISCIPLINA = Object.freeze({ ...M })

export function disciplinasForTag(area, tag) {
  const slug = M[`${area}::${tag}`]
  return slug ? [slug] : []
}

export function disciplinasForQuestion(question) {
  if (!question) return []
  if (question.area === 'math') return ['matematica']

  const set = new Set()
  for (const tag of question.tags ?? []) {
    const slug = M[`${question.area}::${tag}`]
    if (slug) set.add(slug)
  }
  if (question.area === 'linguagens' &&
      (question.language === 'en' || question.language === 'es')) {
    set.add('lingua_estrangeira')
  }
  return [...set].sort()
}
