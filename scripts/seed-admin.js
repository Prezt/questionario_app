#!/usr/bin/env node
// Upserts an admin user with password "admin" into the DB.
// Run from project root: node scripts/seed-admin.js
// Requires DATABASE_URL to be set (via .env or environment).

import { neon } from '@neondatabase/serverless'
import bcrypt from 'bcryptjs'

const sql = neon(process.env.DATABASE_URL)
const hash = await bcrypt.hash('admin', 10)

await sql`
  INSERT INTO users (username, password_hash)
  VALUES ('admin', ${hash})
  ON CONFLICT (username) DO UPDATE SET password_hash = ${hash}
`

console.log('✓ admin user ready (password: admin)')
