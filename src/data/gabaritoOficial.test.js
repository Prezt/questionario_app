import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PUBLIC_DIR = fileURLToPath(new URL('../../public', import.meta.url))
const oficial = JSON.parse(
  fs.readFileSync(path.join(PUBLIC_DIR, 'gabarito-oficial.json'), 'utf8'),
)

// Mesma regra do scripts/audit-questions.js: a chave do bloco de língua
// estrangeira carrega o idioma, e o campo que manda é `language` — não
// `disciplinas`, que pode divergir dele.
function chaveOficial(q) {
  return q.language ? `${q.year}:${q.number}:${q.language}` : `${q.year}:${q.number}`
}

const arquivos = fs
  .readdirSync(PUBLIC_DIR)
  .filter(f => /_enem_\d{4}\.json$/.test(f))
  .sort()

describe('answer bate com o gabarito oficial do INEP', () => {
  for (const arquivo of arquivos) {
    it(arquivo, () => {
      const questoes = JSON.parse(
        fs.readFileSync(path.join(PUBLIC_DIR, arquivo), 'utf8'),
      )
      const divergencias = []
      for (const q of questoes) {
        const chave = chaveOficial(q)
        const esperado = oficial[chave]
        if (!esperado) continue // sem gabarito oficial para essa chave
        if (q.answer !== esperado) {
          divergencias.push(`Q${q.number} (${chave}): json=${q.answer} inep=${esperado}`)
        }
      }
      expect(divergencias).toEqual([])
    })
  }
})

// A Q5 de 2019 tinha `language: "es"` numa questão de inglês. Como o gabarito
// oficial é indexado por `language`, a questão era cobrada contra a chave do
// idioma errado — e `disciplinas` sozinha não denunciava.
const DISCIPLINA_DO_IDIOMA = { en: 'ingles', es: 'espanhol' }

describe('language e disciplinas concordam', () => {
  for (const arquivo of arquivos) {
    it(arquivo, () => {
      const questoes = JSON.parse(
        fs.readFileSync(path.join(PUBLIC_DIR, arquivo), 'utf8'),
      )
      const conflitos = []
      for (const q of questoes) {
        const esperada = DISCIPLINA_DO_IDIOMA[q.language]
        if (!esperada) continue
        if (!(q.disciplinas || []).includes(esperada)) {
          conflitos.push(`Q${q.number}: language=${q.language} mas disciplinas=${JSON.stringify(q.disciplinas)}`)
        }
      }
      expect(conflitos).toEqual([])
    })
  }
})

// Havia dois formatos para a mesma coisa: `contextId` (string) e `contextIds`
// (array), e questões sem contexto simplesmente não traziam o campo. O código
// lia tudo isso, mas qualquer varredura que olhasse só um dos campos dava
// resposta errada. Formato único: toda questão tem `contextIds`, array sempre,
// vazio quando não há contexto.
describe('contexto sempre como array', () => {
  for (const arquivo of arquivos) {
    it(arquivo, () => {
      const questoes = JSON.parse(
        fs.readFileSync(path.join(PUBLIC_DIR, arquivo), 'utf8'),
      )
      const fora = []
      for (const q of questoes) {
        if ('contextId' in q) fora.push(`Q${q.number}: usa contextId (string)`)
        if (!Array.isArray(q.contextIds)) {
          fora.push(`Q${q.number}: contextIds ausente ou não é array`)
        }
      }
      expect(fora).toEqual([])
    })
  }
})

describe('toda referência de contexto existe', () => {
  const contexts = JSON.parse(
    fs.readFileSync(path.join(PUBLIC_DIR, 'contexts.json'), 'utf8'),
  )
  for (const arquivo of arquivos) {
    it(arquivo, () => {
      const questoes = JSON.parse(
        fs.readFileSync(path.join(PUBLIC_DIR, arquivo), 'utf8'),
      )
      const quebradas = []
      for (const q of questoes) {
        for (const cid of q.contextIds || []) {
          if (!(cid in contexts)) quebradas.push(`Q${q.number}: ${cid}`)
        }
      }
      expect(quebradas).toEqual([])
    })
  }
})

describe('nenhuma questão é cópia de outra', () => {
  for (const arquivo of arquivos) {
    it(arquivo, () => {
      const questoes = JSON.parse(
        fs.readFileSync(path.join(PUBLIC_DIR, arquivo), 'utf8'),
      )
      const vistas = new Map()
      const duplicadas = []
      for (const q of questoes) {
        // O bloco 1-5 de linguagens tem dois idiomas por número: alternativas
        // diferentes, então uma colisão ali também é bug de verdade.
        const alts = ['a', 'b', 'c', 'd', 'e'].map(k => (q.alternatives?.[k] || '').trim())
        const assinatura = alts.join('|')
        if (assinatura.length < 40) continue // alternativas curtas colidem à toa
        // Questões cujas alternativas são só marcador de imagem ("[Figura]" nas
        // cinco) têm assinatura idêntica sem serem a mesma questão. Só comparamos
        // quando as alternativas carregam texto que as distingue entre si.
        if (new Set(alts.filter(Boolean)).size < 3) continue
        if (vistas.has(assinatura)) {
          duplicadas.push(`Q${vistas.get(assinatura)} e Q${q.number} têm as mesmas alternativas`)
        } else {
          vistas.set(assinatura, q.number)
        }
      }
      expect(duplicadas).toEqual([])
    })
  }
})
