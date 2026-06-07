#!/usr/bin/env node
// Minimal local API server. Run with: node --env-file=.env scripts/local-api.js
// Handles /api/* routes so Vite (port 5173) can proxy to this server (port 3001).

import http from 'node:http'
import { URL } from 'node:url'

// Route map: METHOD /api/path → handler module (string) or { module, query } for dynamic routes.
// Admin endpoints share a single [action].js handler in production; locally we inject the action.
const ROUTES = {
  'POST /api/auth/login':           '../api/auth/login.js',
  'POST /api/auth/register':        '../api/auth/register.js',
  'GET /api/results':               '../api/results/index.js',
  'POST /api/results':              '../api/results/index.js',
  'GET /api/daily-challenge':       '../api/daily-challenge/index.js',
  'POST /api/daily-challenge':      '../api/daily-challenge/index.js',
  'POST /api/daily-challenge/result': '../api/daily-challenge/result.js',
  'POST /api/feedback':             '../api/feedback/index.js',
  // /api/explanations: locally backed by public/explanations.json so dev runs without Postgres.
  'GET /api/explanations':          './explanations-local.js',
  'POST /api/explanations':         './explanations-local.js',
  'DELETE /api/explanations':       './explanations-local.js',
  'POST /api/explanations/freeze':  './freeze-explanations-local.js',
  'GET /api/question-sets':         '../api/question-sets/index.js',
  'POST /api/question-sets':        '../api/question-sets/index.js',
  'PATCH /api/question-sets':       '../api/question-sets/index.js',
  'DELETE /api/question-sets':      '../api/question-sets/index.js',
  'GET /api/question-sets/all':     '../api/question-sets/all.js',
  'GET /api/question-sets/export':  '../api/question-sets/export.js',
  'POST /api/question-sets/questions':   '../api/question-sets/questions.js',
  'PUT /api/question-sets/questions':    '../api/question-sets/questions.js',
  'DELETE /api/question-sets/questions': '../api/question-sets/questions.js',
  'GET /api/admin/stats':           { module: '../api/admin/[action].js', query: { action: 'stats' } },
  'DELETE /api/admin/delete-user':  { module: '../api/admin/[action].js', query: { action: 'delete-user' } },
  'DELETE /api/admin/delete-list':  { module: '../api/admin/[action].js', query: { action: 'delete-list' } },
  'PATCH /api/admin/set-role':      { module: '../api/admin/[action].js', query: { action: 'set-role' } },
}

function makeRes(raw) {
  let statusCode = 200
  const headers = { 'Content-Type': 'application/json' }
  const res = {
    status(code) { statusCode = code; return res },
    json(data)   { raw.writeHead(statusCode, headers); raw.end(JSON.stringify(data)) },
    end()        { raw.writeHead(statusCode); raw.end() },
    setHeader(k, v) { headers[k] = v; return res },
  }
  return res
}

const server = http.createServer(async (raw, res) => {
  const url = new URL(raw.url, `http://localhost`)
  const key = `${raw.method} ${url.pathname}`

  const route = ROUTES[key]
  if (!route) {
    res.writeHead(404)
    res.end()
    return
  }
  const modulePath = typeof route === 'string' ? route : route.module
  const injectedQuery = typeof route === 'string' ? null : route.query

  // Parse JSON body
  const body = await new Promise((resolve) => {
    let data = ''
    raw.on('data', (chunk) => (data += chunk))
    raw.on('end', () => {
      try { resolve(JSON.parse(data)) } catch { resolve({}) }
    })
  })

  const req = {
    method: raw.method,
    headers: raw.headers,
    body,
    query: { ...Object.fromEntries(url.searchParams), ...injectedQuery },
  }

  try {
    const { default: handler } = await import(modulePath)
    await handler(req, makeRes(res))
  } catch (err) {
    console.error(err)
    res.writeHead(500)
    res.end()
  }
})

server.listen(3001, () => console.log('API server running on http://localhost:3001'))
