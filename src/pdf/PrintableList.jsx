// Documento PDF com uma lista de questoes numeradas 1..N.
// Renderizado via @react-pdf/renderer no cliente.
//
// Segunda pagina em diante repete o cabecalho (logo + titulo).
// Cada questao tem: numero, meta (area/ano), enunciado, alternativas a-e,
// linha de bolinhas para o aluno marcar a resposta.
//
// Enunciado e contexto podem trazer tabela markdown (83 blocos no banco) e
// marcacao inline (<b>, <i>, <sub>, <sup>): ambos passam por blocos proprios
// em vez de sair literais. Quando as imagens da questao sao as alternativas
// (44 questoes), cada letra recebe a sua figura em vez de todas irem pro
// enunciado — ver src/alternativeImages.js.

import React from 'react'
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import { formatQuestionText } from './formatQuestionText.js'
import { inlineSegments } from './inlineText.js'
import { splitQuestionImages, alternativeLetters } from '../alternativeImages.js'
import { parseStemSegments } from '../parseQuestionFigures.js'
import PdfTable from './PdfTable.jsx'

function publicImageSrc(path) {
  const src = typeof path === 'string' ? path : path?.src
  if (!src) return ''
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) return src
  return src.startsWith('/') ? src : `/${src}`
}

const styles = StyleSheet.create({
  page: {
    // Coluna flex para o rodape poder ser empurrado pro pe com marginTop auto.
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 48,
    fontSize: 10.5,
    fontFamily: 'Helvetica',
    lineHeight: 1.4,
    color: '#111111',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#C7202A',
    paddingBottom: 8,
    marginBottom: 16,
  },
  logo: { width: 28, height: 28, marginRight: 12 },
  title: { fontSize: 14, fontWeight: 'bold', marginLeft: 'auto' },
  question: { marginBottom: 20 },
  questionHeader: { flexDirection: 'row', marginBottom: 4 },
  questionNumber: { fontSize: 11, fontWeight: 'bold', marginRight: 8, color: '#C7202A' },
  questionMeta: { fontSize: 9, color: '#666' },
  contextBox: {
    borderLeftWidth: 2,
    borderLeftColor: '#C7202A',
    paddingLeft: 8,
    marginBottom: 6,
    fontSize: 9.5,
    color: '#333',
  },
  contextTitle: { fontSize: 9, fontWeight: 'bold', marginBottom: 2 },
  contextText: { marginBottom: 2 },
  // Sem `fontStyle: italic` aqui: o italico vem pela familia, via a prop
  // `italic` do RichText. `fontStyle` era herdado pelos <Text> aninhados e
  // pedia "Helvetica-Bold + italic", par que nao existe registrado.
  contextReference: { color: '#666', marginTop: 2 },
  statement: { marginBottom: 4 },
  altLine: { flexDirection: 'row', marginBottom: 2 },
  altKey: { width: 16, fontWeight: 'bold' },
  altText: { flex: 1 },
  altImageBlock: { flex: 1 },
  altImage: { maxWidth: 150, maxHeight: 110, marginBottom: 2 },
  altCaption: { fontSize: 8, color: '#666' },
  answerRow: {
    flexDirection: 'row',
    marginTop: 6,
    fontSize: 9,
    color: '#666',
  },
  bubble: { marginRight: 10 },
  image: { maxWidth: 220, maxHeight: 160, marginVertical: 4 },
  // Em fluxo, nao `position: absolute`. O rodape absoluto nao renderizava:
  // com `lineHeight` herdado da pagina ele saia do documento calado, e tirar o
  // lineHeight da pagina custa 25% a 50% de folha a mais (o padrao do
  // @react-pdf e mais alto que 1.4). `marginTop: auto` numa pagina flex-column
  // prega ele no pe de toda folha sem tocar na metrica do corpo.
  footer: {
    marginTop: 'auto',
    paddingTop: 8,
    fontSize: 7,
    color: '#C9C9C9',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bold: { fontFamily: 'Helvetica-Bold' },
  italic: { fontFamily: 'Helvetica-Oblique' },
  boldItalic: { fontFamily: 'Helvetica-BoldOblique' },
  sup: { fontSize: 6, verticalAlign: 'super' },
  sub: { fontSize: 6, verticalAlign: 'sub' },
})

/**
 * Texto com <b>/<i>/<sub>/<sup> resolvidos em <Text> aninhado.
 *
 * `italic` marca que o bloco inteiro e italico (a referencia do contexto e).
 * A variacao tem que virar nome de familia — Helvetica-BoldOblique — e nunca
 * `fontStyle`, que o @react-pdf herda e combina com a familia do trecho ate
 * pedir um par inexistente. Mesma convencao do PdfTable.
 */
function RichText({ children, style, italic: blockItalic = false }) {
  const segments = inlineSegments(children)
  if (!segments.length) return null
  return (
    <Text style={style}>
      {segments.map((seg, i) => {
        const it = seg.italic || blockItalic
        return (
          <Text
            key={i}
            style={[
              seg.bold && it ? styles.boldItalic : seg.bold ? styles.bold : it ? styles.italic : null,
              seg.sup ? styles.sup : null,
              seg.sub ? styles.sub : null,
            ]}
          >
            {seg.text}
          </Text>
        )
      })}
    </Text>
  )
}

/**
 * Blocos de texto/imagem/tabela de um enunciado ou contexto.
 *
 * `parseStemSegments` e o mesmo parser do app web: coloca cada imagem no lugar
 * do seu marcador ([Figura], [Gráfico], …) em vez de empilhar tudo no fim.
 * O que sobra de texto ainda pode conter tabela markdown e o marcador
 * [Image: path], resolvidos por formatQuestionText.
 */
function Blocks({ raw, images = [], textStyle, imageStyle }) {
  const segments = parseStemSegments(raw ?? '', images)
  const out = []
  segments.forEach((seg, si) => {
    if (seg.type === 'figure') {
      if (!seg.src) return
      out.push(
        <View key={`f-${si}`} wrap={false}>
          <Image src={publicImageSrc(seg.src)} style={imageStyle} />
          {seg.caption ? <RichText style={styles.altCaption}>{seg.caption}</RichText> : null}
        </View>,
      )
      return
    }
    formatQuestionText(seg.text).forEach((chunk, ci) => {
      const key = `${si}-${ci}`
      if (chunk.type === 'image') out.push(<Image key={key} src={publicImageSrc(chunk.path)} style={imageStyle} />)
      else if (chunk.type === 'table') out.push(<PdfTable key={key} grid={chunk.grid} />)
      else out.push(<RichText key={key} style={textStyle}>{chunk.text}</RichText>)
    })
  })
  return out
}

function Header({ title }) {
  return (
    <View style={styles.header} fixed>
      <Image src="/figuras/logos/integrar-logo-transparent.png" style={styles.logo} />
      <Text style={styles.title}>{title}</Text>
    </View>
  )
}

const CURRENT_YEAR = new Date().getFullYear()

/**
 * Sem numero de pagina: `render` nao produz nada nesta versao do @react-pdf,
 * nem no <Text> filho, nem com `fixed` proprio, nem na View do rodape — foram
 * sete construcoes testadas, todas mudas ou derrubando o rodape junto. Ficava
 * codigo morto pendurado no documento.
 */
function Footer() {
  return (
    <View style={styles.footer} fixed>
      <Text>{`Projeto de Educação Comunitária Integrar · ${CURRENT_YEAR}`}</Text>
    </View>
  )
}

function ContextBlock({ context }) {
  if (!context) return null
  const hasText = context.text && context.text.trim().length > 0
  const hasImages = Array.isArray(context.images) && context.images.length > 0
  return (
    <View style={styles.contextBox} wrap={false}>
      {context.title ? <RichText style={styles.contextTitle}>{context.title}</RichText> : null}
      {context.subtitle ? <RichText style={styles.contextText}>{context.subtitle}</RichText> : null}
      {hasText || hasImages
        ? <Blocks raw={context.text ?? ''} images={context.images ?? []} textStyle={styles.contextText} imageStyle={styles.image} />
        : null}
      {context.reference ? <RichText style={styles.contextReference} italic>{context.reference}</RichText> : null}
    </View>
  )
}

function AlternativeLine({ letter, text, image }) {
  return (
    <View style={styles.altLine} wrap={false}>
      <Text style={styles.altKey}>{letter.toUpperCase()})</Text>
      {image ? (
        <View style={styles.altImageBlock}>
          <Image src={publicImageSrc(image.src)} style={styles.altImage} />
          {image.caption ? <RichText style={styles.altCaption}>{image.caption}</RichText> : null}
        </View>
      ) : (
        <RichText style={styles.altText}>{text}</RichText>
      )}
    </View>
  )
}

