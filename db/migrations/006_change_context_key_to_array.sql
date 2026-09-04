-- db/migrations/006_change_context_key_to_array.sql
-- Run once manually in the Neon SQL console (after 005).
-- Troca `context_key TEXT` por `context_keys TEXT[]` em multiple_choice_questions.
-- Motivo: algumas questões (principalmente humanas/linguagens) referenciam
-- múltiplos contextos legítimos; o single-value dropava N-1 silenciosamente.
-- Seguro porque a tabela ainda está vazia (nenhum INSERT rodou antes deste ALTER).

ALTER TABLE multiple_choice_questions
  DROP COLUMN context_key,
  ADD COLUMN context_keys TEXT[] DEFAULT '{}';
a