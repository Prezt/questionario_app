import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import './QuestionEditor.css'
import FormatToolbar from './FormatToolbar.jsx'

function SunIcon()  { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> }
function MoonIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> }

const ALT_KEYS = ['a', 'b', 'c', 'd', 'e']

const SUGGESTED_TAGS = [
  "álgebra","análise combinatória","análise de dados","aritmética e números",
  "biologia","biologia molecular","biotecnologia","botânica",
  "cinemática","citologia","ciência e tecnologia","ciclos biogeoquímicos",
  "clima e processos geomorfológicos","climatologia","comportamento animal",
  "comunicação e mídia","cultura e identidade","direitos humanos e cidadania",
  "ecologia","eletricidade e magnetismo","eletroquímica","endocrinologia",
  "energia e conservação","energia e trabalho","epidemiologia",
  "epistemologia e lógica","equilíbrio químico","estatística","estequiometria",
  "evolução","filosofia e política","filosofia e sociologia","filosofia moderna e contemporânea",
  "fisiologia de plantas","fisiologia humana","fotossíntese","funções",
  "física","física moderna","física nuclear e radioatividade",
  "genética e hereditariedade","geografia física e geologia","geografia humana e urbana",
  "geometria analítica","geometria espacial","geometria plana",
  "geopolítica e relações internacionais","gravitação e astronomia","gêneros textuais",
  "história antiga e medieval","história contemporânea","história da cultura e arte",
  "história do brasil colonial","história do brasil república","história moderna e contemporânea",
  "imunologia e microbiologia","interpretação de texto","ligações químicas",
  "linguística e variação linguística","literatura brasileira","literatura mundial",
  "língua espanhola","língua inglesa","matemática financeira","mecânica newtoniana",
  "meio ambiente e sustentabilidade","ondulatória e acústica","política e direitos humanos",
  "probabilidade","processos químicos industriais","proporção e escala",
  "química geral e inorgânica","química orgânica","reprodução vegetal",
  "sequências e progressões","sistema nervoso","sociologia e estrutura social",
  "soluções e solubilidade","termologia","termoquímica e cinética",
  "transferência de calor","trigonometria","zoologia","ética e política","óptica",
]

const EMPTY_QUESTION = {
  stem: '',
  images: [],
  alternatives: { a: '', b: '', c: '', d: '', e: '' },
  correct: 'a',
  tags: [],
  difficulty: 'medium',
}

// Convert a local file to base64 data URL
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function TagPicker({ selected, onChange }) {
  const [search, setSearch] = useState('')

  const filtered = search.trim()
    ? SUGGESTED_TAGS.filter(t => t.toLowerCase().includes(search.toLowerCase()) && !selected.includes(t))
    : SUGGESTED_TAGS.filter(t => !selected.includes(t)).slice(0, 20)

  const toggle = (tag) => {
    onChange(selected.includes(tag) ? selected.filter(t => t !== tag) : [...selected, tag])
  }

  const addCustom = () => {
    const val = search.trim()
    if (val && !selected.includes(val)) { onChange([...selected, val]); setSearch('') }
  }

  const showAddNew = search.trim() && !SUGGESTED_TAGS.includes(search.trim()) && !selected.includes(search.trim())

  return (
    <div className="qe-tag-picker">
      <div className="qe-selected-tags">
        {selected.map(t => (
          <span key={t} className="qe-tag-chip qe-tag-chip--selected" onClick={() => toggle(t)}>{t} ✕</span>
        ))}
        {selected.length === 0 && <span className="qe-tag-empty">Nenhum assunto selecionado</span>}
      </div>
      <input
        className="qe-tag-search"
        placeholder="Buscar assunto…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
      />
      <div className="qe-tag-suggestions">
        {filtered.map(t => (
          <span key={t} className="qe-tag-chip" onClick={() => { toggle(t); setSearch('') }}>{t}</span>
        ))}
        {showAddNew && (
          <span className="qe-tag-chip qe-tag-chip--new" onClick={addCustom}>+ Adicionar "{search.trim()}"</span>
        )}
      </div>
    </div>
  )
}

