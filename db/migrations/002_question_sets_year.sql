-- Add optional year to question_sets so teachers can tag their list with a school year.
ALTER TABLE question_sets ADD COLUMN IF NOT EXISTS year INTEGER;
