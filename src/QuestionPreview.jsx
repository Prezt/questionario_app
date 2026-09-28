// Questao renderizada por inteiro: contexto, enunciado com figuras no lugar
// dos marcadores, e alternativas — imagem quando a alternativa e imagem.
//
// Usado em dois lugares: o modal "ver questao" da montagem de lista
// (src/pdf/PdfExporter.jsx) e a tela de questao avulsa acessada por URL
// propria (/2023/10). Ler so, sem interacao de resposta.

import React from 'react'
import { richHtml, richHtmlBr } from './richHtml.js'
import { parseStemSegments } from './parseQuestionFigures.js'
import { splitQuestionImages, alternativeLetters } from './alternativeImages.js'
import './QuestionPreview.css'

function publicImageSrc(path) {
  const src = typeof path === 'string' ? path : path?.src
  if (!src) return ''
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) return src
  return src.startsWith('/') ? src : `/${src}`
}

const AREA_LABELS = {
  math: 'Matemática',
  nature: 'Ciências da Natureza',
  humanas: 'Ciências Humanas',
  linguagens: 'Linguagens',
}

const LANG_LABELS = { ingles: 'Inglês', espanhol: 'Espanhol', en: 'Inglês', es: 'Espanhol' }

function Figure({ src, caption, onZoom }) {
  if (!src) return null
  const url = publicImageSrc(src)
  return (
    <figure className="qprev-figure">
      <img
        className="qprev-img"
        src={url}
        alt={caption || 'Figura da questão'}
        loading="lazy"
        onClick={onZoom ? () => onZoom({ src: url, caption: caption || '' }) : undefined}
        style={onZoom ? { cursor: 'zoom-in' } : undefined}
      />
      {caption && (
        <figcaption className="qprev-figure-caption" dangerouslySetInnerHTML={{ __html: richHtmlBr(caption) }} />
      )}
    </figure>
  )
}

/** Texto com figuras intercaladas nos marcadores ([Figura], [Gráfico], …). */
function Stem({ text, images, onZoom }) {
  const segments = parseStemSegments(text ?? '', images ?? [])
  return segments.map((seg, i) =>
    seg.type === 'figure' ? (
      <Figure key={i} src={seg.src} caption={seg.caption} onZoom={onZoom} />
    ) : (
      <div key={i} className="qprev-text" dangerouslySetInnerHTML={{ __html: richHtml(seg.text) }} />
    ),
  )
}

function ContextBlock({ context, onZoom }) {
  if (!context) return null
  return (
    <div className="qprev-context">
      {context.title && (
        <div className="qprev-context-title" dangerouslySetInnerHTML={{ __html: richHtml(context.title) }} />
      )}
      {context.subtitle && (
        <div className="qprev-context-subtitle" dangerouslySetInnerHTML={{ __html: richHtml(context.subtitle) }} />
      )}
      <Stem text={context.text} images={context.images} onZoom={onZoom} />
      {context.reference && (
        <div className="qprev-context-ref" dangerouslySetInnerHTML={{ __html: richHtmlBr(context.reference) }} />
      )}
    </div>
  )
}

export default function QuestionPreview({ question, contexts = {}, showAnswer = true, onZoom }) {
  if (!question) return null

  const { stemImages, altImages } = splitQuestionImages(question)
  const letters = alternativeLetters(question)
  const ctxKeys = Array.isArray(question.context_keys)
    ? question.context_keys
    : Array.isArray(question.contextIds) ? question.contextIds : []

  const meta = [
    AREA_LABELS[question.area] ?? question.area,
    question.year,
    question.number != null ? `questão ${question.number}` : null,
    LANG_LABELS[question.language],
  ].filter(Boolean).join(' · ')

  return (
    <article className="qprev">
      {meta && <div className="qprev-meta">{meta}</div>}

      {ctxKeys.map((key) => (
        <ContextBlock key={key} context={contexts[key]} onZoom={onZoom} />
      ))}

      <Stem text={question.text} images={stemImages} onZoom={onZoom} />

      <ol className="qprev-alts">
        {letters.map((letter) => {
          const image = altImages[letter]
          const correct = showAnswer && question.answer === letter
          return (
            <li key={letter} className={`qprev-alt${correct ? ' qprev-alt--correct' : ''}`}>
              <span className="qprev-alt-letter">{letter.toUpperCase()}</span>
              <div className="qprev-alt-body">
                {image ? (
                  <Figure src={image.src} caption={image.caption} onZoom={onZoom} />
                ) : (
                  <span dangerouslySetInnerHTML={{ __html: richHtml(question.alternatives?.[letter] ?? '') }} />
                )}
              </div>
            </li>
          )
        })}
      </ol>

      {showAnswer && question.answer === 'annulled' && (
        <p className="qprev-annulled">Questão anulada.</p>
      )}
    </article>
  )
}
