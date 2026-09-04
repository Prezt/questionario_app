// Documento PDF com uma lista de questoes numeradas 1..N.
// Renderizado via @react-pdf/renderer no cliente.
//
// Segunda pagina em diante repete o cabecalho (logo + titulo).
// Cada questao tem: numero, meta (area/ano), enunciado, alternativas a-e,
// linha de bolinhas para o aluno marcar a resposta.

import React from 'react'
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import { formatQuestionText } from './formatQuestionText.js'

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
  brand: { fontSize: 12, fontWeight: 'bold' },
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
    fontSize: 8,
    color: '#999',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
})

function Header({ title }) {
  return (
    <View style={styles.header} fixed>
      <Image src="/logo-192.png" style={styles.logo} />
      <Text style={styles.brand}>Trilha Integrar</Text>
      <Text style={styles.title}>{title}</Text>
    </View>
  )
}

function Footer() {
  return (
    <View style={styles.footer} fixed>
      <Text>Trilha Integrar · lista de exercícios</Text>
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
      {context.title ? <Text style={styles.contextTitle}>{context.title}</Text> : null}
      {hasText ? <Text style={styles.contextText}>{context.text}</Text> : null}
      {hasImages
        ? context.images.map((src, i) => <Image key={i} src={`/${src}`} style={styles.image} />)
        : null}
      {context.reference ? <Text style={styles.contextReference}>{context.reference}</Text> : null}
    </View>
  )
}

function QuestionBlock({ q, index, contexts }) {
  const meta = [q.area, q.year, `nº ${q.number}`].filter(Boolean).join(' · ')
  const chunks = formatQuestionText(q.text)
  const ctxKeys = Array.isArray(q.context_keys) ? q.context_keys : []
  const alts = q.alternatives ?? {}
  return (
    <View style={styles.question} wrap>
      <View style={styles.questionHeader}>
        <Text style={styles.questionNumber}>{index + 1}.</Text>
        <Text style={styles.questionMeta}>{meta}</Text>
      </View>
      {ctxKeys.map((k) => <ContextBlock key={k} context={contexts[k]} />)}
      {chunks.map((chunk, i) =>
        chunk.type === 'image'
          ? <Image key={i} src={`/${chunk.path}`} style={styles.image} />
          : <Text key={i} style={styles.statement}>{chunk.text}</Text>
      )}
      {Array.isArray(q.images)
        ? q.images.map((src, i) => <Image key={`qi-${i}`} src={`/${src}`} style={styles.image} />)
        : null}
      {['a', 'b', 'c', 'd', 'e'].map((k) =>
        alts[k] === undefined ? null : (
          <View key={k} style={styles.altLine}>
            <Text style={styles.altKey}>{k.toUpperCase()})</Text>
            <Text style={styles.altText}>{alts[k]}</Text>
          </View>
        )
      )}
      <View style={styles.answerRow}>
        {['a', 'b', 'c', 'd', 'e'].map((k) => (
          <Text key={k} style={styles.bubble}>○ {k}</Text>
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
