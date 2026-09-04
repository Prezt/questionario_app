// Tela do professor: formulario de filtros + botao "Gerar PDFs".
// Consulta /api/questions/search e produz dois PDFs (lista + gabarito).
// Ainda vive dentro da aba Ensine — reposicionada em task #2/#4.

import React, { useState } from 'react'
import { pdf } from '@react-pdf/renderer'
import PrintableList from './PrintableList.jsx'
import PrintableAnswerKey from './PrintableAnswerKey.jsx'

const AREAS = [
  { value: '', label: 'todas' },
  { value: 'math', label: 'Matemática' },
  { value: 'nature', label: 'Ciências da Natureza' },
  { value: 'humanas', label: 'Humanas' },
  { value: 'linguagens', label: 'Linguagens' },
]

function slugify(str) {
  return String(str || 'lista')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'lista'
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function PdfExporter({ token, onClose }) {
  const [name, setName] = useState('')
  const [area, setArea] = useState('')
  const [year, setYear] = useState('')
  const [tag, setTag] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [count, setCount] = useState('10')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleGenerate() {
    setBusy(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (area) params.set('area', area)
      if (year) params.set('year', year)
      if (tag) params.set('tag', tag)
      if (difficulty) params.set('difficulty', difficulty)
      const limit = Math.min(100, Math.max(1, Number.parseInt(count, 10) || 10))
      params.set('limit', String(limit))

      const res = await fetch(`/api/questions/search?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { questions, contexts } = await res.json()
      if (!questions.length) throw new Error('Nenhuma questão bate com os filtros.')

      const title = name || 'Lista de Exercícios'
      const slug = slugify(name)

      const listBlob = await pdf(
        <PrintableList title={title} questions={questions} contexts={contexts} />
      ).toBlob()
      downloadBlob(listBlob, `${slug}-questoes.pdf`)

      const keyBlob = await pdf(
        <PrintableAnswerKey title={title} questions={questions} />
      ).toBlob()
      downloadBlob(keyBlob, `${slug}-gabarito.pdf`)
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="qe-container" style={{ maxWidth: 640 }}>
      <div className="qe-header">
        <h2 className="qe-title">Gerar Lista para Impressão</h2>
        <button type="button" className="qe-close" onClick={onClose}>×</button>
      </div>

      <p className="qe-hint">
        Filtre as questões, escolha um nome para a lista e clique para baixar dois PDFs
        (questões + gabarito separado). Os PDFs usam a mesma paleta e o logo do Trilha Integrar.
      </p>

      <div className="qe-grid">
        <label className="qe-label">
          Nome da lista (opcional)
          <input
            className="qe-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Matemática ENEM 2024"
            disabled={busy}
          />
        </label>

        <label className="qe-label">
          Área
          <select
            className="qe-input"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            disabled={busy}
          >
            {AREAS.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </label>

        <label className="qe-label">
          Ano
          <input
            className="qe-input"
            type="number"
            min="2000"
            max="2100"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="ex: 2024"
            disabled={busy}
          />
        </label>

        <label className="qe-label">
          Tag (uma por vez)
          <input
            className="qe-input"
            type="text"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="ex: álgebra"
            disabled={busy}
          />
        </label>

        <label className="qe-label">
          Dificuldade (N ou N-M)
          <input
            className="qe-input"
            type="text"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            placeholder="ex: 3-7"
            disabled={busy}
          />
        </label>

        <label className="qe-label">
          Quantidade (máx 100)
          <input
            className="qe-input"
            type="number"
            min="1"
            max="100"
            value={count}
            onChange={(e) => setCount(e.target.value)}
            disabled={busy}
          />
        </label>
      </div>

      {error && <p className="auth-error" style={{ marginTop: 8 }}>{error}</p>}

      <div className="qe-actions" style={{ marginTop: 12 }}>
        <button type="button" className="home-start-btn" onClick={handleGenerate} disabled={busy}>
          {busy ? 'Gerando…' : 'Gerar PDFs'}
        </button>
        <button type="button" className="qe-btn qe-btn-secondary" onClick={onClose} disabled={busy}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
