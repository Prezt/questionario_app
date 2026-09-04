// Documento PDF com o gabarito da lista — grid compacto de numero -> letra.
// Segue o mesmo cabecalho da lista para consistencia visual.

import React from 'react'
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 48,
    fontSize: 11,
    fontFamily: 'Helvetica',
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
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: '10%',
    padding: 6,
    borderWidth: 0.5,
    borderColor: '#DDD',
    flexDirection: 'row',
  },
  cellNumber: { fontWeight: 'bold', marginRight: 6, color: '#C7202A' },
  cellAnswer: { fontWeight: 'bold' },
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 48,
    right: 48,
    fontSize: 8,
    color: '#999',
  },
})

export default function PrintableAnswerKey({ title = 'Lista de Exercícios', questions = [] }) {
  return (
    <Document title={`${title} — Gabarito`} author="Trilha Integrar">
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <Image src="/logo-192.png" style={styles.logo} />
          <Text style={styles.brand}>Trilha Integrar</Text>
          <Text style={styles.title}>{title} · Gabarito</Text>
        </View>
        <View style={styles.grid}>
          {questions.map((q, i) => (
            <View key={q.id ?? i} style={styles.cell}>
              <Text style={styles.cellNumber}>{i + 1}.</Text>
              <Text style={styles.cellAnswer}>{String(q.answer ?? '?').toUpperCase()}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.footer} fixed>Trilha Integrar · gabarito</Text>
      </Page>
    </Document>
  )
}
