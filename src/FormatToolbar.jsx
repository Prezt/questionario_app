import { useEffect, useRef, useState } from 'react'
import { applyFormat } from './applyFormat.js'
import './FormatToolbar.css'

function writeToTextarea(el, newValue, selStart, selEnd) {
  // React tracks the native input value via an internal property.
  // To trigger onChange on a controlled input we must set the value
  // through the native setter, then dispatch an 'input' event.
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set
  nativeSetter.call(el, newValue)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.selectionStart = selStart
  el.selectionEnd = selEnd
}

export default function FormatToolbar() {
  const activeEl = useRef(null)
  const [hasActive, setHasActive] = useState(false)

  useEffect(() => {
    const onFocusIn = (e) => {
      if (e.target.tagName === 'TEXTAREA' || (e.target.tagName === 'INPUT' && e.target.type === 'text')) {
        activeEl.current = e.target
        setHasActive(true)
      }
    }
    const onFocusOut = (e) => {
      if (e.target === activeEl.current) {
        activeEl.current = null
        setHasActive(false)
      }
    }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  const apply = (action) => (e) => {
    e.preventDefault()
    const el = activeEl.current
    if (!el) return
    const { value, selStart, selEnd } = applyFormat(
      el.value,
      el.selectionStart,
      el.selectionEnd,
      action,
    )
    writeToTextarea(el, value, selStart, selEnd)
    el.focus()
  }

  const btn = (action, label, className, title) => (
    <button
      className={`fmt-btn${className ? ` ${className}` : ''}`}
      title={title}
      disabled={!hasActive}
      onMouseDown={apply(action)}
    >
      {label}
    </button>
  )

  return (
    <div className="fmt-toolbar">
      {btn('b', 'B', 'fmt-btn--bold', 'Bold <b>')}
      {btn('i', 'I', 'fmt-btn--italic', 'Italic <i>')}
      <div className="fmt-divider" />
      {btn('sup', 'x²', null, 'Superscript <sup>')}
      {btn('sub', 'x₂', null, 'Subscript <sub>')}
      {btn('supsub',
        <span className="fmt-supsub"><span>x</span><span>y</span></span>,
        null,
        'Stacked sup+sub'
      )}
      {btn('frac', 'a/b', null, 'Fração — envolve em \\(\\frac{}{}\\)')}
      <div className="fmt-divider" />
      {btn('center', '⬛ center', null, 'Center <center>')}
      {btn('br', '↵ br', null, 'Line break <br>')}
    </div>
  )
}
