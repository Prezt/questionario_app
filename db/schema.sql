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
  question_times JSONB,
  answered_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feedback (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  question_number INTEGER,
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
  answers        JSONB,  -- {questionNumber: {selected, correct}}
  completed_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, challenge_date)
);
