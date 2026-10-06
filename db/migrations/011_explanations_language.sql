-- db/migrations/011_explanations_language.sql
-- Run once manually in the Neon SQL console (after 010).
--
-- Adiciona `language` a explanations. Nas questoes 1 a 5 de linguagens o
-- ingles e o espanhol ocupam o MESMO numero — 40 pares no banco — e a chave
-- (area, year, test, number) nao distingue os dois: gravar a resolucao de um
-- sobrescreveria a do outro. Por isso o scripts/import-resolucoes.js pulava
-- essas questoes e as listava no relatorio.
--
-- A PRIMARY KEY nao serve aqui porque exige NOT NULL, e `language` e NULL na
-- esmagadora maioria das questoes. A saida e a mesma do 007/008: UNIQUE
-- NULLS NOT DISTINCT (Postgres 15+), que trata NULL como valor e mantem o
-- ON CONFLICT do upsert funcionando.
--
-- Nao ha backfill: a tabela nao tinha nenhuma linha de linguagens 1-5
-- (conferido antes da migracao), entao nenhuma linha existente muda de chave.

ALTER TABLE explanations
  ADD COLUMN IF NOT EXISTS language TEXT;

ALTER TABLE explanations
  DROP CONSTRAINT IF EXISTS explanations_pkey;

ALTER TABLE explanations
  ADD CONSTRAINT explanations_key
  UNIQUE NULLS NOT DISTINCT (area, year, test, number, language);
