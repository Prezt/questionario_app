// Tabela para o PDF. O @react-pdf/renderer nao tem <table>, entao a grade e
// montada com View em flexDirection row e cada celula pegando `flex` igual ao
// seu colspan.
//
// A largura util de uma A4 retrato com as margens do PrintableList e ~499pt.
// A distribuicao de colunas no banco e 2 a 4 na maioria (65 de 83 blocos), mas
// ha caudas de 13, 14 e 27 colunas — esta ultima e a tabela de cifra do
// enem_2021_math_q147_ctx1, cujas celulas sao letras soltas. Por isso a fonte
// encolhe conforme a tabela alarga, em vez de estourar a pagina.

import React from 'react'
import { Text, View, StyleSheet } from '@react-pdf/renderer'
import { inlineSegments } from './inlineText.js'

const BORDER = '#BBBBBB'

const styles = StyleSheet.create({
  table: {
    marginVertical: 6,
    borderWidth: 0.5,
    borderColor: BORDER,
    borderBottomWidth: 0,
    borderRightWidth: 0,
  },
  row: { flexDirection: 'row' },
  cell: {
    borderRightWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: BORDER,
    paddingVertical: 3,
    paddingHorizontal: 4,
    justifyContent: 'center',
  },
  headerRow: { backgroundColor: '#F2F2F2' },
  headerText: { fontFamily: 'Helvetica-Bold' },
  sup: { fontSize: 6, verticalAlign: 'super' },
  sub: { fontSize: 6, verticalAlign: 'sub' },
})

/** Tabelas largas precisam de fonte menor pra caber na largura util da pagina. */
function fontSizeFor(columnCount) {
  if (columnCount <= 4) return 9
  if (columnCount <= 6) return 8
  if (columnCount <= 10) return 7
  if (columnCount <= 16) return 6
  return 5
}

function CellText({ text, bold, fontSize }) {
  const segments = inlineSegments(text)
  if (!segments.length) return <Text style={{ fontSize }}> </Text>
  return (
    <Text style={[{ fontSize }, bold ? styles.headerText : null]}>
      {segments.map((seg, i) => (
        <Text
          key={i}
          style={[
            seg.bold && !bold ? styles.headerText : null,
            seg.italic ? { fontFamily: seg.bold || bold ? 'Helvetica-BoldOblique' : 'Helvetica-Oblique' } : null,
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

function Row({ cells, header, columnCount, fontSize }) {
  return (
    <View style={[styles.row, header ? styles.headerRow : null]} wrap={false}>
      {cells.map((cell, i) => (
        <View key={i} style={[styles.cell, { flexGrow: cell.colspan, flexShrink: 1, flexBasis: 0 }]}>
          <CellText text={cell.text} bold={header} fontSize={fontSize} />
        </View>
      ))}
    </View>
  )
}

export default function PdfTable({ grid }) {
  if (!grid || !grid.header?.length) return null
  const fontSize = fontSizeFor(grid.columnCount)
  // Tabela curta nao se parte entre paginas; tabela longa precisa poder quebrar.
  const short = grid.rows.length <= 12
  return (
    <View style={styles.table} wrap={!short}>
      <Row cells={grid.header} header columnCount={grid.columnCount} fontSize={fontSize} />
      {grid.rows.map((cells, i) => (
        <Row key={i} cells={cells} columnCount={grid.columnCount} fontSize={fontSize} />
      ))}
    </View>
  )
}