function QuestionBlock({ q, index, contexts }) {
  const meta = [q.area, q.year, `nº ${q.number}`].filter(Boolean).join(' · ')
  const ctxKeys = Array.isArray(q.context_keys) ? q.context_keys : []
  const alts = q.alternatives ?? {}
  const { stemImages, altImages } = splitQuestionImages(q)
  const letters = alternativeLetters(q)
  return (
    <View style={styles.question} wrap>
      <View style={styles.questionHeader}>
        <Text style={styles.questionNumber}>{index + 1}.</Text>
        <Text style={styles.questionMeta}>{meta}</Text>
      </View>
      {ctxKeys.map((k) => <ContextBlock key={k} context={contexts[k]} />)}
      <Blocks raw={q.text} images={stemImages} textStyle={styles.statement} imageStyle={styles.image} />
      {letters.map((letter) => (
        <AlternativeLine key={letter} letter={letter} text={alts[letter]} image={altImages[letter]} />
      ))}
      <View style={styles.answerRow}>
        {letters.map((letter) => (
          <Text key={letter} style={styles.bubble}>○ {letter}</Text>
        ))}
      </View>
    </View>
  )
}

/**
 * Quantas questoes entram em cada <Page>. NAO e quantas cabem por folha: a
 * Page continua quebrando sozinha em quantas folhas precisar.
 *
 * Existe porque uma unica <Page> com a lista inteira estoura o layout a partir
 * de ~15 questoes com figura — o erro "unsupported number: -1.97e+22", que e
 * uma coordenada lixo vindo da arvore de layout saturada. O limite e
 * cumulativo (quanto conteudo, nao quantas questoes), entao remover qualquer
 * pedaco do bloco so empurra o limiar: com 40 questoes quebra de todo jeito.
 *
 * Fatiar da a cada grupo a sua propria arvore. 6 foi medido contra o banco (8 ainda quebrava nas
 * 60 questoes mais pesadas): custa ~5% de folha a mais que a pagina unica.
 */
const QUESTOES_POR_PAGINA = 6

function chunk(arr, n) {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

export default function PrintableList({ title = 'Lista de Exercícios', questions = [], contexts = {} }) {
  const grupos = chunk(questions, QUESTOES_POR_PAGINA)
  return (
    <Document title={title} author="Trilha Integrar">
      {(grupos.length ? grupos : [[]]).map((grupo, gi) => (
        <Page key={gi} size="A4" style={styles.page}>
          <Header title={title} />
          {grupo.map((q, i) => (
            <QuestionBlock
              key={q.id ?? `${gi}-${i}`}
              q={q}
              index={gi * QUESTOES_POR_PAGINA + i}
              contexts={contexts}
            />
          ))}
          <Footer />
        </Page>
      ))}
    </Document>
  )
}