function ImageInput({ images, onChange, onInsertTag, onAdd }) {
  const update = (i, field, val) =>
    onChange(images.map((img, idx) => idx === i ? { ...img, [field]: val } : img))

  const remove = (i) => onChange(images.filter((_, idx) => idx !== i))

  const handleFile = async (i, file) => {
    if (!file) return
    try { update(i, 'src', await fileToDataUrl(file)) } catch { /* ignore */ }
  }

  return (
    <div className="qe-images">
      {images.map((img, i) => (
        <div key={i} className="qe-image-block">
          <div className="qe-image-row">
            <span className="qe-image-label">Imagem {i + 1}</span>
            <button type="button" className="qe-tag-insert-btn" onClick={() => onInsertTag(i + 1)}>
              Inserir [Imagem {i + 1}] no texto
            </button>
            <button type="button" className="qe-icon-btn qe-remove-btn" onClick={() => remove(i)}>✕</button>
          </div>
          <div className="qe-image-row">
            <input
              className="qe-input qe-image-url"
              placeholder="URL da imagem"
              value={img.src.startsWith('data:') ? '(arquivo local carregado)' : img.src}
              readOnly={img.src.startsWith('data:')}
              onChange={e => update(i, 'src', e.target.value)}
            />
            <label className="qe-file-label">
              📁
              <input type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => handleFile(i, e.target.files[0])} />
            </label>
          </div>
          <div className="qe-image-row">
            <input
              className="qe-input qe-image-caption"
              placeholder="Legenda (opcional)"
              value={img.caption}
              onChange={e => update(i, 'caption', e.target.value)}
            />
          </div>
          {img.src.startsWith('data:') && (
            <img src={img.src} alt="preview" className="qe-image-preview" />
          )}
        </div>
      ))}
      <button type="button" className="qe-add-img-btn" onClick={onAdd}>
        + Imagem
      </button>
    </div>
  )
}

const ENEM_AREAS = [
  { key: 'math',       label: 'Matemática' },
  { key: 'nature',     label: 'C. Natureza' },
  { key: 'linguagens', label: 'Linguagens' },
  { key: 'humanas',    label: 'C. Humanas' },
]
const ENEM_YEARS = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018]

function diffLabel(d) {
  if (typeof d === 'string') return d
  return d <= 3 ? 'easy' : d <= 6 ? 'medium' : 'hard'
}

