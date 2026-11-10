-- Campos de pessoas (vários nomes) e de endereço na ficha da prestação de contas.
ALTER TYPE "TipoCampoPrestacao" ADD VALUE IF NOT EXISTS 'PESSOAS';
ALTER TYPE "TipoCampoPrestacao" ADD VALUE IF NOT EXISTS 'ENDERECO';
