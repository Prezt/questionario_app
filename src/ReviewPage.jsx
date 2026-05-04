// src/ReviewPage.jsx
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import './ReviewPage.css'

const AREA_TO_DAY = {
  linguagens: 'd1',
  humanas: 'd1',
  nature: 'd2',
  math: 'd2',
}
const FLAGS_KEY = 'review-flags'
const ALL_FILES = [
  'humanas_enem_2018','humanas_enem_2019','humanas_enem_2020','humanas_enem_2021',
  'humanas_enem_2022','humanas_enem_2023','humanas_enem_2024','humanas_enem_2025',
  'linguagens_enem_2018','linguagens_enem_2019','linguagens_enem_2020','linguagens_enem_2021',
  'linguagens_enem_2022','linguagens_enem_2023','linguagens_enem_2024','linguagens_enem_2025',
  'math_enem_2018','math_enem_2019','math_enem_2020','math_enem_2021',
  'math_enem_2022','math_enem_2023','math_enem_2024','math_enem_2025',
  'nature_enem_2018','nature_enem_2019','nature_enem_2020','nature_enem_2021',
  'nature_enem_2022','nature_enem_2023','nature_enem_2024','nature_enem_2025',
].map(f => f + '.json')

function loadFlags() {
  try { return JSON.parse(localStorage.getItem(FLAGS_KEY) || '{}') } catch { return {} }
}
function saveFlags(flags) {
  localStorage.setItem(FLAGS_KEY, JSON.stringify(flags))
}
function flagKey(file, questionNumber, language) {
  const base = `${file.replace('.json', '')}_${questionNumber}`
  return language ? `${base}_${language}` : base
}
function pageMapKey(year, area, number) {
  return `${year}_${AREA_TO_DAY[area] ?? 'd1'}_${number}`
}
function getAuditIssues(auditReport, file, questionNumber) {
  const fr = auditReport?.byFile?.[file]
  if (!fr) return []
  const qi = fr.questionIssues.find(qi => qi.number === questionNumber)
  return qi ? qi.issues : []
}

// ── Rich text rendering ────────────────────────────────────────────────────
function escapeInline(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/&lt;b&gt;/gi, '<strong>').replace(/&lt;\/b&gt;/gi, '</strong>')
    .replace(/&lt;i&gt;/gi, '<em>').replace(/&lt;\/i&gt;/gi, '</em>')
    .replace(/&lt;sub&gt;/gi, '<sub>').replace(/&lt;\/sub&gt;/gi, '</sub>')
    .replace(/&lt;sup&gt;/gi, '<sup>').replace(/&lt;\/sup&gt;/gi, '</sup>')
    .replace(/<sup>(.*?)<\/sup><sub>(.*?)<\/sub>/g, '<span class="supsub"><sup>$1</sup><sub>$2</sub></span>')
    .replace(/&lt;center&gt;/gi, '<span class="txt-center">').replace(/&lt;\/center&gt;/gi, '</span>')
}
function parseMarkdownTable(tableLines) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const dataRows = tableLines.filter(l => !/^\|[\s\-:|]+\|$/.test(l.trim()))
  if (!dataRows.length) return ''
  const parseRow = l => l.split('|').slice(1, -1).map(c => c.trim())
  const [header, ...body] = dataRows
  const ths = parseRow(header).map(c => `<th>${esc(c)}</th>`).join('')
  const trs = body.map(l => `<tr>${parseRow(l).map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')
  return `<table class="q-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`
}
function richHtml(text) {
  if (!text) return ''
  const lines = text.split('\n')
  const parts = []
  let tableLines = [], plainLines = []
  const flushPlain = () => { if (plainLines.length) { parts.push(escapeInline(plainLines.join('\n'))); plainLines = [] } }
  const flushTable = () => { if (tableLines.length) { parts.push(parseMarkdownTable(tableLines)); tableLines = [] } }
  for (const line of lines) {
    if (line.trim().startsWith('|')) { flushPlain(); tableLines.push(line) }
    else { flushTable(); plainLines.push(line) }
  }
  flushPlain(); flushTable()
  return parts.join('')
}
function RichText({ text, className }) {
  if (!text) return null
  return <span className={className} dangerouslySetInnerHTML={{ __html: richHtml(text) }} />
}

