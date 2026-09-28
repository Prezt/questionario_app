// URL propria de uma questao: /2023/10.
//
// O par (ano, numero) endereca 1451 das 1491 questoes do banco. As outras 40
// sao as questoes 1 a 5 de linguagens de 2018 a 2025, onde ingles e espanhol
// dividem o mesmo numero — dai o terceiro segmento opcional de desempate:
// /2023/1/ingles. Sem ele, a tela abre no idioma que o usuario ja usa e deixa
// trocar na propria pagina.

const QUESTION_PATH_RE = /^(\d{4})\/(\d{1,3})(?:\/(ingles|espanhol))?$/

// O app guarda a preferencia como 'en'/'es'; a coluna `language` do banco usa
// 'ingles'/'espanhol'. Os dois vocabularios convivem, entao a traducao e explicita.
export const DB_LANG = { en: 'ingles', es: 'espanhol' }
export const APP_LANG = { ingles: 'en', espanhol: 'es' }
const LANG_SLUG = { ingles: 'ingles', espanhol: 'espanhol', en: 'ingles', es: 'espanhol' }

const trim = (p) => String(p ?? '').replace(/^\/+|\/+$/g, '')

/** Retorna { year, number, lang } ou null quando o path nao e de questao. */
export function parseQuestionPath(pathname) {
  const m = QUESTION_PATH_RE.exec(trim(pathname))
  if (!m) return null
  const year = Number(m[1])
  const number = Number(m[2])
  if (year < 1990 || year > 2100 || number < 1) return null
  return { year, number, lang: m[3] ?? null }
}

/** Caminho canonico de uma questao, ou '' quando ela nao tem ano/numero. */
export function questionPath(q) {
  if (!q?.year || q?.number == null) return ''
  const lang = LANG_SLUG[q.language]
  return `/${q.year}/${q.number}${lang ? `/${lang}` : ''}`
}
