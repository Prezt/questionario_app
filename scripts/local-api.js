#!/usr/bin/env node
// Minimal local API server. Run with: node --env-file=.env scripts/local-api.js
// Handles /api/* routes so Vite (port 5173) can proxy to this server (port 3001).

import http from 'node:http'
import { URL } from 'node:url'

// Route map: METHOD /api/path → handler module
const ROUTES = {
  'POST /api/auth/login':           '../api/auth/login.js',
  'POST /api/auth/register':        '../api/auth/register.js',
  'GET /api/results':               '../api/results/index.js',
  'POST /api/results':              '../api/results/index.js',
  'GET /api/daily-challenge':       '../api/daily-challenge/index.js',
  'POST /api/daily-challenge':      '../api/daily-challenge/index.js',
  'POST /api/daily-challenge/result': '../api/daily-challenge/result.js',
  'POST /api/feedback':             '../api/feedback/index.js',
  'GET /api/admin/stats':           '../api/admin/stats.js',
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

  if (!ROUTES[key]) {
    res.writeHead(404)
    res.end()
    return
  }

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
    query: Object.fromEntries(url.searchParams),
  }

  try {
    const { default: handler } = await import(ROUTES[key])
    await handler(req, makeRes(res))
  } catch (err) {
    console.error(err)
    res.writeHead(500)
    res.end()
  }
})

server.listen(3001, () => console.log('API server running on http://localhost:3001'))
