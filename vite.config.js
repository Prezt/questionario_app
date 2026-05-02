import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const PUBLIC_DIR = path.resolve('./public')

function reviewCreateContextMiddleware(req, res, next) {
  if (req.method !== 'POST' || req.url !== '/api/review/create-context') return next()

  let body = ''
  req.on('data', chunk => { body += chunk })
  req.on('end', () => {
    try {
      const { contextId, context } = JSON.parse(body)

      if (!contextId || !context) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Missing contextId or context' }))
        return
      }
      if (!/^[a-z0-9_]+$/.test(contextId)) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Invalid contextId — use lowercase letters, digits and underscores only' }))
        return
      }

      const filePath = path.join(PUBLIC_DIR, 'contexts.json')
      const contexts = JSON.parse(fs.readFileSync(filePath, 'utf8'))

      if (contextId in contexts) {
        res.statusCode = 409
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: `Context already exists: ${contextId}` }))
        return
      }

      contexts[contextId] = {
        title: context.title ?? '',
        subtitle: context.subtitle ?? '',
        text: context.text ?? '',
        reference: context.reference ?? '',
      }

      fs.writeFileSync(filePath, JSON.stringify(contexts, null, 2), 'utf8')
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true }))
    } catch (err) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: String(err) }))
    }
  })
}

function reviewContextMiddleware(req, res, next) {
  if (req.method !== 'POST' || req.url !== '/api/review/save-context') return next()

  let body = ''
  req.on('data', chunk => { body += chunk })
  req.on('end', () => {
    try {
      const { contextId, patch } = JSON.parse(body)

      if (!contextId || !patch) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Missing contextId or patch' }))
        return
      }

      // contextId must be alphanumeric + underscores only
      if (!/^[a-z0-9_]+$/.test(contextId)) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Invalid contextId' }))
        return
      }

      const filePath = path.join(PUBLIC_DIR, 'contexts.json')
      const contexts = JSON.parse(fs.readFileSync(filePath, 'utf8'))

      if (!(contextId in contexts)) {
        res.statusCode = 404
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: `Context not found: ${contextId}` }))
        return
      }

      const allowed = ['title', 'subtitle', 'text', 'reference']
      for (const key of allowed) {
        if (key in patch) contexts[contextId][key] = patch[key]
      }

      fs.writeFileSync(filePath, JSON.stringify(contexts, null, 2), 'utf8')
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true }))
    } catch (err) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: String(err) }))
    }
  })
}

function reviewSaveMiddleware(req, res, next) {
  if (req.method !== 'POST' || req.url !== '/api/review/save') return next()

  let body = ''
  req.on('data', chunk => { body += chunk })
  req.on('end', () => {
    try {
      const { file, questionNumber, patch } = JSON.parse(body)

      if (!file || typeof questionNumber !== 'number' || !patch) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Missing file, questionNumber, or patch' }))
        return
      }

      // Only allow files that match the known pattern — no path traversal
      if (!/^[a-z]+_enem_\d{4}\.json$/.test(file)) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Invalid file name' }))
        return
      }

      const filePath = path.join(PUBLIC_DIR, file)
      if (!fs.existsSync(filePath)) {
        res.statusCode = 404
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: `File not found: ${file}` }))
        return
      }

      const questions = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      const idx = questions.findIndex(q => q.number === questionNumber)
      if (idx === -1) {
        res.statusCode = 404
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: `Question ${questionNumber} not found in ${file}` }))
        return
      }

      // Merge only the allowed patch fields
      const allowed = ['text', 'alternatives', 'answer', 'contextIds', 'contextId', 'images']
      for (const key of allowed) {
        if (key in patch) questions[idx][key] = patch[key]
      }

      fs.writeFileSync(filePath, JSON.stringify(questions, null, 2), 'utf8')
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true }))
    } catch (err) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: String(err) }))
    }
  })
}

function reviewUploadImageMiddleware(req, res, next) {
  if (req.method !== 'POST' || req.url !== '/api/review/upload-image') return next()

  let body = ''
  req.on('data', chunk => { body += chunk })
  req.on('end', () => {
    try {
      const { filename, dataUrl } = JSON.parse(body)

      if (!filename || !dataUrl) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Missing filename or dataUrl' }))
        return
      }

      // Only allow safe filenames — no path traversal
      if (!/^[a-zA-Z0-9_\-]+\.(png|jpg|jpeg|webp)$/i.test(filename)) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Invalid filename' }))
        return
      }

      const match = dataUrl.match(/^data:image\/[a-z+]+;base64,(.+)$/i)
      if (!match) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Invalid dataUrl format' }))
        return
      }

      const figDir = path.join(PUBLIC_DIR, 'figuras')
      if (!fs.existsSync(figDir)) fs.mkdirSync(figDir)

      const filePath = path.join(figDir, filename)
      fs.writeFileSync(filePath, Buffer.from(match[1], 'base64'))

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, path: `figuras/${filename}` }))
    } catch (err) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: String(err) }))
    }
  })
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'review-save',
      configureServer(server) {
        server.middlewares.use(reviewCreateContextMiddleware)
        server.middlewares.use(reviewContextMiddleware)
        server.middlewares.use(reviewSaveMiddleware)
        server.middlewares.use(reviewUploadImageMiddleware)
      },
    },
  ],
  server: {
    proxy: { '/api': process.env.API_URL ?? 'http://localhost:3000' },
  },
})
