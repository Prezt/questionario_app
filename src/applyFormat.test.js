import { describe, it, expect } from 'vitest'
import { applyFormat } from './applyFormat.js'

describe('applyFormat', () => {
  it('wraps selection in <b> tags', () => {
    const result = applyFormat('hello world', 6, 11, 'b')
    expect(result.value).toBe('hello <b>world</b>')
    expect(result.selStart).toBe(18)
    expect(result.selEnd).toBe(18)
  })

  it('inserts <b> tags at cursor when nothing is selected', () => {
    const result = applyFormat('hello', 5, 5, 'b')
    expect(result.value).toBe('hello<b></b>')
    expect(result.selStart).toBe(8)
    expect(result.selEnd).toBe(8)
  })

  it('wraps selection in <i> tags', () => {
    const result = applyFormat('foo bar', 4, 7, 'i')
    expect(result.value).toBe('foo <i>bar</i>')
    expect(result.selStart).toBe(14)
    expect(result.selEnd).toBe(14)
  })

  it('wraps selection in <sup> tags', () => {
    const result = applyFormat('x2', 1, 2, 'sup')
    expect(result.value).toBe('x<sup>2</sup>')
    expect(result.selStart).toBe(13)
    expect(result.selEnd).toBe(13)
  })

  it('wraps selection in <sub> tags', () => {
    const result = applyFormat('H2O', 1, 2, 'sub')
    expect(result.value).toBe('H<sub>2</sub>O')
    expect(result.selStart).toBe(13)
    expect(result.selEnd).toBe(13)
  })

  it('wraps selection in <center> tags', () => {
    const result = applyFormat('title', 0, 5, 'center')
    expect(result.value).toBe('<center>title</center>')
    expect(result.selStart).toBe(22)
    expect(result.selEnd).toBe(22)
  })

  it('inserts <br> at cursor', () => {
    const result = applyFormat('line1line2', 5, 5, 'br')
    expect(result.value).toBe('line1<br>line2')
    expect(result.selStart).toBe(9)
    expect(result.selEnd).toBe(9)
  })

  it('ignores selection for <br> — inserts at selStart', () => {
    const result = applyFormat('abcde', 1, 4, 'br')
    expect(result.value).toBe('a<br>bcde')
    expect(result.selStart).toBe(5)
    expect(result.selEnd).toBe(5)
  })

  it('wraps selection in supsub, cursor inside <sub>', () => {
    const result = applyFormat('ab', 0, 1, 'supsub')
    expect(result.value).toBe('<sup>a</sup><sub></sub>b')
    // cursor lands between <sub> and </sub> (position 17 = after '<sup>a</sup><sub>')
    expect(result.selStart).toBe(17)
    expect(result.selEnd).toBe(17)
  })
})

describe('applyFormat — frac', () => {
  it('selection "1/2" -> \\(\\frac{1}{2}\\), caret after closing delim', () => {
    const result = applyFormat('value 1/2 here', 6, 9, 'frac')
    expect(result.value).toBe('value \\(\\frac{1}{2}\\) here')
    // caret lands after the inserted span
    expect(result.selStart).toBe(6 + '\\(\\frac{1}{2}\\)'.length)
    expect(result.selEnd).toBe(result.selStart)
  })

  it('selection without "/" wraps as numerator, caret in empty denominator', () => {
    const result = applyFormat('n+1', 0, 3, 'frac')
    expect(result.value).toBe('\\(\\frac{n+1}{}\\)')
    // caret should land inside the empty {} of the denominator
    const idx = result.value.indexOf('}{}')
    expect(result.selStart).toBe(idx + 2) // between the two braces of {}
    expect(result.selEnd).toBe(result.selStart)
  })

  it('empty selection inserts \\(\\frac{}{}\\) with caret in numerator', () => {
    const result = applyFormat('abc', 3, 3, 'frac')
    expect(result.value).toBe('abc\\(\\frac{}{}\\)')
    const idx = result.value.indexOf('\\frac{')
    expect(result.selStart).toBe(idx + '\\frac{'.length)
    expect(result.selEnd).toBe(result.selStart)
  })
})
