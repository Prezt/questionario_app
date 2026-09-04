-- db/migrations/010_create_contexts.sql
-- Run once manually in the Neon SQL console.
-- Cria a tabela `contexts` — passagens de leitura compartilhadas entre
-- multiplas questoes de multipla escolha (multiple_choice_questions.context_keys
-- aponta pra cada `key` daqui). Chave primaria natural (nao SERIAL) porque a
-- key ja e o identificador estavel usado em context_keys.

-- Nota: text e reference sao nullable porque contextos so-imagem legitimos
-- (com figura mas sem texto/atribuicao — a fonte vai na legenda inline da
-- questao) tem ambos vazios ou null no JSON. Enforcar "images XOR text"
-- via check constraint seria mais rigoroso, mas os dados atuais tem varias
-- combinacoes (ex: apenas title + reference) que quebrariam isso.
CREATE TABLE IF NOT EXISTS contexts (
  key        TEXT PRIMARY KEY,
  title      TEXT,
  subtitle   TEXT,
  text       TEXT,
  reference  TEXT,
  images     TEXT[] DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
