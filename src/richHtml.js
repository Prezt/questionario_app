// src/richHtml.js

import { renderMath } from './renderMath.js'

// Scans `text` for \(...\) segments not preceded by an extra backslash.
// Returns { stripped, fragments }:
//   - stripped: original text with each segment replaced by `\x00MATH:i\x00`
//   - fragments: array of pre-rendered KaTeX HTML, indexed by `i`
// Unclosed `\(` is left in place and a console.warn is emitted.
// Outside math, `\\(` → literal `\(` and `\\)` → literal `\)` (escape sequences).
function extractMath(text) {
  const fragments = []
  let out = ''
  let i = 0
  while (i < text.length) {
    // Find the next significant marker after i:
    //   - `\\(` (escaped open paren — literal)
    //   - `\\)` (escaped close paren — literal)
    //   - `\(`  (math open)
    // We scan char-by-char to give priority to the escape forms when a backslash precedes.
    let found = -1
    let kind = null
    for (let j = i; j < text.length - 1; j++) {
      if (text[j] === '\\' && text[j + 1] === '\\' && text[j + 2] === '(') {
        found = j; kind = 'escOpen'; break
      }
      if (text[j] === '\\' && text[j + 1] === '\\' && text[j + 2] === ')') {
        found = j; kind = 'escClose'; break
      }
      if (text[j] === '\\' && text[j + 1] === '(') {
        found = j; kind = 'mathOpen'; break
      }
    }

    if (found === -1) { out += text.slice(i); break }

    if (kind === 'escOpen') {
      out += text.slice(i, found) + '\\('
      i = found + 3
      continue
    }
    if (kind === 'escClose') {
      out += text.slice(i, found) + '\\)'
      i = found + 3
      continue
    }

    // mathOpen: find matching \) — first occurrence, not preceded by escape (i.e. not \\))
    const open = found
    let close = -1
    let scan = open + 2
    while (scan < text.length - 1) {
      const c = text.indexOf('\\)', scan)
      if (c === -1) break
      if (c > 0 && text[c - 1] === '\\') { scan = c + 2; continue }
      close = c
      break
    }
    if (close === -1) {
      console.warn('richHtml: unclosed \\( segment at index', open, '-', text.slice(open, open + 40))
      out += text.slice(i)
      break
    }
    const latex = text.slice(open + 2, close)
    const idx = fragments.length
    fragments.push(renderMath(latex))
    out += text.slice(i, open) + `\x00MATH:${idx}\x00`
    i = close + 2
  }
  return { stripped: out, fragments }
}

function reinsertMath(html, fragments) {
  if (!fragments.length) return html
  return html.replace(/\x00MATH:(\d+)\x00/g, (_, n) => fragments[Number(n)] ?? '')
}

// Render text with <b> (bold) and <i> (italic) support.
// All other HTML is escaped, so this is safe even for user-edited content.
export function escapeInline(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&lt;b&gt;/gi, '<strong>')
    .replace(/&lt;\/b&gt;/gi, '</strong>')
    .replace(/&lt;i&gt;/gi, '<em>')
    .replace(/&lt;\/i&gt;/gi, '</em>')
    .replace(/&lt;sub&gt;/gi, '<sub>')
    .replace(/&lt;\/sub&gt;/gi, '</sub>')
    .replace(/&lt;sup&gt;/gi, '<sup>')
    .replace(/&lt;\/sup&gt;/gi, '</sup>')
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
    .replace(/&lt;hr\s*\/?&gt;/gi, '<hr>')
    .replace(/&lt;left&gt;/gi, '<span class="txt-left">')
    .replace(/&lt;\/left&gt;/gi, '</span>')
    .replace(/&lt;center&gt;/gi, '<span class="txt-center">')
    .replace(/&lt;\/center&gt;/gi, '</span>')
    .replace(/&lt;right&gt;/gi, '<span class="txt-right">')
    .replace(/&lt;\/right&gt;/gi, '</span>')
    .replace(/&lt;justify&gt;/gi, '<span class="txt-justify">')
    .replace(/&lt;\/justify&gt;/gi, '</span>')
    .replace(/<sup>(.*?)<\/sup><sub>(.*?)<\/sub>/g, '<span class="supsub"><sup>$1</sup><sub>$2</sub></span>')
}

export function parseMarkdownTable(tableLines) {
  const dataRows = tableLines.filter(l => !/^\|[\s\-:|]+\|$/.test(l.trim()))
  if (!dataRows.length) return ''
  const parseRow = l => l.split('|').slice(1, -1).map(c => c.trim())
  // Build a row of <th> or <td> elements, merging cells whose content is ">"
  const buildCells = (cells, tag) => {
    const out = []
    let i = 0
    while (i < cells.length) {
      let span = 1
      while (i + span < cells.length && cells[i + span] === '>') span++
      const attr = span > 1 ? ` colspan="${span}"` : ''
      out.push(`<${tag}${attr}>${escapeInline(cells[i])}</${tag}>`)
      i += span
    }
    return out.join('')
  }
  const [header, ...body] = dataRows
  const ths = buildCells(parseRow(header), 'th')
  const trs = body.map(l => `<tr>${buildCells(parseRow(l), 'td')}</tr>`).join('')
  return `<table class="q-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`
}

export function richHtmlBr(text) {
  if (!text) return ''
  return richHtml(text).replace(/\n/g, '<br>')
}

export function richHtml(text) {
  if (!text) return ''
  const { stripped, fragments } = extractMath(text)
  const lines = stripped.split('\n')
  const parts = []
  let tableLines = [], plainLines = []
  const flushPlain = () => { if (plainLines.length) { parts.push(escapeInline(plainLines.join('\n'))); plainLines = [] } }
  const flushTable = () => { if (tableLines.length) { parts.push(parseMarkdownTable(tableLines)); tableLines = [] } }
  for (const line of lines) {
    if (line.trim().startsWith('|')) { flushPlain(); tableLines.push(line) }
    else { flushTable(); plainLines.push(line) }
  }
  flushPlain(); flushTable()
  return reinsertMath(parts.join(''), fragments)
}
