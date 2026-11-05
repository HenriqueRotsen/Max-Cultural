-- Campos "inteligentes" da ficha: tipos novos (várias opções, horário) e sugestão automática.
ALTER TYPE "TipoCampoPrestacao" ADD VALUE IF NOT EXISTS 'MULTIPLA';
ALTER TYPE "TipoCampoPrestacao" ADD VALUE IF NOT EXISTS 'HORARIO';
ALTER TABLE "prestacao_campos" ADD COLUMN IF NOT EXISTS "sugestao" TEXT;
