// Tela de uma questao avulsa, acessada por URL propria: /2023/10.
//
// O par (ano, numero) enderecai 1451 das 1491 questoes do banco. As 40 restantes
// sao as questoes 1 a 5 de linguagens, onde ingles e espanhol dividem o numero.
// Nesse caso a tela abre no idioma que o usuario ja usa no app (`foreignLang`)
// e oferece a troca ali mesmo, em vez de exigir a URL desambiguada.
//
// O desempate explicito continua valendo como link: /2023/1/ingles.

import React, { useEffect, useState } from 'react'
import QuestionPreview from './QuestionPreview.jsx'
import { DB_LANG, APP_LANG } from './questionPath.js'
import './QuestionRoute.css'

const LANG_LABEL = { ingles: 'Inglês', espanhol: 'Espanhol' }

export default function QuestionRoute({ year, number, lang, token, foreignLang = 'en', onChangeForeignLang, onClose }) {
  const [state, setState] = useState({ status: 'loading', questions: [], contexts: {} })
  const [chosenLang, setChosenLang] = useState(lang ?? DB_LANG[foreignLang] ?? 'ingles')

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading', questions: [], contexts: {} })

    const params = new URLSearchParams({ year: String(year), number: String(number), limit: '5' })
    fetch(`/api/questions/search?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        const questions = data.questions ?? []
        setState({
          status: questions.length ? 'ok' : 'empty',
          questions,
          contexts: data.contexts ?? {},
        })
      })
      .catch((err) => {
        if (!cancelled) setState({ status: 'error', error: err.message, questions: [], contexts: {} })
      })

    return () => { cancelled = true }
  }, [year, number, token])

  const { status, questions, contexts } = state

  // Varias questoes com o mesmo (ano, numero) significa colisao de idioma.
  const collision = questions.length > 1
  const question = collision
    ? questions.find((q) => q.language === chosenLang) ?? questions[0]
    : questions[0]

  function pickLang(next) {
    setChosenLang(next)
    // Mantem a preferencia do app em sincronia com a escolha feita aqui.
    onChangeForeignLang?.(APP_LANG[next] ?? 'en')
    const path = `/${year}/${number}/${next}`
    try { window.history.replaceState({}, '', path) } catch {}
  }

  return (
    <div className="qroute">
      <div className="qroute-bar">
        <button type="button" className="btn--ghost" onClick={onClose}>
          ← Voltar ao início
        </button>
        <span className="qroute-path">/{year}/{number}</span>
      </div>

      {status === 'loading' && <p className="qroute-msg">Carregando a questão…</p>}

      {status === 'error' && (
        <p className="qroute-msg qroute-msg--error">
          Não foi possível carregar a questão ({state.error}).
        </p>
      )}

      {status === 'empty' && (
        <p className="qroute-msg">
          Não encontrei a questão {number} de {year}.
        </p>
      )}

      {status === 'ok' && question && (
        <>
          {collision && (
            <div className="qroute-lang">
              <span className="qroute-lang-label">Língua estrangeira:</span>
              {questions.map((q) => (
                <button
                  key={q.language}
                  type="button"
                  className={`qroute-lang-btn${q.language === question.language ? ' is-active' : ''}`}
                  onClick={() => pickLang(q.language)}
                >
                  {LANG_LABEL[q.language] ?? q.language}
                </button>
              ))}
            </div>
          )}
          <QuestionPreview question={question} contexts={contexts} />
        </>
      )}
    </div>
  )
}
