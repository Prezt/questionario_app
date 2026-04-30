# DB Storage Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce PostgreSQL (Neon) storage consumption by dropping two write-only JSONB columns, adding a per-user row retention policy, and indexing `test_results(user_id)`.

**Architecture:** Drop `question_times` from `test_results` and `answers` from `daily_challenge_results` via a SQL migration run manually in Neon. After each test result INSERT, run a cleanup DELETE that keeps only the top score per (test, year) and the 20 most recent rows for that user. Add a `user_id` index so both queries are efficient.

**Tech Stack:** PostgreSQL (Neon serverless), `@neondatabase/serverless` tagged template literals, Vercel serverless functions (ESM), React 19 / Vite.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `db/migrations/001_drop_unused_jsonb.sql` | **Create** | One-time migration: drop columns, vacuum, add index |
| `db/schema.sql` | **Modify** | Remove `question_times` and `answers` to keep schema in sync |
| `api/results/index.js` | **Modify** | Remove `question_times` from INSERT; add retention DELETE after INSERT |
| `api/daily-challenge/result.js` | **Modify** | Remove `answers` from INSERT |
| `src/App.jsx` | **Modify** | Remove `question_times` from fetch POST body |

---

## Task 1: Create migration file

**Files:**
- Create: `db/migrations/001_drop_unused_jsonb.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- db/migrations/001_drop_unused_jsonb.sql
-- Run once manually in the Neon SQL console.

ALTER TABLE test_results DROP COLUMN IF EXISTS question_times;
ALTER TABLE daily_challenge_results DROP COLUMN IF EXISTS answers;

-- Reclaim storage from existing rows
VACUUM FULL test_results;
VACUUM FULL daily_challenge_results;

-- Index for retention DELETE and results GET
CREATE INDEX IF NOT EXISTS idx_test_results_user_id ON test_results(user_id);
```

- [ ] **Step 2: Verify the file was created**

```bash
cat db/migrations/001_drop_unused_jsonb.sql
```

Expected: full SQL content printed with no errors.

- [ ] **Step 3: Commit**

```bash
git add db/migrations/001_drop_unused_jsonb.sql
git commit -m "feat: add migration to drop unused JSONB columns and add user_id index"
```

---

## Task 2: Update db/schema.sql to match

**Files:**
- Modify: `db/schema.sql`

The schema file is the source of truth for a fresh database setup. It must reflect the migration.

- [ ] **Step 1: Remove `question_times` from `test_results`**

In `db/schema.sql`, find the `test_results` table definition:

```sql
CREATE TABLE IF NOT EXISTS test_results (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER REFERENCES users(id) ON DELETE CASCADE,
  test           TEXT NOT NULL,
  year           INTEGER NOT NULL,
  day            INTEGER NOT NULL,
  score          INTEGER NOT NULL,
  total          INTEGER NOT NULL,
  elapsed_secs   INTEGER NOT NULL,
  question_times JSONB,
  answered_at    TIMESTAMPTZ DEFAULT NOW()
);
```

Replace it with:

```sql
CREATE TABLE IF NOT EXISTS test_results (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER REFERENCES users(id) ON DELETE CASCADE,
  test           TEXT NOT NULL,
  year           INTEGER NOT NULL,
  day            INTEGER NOT NULL,
  score          INTEGER NOT NULL,
  total          INTEGER NOT NULL,
  elapsed_secs   INTEGER NOT NULL,
  answered_at    TIMESTAMPTZ DEFAULT NOW()
);
```

- [ ] **Step 2: Remove `answers` from `daily_challenge_results`**

Find:

```sql
CREATE TABLE IF NOT EXISTS daily_challenge_results (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER REFERENCES users(id) ON DELETE CASCADE,
  challenge_date DATE NOT NULL,
  score          INTEGER NOT NULL,
  total          INTEGER NOT NULL,
  elapsed_secs   INTEGER NOT NULL,
  answers        JSONB,  -- {questionNumber: {selected, correct}}
  completed_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, challenge_date)
);
```

Replace with:

```sql
CREATE TABLE IF NOT EXISTS daily_challenge_results (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER REFERENCES users(id) ON DELETE CASCADE,
  challenge_date DATE NOT NULL,
  score          INTEGER NOT NULL,
  total          INTEGER NOT NULL,
  elapsed_secs   INTEGER NOT NULL,
  completed_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, challenge_date)
);
```

- [ ] **Step 3: Add the index declaration at the bottom of schema.sql**

Append after the last `CREATE TABLE` block:

```sql
-- Indexes
CREATE INDEX IF NOT EXISTS idx_test_results_user_id ON test_results(user_id);
```

- [ ] **Step 4: Verify no remaining references to removed columns**

```bash
grep -n "question_times\|answers JSONB" db/schema.sql
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add db/schema.sql
git commit -m "feat: remove question_times and answers columns from schema"
```

---

## Task 3: Update api/results/index.js

**Files:**
- Modify: `api/results/index.js`

Remove `question_times` from the INSERT and add the retention DELETE immediately after.

- [ ] **Step 1: Replace the POST handler**

Open `api/results/index.js`. Replace the entire file content with:

