import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('katex', () => ({
  default: {
    renderToString: (latex) => `<span class="katex">RENDERED:${latex}</span>`,
  },
}))

beforeEach(() => {
  vi.resetModules()
})

describe('renderMath (lazy)', () => {
  it('returns raw \\(latex\\) when KaTeX has not loaded yet', async () => {
    const { renderMath } = await import('./renderMath.js')
    expect(renderMath('\\frac{1}{2}')).toBe('\\(\\frac{1}{2}\\)')
  })

  it('returns KaTeX HTML once loadKatex() resolves', async () => {
    const mod = await import('./renderMath.js')
    await mod.loadKatex()
    expect(mod.renderMath('\\frac{1}{2}'))
      .toBe('<span class="katex">RENDERED:\\frac{1}{2}</span>')
  })

  it('notifies subscribers when KaTeX finishes loading', async () => {
    const mod = await import('./renderMath.js')
    const cb = vi.fn()
    const unsub = mod.subscribeToKatexReady(cb)
    await mod.loadKatex()
    expect(cb).toHaveBeenCalledTimes(1)
    unsub()
  })
})