// ── Portuguese accent correction ───────────────────────────────────────────
const PT_ACCENT_MAP = {
  // Particles, conjunctions, prepositions
  'tres': 'três',
  'nao': 'não', 'tambem': 'também', 'entao': 'então', 'porem': 'porém',
  'alem': 'além', 'atraves': 'através', 'apos': 'após', 'ate': 'até',
  'so': 'só', 'la': 'lá', 'ca': 'cá', 'ja': 'já', 'ha': 'há',
  'voce': 'você', 'voces': 'vocês',
  'ora': 'ora', 'propria': 'própria', 'proprio': 'próprio', 'proprios': 'próprios', 'proprias': 'próprias',
  'vario': 'vário', 'varia': 'vária', 'varios': 'vários', 'varias': 'várias',
  'conjuge': 'cônjuge', 'conjuges': 'cônjuges',

  // Common verbs / verb forms
  'esta': 'está', 'estao': 'estão', 'estao': 'estão',
  'sao': 'são', 'vao': 'vão', 'dao': 'dão', 'trao': 'trarão',
  'sera': 'será', 'serao': 'serão', 'seria': 'seria',
  'podera': 'poderá', 'poderao': 'poderão',
  'devera': 'deverá', 'deverao': 'deverão',

  // Nouns — nation/society/politics (common in humanas/linguagens)
  'nacao': 'nação', 'nacoes': 'nações',
  'populacao': 'população', 'populacoes': 'populações',
  'educacao': 'educação', 'situacao': 'situação', 'situacoes': 'situações',
  'questao': 'questão', 'questoes': 'questões',
  'relacao': 'relação', 'relacoes': 'relações',
  'producao': 'produção', 'producoes': 'produções',
  'informacao': 'informação', 'informacoes': 'informações',
  'organizacao': 'organização', 'organizacoes': 'organizações',
  'comunicacao': 'comunicação', 'comunicacoes': 'comunicações',
  'constituicao': 'constituição', 'instituicao': 'instituição', 'instituicoes': 'instituições',
  'democracia': 'democracia', 'participacao': 'participação',
  'administracao': 'administração', 'gestao': 'gestão',
  'valorizacao': 'valorização', 'transformacao': 'transformação', 'transformacoes': 'transformações',
  'representacao': 'representação', 'representacoes': 'representações',
  'civilizacao': 'civilização', 'civilizacoes': 'civilizações',
  'globalizacao': 'globalização', 'integracao': 'integração',
  'discriminacao': 'discriminação', 'dominacao': 'dominação',
  'exploracao': 'exploração', 'colonizacao': 'colonização',
  'revolucao': 'revolução', 'revolucoes': 'revoluções',
  'solucao': 'solução', 'solucoes': 'soluções',
  'definicao': 'definição', 'definicoes': 'definições',
  'acoes': 'ações', 'acao': 'ação',
  'condicao': 'condição', 'condicoes': 'condições',
  'funcao': 'função', 'funcoes': 'funções',

  // Nouns — culture/arts/language
  'lingua': 'língua', 'linguas': 'línguas',
  'musica': 'música', 'musicas': 'músicas',
  'historia': 'história', 'historias': 'histórias',
  'ciencia': 'ciência', 'ciencias': 'ciências',
  'fisica': 'física', 'quimica': 'química', 'matematica': 'matemática',
  'pratica': 'prática', 'praticas': 'práticas',
  'teoria': 'teoria', 'genero': 'gênero', 'generos': 'gêneros',
  'periodo': 'período', 'periodos': 'períodos',
  'seculo': 'século', 'seculos': 'séculos',
  'area': 'área', 'areas': 'áreas',
  'carater': 'caráter', 'caracteres': 'caracteres',
  'fenomeno': 'fenômeno', 'fenomenos': 'fenômenos',
  'orgao': 'órgão', 'orgaos': 'órgãos',
  'nivel': 'nível', 'niveis': 'níveis',
  'obstaculo': 'obstáculo', 'obstaculos': 'obstáculos',
  'simbolo': 'símbolo', 'simbolos': 'símbolos',
  'indice': 'índice', 'indices': 'índices',
  'numero': 'número', 'numeros': 'números',
  'codigo': 'código', 'codigos': 'códigos',

  // Adjectives — common proparoxytones
  'publico': 'público', 'publica': 'pública', 'publicos': 'públicos', 'publicas': 'públicas',
  'unico': 'único', 'unica': 'única', 'unicos': 'únicos', 'unicas': 'únicas',
  'historico': 'histórico', 'historica': 'histórica', 'historicos': 'históricos', 'historicas': 'históricas',
  'politico': 'político', 'politica': 'política', 'politicos': 'políticos', 'politicas': 'políticas',
  'economico': 'econômico', 'economica': 'econômica', 'economicos': 'econômicos', 'economicas': 'econômicas',
  'basico': 'básico', 'basica': 'básica', 'basicos': 'básicos', 'basicas': 'básicas',
  'etico': 'ético', 'etica': 'ética', 'eticos': 'éticos', 'eticas': 'éticas',
  'critico': 'crítico', 'critica': 'crítica', 'criticos': 'críticos', 'criticas': 'críticas',
  'logico': 'lógico', 'logica': 'lógica', 'logicos': 'lógicos', 'logicas': 'lógicas',
  'tipico': 'típico', 'tipica': 'típica', 'tipicos': 'típicos', 'tipicas': 'típicas',
  'classico': 'clássico', 'classica': 'clássica', 'classicos': 'clássicos', 'classicas': 'clássicas',
  'especifico': 'específico', 'especifica': 'específica', 'especificos': 'específicos', 'especificas': 'específicas',
  'especie': 'espécie', 'especies': 'espécies',
  'acude': 'açude', 'acudes': 'açudes',
  'cientifico': 'científico', 'cientifica': 'científica', 'cientificos': 'científicos', 'cientificas': 'científicas',
  'dificil': 'difícil', 'dificeis': 'difíceis',
  'pessimo': 'péssimo', 'pessima': 'péssima', 'pessimos': 'péssimos', 'pessimas': 'péssimas',
  'otimo': 'ótimo', 'otima': 'ótima', 'otimos': 'ótimos', 'otimas': 'ótimas',
  'identico': 'idêntico', 'identica': 'idêntica', 'identicos': 'idênticos', 'identicas': 'idênticas',
  'destroco': 'destroço', 'destrocos': 'destroços',
  'cartografica': 'cartográfica', 'cartograficas': 'cartográficas', 'cartografico': 'cartográfico', 'cartograficos': 'cartográficos',
  'apareca': 'apareça', 'aparecam': 'apareçam',
  'jonio': 'jônio', 'jonia': 'jônia', 'jonios': 'jônios', 'jonias': 'jônias',
  'solidario': 'solidário', 'solidaria': 'solidária', 'solidarios': 'solidários', 'solidarias': 'solidárias',
  'atribuido': 'atribuído', 'atribuida': 'atribuída', 'atribuidos': 'atribuídos', 'atribuidas': 'atribuídas',
  'facil': 'fácil', 'faceis': 'fáceis',
  'possivel': 'possível', 'possiveis': 'possíveis',
  'necessario': 'necessário', 'necessaria': 'necessária', 'necessarios': 'necessários', 'necessarias': 'necessárias',
  'especial': 'especial', 'importante': 'importante',
  'util': 'útil', 'uteis': 'úteis',
  'fragil': 'frágil', 'frageis': 'frágeis',
  'agil': 'ágil', 'ageis': 'ágeis',
  'filmico': 'fílmico', 'filmica': 'fílmica', 'filmicos': 'fílmicos', 'filmicas': 'fílmicas',
  'lirico': 'lírico', 'lirica': 'lírica', 'liricos': 'líricos', 'liricas': 'líricas',
  'epico': 'épico', 'epica': 'épica', 'epicos': 'épicos', 'epicas': 'épicas',
  'ironico': 'irônico', 'ironica': 'irônica', 'ironicos': 'irônicos', 'ironicas': 'irônicas',
  'satirico': 'satírico', 'satirica': 'satírica', 'satiricos': 'satíricos', 'satiricas': 'satíricas',
  'tematico': 'temático', 'tematica': 'temática', 'tematicos': 'temáticos', 'tematicas': 'temáticas',
  'dramatico': 'dramático', 'dramatica': 'dramática', 'dramaticos': 'dramáticos', 'dramaticas': 'dramáticas',
  'academico': 'acadêmico', 'academica': 'acadêmica', 'academicos': 'acadêmicos', 'academicas': 'acadêmicas',
  'comico': 'cômico', 'comica': 'cômica', 'comicos': 'cômicos', 'comicas': 'cômicas',
  'grafico': 'gráfico', 'grafica': 'gráfica', 'graficos': 'gráficos', 'graficas': 'gráficas',
  'infografico': 'infográfico', 'infografica': 'infográfica', 'infograficos': 'infográficos', 'infograficas': 'infográficas',
  'geografico': 'geográfico', 'geografica': 'geográfica', 'geograficos': 'geográficos', 'geograficas': 'geográficas',
  'biologico': 'biológico', 'biologica': 'biológica', 'biologicos': 'biológicos', 'biologicas': 'biológicas',
  'ideologico': 'ideológico', 'ideologica': 'ideológica', 'ideologicos': 'ideológicos', 'ideologicas': 'ideológicas',
  'sintatico': 'sintático', 'sintatica': 'sintática', 'sintaticos': 'sintáticos', 'sintaticas': 'sintáticas',
  'semantico': 'semântico', 'semantica': 'semântica', 'semanticos': 'semânticos', 'semanticas': 'semânticas',
  'geometrico': 'geométrico', 'geometrica': 'geométrica', 'geometricos': 'geométricos', 'geometricas': 'geométricas',
  'simetrico': 'simétrico', 'simetrica': 'simétrica', 'simetricos': 'simétricos', 'simetricas': 'simétricas',
  'molecula': 'molécula', 'moleculas': 'moléculas',
  'celula': 'célula', 'celulas': 'células',
  'silicio': 'silício',
  'eletrica': 'elétrica', 'eletricas': 'elétricas', 'eletrico': 'elétrico', 'eletricos': 'elétricos',
  'atomico': 'atômico', 'atomica': 'atômica', 'atomicos': 'atômicos', 'atomicas': 'atômicas',
  'eletronico': 'eletrônico', 'eletronica': 'eletrônica', 'eletronicos': 'eletrônicos', 'eletronicas': 'eletrônicas',
  'estetico': 'estético', 'estetica': 'estética', 'esteticos': 'estéticos', 'esteticas': 'estéticas',
  'retorico': 'retórico', 'retorica': 'retórica', 'retoricos': 'retóricos', 'retoricas': 'retóricas',
  'tecnico': 'técnico', 'tecnica': 'técnica', 'tecnicos': 'técnicos', 'tecnicas': 'técnicas',
  'magico': 'mágico', 'magica': 'mágica', 'magicos': 'mágicos', 'magicas': 'mágicas',
  'organico': 'orgânico', 'organica': 'orgânica', 'organicos': 'orgânicos', 'organicas': 'orgânicas',
  'dinamico': 'dinâmico', 'dinamica': 'dinâmica', 'dinamicos': 'dinâmicos', 'dinamicas': 'dinâmicas',
  'mecanico': 'mecânico', 'mecanica': 'mecânica', 'mecanicos': 'mecânicos', 'mecanicas': 'mecânicas',
  'fisico': 'físico', 'fisicos': 'físicos', 'fisicas': 'físicas',
  'quimico': 'químico', 'quimica': 'química', 'quimicos': 'químicos', 'quimicas': 'químicas',
  'mitico': 'mítico', 'mitica': 'mítica', 'miticos': 'míticos', 'miticas': 'míticas',
  'mistico': 'místico', 'mistica': 'mística', 'misticos': 'místicos', 'misticas': 'místicas',
  'plastico': 'plástico', 'plastica': 'plástica', 'plasticos': 'plásticos', 'plasticas': 'plásticas',

  // Nouns ending in -ência / -ança
  'lancada': 'lançada', 'lancado': 'lançado', 'lancadas': 'lançadas', 'lancados': 'lançados',
  'lancamento': 'lançamento', 'lancamentos': 'lançamentos',
  'lancar': 'lançar', 'lancou': 'lançou', 'lancam': 'lançam',
  'militancia': 'militância', 'militancias': 'militâncias',
  'tolerancia': 'tolerância', 'tolerancias': 'tolerâncias',
  'distancia': 'distância', 'distancias': 'distâncias',
  'relevancia': 'relevância', 'relevancias': 'relevâncias',
  'importancia': 'importância', 'importancias': 'importâncias',
  'substancia': 'substância', 'substancias': 'substâncias',
  'instancia': 'instância', 'instancias': 'instâncias',
  'vivencia': 'vivência', 'vivencias': 'vivências',
  'experiencia': 'experiência', 'experiencias': 'experiências',
  'consciencia': 'consciência', 'consciencias': 'consciências',
  'eficiencia': 'eficiência', 'eficiencias': 'eficiências',
  'tendencia': 'tendência', 'tendencias': 'tendências',
  'influencia': 'influência', 'influencias': 'influências',
  'violencia': 'violência', 'violencias': 'violências',
  'existencia': 'existência', 'existencias': 'existências',
  'diferenca': 'diferença', 'diferencas': 'diferenças',
  'semelhanca': 'semelhança', 'semelhancas': 'semelhanças',
  'alianca': 'aliança', 'aliancas': 'alianças',
  'lideranca': 'liderança', 'liderancas': 'lideranças',
  'confianca': 'confiança', 'confiancas': 'confianças',
  'esperanca': 'esperança', 'esperancas': 'esperanças',
  'mudanca': 'mudança', 'mudancas': 'mudanças',
  'heranca': 'herança', 'herancas': 'heranças',
  'crianca': 'criança', 'criancas': 'crianças',
  'balanca': 'balança', 'balancas': 'balanças',

  // Common nouns — proparoxytones and others
  'onus': 'ônus', 'bonus': 'bônus',
  'ocio': 'ócio',
  'vinculo': 'vínculo', 'vinculos': 'vínculos',
  'etnico': 'étnico', 'etnica': 'étnica', 'etnicos': 'étnicos', 'etnicas': 'étnicas',
  'indigena': 'indígena', 'indigenas': 'indígenas',
  'ceara': 'Ceará',
  'contemporaneo': 'contemporâneo', 'contemporanea': 'contemporânea',
  'contemporaneos': 'contemporâneos', 'contemporaneas': 'contemporâneas',
  'dialogo': 'diálogo', 'dialogos': 'diálogos',
  'imperio': 'império', 'imperios': 'impérios',
  'memoria': 'memória', 'memorias': 'memórias',
  'comercio': 'comércio',
  'metafora': 'metáfora', 'metaforas': 'metáforas',
  'analise': 'análise', 'analises': 'análises',
  'hipotese': 'hipótese', 'hipoteses': 'hipóteses',
  'sintese': 'síntese', 'sinteses': 'sínteses',
  'titulo': 'título', 'titulos': 'títulos',
  'capitulo': 'capítulo', 'capitulos': 'capítulos',
  'republica': 'república', 'republicas': 'repúblicas',
  'cidadao': 'cidadão', 'cidadaos': 'cidadãos',
  'musico': 'músico', 'musicos': 'músicos',
  'estilo': 'estilo', 'genio': 'gênio', 'genios': 'gênios',
  'proverbio': 'provérbio', 'proverbios': 'provérbios',
  'curriculo': 'currículo', 'curriculos': 'currículos',
  'criterio': 'critério', 'criterios': 'critérios',
  'exercicio': 'exercício', 'exercicios': 'exercícios',
  'beneficio': 'benefício', 'beneficios': 'benefícios',
  'principio': 'princípio', 'principios': 'princípios',
  'patrimonio': 'patrimônio', 'patrimonios': 'patrimônios',
}

