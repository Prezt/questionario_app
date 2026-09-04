-- db/migrations/009_add_users_role.sql
-- Run once manually in the Neon SQL console.
-- Versiona a enum `user_role` e a coluna `users.role` que ja existem em
-- producao (criadas via console em algum momento sem migration). Idempotente:
-- roda sem efeito quando ja aplicado.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('user', 'prof', 'admin');
  END IF;
END $$;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role user_role NOT NULL DEFAULT 'user';
