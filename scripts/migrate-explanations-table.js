#!/usr/bin/env node
// Creates the `explanations` table in the Neon DB if it doesn't exist.
// Run once from project root: node scripts/migrate-explanations-table.js
// Requires DATABASE_URL to be set.

import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

await sql`
  CREATE TABLE IF NOT EXISTS explanations (
    area TEXT NOT NULL,
    year INTEGER NOT NULL,
    test TEXT NOT NULL,
    number INTEGER NOT NULL,
    explanation TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by INTEGER REFERENCES users(id),
    PRIMARY KEY (area, year, test, number)
  )
`

console.log('✓ explanations table ready')