// Suffix rules: [regex, replacement] applied in order when dictionary lookup fails
const PT_SUFFIX_RULES = [
  // Most specific first to avoid shorter rules stealing the match
  [/isticas$/i,  'ísticas'],  // caracteristicas → características, linguisticas → linguísticas
  [/istico$/i,   'ístico'],  // linguistico → linguístico
  [/isticos$/i,  'ísticos'], // linguisticos → linguísticos
  [/istica$/i,   'ística'],  // linguistica → linguística
  [/aveis$/i,    'áveis'],   // confrontaveis → confrontáveis, notaveis → notáveis
  [/avel$/i,     'ável'],    // notavel → notável, amavel → amável
  [/iveis$/i,    'íveis'],   // possiveis → possíveis, incrivel... plural
  [/ivel$/i,     'ível'],    // possivel → possível, incrivel → incrível
  [/ologicas$/i, 'ológicas'],  // museologicas → museológicas, biologicas → biológicas
  [/ologicos$/i, 'ológicos'],  // biologicos → biológicos
  [/ologica$/i,  'ológica'],   // biologica  → biológica
  [/ologico$/i,  'ológico'],   // biologico  → biológico
  [/encias$/i, 'ências'],  // vivencias → vivências, experiencias → experiências
  [/encia$/i,  'ência'],   // vivencia  → vivência
  [/ancias$/i, 'âncias'],  // militancias → militâncias, tolerancias → tolerâncias
  [/ancia$/i,  'ância'],   // militancia → militância
  [/ancas$/i,  'anças'],   // aliancas  → alianças, semelhancas → semelhanças
  [/anca$/i,   'ança'],    // alianca   → aliança
  [/encas$/i,  'enças'],   // pertencas → pertenças
  [/enca$/i,   'ença'],    // pertenca  → pertença
  [/arios$/i,  'ários'],   // publicitarios → publicitários, voluntarios → voluntários
  [/ario$/i,   'ário'],    // publicitario  → publicitário, voluntario  → voluntário
  [/arias$/i,  'árias'],   // publicitarias → publicitárias
  [/aria$/i,   'ária'],    // publicitaria  → publicitária
  [/coes$/i,   'ções'],    // manifestacoes → manifestações
  [/cao$/i,    'ção'],     // manifestacao  → manifestação
  [/oes$/i,    'ões'],     // broader fallback
  [/ao$/i,     'ão'],      // last resort; short words may false-positive
]

function applyCapitalisation(original, corrected) {
  if (original === original.toUpperCase()) return corrected.toUpperCase()
  if (original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase()) {
    return corrected[0].toUpperCase() + corrected.slice(1)
  }
  return corrected
}

function correctAccents(text) {
  if (!text) return text
  return text.replace(/[a-zA-ZàáâãäéêëíïóôõöúüçÀÁÂÃÄÉÊËÍÏÓÔÕÖÚÜÇ]+/g, word => {
    const lower = word.toLowerCase()

    // 1. Dictionary lookup (exact)
    const dictResult = PT_ACCENT_MAP[lower]
    if (dictResult) return applyCapitalisation(word, dictResult)

    // 2. Suffix-based fallback — only for words ≥ 5 chars to avoid false positives
    if (lower.length >= 5) {
      for (const [pattern, replacement] of PT_SUFFIX_RULES) {
        if (pattern.test(lower)) {
          const corrected = lower.replace(pattern, replacement)
          if (corrected !== lower) return applyCapitalisation(word, corrected)
        }
      }
    }

    return word
  })
}

