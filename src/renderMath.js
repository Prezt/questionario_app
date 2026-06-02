let katexModule = null
let loading = null
const listeners = new Set()

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function loadKatex() {
  if (katexModule) return Promise.resolve(katexModule)
  if (!loading) {
    loading = import('katex').then((mod) => {
      katexModule = mod.default || mod
      for (const cb of listeners) {
        try { cb() } catch (err) { console.error('katexReady listener threw', err) }
      }
      return katexModule
    })
  }
  return loading
}

export function subscribeToKatexReady(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function isKatexReady() {
  return katexModule !== null
}

export function renderMath(latex) {
  if (!katexModule) {
    // Kick off the load, then fall back to the raw delimited form for now.
    loadKatex()
    return `\\(${latex}\\)`
  }
  try {
    return katexModule.renderToString(latex, {
      throwOnError: false,
      displayMode: false,
      output: 'html',
    })
  } catch (err) {
    const msg = escapeHtml(err && err.message ? err.message : 'render error')
    return `<span class="math-error" title="${msg}">${escapeHtml(latex)}</span>`
  }
}
