-- Add year, test, and area context to feedback rows
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS question_year INTEGER;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS question_test TEXT;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS question_area TEXT;