export default function ReviewPage() {
  useEffect(() => {
    const prev = document.title
    document.title = 'Revisão'
    return () => { document.title = prev }
  }, [])

  useEffect(() => {
    const links = Array.from(document.querySelectorAll("link[rel*='icon']"))
    const prevHrefs = links.map(l => l.href)
    links.forEach(l => { l.href = l.href.replace(/favicon[^.]*\.(ico|png)/, m => 'review-' + m) })
    return () => { links.forEach((l, i) => { l.href = prevHrefs[i] }) }
  }, [])

  // datasets: { [filename]: Question[] }
  const [datasets, setDatasets] = useState({})
  const [contexts, setContexts] = useState({})
  const [auditReport, setAuditReport] = useState(null)
  const [pageMap, setPageMap] = useState({})
  const [flags, setFlags] = useState(loadFlags)
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const [auditRes, pageMapRes, contextsRes, ...questionResults] = await Promise.all([
          fetch('/audit-report.json'),
          fetch('/question-pages.json'),
          fetch('/contexts.json'),
          ...ALL_FILES.map(f => fetch(`/${f}`)),
        ])

        if (!auditRes.ok) throw new Error('Could not load audit-report.json — run: npm run audit')
        const audit = await auditRes.json()
        setAuditReport(audit)

        const pm = pageMapRes.ok ? await pageMapRes.json() : {}
        setPageMap(pm)

        const ctxs = contextsRes.ok ? await contextsRes.json() : {}
        setContexts(ctxs)

        const ds = {}
        for (let i = 0; i < ALL_FILES.length; i++) {
          if (questionResults[i].ok) {
            ds[ALL_FILES[i]] = await questionResults[i].json()
          }
        }
        setDatasets(ds)
        setReady(true)
      } catch (err) {
        setLoadError(err.message)
      }
    }
    load()
  }, [])

  // Navigation + mode state (only used after ready)
  const [mode, setMode] = useState('all')
  const [selectedFile, setSelectedFile] = useState(ALL_FILES[0])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [issueFilter, setIssueFilter] = useState(null)
  const activeItemRef = useRef(null)
  const [collapsedCtx, setCollapsedCtx] = useState({})
  const [sidebarFilter, setSidebarFilter] = useState('not-ok') // 'all' | 'not-ok'

  // ── Session timer ──────────────────────────────────────────────────────────
  const [timerState, setTimerState] = useState('idle') // 'idle' | 'running' | 'paused' | 'finished'
  const [elapsed, setElapsed] = useState(0) // seconds
  const [sessionReviewed, setSessionReviewed] = useState(0)
  const timerRef = useRef(null)
  const sessionStartFlagsRef = useRef(null)

  const formatTime = (s) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
  }

  const startTimer = useCallback(() => {
    if (timerState === 'idle') sessionStartFlagsRef.current = { ...flags }
    setTimerState('running')
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
  }, [timerState, flags])

  const pauseTimer = useCallback(() => {
    clearInterval(timerRef.current)
    setTimerState('paused')
  }, [])

  const finishTimer = useCallback(() => {
    clearInterval(timerRef.current)
    setTimerState('finished')
  }, [])

  // Keep sessionReviewed count in sync while running
  useEffect(() => {
    if (timerState !== 'running' && timerState !== 'paused') return
    if (!sessionStartFlagsRef.current) return
    const startKeys = new Set(Object.keys(sessionStartFlagsRef.current))
    const newlyReviewed = Object.keys(flags).filter(k => !startKeys.has(k)).length
    setSessionReviewed(newlyReviewed)
  }, [flags, timerState])

  useEffect(() => () => clearInterval(timerRef.current), [])

  // Derive active question list
  const activeList = useMemo(() => {
    if (!ready) return []
    if (mode === 'queue') {
      const flagged = []
      for (const [filename, fileReport] of Object.entries(auditReport?.byFile ?? {})) {
        const qs = datasets[filename] ?? []
        const flaggedNums = new Set(fileReport.questionIssues.map(qi => qi.number))
        if (fileReport.datasetIssues.length > 0 && qs.length > 0) {
          flaggedNums.add(qs[0].number)
        }
        for (const q of qs) {
          if (!flaggedNums.has(q.number)) continue
          if (issueFilter) {
            const qi = fileReport.questionIssues.find(qi => qi.number === q.number)
            if (!qi || !qi.issues.some(i => i.type === issueFilter)) continue
          }
          flagged.push({ ...q, _file: filename })
        }
      }
      const isFixed = q => ['fixed', 'ok'].includes(flags[flagKey(q._file, q.number, q.language)]?.status)
      return flagged.sort((a, b) => {
        const fa = isFixed(a) ? 1 : 0, fb = isFixed(b) ? 1 : 0
        if (fa !== fb) return fa - fb
        return a._file.localeCompare(b._file) || a.number - b.number
      })
    } else if (mode === 'all') {
      const all = []
      for (const filename of ALL_FILES) {
        for (const q of (datasets[filename] ?? [])) {
          all.push({ ...q, _file: filename })
        }
      }
      const yearOf = f => parseInt(f.match(/(\d{4})/)?.[1] ?? '0')
      return all.sort((a, b) => yearOf(b._file) - yearOf(a._file) || a.number - b.number)
    } else if (mode === 'reviewed') {
      const reviewed = []
      for (const [filename, qs] of Object.entries(datasets)) {
        for (const q of qs) {
          if (flags[flagKey(filename, q.number, q.language)]) reviewed.push({ ...q, _file: filename })
        }
      }
      const yearOf = f => parseInt(f.match(/(\d{4})/)?.[1] ?? '0')
      return reviewed.sort((a, b) => yearOf(b._file) - yearOf(a._file) || a.number - b.number)
    } else {
      return (datasets[selectedFile] ?? [])
        .map(q => ({ ...q, _file: selectedFile }))
        .sort((a, b) => a.number - b.number)
    }
  }, [mode, selectedFile, datasets, auditReport, issueFilter, flags, ready])

  // All questions across all files — used by the sidebar
  const allQuestions = useMemo(() => {
    if (!ready) return []
    const all = []
    for (const [filename, qs] of Object.entries(datasets)) {
      for (const q of qs) all.push({ ...q, _file: filename })
    }
    return all.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.number - b.number || a._file.localeCompare(b._file))
  }, [datasets, ready])

  // Set of question keys that have audit issues
  const auditIssueKeys = useMemo(() => {
    const keys = new Set()
    for (const [filename, fileReport] of Object.entries(auditReport?.byFile ?? {})) {
      fileReport.questionIssues.forEach(qi => keys.add(flagKey(filename, qi.number)))
      if (fileReport.datasetIssues.length > 0) {
        const qs = datasets[filename] ?? []
        if (qs.length > 0) keys.add(flagKey(filename, qs[0].number))
      }
    }
    return keys
  }, [auditReport, datasets])

  // overrideQuestion: set when user clicks the sidebar directly
  const [overrideQuestion, setOverrideQuestion] = useState(null)

  const currentQuestion = overrideQuestion ?? activeList[currentIndex] ?? null

  // Sidebar-filtered list — arrow keys and nav buttons navigate this
  const sidebarList = useMemo(() => {
    return allQuestions.filter(q => {
      if (sidebarFilter === 'not-ok') {
        const status = flags[flagKey(q._file, q.number, q.language)]?.status
        return status !== 'ok'
      }
      return true
    })
  }, [allQuestions, sidebarFilter, flags])

  const navigateSidebar = useCallback((delta) => {
    const cq = overrideQuestion ?? activeList[currentIndex]
    const idx = sidebarList.findIndex(q =>
      q._file === cq?._file && q.number === cq?.number && (q.language ?? null) === (cq?.language ?? null)
    )
    const next = sidebarList[Math.max(0, Math.min(sidebarList.length - 1, idx + delta))]
    if (!next) return
    const idx2 = activeList.findIndex(aq =>
      aq._file === next._file && aq.number === next.number && (aq.language ?? null) === (next.language ?? null)
    )
    if (idx2 !== -1) { setOverrideQuestion(null); setCurrentIndex(idx2) }
    else setOverrideQuestion(next)
  }, [overrideQuestion, activeList, currentIndex, sidebarList])

  // Collect all issue types present in the audit report
  const allIssueTypes = useMemo(() => {
    const types = new Set()
    for (const fr of Object.values(auditReport?.byFile ?? {})) {
      fr.questionIssues.forEach(qi => qi.issues.forEach(i => types.add(i.type)))
      fr.datasetIssues.forEach(i => types.add(i.type))
    }
    return [...types].sort()
  }, [auditReport])

  const reviewedCount = useMemo(() =>
    activeList.filter(q => flags[flagKey(q._file, q.number, q.language)]).length,
    [activeList, flags]
  )

  // PDF page state
  const [currentPdfPage, setCurrentPdfPage] = useState(1)

  useEffect(() => {
    if (!currentQuestion) return
    const key = pageMapKey(currentQuestion.year, currentQuestion.area, currentQuestion.number)
    const stem = pageMap[key]
    if (stem) {
      const parts = stem.split('-')
      const pageNum = parseInt(parts[parts.length - 1], 10)
      setCurrentPdfPage(pageNum)
    } else {
      setCurrentPdfPage(1)
    }
  }, [currentQuestion, pageMap])

  const pdfPageSrc = currentQuestion
    ? `/Pages/page-${AREA_TO_DAY[currentQuestion.area] ?? 'd1'}-${currentQuestion.year}-${String(currentPdfPage).padStart(2, '0')}.png`
    : null

  const totalPdfPages = useMemo(() => {
    if (!currentQuestion) return 32
    const day = AREA_TO_DAY[currentQuestion.area] ?? 'd1'
    const prefix = `page-${day}-${currentQuestion.year}-`
    const stems = Object.values(pageMap).filter(s => s.startsWith(prefix))
    if (stems.length === 0) return 32
    return Math.max(...stems.map(s => parseInt(s.split('-').pop(), 10)))
  }, [currentQuestion, pageMap])

  // Flag/edit tab state
  const [activeTab, setActiveTab] = useState('flag')
  const [pendingFlag, setPendingFlag] = useState({ issues: [], note: '' })

  useEffect(() => {
    if (!currentQuestion) return
    const saved = flags[flagKey(currentQuestion._file, currentQuestion.number, currentQuestion.language)]
    setPendingFlag(saved ? { issues: saved.issues ?? [], note: saved.note ?? '' } : { issues: [], note: '' })
    setActiveTab('flag')
  }, [currentQuestion])

  // Edit state
  const [draft, setDraft] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [ctxSearch, setCtxSearch] = useState('')
  const [newCtx, setNewCtx] = useState(null) // null = hidden; object = { id, title, subtitle, text, reference }

  // Suggest a context key for the current question
  const suggestContextId = useCallback(() => {
    if (!currentQuestion) return ''
    const area = currentQuestion.area ?? 'linguagens'
    const base = `enem_${currentQuestion.year}_${area}_q${currentQuestion.number}`
    let key = `${base}_ctx1`
    let n = 1
    while (contexts[key]) { n++; key = `${base}_ctx${n}` }
    return key
  }, [currentQuestion, contexts])

  const suggestImageFilename = useCallback((existingImages) => {
    if (!currentQuestion) return 'image.png'
    const num = String(currentQuestion.number).padStart(3, '0')
    const year = currentQuestion.year
    const base = `q${num}_${year}_fig`
    const usedNums = (existingImages ?? [])
      .map(p => { const m = p.match(/_fig(\d+)/); return m ? parseInt(m[1]) : 0 })
    let n = 1
    while (usedNums.includes(n)) n++
    return `${base}${n}.png`
  }, [currentQuestion])

  const uploadImage = useCallback(async (dataUrl, existingImages) => {
    const filename = suggestImageFilename(existingImages)
    const res = await fetch('/api/review/upload-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, dataUrl }),
    })
    const json = await res.json()
    if (!json.ok) throw new Error(json.error ?? 'Upload failed')
    return json.path  // e.g. "figuras/q053_2021_fig1.png"
  }, [suggestImageFilename])

  // Scroll active question into view in the list panel
  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' })
  }, [currentIndex])

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e) {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        navigateSidebar(-1)
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        navigateSidebar(1)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [navigateSidebar])

  const saveFlag = useCallback(() => {
    if (!currentQuestion || pendingFlag.issues.length === 0) return
    const fk = flagKey(currentQuestion._file, currentQuestion.number, currentQuestion.language)
    const updated = {
      ...flags,
      [fk]: {
        file: currentQuestion._file,
        questionNumber: currentQuestion.number,
        issues: pendingFlag.issues,
        note: pendingFlag.note,
        status: 'flagged',
        reviewedAt: new Date().toISOString(),
      },
    }
    saveFlags(updated)
    setFlags(updated)
    navigateSidebar(1)
  }, [currentQuestion, pendingFlag, flags, navigateSidebar])

  const markOk = useCallback(() => {
    if (!currentQuestion) return
    const fk = flagKey(currentQuestion._file, currentQuestion.number, currentQuestion.language)
    const updated = {
      ...flags,
      [fk]: {
        file: currentQuestion._file,
        questionNumber: currentQuestion.number,
        issues: [],
        note: '',
        status: 'ok',
        reviewedAt: new Date().toISOString(),
      },
    }
    saveFlags(updated)
    setFlags(updated)
    navigateSidebar(1)
  }, [currentQuestion, flags, navigateSidebar])

  // Collect contextIds for the current question (normalised to array)
  const currentContextIds = useMemo(() => {
    if (!currentQuestion) return []
    if (Array.isArray(currentQuestion.contextIds)) return currentQuestion.contextIds
    if (currentQuestion.contextId) return [currentQuestion.contextId]
    return []
  }, [currentQuestion])

  const initDraft = useCallback(() => {
    if (!currentQuestion) return
    const linkedIds = Array.isArray(currentQuestion.contextIds)
      ? [...currentQuestion.contextIds]
      : currentQuestion.contextId ? [currentQuestion.contextId] : []
    const ctxDrafts = {}
    for (const cid of linkedIds) {
      const c = contexts[cid]
      if (c) ctxDrafts[cid] = { title: c.title ?? '', subtitle: c.subtitle ?? '', text: c.text ?? '', reference: c.reference ?? '', images: [...(c.images ?? [])] }
    }
    setDraft({
      text: currentQuestion.text ?? '',
      alternatives: { ...currentQuestion.alternatives },
      answer: currentQuestion.answer ?? 'a',
      linkedContextIds: linkedIds,
      contextDrafts: ctxDrafts,
      images: [...(currentQuestion.images ?? [])],
    })
    setSaveError(null)
  }, [currentQuestion, contexts])

  const saveFix = useCallback(async () => {
    if (!currentQuestion || !draft) return
    setSaving(true)
    setSaveError(null)

    try {
      // 1. Save question fields if changed
      const qPatch = {}
      if (draft.text !== currentQuestion.text) qPatch.text = draft.text
      if (draft.answer !== currentQuestion.answer) qPatch.answer = draft.answer
      const altChanged = ['a','b','c','d','e'].some(k => draft.alternatives[k] !== currentQuestion.alternatives?.[k])
      if (altChanged) qPatch.alternatives = { ...draft.alternatives }

      // Images changed?
      const origImages = currentQuestion.images ?? []
      const imagesChanged = JSON.stringify(draft.images) !== JSON.stringify(origImages)
      if (imagesChanged) qPatch.images = draft.images

      // Context links changed?
      const origIds = Array.isArray(currentQuestion.contextIds)
        ? currentQuestion.contextIds
        : currentQuestion.contextId ? [currentQuestion.contextId] : []
      const idsChanged = JSON.stringify([...draft.linkedContextIds].sort()) !== JSON.stringify([...origIds].sort())
      if (idsChanged) {
        qPatch.contextIds = draft.linkedContextIds
        // Clear legacy singular field if it exists
        if (currentQuestion.contextId) qPatch.contextId = null
      }

      if (Object.keys(qPatch).length > 0) {
        const res = await fetch('/api/review/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: currentQuestion._file, questionNumber: currentQuestion.number, language: currentQuestion.language ?? null, patch: qPatch }),
        })
        const json = await res.json()
        if (!json.ok) throw new Error(json.error ?? 'Question save failed')

        setDatasets(prev => {
          const fileQuestions = prev[currentQuestion._file].map(q =>
            q.number === currentQuestion.number && (q.language ?? null) === (currentQuestion.language ?? null)
              ? { ...q, ...qPatch } : q
          )
          return { ...prev, [currentQuestion._file]: fileQuestions }
        })
      }

      // 2. Save each context if changed
      for (const [cid, ctxDraft] of Object.entries(draft.contextDrafts ?? {})) {
        const orig = contexts[cid]
        if (!orig) continue
        const cPatch = {}
        if (ctxDraft.title !== orig.title) cPatch.title = ctxDraft.title
        if (ctxDraft.subtitle !== orig.subtitle) cPatch.subtitle = ctxDraft.subtitle
        if (ctxDraft.text !== orig.text) cPatch.text = ctxDraft.text
        if (ctxDraft.reference !== orig.reference) cPatch.reference = ctxDraft.reference
        if (JSON.stringify(ctxDraft.images) !== JSON.stringify(orig.images ?? [])) cPatch.images = ctxDraft.images
        if (Object.keys(cPatch).length === 0) continue

        const res = await fetch('/api/review/save-context', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contextId: cid, patch: cPatch }),
        })
        const json = await res.json()
        if (!json.ok) throw new Error(`Context ${cid}: ${json.error ?? 'Save failed'}`)

        setContexts(prev => ({ ...prev, [cid]: { ...prev[cid], ...cPatch } }))
      }

      const fk = flagKey(currentQuestion._file, currentQuestion.number, currentQuestion.language)
      const updatedFlags = {
        ...flags,
        [fk]: {
          ...flags[fk],
          file: currentQuestion._file,
          questionNumber: currentQuestion.number,
          status: 'fixed',
          reviewedAt: new Date().toISOString(),
        },
      }
      saveFlags(updatedFlags)
      setFlags(updatedFlags)
      setDraft(null)
      // Do NOT advance — user controls navigation; "Looks good" is what advances
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }, [currentQuestion, draft, flags])

  const createContext = useCallback(async () => {
    if (!newCtx || !newCtx.id.trim()) return
    setSaveError(null)
    try {
      const res = await fetch('/api/review/create-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contextId: newCtx.id, context: { title: newCtx.title, subtitle: newCtx.subtitle, text: newCtx.text, reference: newCtx.reference, images: newCtx.images ?? [] } }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? 'Create failed')

      // Add to in-memory contexts
      const created = { title: newCtx.title, subtitle: newCtx.subtitle, text: newCtx.text, reference: newCtx.reference, images: newCtx.images ?? [] }
      setContexts(prev => ({ ...prev, [newCtx.id]: created }))

      // Link to draft and open its editor
      if (draft) {
        setDraft(d => ({
          ...d,
          linkedContextIds: [...d.linkedContextIds, newCtx.id],
          contextDrafts: { ...d.contextDrafts, [newCtx.id]: { ...created } },
        }))
      }
      setNewCtx(null)
    } catch (err) {
      setSaveError(err.message)
    }
  }, [newCtx, draft])

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loadError) return <div className="rp-shell"><div className="rp-loading rp-error">{loadError}</div></div>
  if (!ready) return <div className="rp-shell"><div className="rp-loading">Loading {Object.keys(datasets).length} / {ALL_FILES.length} files…</div></div>

  return (
    <div className="rp-shell">
      {/* TOP BAR */}
      <div className="rp-topbar">
        <select
          className="rp-mode-select"
          value={mode}
          onChange={e => { setMode(e.target.value); setCurrentIndex(0) }}
        >
          <option value="all">☰ Todas as questões</option>
          <option value="queue">⚠ Issue Queue ({auditReport?.summary?.totalIssues ?? '?'} flagged)</option>
          <option value="reviewed">✓ Reviewed ({Object.keys(flags).length})</option>
          <option value="file">Browse by file</option>
        </select>

        {mode === 'file' && (
          <select
            className="rp-file-select"
            value={selectedFile}
            onChange={e => { setSelectedFile(e.target.value); setCurrentIndex(0) }}
          >
            {ALL_FILES.map(f => {
              const count = datasets[f]?.length ?? 0
              const fr = auditReport?.byFile?.[f]
              const issues = fr ? fr.datasetIssues.length + fr.questionIssues.length : 0
              return (
                <option key={f} value={f}>
                  {f.replace('.json', '')} — {count} q{issues > 0 ? ` ⚠${issues}` : ''}
                </option>
              )
            })}
          </select>
        )}

        {mode === 'queue' && (
          <select
            className="rp-filter-select"
            value={issueFilter ?? ''}
            onChange={e => { setIssueFilter(e.target.value || null); setCurrentIndex(0) }}
          >
            <option value="">All issue types</option>
            {allIssueTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}

        <span className="rp-progress">
          {reviewedCount} / {activeList.length} reviewed
        </span>

        {/* Session timer */}
        <div className="rp-timer">
          {(timerState === 'running' || timerState === 'paused' || timerState === 'finished') && (
            <span className="rp-timer-display">
              <span className="rp-timer-count">{sessionReviewed} revisadas</span>
              <span className="rp-timer-sep">·</span>
              <span className={`rp-timer-clock${timerState === 'paused' ? ' rp-timer-clock--paused' : ''}`}>
                {formatTime(elapsed)}
              </span>
            </span>
          )}
          {timerState === 'idle' && (
            <button className="rp-timer-btn rp-timer-btn--start" onClick={startTimer}>▶ Iniciar</button>
          )}
          {timerState === 'running' && (
            <>
              <button className="rp-timer-btn rp-timer-btn--pause" onClick={pauseTimer}>⏸ Pausar</button>
              <button className="rp-timer-btn rp-timer-btn--finish" onClick={finishTimer}>■ Finalizar</button>
            </>
          )}
          {timerState === 'paused' && (
            <>
              <button className="rp-timer-btn rp-timer-btn--start" onClick={startTimer}>▶ Continuar</button>
              <button className="rp-timer-btn rp-timer-btn--finish" onClick={finishTimer}>■ Finalizar</button>
            </>
          )}
          {timerState === 'finished' && (
            <button className="rp-timer-btn rp-timer-btn--start" onClick={() => { setElapsed(0); setSessionReviewed(0); sessionStartFlagsRef.current = null; setTimerState('idle') }}>↺ Reiniciar</button>
          )}
        </div>

        <button
          className="rp-export-btn"
          onClick={() => {
            const blob = new Blob([JSON.stringify(flags, null, 2)], { type: 'application/json' })
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = 'review-flags.json'
            a.click()
          }}
        >
          ↓ Export flags
        </button>
      </div>

      {/* MAIN PANELS */}
      <div className="rp-main">
        {/* LEFT: PDF PAGE */}
        <div className="rp-left">
          <div className="rp-pdf-header">
            <span className="rp-pdf-label">
              {pdfPageSrc
                ? `page-${AREA_TO_DAY[currentQuestion.area] ?? 'd1'}-${currentQuestion.year}-${String(currentPdfPage).padStart(2, '0')}.png`
                : 'No page available'}
            </span>
            <div className="rp-pdf-nav">
              <button
                className="rp-pdf-nav-btn"
                onClick={() => setCurrentPdfPage(p => Math.max(1, p - 1))}
                disabled={currentPdfPage <= 1}
              >◀</button>
              <span>{currentPdfPage} / {totalPdfPages}</span>
              <button
                className="rp-pdf-nav-btn"
                onClick={() => setCurrentPdfPage(p => Math.min(totalPdfPages, p + 1))}
                disabled={currentPdfPage >= totalPdfPages}
              >▶</button>
            </div>
          </div>
          <div className="rp-pdf-body">
            {pdfPageSrc ? (
              <img
                key={pdfPageSrc}
                src={pdfPageSrc}
                alt={`PDF page ${currentPdfPage}`}
                className="rp-pdf-img"
                onError={e => { e.target.style.display = 'none' }}
              />
            ) : (
              <div className="rp-pdf-missing">No PDF page available for this question</div>
            )}
          </div>
        </div>

        {/* RIGHT: QUESTION */}
        <div className="rp-right">
          {!currentQuestion ? (
            <div className="rp-q-empty">No questions in this view</div>
          ) : (
            <>
              <div className="rp-q-header">
                <span className="rp-q-number">Q{currentQuestion.number}</span>
                <span className="rp-q-file">{currentQuestion._file.replace('.json', '')}</span>
                {(() => {
                  const fk = flagKey(currentQuestion._file, currentQuestion.number, currentQuestion.language)
                  const flag = flags[fk]
                  if (!flag) return null
                  const colors = { fixed: '#16a34a', ok: '#16a34a', flagged: '#dc2626' }
                  const labels = { fixed: '✓ Fixed', ok: '✓ OK', flagged: '⚠ Flagged' }
                  return <span className="rp-q-status" style={{ color: colors[flag.status] }}>{labels[flag.status]}</span>
                })()}
                {getAuditIssues(auditReport, currentQuestion._file, currentQuestion.number).map((issue, i) => (
                  <span key={i} className="rp-audit-badge">{issue.type}</span>
                ))}
              </div>

              <div className="rp-q-body">
                {currentContextIds.length > 0 && (
                  <div className="rp-ctx-list">
                    {currentContextIds.map(cid => {
                      const c = contexts[cid]
                      if (!c) return <div key={cid} className="rp-ctx rp-ctx--missing">Context not found: {cid}</div>
                      const isCollapsed = collapsedCtx[cid]
                      return (
                        <div key={cid} className="rp-ctx">
                          <div className="rp-ctx-header">
                            <button
                              className="rp-ctx-collapse-btn"
                              title={isCollapsed ? 'Expand' : 'Collapse'}
                              onClick={() => setCollapsedCtx(s => ({ ...s, [cid]: !s[cid] }))}
                            >{isCollapsed ? '▶' : '▼'}</button>
                            {c.title && <RichText text={c.title} className="rp-ctx-title" />}
                            {!c.title && <span className="rp-ctx-title" style={{color:'#94a3b8'}}>{cid}</span>}
                            <button
                              className="rp-ctx-edit-btn"
                              title="Edit this context"
                              onClick={() => {
                                setActiveTab('edit')
                                setDraft(prev => {
                                  // Build base draft if not yet initialized
                                  const base = prev ?? (() => {
                                    const linkedIds = Array.isArray(currentQuestion.contextIds)
                                      ? [...currentQuestion.contextIds]
                                      : currentQuestion.contextId ? [currentQuestion.contextId] : []
                                    const ctxDrafts = {}
                                    for (const id of linkedIds) {
                                      const cx = contexts[id]
                                      if (cx) ctxDrafts[id] = { title: cx.title ?? '', subtitle: cx.subtitle ?? '', text: cx.text ?? '', reference: cx.reference ?? '', images: [...(cx.images ?? [])] }
                                    }
                                    return { text: currentQuestion.text ?? '', alternatives: { ...currentQuestion.alternatives }, answer: currentQuestion.answer ?? 'a', linkedContextIds: linkedIds, contextDrafts: ctxDrafts, images: [...(currentQuestion.images ?? [])] }
                                  })()
                                  // Ensure this context is in contextDrafts
                                  if (base.contextDrafts?.[cid]) return base
                                  return { ...base, contextDrafts: { ...base.contextDrafts, [cid]: { title: c.title ?? '', subtitle: c.subtitle ?? '', text: c.text ?? '', reference: c.reference ?? '', images: [...(c.images ?? [])] } } }
                                })
                                setSaveError(null)
                              }}
                            >✏</button>
                          </div>
                          {!isCollapsed && <>
                            {c.subtitle && <RichText text={c.subtitle} className="rp-ctx-subtitle" />}
                            {c.text && <RichText text={c.text} className="rp-ctx-text" />}
                            {c.images?.length > 0 && (
                              <div className="rp-q-images">
                                {c.images.map(img => <img key={img} src={`/${img}`} alt="" className="rp-q-img" />)}
                              </div>
                            )}
                            {c.reference && <RichText text={c.reference} className="rp-ctx-reference" />}
                          </>}
                        </div>
                      )
                    })}
                  </div>
                )}
                <RichText text={currentQuestion.text} className="rp-q-text" />

                {currentQuestion.images?.length > 0 && (
                  <div className="rp-q-images">
                    {currentQuestion.images.map(img => (
                      <img key={img} src={`/${img}`} alt="" className="rp-q-img" />
                    ))}
                  </div>
                )}

                <div className="rp-q-alts">
                  {['a','b','c','d','e'].map(letter => {
                    const val = currentQuestion.alternatives?.[letter] ?? ''
                    const isEmpty = !val.trim()
                    const isCorrect = currentQuestion.answer === letter
                    return (
                      <div
                        key={letter}
                        className={`rp-alt ${isEmpty ? 'rp-alt--empty' : ''} ${isCorrect ? 'rp-alt--correct' : ''}`}
                      >
                        <span className="rp-alt-letter">{letter.toUpperCase()})</span>
                        {isEmpty ? <span className="rp-alt-text">[empty]</span> : <RichText text={val} className="rp-alt-text" />}
                      </div>
                    )
                  })}
                </div>

                {/* ACTION PANEL */}
                <div className="rp-action-panel">
                  <div className="rp-tabs">
                    <button
                      className={`rp-tab ${activeTab === 'flag' ? 'rp-tab--active' : ''}`}
                      onClick={() => setActiveTab('flag')}
                    >🚩 Flag</button>
                    <button
                      className={`rp-tab ${activeTab === 'edit' ? 'rp-tab--active' : ''}`}
                      onClick={() => { setActiveTab('edit'); if (!draft) initDraft() }}
                    >✏️ Edit</button>
                  </div>

                  {activeTab === 'flag' && (
                    <div className="rp-flag-panel">
                      <div className="rp-checkboxes">
                        {['text', 'image', 'alternatives'].map(issue => (
                          <label key={issue} className="rp-checkbox-label">
                            <input
                              type="checkbox"
                              checked={pendingFlag.issues.includes(issue)}
                              onChange={e => {
                                const next = e.target.checked
                                  ? [...pendingFlag.issues, issue]
                                  : pendingFlag.issues.filter(i => i !== issue)
                                setPendingFlag(f => ({ ...f, issues: next }))
                              }}
                            />
                            {issue} not matching
                          </label>
                        ))}
                      </div>
                      <input
                        className="rp-note-input"
                        type="text"
                        placeholder="Optional note…"
                        value={pendingFlag.note}
                        onChange={e => setPendingFlag(f => ({ ...f, note: e.target.value }))}
                      />
                      <div className="rp-flag-actions">
                        <button
                          className="rp-btn rp-btn--flag"
                          onClick={saveFlag}
                          disabled={pendingFlag.issues.length === 0}
                        >Save flag</button>
                        <button className="rp-btn rp-btn--ok" onClick={markOk}>✓ Looks good</button>
                      </div>
                    </div>
                  )}

                  {activeTab === 'edit' && (
                    <div className="rp-edit-panel">
                      {!draft ? (
                        <button className="rp-btn rp-btn--edit-start" onClick={initDraft}>
                          ✏️ Start editing Q{currentQuestion?.number}
                        </button>
                      ) : (
                        <div className="rp-edit-form">
                          {/* Context linker */}
                          <div className="rp-ctx-linker">
                            <div className="rp-edit-label" style={{marginBottom:4}}>Linked contexts</div>
                            {draft.linkedContextIds.length === 0 && (
                              <div className="rp-ctx-no-links">No contexts linked</div>
                            )}
                            <div className="rp-ctx-chips">
                              {draft.linkedContextIds.map(cid => (
                                <span key={cid} className="rp-ctx-chip">
                                  <span className="rp-ctx-chip-label" title={contexts[cid]?.title}>{cid}</span>
                                  <button
                                    className="rp-ctx-chip-remove"
                                    onClick={() => setDraft(d => {
                                      const next = d.linkedContextIds.filter(id => id !== cid)
                                      const nextDrafts = { ...d.contextDrafts }
                                      delete nextDrafts[cid]
                                      return { ...d, linkedContextIds: next, contextDrafts: nextDrafts }
                                    })}
                                  >×</button>
                                </span>
                              ))}
                            </div>
                            <div className="rp-ctx-add-row">
                              <input
                                className="rp-ctx-search"
                                type="text"
                                placeholder="Search contexts…"
                                value={ctxSearch}
                                onChange={e => setCtxSearch(e.target.value)}
                              />
                              <select
                                className="rp-ctx-select"
                                size={1}
                                onChange={e => {
                                  const cid = e.target.value
                                  if (!cid || draft.linkedContextIds.includes(cid)) return
                                  const c = contexts[cid]
                                  setDraft(d => ({
                                    ...d,
                                    linkedContextIds: [...d.linkedContextIds, cid],
                                    contextDrafts: {
                                      ...d.contextDrafts,
                                      [cid]: { title: c?.title ?? '', subtitle: c?.subtitle ?? '', text: c?.text ?? '', reference: c?.reference ?? '' },
                                    },
                                  }))
                                  setCtxSearch('')
                                  e.target.value = ''
                                }}
                              >
                                <option value="">— pick a context to link —</option>
                                {Object.entries(contexts).sort(([a], [b]) => a.localeCompare(b))
                                  .filter(([cid, c]) => {
                                    if (draft.linkedContextIds.includes(cid)) return false
                                    if (!ctxSearch) return true
                                    const q = ctxSearch.toLowerCase()
                                    return cid.toLowerCase().includes(q) || (c.title ?? '').toLowerCase().includes(q)
                                  })
                                  .map(([cid, c]) => (
                                    <option key={cid} value={cid}>
                                      {cid}{c.title && c.title !== 'undefined' ? ` — ${c.title}` : ''}
                                    </option>
                                  ))
                                }
                              </select>
                            </div>

                            {!newCtx ? (
                              <button
                                className="rp-btn rp-btn--new-ctx"
                                onClick={() => setNewCtx({ id: suggestContextId(), title: '', subtitle: '', text: '', reference: '', images: [] })}
                              >+ Create new context</button>
                            ) : (
                              <div className="rp-new-ctx-form">
                                <div className="rp-edit-label" style={{marginBottom:2}}>New context key</div>
                                <input
                                  className="rp-ctx-search"
                                  type="text"
                                  value={newCtx.id}
                                  onChange={e => setNewCtx(c => ({ ...c, id: e.target.value }))}
                                  placeholder="e.g. enem_2021_humanas_q53_ctx1"
                                />
                                <input className="rp-edit-alt-input" type="text" placeholder="Title" value={newCtx.title}
                                  onChange={e => setNewCtx(c => ({ ...c, title: e.target.value }))} />
                                <input className="rp-edit-alt-input" type="text" placeholder="Subtitle" value={newCtx.subtitle}
                                  onChange={e => setNewCtx(c => ({ ...c, subtitle: e.target.value }))} />
                                <textarea className="rp-edit-textarea rp-edit-textarea--ctx" rows={5} placeholder="Context text…"
                                  value={newCtx.text} onChange={e => setNewCtx(c => ({ ...c, text: e.target.value }))} />
                                <input className="rp-edit-alt-input" type="text" placeholder="Reference / source" value={newCtx.reference}
                                  onChange={e => setNewCtx(c => ({ ...c, reference: e.target.value }))} />
                                {newCtx.images?.length > 0 && (
                                  <div className="rp-edit-img-list">
                                    {newCtx.images.map((img, i) => (
                                      <div key={img} className="rp-edit-img-card">
                                        <img src={`/${img}`} className="rp-edit-img-preview" alt="" />
                                        <div className="rp-edit-img-row">
                                          <span className="rp-edit-img-name">{img.replace('figuras/', '')}</span>
                                          <button className="rp-edit-img-remove"
                                            onClick={() => setNewCtx(c => ({ ...c, images: c.images.filter((_, j) => j !== i) }))}>×</button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div
                                  className="rp-paste-zone"
                                  tabIndex={0}
                                  onPaste={async e => {
                                    const item = [...e.clipboardData.items].find(it => it.type.startsWith('image/'))
                                    if (!item) return
                                    e.preventDefault()
                                    const blob = item.getAsFile()
                                    const reader = new FileReader()
                                    reader.onload = async ev => {
                                      try {
                                        const imgPath = await uploadImage(ev.target.result, newCtx.images ?? [])
                                        setNewCtx(c => ({ ...c, images: [...(c.images ?? []), imgPath] }))
                                      } catch (err) {
                                        setSaveError('Image upload failed: ' + err.message)
                                      }
                                    }
                                    reader.readAsDataURL(blob)
                                  }}
                                >
                                  Click here, then paste an image (Ctrl+V / ⌘V)
                                </div>
                                <div className="rp-edit-actions">
                                  <button className="rp-btn rp-btn--save" onClick={createContext}>Create &amp; link</button>
                                  <button className="rp-btn rp-btn--cancel" onClick={() => setNewCtx(null)}>Cancel</button>
                                </div>
                                {saveError && <div className="rp-save-error">{saveError}</div>}
                              </div>
                            )}
                          </div>

                          {/* Context editors — one per context linked to this question */}
                          {Object.entries(draft.contextDrafts ?? {}).map(([cid, ctxDraft]) => (
                            <div key={cid} className="rp-edit-ctx-block">
                              <div className="rp-edit-ctx-id">{cid}</div>
                              <label className="rp-edit-label">
                                Title
                                <input
                                  className="rp-edit-alt-input"
                                  type="text"
                                  value={ctxDraft.title}
                                  onChange={e => setDraft(d => ({
                                    ...d,
                                    contextDrafts: { ...d.contextDrafts, [cid]: { ...d.contextDrafts[cid], title: e.target.value } }
                                  }))}
                                />
                              </label>
                              <label className="rp-edit-label">
                                Subtitle
                                <input
                                  className="rp-edit-alt-input"
                                  type="text"
                                  value={ctxDraft.subtitle}
                                  onChange={e => setDraft(d => ({
                                    ...d,
                                    contextDrafts: { ...d.contextDrafts, [cid]: { ...d.contextDrafts[cid], subtitle: e.target.value } }
                                  }))}
                                />
                              </label>
                              <label className="rp-edit-label">
                                Context text
                                <textarea
                                  className="rp-edit-textarea rp-edit-textarea--ctx"
                                  value={ctxDraft.text}
                                  rows={6}
                                  onChange={e => setDraft(d => ({
                                    ...d,
                                    contextDrafts: { ...d.contextDrafts, [cid]: { ...d.contextDrafts[cid], text: e.target.value } }
                                  }))}
                                />
                              </label>
                              <label className="rp-edit-label">
                                Reference / source
                                <input
                                  className="rp-edit-alt-input"
                                  type="text"
                                  value={ctxDraft.reference}
                                  onChange={e => setDraft(d => ({
                                    ...d,
                                    contextDrafts: { ...d.contextDrafts, [cid]: { ...d.contextDrafts[cid], reference: e.target.value } }
                                  }))}
                                />
                              </label>
                              {/* Context images */}
                              <div className="rp-edit-images">
                                <span className="rp-edit-images-label">Images</span>
                                {ctxDraft.images?.length > 0 && (
                                  <div className="rp-edit-img-list">
                                    {ctxDraft.images.map((img, i) => (
                                      <div key={img} className="rp-edit-img-card">
                                        <img src={`/${img}`} className="rp-edit-img-preview" alt="" />
                                        <div className="rp-edit-img-row">
                                          <span className="rp-edit-img-name">{img.replace('figuras/', '')}</span>
                                          <button
                                            className="rp-edit-img-remove"
                                            title="Remove image"
                                            onClick={() => setDraft(d => ({
                                              ...d,
                                              contextDrafts: { ...d.contextDrafts, [cid]: { ...d.contextDrafts[cid], images: d.contextDrafts[cid].images.filter((_, j) => j !== i) } }
                                            }))}
                                          >×</button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div
                                  className="rp-paste-zone"
                                  tabIndex={0}
                                  onPaste={async e => {
                                    const item = [...e.clipboardData.items].find(it => it.type.startsWith('image/'))
                                    if (!item) return
                                    e.preventDefault()
                                    const blob = item.getAsFile()
                                    const reader = new FileReader()
                                    reader.onload = async ev => {
                                      try {
                                        const imgPath = await uploadImage(ev.target.result, ctxDraft.images ?? [])
                                        setDraft(d => ({
                                          ...d,
                                          contextDrafts: { ...d.contextDrafts, [cid]: { ...d.contextDrafts[cid], images: [...(d.contextDrafts[cid].images ?? []), imgPath] } }
                                        }))
                                      } catch (err) {
                                        setSaveError('Image upload failed: ' + err.message)
                                      }
                                    }
                                    reader.readAsDataURL(blob)
                                  }}
                                >
                                  Click here, then paste an image (Ctrl+V / ⌘V)
                                </div>
                              </div>
                            </div>
                          ))}

                          <label className="rp-edit-label">
                            Question text
                            <textarea
                              className="rp-edit-textarea"
                              value={draft.text}
                              rows={4}
                              onChange={e => setDraft(d => ({ ...d, text: e.target.value }))}
                            />
                          </label>

                          <div className="rp-edit-alts-grid">
                            {['a','b','c','d','e'].map(letter => (
                              <label key={letter} className="rp-edit-alt-label">
                                <span className="rp-edit-alt-letter">{letter.toUpperCase()}</span>
                                <input
                                  className="rp-edit-alt-input"
                                  type="text"
                                  value={draft.alternatives[letter] ?? ''}
                                  onChange={e => setDraft(d => ({
                                    ...d,
                                    alternatives: { ...d.alternatives, [letter]: e.target.value }
                                  }))}
                                />
                              </label>
                            ))}
                          </div>

                          <label className="rp-edit-label rp-edit-answer-label">
                            Answer
                            <select
                              className="rp-edit-answer-select"
                              value={draft.answer ?? ''}
                              onChange={e => setDraft(d => ({ ...d, answer: e.target.value }))}
                            >
                              {['a','b','c','d','e','annulled'].map(v => (
                                <option key={v} value={v}>{v}</option>
                              ))}
                            </select>
                          </label>

                          {/* Images */}
                          <div className="rp-edit-images">
                            <span className="rp-edit-images-label">Images</span>
                            {draft.images.length > 0 && (
                              <div className="rp-edit-img-list">
                                {draft.images.map((img, i) => (
                                  <div key={img} className="rp-edit-img-card">
                                    <img src={`/${img}`} className="rp-edit-img-preview" alt="" />
                                    <div className="rp-edit-img-row">
                                      <span className="rp-edit-img-name">{img.replace('figuras/', '')}</span>
                                      <button
                                        className="rp-edit-img-remove"
                                        title="Remove image"
                                        onClick={() => setDraft(d => ({ ...d, images: d.images.filter((_, j) => j !== i) }))}
                                      >×</button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div
                              className="rp-paste-zone"
                              tabIndex={0}
                              onPaste={async e => {
                                const item = [...e.clipboardData.items].find(it => it.type.startsWith('image/'))
                                if (!item) return
                                e.preventDefault()
                                const blob = item.getAsFile()
                                const reader = new FileReader()
                                reader.onload = async ev => {
                                  try {
                                    const path = await uploadImage(ev.target.result, draft.images)
                                    setDraft(d => ({ ...d, images: [...d.images, path] }))
                                  } catch (err) {
                                    setSaveError('Image upload failed: ' + err.message)
                                  }
                                }
                                reader.readAsDataURL(blob)
                              }}
                            >
                              Click here, then paste an image (Ctrl+V / ⌘V)
                            </div>
                          </div>

                          {saveError && <div className="rp-save-error">{saveError}</div>}

                          <div className="rp-edit-actions">
                            <button
                              className="rp-btn rp-btn--save"
                              onClick={saveFix}
                              disabled={saving}
                            >{saving ? 'Saving…' : 'Save fix'}</button>
                            <button
                              className="rp-btn rp-btn--cancel"
                              onClick={() => { setDraft(null); setSaveError(null) }}
                              disabled={saving}
                            >Cancel</button>
                            <button
                              className="rp-btn rp-btn--accent"
                              title="Auto-correct Portuguese accents in all text fields"
                              onClick={() => setDraft(d => {
                                const fixedCtxDrafts = {}
                                for (const [cid, c] of Object.entries(d.contextDrafts ?? {})) {
                                  fixedCtxDrafts[cid] = {
                                    title: correctAccents(c.title),
                                    subtitle: correctAccents(c.subtitle),
                                    text: correctAccents(c.text),
                                    reference: correctAccents(c.reference),
                                  }
                                }
                                return {
                                  ...d,
                                  text: correctAccents(d.text),
                                  alternatives: Object.fromEntries(
                                    Object.entries(d.alternatives).map(([k, v]) => [k, correctAccents(v)])
                                  ),
                                  contextDrafts: fixedCtxDrafts,
                                }
                              })}
                            >Aa→ Fix accents</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* FAR RIGHT: QUESTION LIST */}
        <div className="rp-qlist">
          <div className="rp-qlist-filters">
            <button className={`rp-qlist-filter-btn${sidebarFilter === 'all' ? ' active' : ''}`} onClick={() => setSidebarFilter('all')} title="Show all questions">All</button>
            <button className={`rp-qlist-filter-btn${sidebarFilter === 'not-ok' ? ' active' : ''}`} onClick={() => setSidebarFilter('not-ok')} title="Show questions not marked as OK">≠OK</button>
          </div>
          {(() => {
            const filtered = allQuestions.filter(q => {
              if (sidebarFilter === 'not-ok') {
                const status = flags[flagKey(q._file, q.number, q.language)]?.status
                return status !== 'ok'
              }
              return true
            })
            const items = []
            let lastYear = null
            filtered.forEach((q, idx) => {
              if (q.year !== lastYear) {
                items.push(<div key={`year-${q.year}`} className="rp-qlist-year">{q.year}</div>)
                lastYear = q.year
              }
              const fk = flagKey(q._file, q.number, q.language)
              const flag = flags[fk]
              const status = flag?.status
              const hasIssue = auditIssueKeys.has(fk)
              const langMatch = (a, b) => (a?.language ?? null) === (b?.language ?? null)
              const isCurrent = overrideQuestion
                ? overrideQuestion._file === q._file && overrideQuestion.number === q.number && langMatch(overrideQuestion, q)
                : currentQuestion?._file === q._file && currentQuestion?.number === q.number && langMatch(currentQuestion, q)
              items.push(
                <button
                  key={`${fk}_${q.language ?? 'pt'}_${idx}`}
                  ref={isCurrent ? activeItemRef : null}
                  className={`rp-qlist-item${isCurrent ? ' rp-qlist-item--active' : ''} ${status ? `rp-qlist-item--${status}` : ''}`}
                  onClick={() => {
                    const idx2 = activeList.findIndex(aq => aq._file === q._file && aq.number === q.number && langMatch(aq, q))
                    if (idx2 !== -1) { setOverrideQuestion(null); setCurrentIndex(idx2) }
                    else setOverrideQuestion(q)
                  }}
                  title={`${q._file.replace('.json','').replace('_enem_',' ')} Q${q.number}`}
                >
                  <span className="rp-qlist-num">{q.number}</span>
                  {status === 'fixed' && <span className="rp-qlist-dot rp-qlist-dot--fixed" />}
                  {status === 'ok' && <span className="rp-qlist-dot rp-qlist-dot--ok" />}
                  {status === 'flagged' && <span className="rp-qlist-dot rp-qlist-dot--flagged" />}
                  {!status && hasIssue && <span className="rp-qlist-dot rp-qlist-dot--issue" />}
                </button>
              )
            })
            return items
          })()}
        </div>
      </div>

      {/* BOTTOM NAV */}
      <div className="rp-bottom">
        <button className="rp-nav-btn" onClick={() => navigateSidebar(-1)}>← Prev</button>
        <button className="rp-nav-btn" onClick={() => navigateSidebar(1)}>Next →</button>
        <span className="rp-nav-hint">or use ← → keys</span>
        <span className="rp-nav-progress">
          {(() => {
            const cq = overrideQuestion ?? activeList[currentIndex]
            const pos = sidebarList.findIndex(q =>
              q._file === cq?._file && q.number === cq?.number && (q.language ?? null) === (cq?.language ?? null)
            )
            return `${pos + 1} of ${sidebarList.length}`
          })()}
          {currentQuestion && ` — Q${currentQuestion.number} (${currentQuestion._file.replace('.json', '')})`}
        </span>
      </div>
    </div>
  )
}
