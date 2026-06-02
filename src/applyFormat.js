const WRAP = {
  b:      ['<b>',       '</b>'],
  i:      ['<i>',       '</i>'],
  sup:    ['<sup>',     '</sup>'],
  sub:    ['<sub>',     '</sub>'],
  center: ['<center>',  '</center>'],
}

export function applyFormat(value, selStart, selEnd, action) {
  if (action === 'br') {
    const next = value.slice(0, selStart) + '<br>' + value.slice(selStart)
    const pos = selStart + 4
    return { value: next, selStart: pos, selEnd: pos }
  }

  if (action === 'supsub') {
    const selected = value.slice(selStart, selEnd)
    const open = `<sup>${selected}</sup><sub>`
    const close = `</sub>`
    const next = value.slice(0, selStart) + open + close + value.slice(selEnd)
    const pos = selStart + open.length
    return { value: next, selStart: pos, selEnd: pos }
  }

  if (action === 'frac') {
    const selected = value.slice(selStart, selEnd)
    let inserted, caretOffset
    if (selected === '') {
      inserted = '\\(\\frac{}{}\\)'
      caretOffset = '\\(\\frac{'.length // inside the numerator
    } else if (selected.includes('/')) {
      const slash = selected.indexOf('/')
      const num = selected.slice(0, slash)
      const den = selected.slice(slash + 1)
      inserted = `\\(\\frac{${num}}{${den}}\\)`
      caretOffset = inserted.length // after the closing delim
    } else {
      inserted = `\\(\\frac{${selected}}{}\\)`
      // caret inside the empty denominator: position of `}{}` + 2
      caretOffset = inserted.indexOf('}{}') + 2
    }
    const next = value.slice(0, selStart) + inserted + value.slice(selEnd)
    const pos = selStart + caretOffset
    return { value: next, selStart: pos, selEnd: pos }
  }

  const [open, close] = WRAP[action]
  const selected = value.slice(selStart, selEnd)
  const next = value.slice(0, selStart) + open + selected + close + value.slice(selEnd)
  // No selection: land inside the tags so the user can type immediately.
  // With selection: land after the closing tag.
  const pos = selStart === selEnd
    ? selStart + open.length
    : selStart + open.length + selected.length + close.length
  return { value: next, selStart: pos, selEnd: pos }
}