```js
import { neon } from '@neondatabase/serverless'
import { verifyToken } from '../_auth.js'

export default async function handler(req, res) {
  const payload = verifyToken(req)
  if (!payload) return res.status(401).json({ error: 'Não autorizado' })

  const sql = neon(process.env.DATABASE_URL)

  if (req.method === 'POST') {
    const { test, year, day, score, total, elapsed_secs } = req.body ?? {}
    await sql`
      INSERT INTO test_results (user_id, test, year, day, score, total, elapsed_secs)
      VALUES (
        ${payload.userId}, ${test}, ${year}, ${day},
        ${score}, ${total}, ${elapsed_secs}
      )
    `

    // Retention: keep top score per (test, year) + 20 most recent per user
    await sql`
      DELETE FROM test_results
      WHERE user_id = ${payload.userId}
        AND id NOT IN (
          SELECT DISTINCT ON (test, year) id
          FROM test_results
          WHERE user_id = ${payload.userId}
          ORDER BY test, year, score DESC
        )
        AND id NOT IN (
          SELECT id
          FROM test_results
          WHERE user_id = ${payload.userId}
          ORDER BY answered_at DESC
          LIMIT 20
        )
    `

    return res.status(201).json({ ok: true })
  }

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT id, test, year, day, score, total, elapsed_secs, answered_at
      FROM test_results
      WHERE user_id = ${payload.userId}
      ORDER BY answered_at DESC
    `
    return res.json(rows)
  }

  res.status(405).end()
}
```

- [ ] **Step 2: Verify no remaining reference to question_times**

```bash
grep -n "question_times" api/results/index.js
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add api/results/index.js
git commit -m "feat: remove question_times from INSERT and add retention policy"
```

---

## Task 4: Update api/daily-challenge/result.js

**Files:**
- Modify: `api/daily-challenge/result.js`

Remove `answers` from the INSERT.

- [ ] **Step 1: Replace the file content**

```js
import { neon } from '@neondatabase/serverless'
import { verifyToken } from '../_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const payload = verifyToken(req)
  if (!payload) return res.status(401).json({ error: 'Não autorizado' })

  const sql = neon(process.env.DATABASE_URL)
  const today = new Date().toISOString().split('T')[0]

  const { score, total, elapsed_secs } = req.body ?? {}

  await sql`
    INSERT INTO daily_challenge_results (user_id, challenge_date, score, total, elapsed_secs)
    VALUES (${payload.userId}, ${today}, ${score}, ${total}, ${elapsed_secs})
    ON CONFLICT (user_id, challenge_date) DO NOTHING
  `

  return res.status(201).json({ ok: true })
}
```

- [ ] **Step 2: Verify no remaining reference to answers**

```bash
grep -n "answers" api/daily-challenge/result.js
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add api/daily-challenge/result.js
git commit -m "feat: remove answers column from daily challenge result INSERT"
```

---

## Task 5: Update src/App.jsx

**Files:**
- Modify: `src/App.jsx` (line ~870)

Remove `question_times` from the fetch POST body. The local ref and state for `question_times` are untouched — they still drive the in-session per-question timer UI.

- [ ] **Step 1: Find the fetch call**

```bash
grep -n "question_times" src/App.jsx
```

Expected output: lines referencing `question_times: accQuestionTimesRef.current` in the fetch body (around line 870).

- [ ] **Step 2: Remove `question_times` from the fetch body**

Find the fetch POST body that looks like:

```js
body: JSON.stringify({
  test: selectedTest,
  year: selectedYear,
  day: selectedDay,
  score,
  total: questions.length,
  elapsed_secs: finalTotal,
  question_times: accQuestionTimesRef.current,
}),
```

Remove the `question_times` line so it becomes:

```js
body: JSON.stringify({
  test: selectedTest,
  year: selectedYear,
  day: selectedDay,
  score,
  total: questions.length,
  elapsed_secs: finalTotal,
}),
```

- [ ] **Step 3: Verify**

```bash
grep -n "question_times" src/App.jsx
```

Expected: only lines related to local state/ref (`accQuestionTimesRef`, `setQuestionTimes`, `questionTimes`) — none should be inside a `JSON.stringify` or fetch body.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: stop sending question_times to API"
```

---

## Task 6: Run migration in Neon console (manual step)

This step must be done by a human with access to the Neon dashboard.

- [ ] **Step 1: Open the Neon SQL console**

Go to your Neon project dashboard → SQL Editor.

- [ ] **Step 2: Paste and run the migration**

Copy the contents of `db/migrations/001_drop_unused_jsonb.sql` and execute it. The statements run in order: `ALTER TABLE` (×2), `VACUUM FULL` (×2), `CREATE INDEX`.

Note: `VACUUM FULL` may take a few seconds on a small DB. It requires an exclusive lock, so run it when no active user sessions are expected.

- [ ] **Step 3: Verify in Neon**

Run this in the SQL console to confirm the columns are gone and the index exists:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'test_results'
ORDER BY ordinal_position;

SELECT column_name FROM information_schema.columns
WHERE table_name = 'daily_challenge_results'
ORDER BY ordinal_position;

SELECT indexname FROM pg_indexes
WHERE tablename = 'test_results';
```

Expected:
- `question_times` absent from `test_results` columns
- `answers` absent from `daily_challenge_results` columns
- `idx_test_results_user_id` present in `pg_indexes`

---

## Task 7: End-to-end smoke test

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Log in and complete a test**

Complete any exam in the app. The submission should succeed (HTTP 201) with no errors in the browser console or Vercel function logs.

- [ ] **Step 3: Verify results appear**

Navigate to the results/history view. Your just-submitted result should appear correctly with score, test name, year, and date.

- [ ] **Step 4: Complete the daily challenge**

Submit a daily challenge. It should succeed with no errors.

- [ ] **Step 5: Check Neon storage**

In the Neon dashboard, check the storage usage. It should be lower than before running the migration (due to VACUUM reclaiming freed space from the dropped columns).

- [ ] **Step 6: Build for production**

```bash
npm run build
```

Expected: build completes with no errors.

- [ ] **Step 7: Final commit**

```bash
git add .
git commit -m "chore: verify db storage optimization end-to-end"
```
