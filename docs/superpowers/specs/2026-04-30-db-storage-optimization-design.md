# DB Storage Optimization Design

**Date:** 2026-04-30  
**Scope:** Reduce PostgreSQL (Neon) storage consumption for the questionario_app, which operates under a 0.5 GB limit with ~200 users.

---

## Problem

The `test_results` table stores a `question_times JSONB` column (up to 90 key-value pairs per row) and `daily_challenge_results` stores an `answers JSONB` column. Neither column is ever read back from the database — all query endpoints explicitly exclude them. They are pure write-only storage waste and the primary driver of storage growth.

Additionally, `test_results` has no row limit per user, allowing unbounded growth as users retake exams.

---

## Solution Overview

Three changes, applied together:

1. **Drop unused JSONB columns** — reclaim storage from all existing and future rows.
2. **Retention policy** — bound future growth to a safe per-user row count.
3. **Index on `test_results(user_id)`** — make the retention DELETE and results GET efficient.

---

## Section 1 — Column Removal

### Migration (`db/migrations/001_drop_unused_jsonb.sql`)

```sql
ALTER TABLE test_results DROP COLUMN question_times;
ALTER TABLE daily_challenge_results DROP COLUMN answers;
VACUUM FULL test_results;
VACUUM FULL daily_challenge_results;
```

Run once manually in the Neon SQL console (same pattern as `db/schema.sql`).

### Code changes

- **`api/results/index.js`** — remove `question_times` from the destructured POST body and from the INSERT statement.
- **`api/daily-challenge/result.js`** — remove `answers` from the destructured POST body and from the INSERT statement.
- **`src/App.jsx`** — remove `question_times: accQuestionTimesRef.current` from the fetch POST body (line 870). The ref and local state for `question_times` can remain as-is since they drive the in-session UI; only the DB write is removed.

---

## Section 2 — Retention Policy

### Rule

After every INSERT into `test_results`, delete rows for that user that are **neither**:
- the top score for each `(test, year)` combination, **nor**
- among the 20 most recent results for that user.

This guarantees the UI's two requirements — personal bests and recent history — while bounding storage.

### Implementation

A cleanup query runs in `api/results/index.js` immediately after the INSERT. No trigger or cron job — keeps the logic serverless-friendly and co-located with the write.

```sql
DELETE FROM test_results
WHERE user_id = $1
  AND id NOT IN (
    SELECT DISTINCT ON (test, year) id
    FROM test_results
    WHERE user_id = $1
    ORDER BY test, year, score DESC
  )
  AND id NOT IN (
    SELECT id
    FROM test_results
    WHERE user_id = $1
    ORDER BY answered_at DESC
    LIMIT 20
  );
```

Using Neon's tagged template literal client:

```js
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
      SELECT id FROM test_results
      WHERE user_id = ${payload.userId}
      ORDER BY answered_at DESC
      LIMIT 20
    )
`
```

---

## Section 3 — Index

Add an index on `test_results(user_id)` to make both the retention DELETE and the results GET efficient. Without it, both queries scan the full table on every request.

Added to the same migration file:

```sql
CREATE INDEX IF NOT EXISTS idx_test_results_user_id ON test_results(user_id);
```

---

## Files Changed

| File | Change |
|------|--------|
| `db/migrations/001_drop_unused_jsonb.sql` | New — migration to drop columns, vacuum, add index |
| `db/schema.sql` | Update to remove `question_times` and `answers` columns |
| `api/results/index.js` | Remove `question_times` from INSERT; add retention DELETE after INSERT |
| `api/daily-challenge/result.js` | Remove `answers` from INSERT |
| `src/App.jsx` | Remove `question_times` from fetch POST body |

---

## What Is Not Changed

- `question_times` local state and ref in `App.jsx` — still drives the in-session per-question timer UI.
- `daily_challenges.questions` JSONB — actively read and necessary.
- `daily_challenge_results` retention — one row per user per day with a UNIQUE constraint; growth is naturally bounded.
