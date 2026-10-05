// Testes de ponta a ponta do PDF: renderiza de verdade com @react-pdf/renderer
// e inspeciona o arquivo gerado.
//
// A camada de texto e lida com `pdftotext` (poppler) quando disponivel; se nao
// estiver instalado, esses casos sao pulados em vez de falhar — o audit do
// projeto ja depende da mesma ferramenta (ver npm run test:all).

import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import PrintableList from './PrintableList.jsx'

const PUBLIC = path.resolve(import.meta.dirname, '../../public')
// O componente prefixa "/" no path, entao passamos o caminho absoluto sem a barra.
const localImage = (name) => `${PUBLIC.slice(1)}/figuras/${name}`

const hasPdftotext = (() => {
  try { execFileSync('which', ['pdftotext'], { stdio: 'ignore' }); return true } catch { return false }
})()

function pdfText(buffer) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdftest-'))
  const file = path.join(dir, 'out.pdf')
  fs.writeFileSync(file, buffer)
  try {
    return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

const countImages = (buffer) => (buffer.toString('latin1').match(/\/Subtype\s*\/Image/g) || []).length

const render = (questions, contexts = {}) =>
  renderToBuffer(<PrintableList title="Teste" questions={questions} contexts={contexts} />)

describe('PrintableList', () => {
  it('renderiza tabela markdown como grade, nao como texto com pipes', async () => {
    const q = {
      id: 1, number: 150, year: 2024, area: 'math',
      text: 'Observe a tabela:\n|Loja | Raio (cm) | Preço por unidade (R$)|\n|I | 5 | 60|\n|II | 10 | 70|\nQual a melhor opção?',
      alternatives: { a: 'Loja I', b: 'Loja II' },
    }
    const buffer = await render([q])
    if (!hasPdftotext) return
    const text = pdfText(buffer)

    expect(text).toContain('Loja')
    expect(text).toContain('Raio (cm)')
    expect(text).toContain('60')
    expect(text).toContain('Qual a melhor opção?')
    // O marcador cru nao pode sobrar na pagina.
    expect(text).not.toContain('|Loja')
    expect(text).not.toContain('| 5 |')
  })

  it('remove a linha separadora |-|-| da tabela', async () => {
    const q = {
      id: 2, number: 143, year: 2020, area: 'math',
      text: '|Ano|1995|1999|\n|-|-|-|\n|Tempo|5,2|5,8|',
      alternatives: { a: 'x' },
    }
    const buffer = await render([q])
    if (!hasPdftotext) return
    const text = pdfText(buffer)
    expect(text).toContain('1995')
    expect(text).toContain('5,2')
    expect(text).not.toMatch(/\|\s*-\s*\|/)
  })

  it('tabela dentro do contexto tambem vira grade', async () => {
    const q = {
      id: 3, number: 122, year: 2020, area: 'nature',
      text: 'Com base na tabela, responda.',
      alternatives: { a: 'x' },
      context_keys: ['ctx'],
    }
    const contexts = { ctx: { title: 'Densidade', text: '|Parasito|Densidade|\n|-|-|\n|<i>Ascaris</i>|1,11|' } }
    const buffer = await render([q], contexts)
    if (!hasPdftotext) return
    const text = pdfText(buffer)
    expect(text).toContain('Parasito')
    expect(text).toContain('1,11')
    // O <i> da celula nao pode sair literal.
    expect(text).toContain('Ascaris')
    expect(text).not.toContain('<i>')
  })

  it('marcacao inline do enunciado nao sai literal', async () => {
    const q = {
      id: 4, number: 1, year: 2024, area: 'nature',
      text: 'A fórmula da água é H<sub>2</sub>O e o <b>volume</b> é dado em m<sup>3</sup>.',
      alternatives: { a: 'x' },
    }
    const buffer = await render([q])
    if (!hasPdftotext) return
    const text = pdfText(buffer)
    expect(text).not.toContain('<sub>')
    expect(text).not.toContain('<b>')
    expect(text).toContain('volume')
  })

  it('alternativa-imagem: cada letra recebe a sua figura', async () => {
    const q = {
      id: 5, number: 56, year: 2018, area: 'humanas',
      text: 'Qual mapa representa a situação?',
      alternatives: { a: '', b: '', c: '', d: '', e: '' },
      images: [
        localImage('q001_2020_fig1.png'),
        localImage('q001_2023_fig1.png'),
        localImage('q001_2023_fig2.png'),
        localImage('q002_2020_fig1.png'),
        localImage('q002_2023_fig1.png'),
      ],
    }
    const buffer = await render([q])
    // 5 figuras de alternativa + o logo do cabecalho.
    expect(countImages(buffer)).toBe(6)
  })

  it('questao com frases de verdade mantem as imagens no enunciado (q168/2024)', async () => {
    const q = {
      id: 6, number: 168, year: 2024, area: 'math',
      text: 'Analise os gráficos de amplitude.',
      alternatives: {
        a: 'A amplitude no asfalto é igual à da estrada de chão.',
        b: 'O gráfico mostra amplitude constante.',
      },
      images: [localImage('q001_2020_fig1.png'), localImage('q001_2023_fig1.png')],
    }
    const buffer = await render([q])
    expect(countImages(buffer)).toBe(3) // 2 figuras + logo
    if (!hasPdftotext) return
    const text = pdfText(buffer)
    // O texto das alternativas continua impresso — nao virou legenda de figura.
    expect(text).toContain('estrada de chão')
    expect(text).toContain('amplitude constante')
  })

  it('legenda entre colchetes vira legenda da figura da alternativa', async () => {
    const q = {
      id: 7, number: 139, year: 2019, area: 'math',
      text: 'Escolha o gráfico.',
      alternatives: { a: '[Gráfico - opção A]', b: '[Gráfico - opção B]' },
      images: [localImage('q001_2020_fig1.png'), localImage('q001_2023_fig1.png')],
    }
    const buffer = await render([q])
    if (!hasPdftotext) return
    const text = pdfText(buffer)
    expect(text).toContain('Gráfico - opção A')
    // Sem os colchetes crus.
    expect(text).not.toContain('[Gráfico')
  })
})

describe('PrintableList · fonte da referencia do contexto', () => {
  // 148 questoes do banco quebravam aqui: a referencia do contexto e italica e
  // o titulo do livro vem em <b>, entao o trecho pedia Helvetica-Bold com
  // fontStyle italic herdado — combinacao que nao existe registrada e derruba
  // o render inteiro com "Could not resolve font".
  it('renderiza <b> dentro da referencia italica do contexto', async () => {
    const q = {
      id: 90, number: 46, year: 2018, area: 'humanas',
      text: 'Com base no texto, responda.',
      alternatives: { a: 'x', b: 'y' },
      context_keys: ['ctx'],
    }
    const contexts = {
      ctx: {
        text: 'Texto base.',
        reference: 'SAID, E. <b>Cultura e política</b>. São Paulo: Cia. das Letras, 1995.',
        images: [],
      },
    }
    const buffer = await render([q], contexts)
    if (!hasPdftotext) return
    const text = pdfText(buffer)
    expect(text).toContain('Cultura e política')
    expect(text).not.toContain('<b>')
  })
})

describe('PrintableList · lista longa com figuras', () => {
  // "unsupported number: -1.97e+22" ao baixar uma lista de 16 questoes: quando
  // a quebra de pagina cai dentro de um bloco de figura marcado wrap={false},
  // o layout devolve um offset lixo e o documento inteiro nao sai. Uma questao
  // sozinha nunca reproduz — precisa da lista passando de uma pagina.
  const figura = `${PUBLIC.slice(1)}/figuras/q136_2024_fig1.png`
  const lista = (n) => Array.from({ length: n }, (_, i) => ({
    id: i, number: i + 1, year: 2024, area: 'math',
    text: 'Observe a figura a seguir e responda. '.repeat(6),
    alternatives: { a: 'a', b: 'b', c: 'c', d: 'd', e: 'e' },
    images: [figura],
  }))

  it('gera 16 questoes com figura sem estourar o layout', async () => {
    const buffer = await render(lista(16))
    expect(buffer.length).toBeGreaterThan(0)
  })

  it('gera 30 questoes com figura sem estourar o layout', async () => {
    const buffer = await render(lista(30))
    expect(buffer.length).toBeGreaterThan(0)
  })
})

describe('PrintableList · rodape', () => {
  // O rodape era `position: absolute` e nao saia em nenhuma folha: herdava o
  // `lineHeight` da pagina e o documento vinha sem marca nenhuma.
  const lista = (n) => Array.from({ length: n }, (_, i) => ({
    id: i, number: i + 1, year: 2024, area: 'math',
    text: 'Texto do enunciado. '.repeat(30),
    alternatives: { a: 'a', b: 'b', c: 'c', d: 'd', e: 'e' },
  }))

  it('imprime a marca do Projeto no pe de todas as folhas', async () => {
    const buffer = await render(lista(10))
    if (!hasPdftotext) return
    const paginas = pdfText(buffer).split('\f').filter((p) => p.trim())
    expect(paginas.length).toBeGreaterThan(1)
    for (const p of paginas) expect(p).toContain('Projeto de Educação Comunitária Integrar')
  })
})
