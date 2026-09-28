// scripts/fix-gabarito-espanhol.js
//
// Em 2018-2020 as questões de espanhol (1-5) receberam o gabarito da versão
// de inglês. Corrige pela chave oficial "<ano>:<n>:es", nunca por posição.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const oficial = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'public', 'gabarito-oficial.json'), 'utf8'),
)

// 2019 Q5: as duas entradas vieram marcadas como espanhol. A de inglês é a que
// tem o enunciado em inglês; identificamos pelo trecho, não pela ordem.
const RETAG_2019_Q5 = 'turn this thing on'

for (const ano of [2018, 2019, 2020]) {
  const arquivo = path.join(ROOT, 'public', `linguagens_enem_${ano}.json`)
  const questoes = JSON.parse(fs.readFileSync(arquivo, 'utf8'))
  let mudancas = 0

  if (ano === 2019) {
    const q5s = questoes.filter(q => q.number === 5)
    const ingles = q5s.find(q => (q.text || '').includes(RETAG_2019_Q5))
    if (ingles && !ingles.disciplinas.includes('ingles')) {
      ingles.disciplinas = ingles.disciplinas.map(d => (d === 'espanhol' ? 'ingles' : d))
      mudancas++
      console.log(`  ${ano} Q5: entrada em inglês reetiquetada`)
    }
  }

  for (const q of questoes) {
    if (q.number > 5) continue
    if (!(q.disciplinas || []).includes('espanhol')) continue
    const esperado = oficial[`${ano}:${q.number}:es`]
    if (!esperado || q.answer === esperado) continue
    console.log(`  ${ano} Q${q.number} espanhol: ${q.answer} -> ${esperado}`)
    q.answer = esperado
    mudancas++
  }

  fs.writeFileSync(arquivo, `${JSON.stringify(questoes, null, 2)}\n`)
  console.log(`${path.basename(arquivo)}: ${mudancas} mudança(s)`)
}
