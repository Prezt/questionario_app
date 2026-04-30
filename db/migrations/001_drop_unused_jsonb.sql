-- db/migrations/001_drop_unused_jsonb.sql
-- Run once manually in the Neon SQL console.

ALTER TABLE test_results DROP COLUMN IF EXISTS question_times;
ALTER TABLE daily_challenge_results DROP COLUMN IF EXISTS answers;

-- Reclaim storage from existing rows
VACUUM FULL test_results;
VACUUM FULL daily_challenge_results;

-- Index for retention DELETE and results GET
CREATE INDEX IF NOT EXISTS idx_test_results_user_id ON test_results(user_id);
