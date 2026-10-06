// Chave de uma explicacao, usada em cinco lugares: a rota /api/explanations,
// o stub local de dev, o espelho public/explanations.json, o import das
// resolucoes e o freeze de volta pros JSON. Se qualquer um montar diferente, a
// explicacao simplesmente some da tela sem erro nenhum — por isso mora aqui.
//
// O idioma entra porque nas questoes 1 a 5 de linguagens o ingles e o espanhol
// ocupam o MESMO numero (40 pares no banco). Sem ele, as duas caem na mesma
// chave e uma sobrescreve a outra.
//
// Ele so e anexado quando existe: assim as questoes sem idioma — a esmagadora
// maioria — mantem exatamente a chave de antes, e nada do que ja estava salvo
// precisa ser remapeado.

/**
 * O mesmo idioma aparece com dois vocabularios no projeto: os arquivos em
 * public/ gravam "en"/"es" e o banco grava "ingles"/"espanhol". A chave tem que
 * sair igual venha a questao de onde vier, senao a explicacao some sem erro.
 */
const IDIOMA_CANONICO = { en: 'ingles', es: 'espanhol', ingles: 'ingles', espanhol: 'espanhol' }

export function normalizaIdioma(language) {
  if (!language) return null
  return IDIOMA_CANONICO[String(language).toLowerCase()] ?? String(language).toLowerCase()
}

export function explanationKey({ area, year, test, number, language } = {}) {
  const base = `${area}:${year}:${test}:${number}`
  const idioma = normalizaIdioma(language)
  return idioma ? `${base}:${idioma}` : base
}
