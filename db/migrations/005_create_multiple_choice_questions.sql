-- db/migrations/005_create_multiple_choice_questions.sql
-- Run once manually in the Neon SQL console.
-- Cria a tabela `multiple_choice_questions` — banco unificado de questões de múltipla escolha.

CREATE TABLE IF NOT EXISTS multiple_choice_questions (
  id            SERIAL PRIMARY KEY,

  source        TEXT NOT NULL,
  source_list   TEXT,
  area          TEXT,
  test          TEXT,
  year          INTEGER,
  number        INTEGER NOT NULL,

  text          TEXT NOT NULL,
  alternatives  JSONB NOT NULL,
  answer        TEXT NOT NULL,
  images        TEXT[] DEFAULT '{}',
  tags          TEXT[] DEFAULT '{}',
  disciplinas   TEXT[] DEFAULT '{}',
  difficulty    INTEGER,
  context_key   TEXT,

  review        BOOLEAN DEFAULT FALSE,

  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (source, source_list, area, test, year, number)
);

CREATE INDEX IF NOT EXISTS idx_mcq_area        ON multiple_choice_questions(area);
CREATE INDEX IF NOT EXISTS idx_mcq_year        ON multiple_choice_questions(year);
CREATE INDEX IF NOT EXISTS idx_mcq_source      ON multiple_choice_questions(source);
CREATE INDEX IF NOT EXISTS idx_mcq_tags        ON multiple_choice_questions USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_mcq_disciplinas ON multiple_choice_questions USING GIN(disciplinas);
