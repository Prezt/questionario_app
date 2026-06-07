-- Run this once in the Vercel/Neon SQL console to initialize the schema.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS feedback (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  question_number INTEGER,
  question_year   INTEGER,
  question_test   TEXT,
  question_area   TEXT,
  type            TEXT NOT NULL DEFAULT 'feedback',  -- 'feedback' | 'bug'
  body            TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- One row per day; stores the 8 selected question identifiers for all students
CREATE TABLE IF NOT EXISTS daily_challenges (
  id             SERIAL PRIMARY KEY,
  challenge_date DATE UNIQUE NOT NULL,
  questions      JSONB NOT NULL,  -- [{area, year, test, number}]
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- One row per user per day
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

-- Teacher/admin explanations per ENEM question, keyed by (area, year, test, number).
CREATE TABLE IF NOT EXISTS explanations (
  area        TEXT NOT NULL,
  year        INTEGER NOT NULL,
  test        TEXT NOT NULL,
  number      INTEGER NOT NULL,
  explanation TEXT NOT NULL,
  updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (area, year, test, number)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_test_results_user_id ON test_results(user_id);
