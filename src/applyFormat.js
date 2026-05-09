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
