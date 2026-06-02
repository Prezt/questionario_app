import { describe, it, expect, vi } from 'vitest'
import { escapeInline, richHtml, richHtmlBr } from './richHtml.js'

vi.mock('./renderMath.js', () => ({
  renderMath: (latex) => `<span class="katex">M:${latex}</span>`,
}))

describe('escapeInline', () => {
  it('escapes raw HTML special chars', () => {
    expect(escapeInline('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d')
  })

  it('preserves <b> as <strong>', () => {
    expect(escapeInline('hello <b>world</b>')).toBe('hello <strong>world</strong>')
  })

  it('preserves <sub> and <sup>', () => {
    expect(escapeInline('H<sub>2</sub>O e x<sup>2</sup>'))
      .toBe('H<sub>2</sub>O e x<sup>2</sup>')
  })

  it('collapses adjacent sup+sub into .supsub span', () => {
    expect(escapeInline('Q<sup>2</sup><sub>1</sub>'))
      .toBe('Q<span class="supsub"><sup>2</sup><sub>1</sub></span>')
  })
})

describe('richHtml', () => {
  it('returns empty string for null/undefined/empty', () => {
    expect(richHtml(null)).toBe('')
    expect(richHtml(undefined)).toBe('')
    expect(richHtml('')).toBe('')
  })

  it('passes plain text through escapeInline', () => {
    expect(richHtml('hello <b>world</b>')).toBe('hello <strong>world</strong>')
  })

  it('renders a markdown table', () => {
    const input = '| a | b |\n| --- | --- |\n| 1 | 2 |'
    const out = richHtml(input)
    expect(out).toContain('<table class="q-table">')
    expect(out).toContain('<th>a</th>')
    expect(out).toContain('<td>1</td>')
  })
})

describe('richHtmlBr', () => {
  it('converts newlines to <br>', () => {
    expect(richHtmlBr('line1\nline2')).toBe('line1<br>line2')
  })
})

describe('richHtml — math', () => {
  it('renders a single \\(...\\) segment', () => {
    const out = richHtml('valor: \\(\\frac{1}{2}\\) ok')
    expect(out).toBe('valor: <span class="katex">M:\\frac{1}{2}</span> ok')
  })

  it('renders multiple math segments on one line', () => {
    const out = richHtml('\\(a\\) e \\(b\\)')
    expect(out).toBe('<span class="katex">M:a</span> e <span class="katex">M:b</span>')
  })

  it('protects math from HTML escaping of < > {', () => {
    const out = richHtml('x \\(a < b\\) y')
    expect(out).toBe('x <span class="katex">M:a < b</span> y')
  })

  it('treats \\\\( as literal (escape)', () => {
    const out = richHtml('escape \\\\(a\\\\)')
    expect(out).toContain('\\(a\\)')
    expect(out).not.toContain('class="katex"')
  })

  it('warns and leaves text untouched on unclosed \\(', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const out = richHtml('start \\(unfinished')
    expect(out).toContain('\\(unfinished')
    expect(out).not.toContain('class="katex"')
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('renders math inside text with <sub>/<sup>', () => {
    const out = richHtml('H<sub>2</sub>O \\(x^2\\)')
    expect(out).toBe('H<sub>2</sub>O <span class="katex">M:x^2</span>')
  })
})
