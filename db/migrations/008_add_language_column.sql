-- db/migrations/008_add_language_column.sql
-- Run once manually in the Neon SQL console (after 007).
-- Adiciona coluna `language` para desambiguar linguagens 1-5 (versoes
-- de ingles e espanhol ocupam os mesmos numeros de questao).
-- Reforca UNIQUE incluindo language.
-- Tambem DELETE das 40 linguagens 1-5 legadas que ficaram no DB com
-- language=NULL apos a dedupe incorreta do 007 — o proximo run do
-- migrate:questions vai reinsertar as 80 versoes corretas (40 ingles + 40 espanhol).

-- Limpa a constraint orfa deixada pelo 007 (o DROP original usou um nome
-- truncado errado — a orfa nao dropada nao causou danos porque ENEM tem
-- source_list=NULL que a torna permissiva, mas fica peso morto).
ALTER TABLE multiple_choice_questions
  DROP CONSTRAINT IF EXISTS multiple_choice_questions_source_source_list_area_test_year_key;

ALTER TABLE multiple_choice_questions
  ADD COLUMN IF NOT EXISTS language TEXT;

-- Limpa as 40 rows legadas de linguagens 1-5 (todas tem language=NULL agora)
DELETE FROM multiple_choice_questions
WHERE source = 'enem'
  AND area = 'linguagens'
  AND number BETWEEN 1 AND 5
  AND language IS NULL;

ALTER TABLE multiple_choice_questions
  DROP CONSTRAINT multiple_choice_questions_source_key;

ALTER TABLE multiple_choice_questions
  ADD CONSTRAINT multiple_choice_questions_source_key
  UNIQUE NULLS NOT DISTINCT (source, source_list, area, test, year, number, language);
