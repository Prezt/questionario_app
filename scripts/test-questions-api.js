#!/usr/bin/env node
// scripts/test-questions-api.js
//
// Sanity check dos endpoints novos da task #3.
// - Loga com um usuario existente pra obter JWT.
// - Bate em cada endpoint com params tipicos.
// - Imprime resumo (sem dumpar o body inteiro).
//
// Uso (contra localhost, com api local rodando na porta 3001):
//   node --env-file=.env scripts/test-questions-api.js -- <username> <password>
//
// Ou contra a preview/prod, sobrescrevendo a base URL:
//   API_BASE=https://<preview>.vercel.app node scripts/test-questions-api.js -- <username> <password>

const API_BASE = process.env.API_BASE ?? 'http://localhost:3001'

async function post(path, body) {
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await r.text()
  try { return { status: r.status, body: JSON.parse(text) } }
  catch { return { status: r.status, body: text } }
}

async function get(path, token) {
  const r = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const text = await r.text()
  try { return { status: r.status, body: JSON.parse(text) } }
  catch { return { status: r.status, body: text } }
}

function summary(response) {
  if (typeof response.body === 'string') return `[${response.status}] ${response.body.slice(0, 80)}`
  const { questions, contexts, meta } = response.body
  const ctxCount = contexts ? Object.keys(contexts).length : 0
  if (Array.isArray(questions)) {
    return `[${response.status}] questions=${questions.length}, contexts=${ctxCount}` +
      (meta ? `, meta=${JSON.stringify(meta)}` : '') +
      (questions[0] ? `, first={ area:${questions[0].area}, year:${questions[0].year}, number:${questions[0].number} }` : '')
  }
  return `[${response.status}] ${JSON.stringify(response.body).slice(0, 150)}`
}

async function main() {
  const [username, password] = process.argv.slice(-2)
  if (!username || !password || username.startsWith('--')) {
    console.error('Usage: node scripts/test-questions-api.js -- <username> <password>')
    process.exit(1)
  }

  console.log(`[test] API_BASE=${API_BASE}`)
  console.log(`[test] logging in as ${username}...`)
  const login = await post('/api/auth/login', { username, password })
  if (login.status !== 200 || !login.body.token) {
    console.error('[test] login failed:', login)
    process.exit(1)
  }
  const { token, user } = login.body
  console.log(`[test] ok — user.id=${user.id} role=${user.role}`)

  const cases = [
    ['GET /api/questions/search?area=math&year=2024&limit=3',
     '/api/questions/search?area=math&year=2024&limit=3'],
    ['GET /api/questions/search?tag=álgebra&difficulty=3-6&limit=5',
     `/api/questions/search?tag=${encodeURIComponent('álgebra')}&difficulty=3-6&limit=5`],
    ['GET /api/questions/random?count=5&area=humanas',
     '/api/questions/random?count=5&area=humanas'],
    ['GET /api/questions/prova?area=math&year=2018',
     '/api/questions/prova?area=math&year=2018'],
    ['GET /api/questions/prova?area=math&year=9999 (esperado 404)',
     '/api/questions/prova?area=math&year=9999'],
    ['GET /api/contexts?keys=enem_2021_humanas_q46_ctx1,nonexistent',
     '/api/contexts?keys=enem_2021_humanas_q46_ctx1,nonexistent'],
    ['GET /api/questions/search sem token (esperado 401)',
     '/api/questions/search'],
  ]

  for (const [label, path] of cases) {
    const isUnauthTest = label.includes('sem token')
    const response = isUnauthTest
      ? await fetch(`${API_BASE}${path}`).then(async (r) => ({ status: r.status, body: await r.text() }))
      : await get(path, token)
    console.log(`\n${label}`)
    console.log('  ' + summary(response))
  }
}

main().catch((err) => {
  console.error('[test] fatal:', err)
  process.exit(1)
})
