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
  contextReference: { fontStyle: 'italic', color: '#666', marginTop: 2 },
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
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 48,
    right: 48,
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

/** Texto com <b>/<i>/<sub>/<sup> resolvidos em <Text> aninhado. */
function RichText({ children, style }) {
  const segments = inlineSegments(children)
  if (!segments.length) return null
  return (
    <Text style={style}>
      {segments.map((seg, i) => (
        <Text
          key={i}
          style={[
            seg.bold && seg.italic ? styles.boldItalic : seg.bold ? styles.bold : seg.italic ? styles.italic : null,
            seg.sup ? styles.sup : null,
            seg.sub ? styles.sub : null,
          ]}
        >
          {seg.text}
        </Text>
      ))}
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

function Footer() {
  return (
    <View style={styles.footer} fixed>
      <Text>{`Projeto de Educação Comunitária Integrar · ${CURRENT_YEAR}`}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
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
      {context.reference ? <RichText style={styles.contextReference}>{context.reference}</RichText> : null}
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

export default function PrintableList({ title = 'Lista de Exercícios', questions = [], contexts = {} }) {
  return (
    <Document title={title} author="Trilha Integrar">
      <Page size="A4" style={styles.page}>
        <Header title={title} />
        {questions.map((q, i) => (
          <QuestionBlock key={q.id ?? i} q={q} index={i} contexts={contexts} />
        ))}
        <Footer />
      </Page>
    </Document>
  )
}