function EnemPicker({ onSelect, onCancel }) {
  const [area, setArea] = useState('math')
  const [year, setYear] = useState(2025)
  const [questions, setQuestions] = useState([])
  const [fetching, setFetching] = useState(false)
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState('search') // 'search' | 'number'
  const [selectedNum, setSelectedNum] = useState('')
  const [contexts, setContexts] = useState({})
  const listRef = useRef(null)

  useEffect(() => {
    fetch('/contexts.json').then(r => r.ok ? r.json() : {}).catch(() => {}).then(c => setContexts(c ?? {}))
  }, [])

  useEffect(() => {
    setFetching(true)
    setQuestions([])
    setSelectedNum('')
    setSearch('')
    fetch(`/${area}_enem_${year}.json`)
      .then(r => r.ok ? r.json() : [])
      .catch(() => [])
      .then(qs => { setQuestions(qs); setFetching(false) })
  }, [area, year])

  // Reset scroll to top when search changes — useLayoutEffect runs before paint
  useLayoutEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0
  }, [search])

  const filtered = search.trim()
    ? questions.filter(q =>
        q.text?.toLowerCase().includes(search.toLowerCase()) ||
        q.tags?.some(t => t.toLowerCase().includes(search.toLowerCase()))
      )
    : questions

  const buildStem = (q) => {
    const qYear = q.year ?? year
    const header = `Q${q.number} - ${qYear} ENEM`
    let body = q.text ?? q.stem ?? ''
    if (q.contextIds?.length) {
      const parts = []
      for (const id of q.contextIds) {
        const ctx = contexts[id]
        if (!ctx) continue
        if (ctx.text?.trim()) parts.push(ctx.text.trim())
        if (ctx.reference?.trim()) parts.push(ctx.reference.trim())
      }
      if (parts.length) body = parts.join('\n\n') + '\n\n<hr>\n\n' + body
    }
    return header + '\n\n' + body
  }

  const handleSelect = (q) => {
    onSelect({
      stem: buildStem(q),
      images: (q.images ?? []).map(img =>
        typeof img === 'string' ? { src: img, caption: '' } : img
      ),
      alternatives: q.alternatives ?? { a: '', b: '', c: '', d: '', e: '' },
      correct: q.answer ?? 'a',
      tags: q.tags ?? [],
      difficulty: diffLabel(q.difficulty ?? 'medium'),
    })
  }

  const selectedQuestion = mode === 'number' && selectedNum
    ? questions.find(q => q.number === Number(selectedNum))
    : null

  return (
    <div className="qe-picker">
      <div className="qe-picker-filters">
        <div className="qe-picker-seg">
          {ENEM_AREAS.map(a => (
            <button
              key={a.key}
              type="button"
              className={`qe-picker-seg-btn${area === a.key ? ' active' : ''}`}
              onClick={() => setArea(a.key)}
            >
              {a.label}
            </button>
          ))}
        </div>

        <div className="qe-picker-mode-row">
          <button type="button" className={`qe-picker-mode-btn${mode === 'search' ? ' active' : ''}`} onClick={() => setMode('search')}>Buscar</button>
          <button type="button" className={`qe-picker-mode-btn${mode === 'number' ? ' active' : ''}`} onClick={() => setMode('number')}>Por número</button>
        </div>

        {mode === 'search' && (
          <>
            <div className="qe-picker-years">
              {ENEM_YEARS.map(y => (
                <button
                  key={y}
                  type="button"
                  className={`qe-picker-year-btn${year === y ? ' active' : ''}`}
                  onClick={() => setYear(y)}
                >
                  {y}
                </button>
              ))}
            </div>
            <input
              className="qe-input"
              placeholder="Buscar por texto ou assunto…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </>
        )}

        {mode === 'number' && (
          <div className="qe-picker-number-row">
            <select className="qe-input" value={year} onChange={e => setYear(Number(e.target.value))}>
              {ENEM_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select className="qe-input" value={selectedNum} onChange={e => setSelectedNum(e.target.value)} disabled={fetching}>
              <option value="">{fetching ? 'Carregando…' : 'Questão…'}</option>
              {questions.map(q => <option key={q.number} value={q.number}>Q{q.number}</option>)}
            </select>
            <button
              type="button"
              className="qe-btn qe-btn--primary"
              disabled={!selectedQuestion}
              onClick={() => selectedQuestion && handleSelect(selectedQuestion)}
            >
              Usar
            </button>
          </div>
        )}
      </div>

      {mode === 'search' && (
        <div key={`${area}-${year}-${fetching ? 'loading' : filtered.length === 0 ? 'empty' : 'has'}`} className="qe-picker-list" ref={listRef}>
          {fetching && <p key="loading" className="qe-picker-empty">Carregando…</p>}
          {!fetching && filtered.length === 0 && <p key="empty" className="qe-picker-empty">Nenhuma questão encontrada.</p>}
          {filtered.map(q => (
            <div key={q.number} className="qe-picker-item">
              <div className="qe-picker-item-meta">
                <span className="qe-picker-item-num">Q{q.number}</span>
                {q.tags?.slice(0, 2).map(t => (
                  <span key={t} className="qe-picker-item-tag">{t}</span>
                ))}
              </div>
              <p className="qe-picker-item-stem">
                {(q.text ?? q.stem ?? '').slice(0, 120)}…
              </p>
              <button
                type="button"
                className="qe-btn qe-btn--primary qe-picker-use-btn"
                onClick={() => handleSelect(q)}
              >
                Usar
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="qe-form-actions">
        <button type="button" className="qe-btn qe-btn--ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}

function QuestionForm({ question, onSave, onCancel, saving }) {
  const [form, setForm] = useState(question)
  const textareaRef = useRef(null)
  useEffect(() => { setForm(question) }, [question])

  const setField = (field, val) => setForm(f => ({ ...f, [field]: val }))
  const setAlt = (key, val) => setForm(f => ({ ...f, alternatives: { ...f.alternatives, [key]: val } }))

  const insertTag = (n) => {
    const el = textareaRef.current
    if (!el) return
    const tag = `[Imagem ${n}]`
    const start = el.selectionStart
    const end   = el.selectionEnd
    const next  = form.stem.slice(0, start) + tag + form.stem.slice(end)
    setField('stem', next)
    // Restore cursor after tag
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + tag.length
      el.focus()
    })
  }

  const addImage = () => {
    const newImages = [...form.images, { src: '', caption: '' }]
    setField('images', newImages)
    insertTag(newImages.length)
  }

  return (
    <form className="qe-question-form" onSubmit={e => { e.preventDefault(); onSave(form) }}>

      <FormatToolbar />

      <label className="qe-label">Enunciado</label>
      <textarea
        ref={textareaRef}
        className="qe-textarea"
        rows={6}
        placeholder="Digite o enunciado da questão… Use [Imagem 1] para posicionar imagens no texto."
        value={form.stem}
        onChange={e => setField('stem', e.target.value)}
        required
      />

      <label className="qe-label">Imagens</label>
      <ImageInput
        images={form.images}
        onChange={val => setField('images', val)}
        onInsertTag={insertTag}
        onAdd={addImage}
      />

      <label className="qe-label">Alternativas</label>
      <div className="qe-alts">
        {ALT_KEYS.map(k => (
          <div key={k} className="qe-alt-row">
            <label className="qe-alt-radio-label">
              <input type="radio" name="correct" value={k} checked={form.correct === k} onChange={() => setField('correct', k)} />
              <span className="qe-alt-letter">{k.toUpperCase()}</span>
            </label>
            <input
              className={`qe-input qe-alt-input${form.correct === k ? ' qe-alt-input--correct' : ''}`}
              placeholder={`Alternativa ${k.toUpperCase()}`}
              value={form.alternatives[k] ?? ''}
              onChange={e => setAlt(k, e.target.value)}
              required={k === 'a' || k === 'b'}
            />
          </div>
        ))}
      </div>
      <p className="qe-hint">Selecione o botão à esquerda para marcar a alternativa correta.</p>

      <label className="qe-label">Dificuldade</label>
      <div className="qe-difficulty-group">
        {[['easy','Fácil'],['medium','Médio'],['hard','Difícil']].map(([val, label]) => (
          <button
            key={val}
            type="button"
            className={`qe-difficulty-btn qe-difficulty-btn--${val}${form.difficulty === val ? ' active' : ''}`}
            onClick={() => setField('difficulty', val)}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="qe-label">Assuntos</label>
      <TagPicker selected={form.tags} onChange={val => setField('tags', val)} />

      <div className="qe-form-actions">
        <button type="button" className="qe-btn qe-btn--ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="qe-btn qe-btn--primary" disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar questão'}
        </button>
      </div>
    </form>
  )
}

export default function QuestionEditor() {
  const token = localStorage.getItem('token')
  const user  = (() => { try { return JSON.parse(localStorage.getItem('user')) } catch { return null } })()

  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('dark')
    return saved !== null ? saved === 'true' : window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  const isAdmin = user?.role === 'admin'

  const [set, setSet] = useState(null)
  const [setName, setSetName] = useState('')
  const [setYear] = useState(() => new Date().getFullYear())
  const [editingQ, setEditingQ] = useState(null)
  const [importing, setImporting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [exportMsg, setExportMsg] = useState('')

  // Admin: list of prof users to pick from
  const [profUsers, setProfUsers] = useState([])
  const [targetUserId, setTargetUserId] = useState(null) // null = own account

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('dark', dark)
  }, [dark])

  // Page title + blue favicon
  useEffect(() => {
    const prevTitle = document.title
    document.title = 'Criar'
    const links = Array.from(document.querySelectorAll("link[rel*='icon']"))
    const prevHrefs = links.map(l => l.href)
    links.forEach(l => {
      l.href = '/editor-favicon-32.png'
    })
    return () => {
      document.title = prevTitle
      links.forEach((l, i) => { l.href = prevHrefs[i] })
    }
  }, [])

  // Fix scroll — index.css sets overflow:hidden on both html and body
  useEffect(() => {
    const el = document.documentElement
    const bd = document.body
    const prevElOverflow = el.style.overflow
    const prevElHeight   = el.style.height
    const prevBdOverflow = bd.style.overflow
    const prevBdHeight   = bd.style.height
    el.style.overflow = 'auto'
    el.style.height   = 'auto'
    bd.style.overflow = 'auto'
    bd.style.height   = 'auto'
    return () => {
      el.style.overflow = prevElOverflow
      el.style.height   = prevElHeight
      bd.style.overflow = prevBdOverflow
      bd.style.height   = prevBdHeight
    }
  }, [])

  useEffect(() => {
    if (!token || (user?.role !== 'prof' && user?.role !== 'admin')) {
      window.location.href = '/'
    }
  }, [])

  // Admin: fetch list of prof users to pick from
  useEffect(() => {
    if (!isAdmin || !token) return
    fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        const profs = (data.users ?? []).filter(u => u.role === 'prof' || u.role === 'admin')
        setProfUsers(profs)
      })
      .catch(() => {})
  }, [isAdmin, token])

  const userIdParam = targetUserId ? `?userId=${targetUserId}` : ''

  useEffect(() => {
    if (!token) return
    setLoading(true)
    setSet(null)
    fetch(`/api/question-sets${userIdParam}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (data) {
          setSet(data)
          setSetName(data.name)
          // If admin got a fallback set belonging to another user, sync the dropdown
          if (isAdmin && data.created_by && data.created_by !== user?.id && !targetUserId) {
            setTargetUserId(data.created_by)
          }
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [targetUserId])

  // Rename/update only — keeps questions
  const renameSet = useCallback(async (e) => {
    e.preventDefault()
    if (!setName.trim() || !set) return
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/question-sets${userIdParam}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: setName.trim(), year: setYear ? Number(setYear) : null }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Erro'); return }
      setSet(prev => ({ ...prev, name: data.name, year: data.year }))
    } catch { setError('Erro de rede') }
    finally { setSaving(false) }
  }, [setName, setYear, set, token, userIdParam])

  // Create new — wipes questions
  const createNewSet = useCallback(async () => {
    if (!setName.trim()) return
    if (set && !window.confirm('Criar uma nova lista vai apagar todas as questões atuais. Continuar?')) return
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/question-sets${userIdParam}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: setName.trim(), year: setYear ? Number(setYear) : null }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Erro'); return }
      setSet({ id: data.id, name: data.name, year: data.year, questions: [] })
      setEditingQ(null)
    } catch { setError('Erro de rede') }
    finally { setSaving(false) }
  }, [setName, setYear, set, token, userIdParam])

  const saveQuestion = useCallback(async (form) => {
    setSaving(true); setError('')
    try {
      const isNew = editingQ === 'new' || !editingQ?.id
      const qParam = isNew ? userIdParam : `?questionId=${editingQ.id}${targetUserId ? `&userId=${targetUserId}` : ''}`
      const url = `/api/question-sets/questions${qParam}`
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Erro'); return }
      setSet(prev => ({
        ...prev,
        questions: isNew
          ? [...(prev.questions ?? []), data]
          : (prev.questions ?? []).map(q => q.id === data.id ? data : q),
      }))
      setEditingQ(null)
    } catch { setError('Erro de rede') }
    finally { setSaving(false) }
  }, [editingQ, token, targetUserId, userIdParam])

  const deleteQuestion = useCallback(async (q) => {
    if (!window.confirm(`Remover questão ${q.number}?`)) return
    setError('')
    try {
      const res = await fetch(`/api/question-sets/questions?questionId=${q.id}${targetUserId ? `&userId=${targetUserId}` : ''}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Erro'); return }
      setSet(prev => ({
        ...prev,
        questions: (prev.questions ?? []).filter(x => x.id !== q.id).map((x, i) => ({ ...x, number: i + 1 })),
      }))
    } catch { setError('Erro de rede') }
  }, [token, targetUserId])

  const exportJSON = useCallback(async () => {
    setExportMsg(''); setError('')
    try {
      const res = await fetch(`/api/question-sets/export${userIdParam}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Erro'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? 'integrar.json'
      a.click()
      URL.revokeObjectURL(url)
      setExportMsg('JSON exportado! Adicione o arquivo à pasta public/ e faça o commit.')
    } catch { setError('Erro ao exportar') }
  }, [token, userIdParam])

  const deleteSet = useCallback(async () => {
    if (!set) return
    if (!window.confirm(`Deletar a lista "${set.name}" e todas as suas questões? Esta ação é irreversível.`)) return
    setError('')
    try {
      const res = await fetch(`/api/question-sets${userIdParam}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Erro'); return }
      setSet(null)
      setSetName('')
      setEditingQ(null)
    } catch { setError('Erro de rede') }
  }, [set, token, userIdParam])

  if (loading) return <div className="qe-shell"><p className="qe-loading">Carregando…</p></div>

  const questions = set?.questions ?? []

  return (
    <div className="qe-shell">
      <div className="qe-header">
        <button type="button" className="qe-back-btn" onClick={() => window.location.href = '/'}>← Voltar</button>
        <h1 className="qe-title">Criar</h1>
        <button type="button" className="qe-theme-btn" onClick={() => setDark(d => !d)} aria-label="Alternar tema">
          {dark ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>

      {error && <p className="qe-error">{error}</p>}

      {/* Admin: user picker */}
      {isAdmin && (
        <section className="qe-section">
          <label className="qe-label">Editando lista de:</label>
          <select
            className="qe-input"
            value={targetUserId ?? ''}
            onChange={e => { setTargetUserId(e.target.value ? Number(e.target.value) : null); setEditingQ(null) }}
          >
            <option value="">Minha conta</option>
            {profUsers.map(u => (
              <option key={u.id} value={u.id}>{u.username} ({u.role})</option>
            ))}
          </select>
        </section>
      )}

      {/* Set name + year */}
      <section className="qe-section">
        <h2 className="qe-section-title">Lista</h2>
        <div className="qe-set-row">
          <input
            className="qe-input"
            placeholder="Ex: Lista de Física, Revisão Bimestral 1…"
            value={setName}
            onChange={e => setSetName(e.target.value)}
          />
{set
            ? <>
                <button type="button" className="qe-btn qe-btn--ghost" disabled={saving} onClick={renameSet}>
                  Salvar
                </button>
                <button type="button" className="qe-btn qe-btn--danger" disabled={saving} onClick={deleteSet}>
                  Apagar Lista
                </button>
              </>
            : <button type="button" className="qe-btn qe-btn--primary" disabled={saving || !setName.trim()} onClick={createNewSet}>
                Criar lista
              </button>
          }
        </div>
        {set && (
          <p className="qe-set-name-display">
            Lista atual: <strong>{set.name}</strong>
            {set.year ? <> · <strong>{set.year}</strong></> : ''}
          </p>
        )}
      </section>

      {set && (
        <>
          {/* Question list */}
          <section className="qe-section">
            <div className="qe-section-header">
              <h2 className="qe-section-title">Questões ({questions.length})</h2>
              {!editingQ && !importing && (
                <div className="qe-add-btns">
                  <button type="button" className="qe-btn qe-btn--ghost" onClick={() => setImporting(true)}>
                    + Do ENEM
                  </button>
                  <button type="button" className="qe-btn qe-btn--primary" onClick={() => setEditingQ('new')}>
                    + Nova
                  </button>
                </div>
              )}
            </div>

            {questions.length === 0 && !editingQ && !importing && (
              <p className="qe-empty">Nenhuma questão ainda. Clique em "+ Nova" para criar ou "+ Do ENEM" para importar.</p>
            )}

            <div className="qe-question-list">
              {questions.map(q => (
                <div key={q.id} className={`qe-question-item${editingQ?.id === q.id ? ' qe-question-item--active' : ''}`}>
                  <div className="qe-question-item-left">
                    <div className="qe-question-item-meta">
                      <span className="qe-question-num">Q{q.number}</span>
                      <span className={`qe-diff-dot qe-diff-dot--${q.difficulty ?? 'medium'}`} title={q.difficulty} />
                      {(q.tags ?? []).slice(0, 2).map(t => (
                        <span key={t} className="qe-question-tag">{t}</span>
                      ))}
                    </div>
                    <div className="qe-question-item-stem">
                      {q.stem ? q.stem.slice(0, 80) + (q.stem.length > 80 ? '…' : '') : '(sem enunciado)'}
                    </div>
                  </div>
                  <div className="qe-question-item-actions">
                    <button type="button" className="qe-icon-btn" onClick={() => setEditingQ(editingQ?.id === q.id ? null : q)}>
                      {editingQ?.id === q.id ? '✕' : '✎'}
                    </button>
                    <button type="button" className="qe-icon-btn qe-remove-btn" onClick={() => deleteQuestion(q)}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ENEM picker */}
          {importing && (
            <section className="qe-section">
              <h2 className="qe-section-title">Importar questão do ENEM</h2>
              <EnemPicker
                onSelect={(prefilled) => { setImporting(false); saveQuestion(prefilled) }}
                onCancel={() => setImporting(false)}
              />
            </section>
          )}

          {/* Question form */}
          {editingQ && (
            <section className="qe-section">
              <h2 className="qe-section-title">{editingQ === 'new' ? 'Nova questão' : editingQ.number != null ? `Editar Q${editingQ.number}` : 'Importar questão'}</h2>
              <QuestionForm
                question={editingQ === 'new' ? EMPTY_QUESTION : editingQ}
                onSave={saveQuestion}
                onCancel={() => setEditingQ(null)}
                saving={saving}
              />
            </section>
          )}

          {/* Export */}
          {!editingQ && questions.length > 0 && (
            <section className="qe-section qe-export-section">
              <button type="button" className="qe-btn qe-btn--export" onClick={exportJSON}>⬇ Exportar JSON</button>
              {exportMsg && <p className="qe-export-msg">{exportMsg}</p>}
            </section>
          )}
        </>
      )}
    </div>
  )
}
