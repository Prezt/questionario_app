-- db/migrations/007_fix_unique_null_semantics.sql
-- Run once manually in the Neon SQL console (after 005 e 006).
-- Corrige o UNIQUE de multiple_choice_questions para tratar NULL como valor
-- (NULLS NOT DISTINCT — Postgres 15+). Sem isso, a idempotência via
-- ON CONFLICT DO NOTHING quebra para linhas com source_list = NULL (ENEM),
-- porque o Postgres default trata cada NULL como distinto.

-- 1) Dedupe: mantém o menor id em cada grupo lógico.
DELETE FROM multiple_choice_questions
WHERE id NOT IN (
  SELECT MIN(id)
  FROM multiple_choice_questions
  GROUP BY source, source_list, area, test, year, number
);

-- 2) Substitui a constraint pela versão NULLS NOT DISTINCT.
-- O nome da constraint original é gerado automaticamente pelo Postgres e
-- truncado a 63 chars. IF EXISTS blinda contra o caso em que o nome varie
-- entre ambientes.
ALTER TABLE multiple_choice_questions
  DROP CONSTRAINT IF EXISTS multiple_choice_questions_source_source_list_area_test_year_key;

ALTER TABLE multiple_choice_questions
  ADD CONSTRAINT multiple_choice_questions_source_key
  UNIQUE NULLS NOT DISTINCT (source, source_list, area, test, year, number);
