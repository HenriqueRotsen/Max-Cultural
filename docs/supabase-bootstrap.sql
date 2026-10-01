-- Bootstrap do Postgres Supabase (1 projeto, 3 apps).
-- Rode no SQL Editor do Supabase ANTES de prisma migrate deploy.
--
-- Schemas:
--   public  → MAX Cultural (hub IAM + audit_logs central)
--   origem  → MAX Origem
--   fluxo   → MAX Fluxo

CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS origem;
CREATE SCHEMA IF NOT EXISTS fluxo;

-- Opcional: garantir search_path padrão (apps usam ?schema= na connection string)
-- ALTER DATABASE postgres SET search_path TO public;
