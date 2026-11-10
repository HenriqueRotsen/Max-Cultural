-- Alinha os nomes dos índices de inscricoes com o schema.prisma.
-- Na produção eles já têm o nome certo (vieram de `db push`); num banco criado
-- só pelas migrações ficavam em minúsculas. Só renomeia se o antigo existir.
DO $$
DECLARE
  par text[];
BEGIN
  FOREACH par SLICE 1 IN ARRAY ARRAY[
    ['inscricoes_cidade_idx', 'inscricoes_Cidade_idx'],
    ['inscricoes_estado_idx', 'inscricoes_Estado_idx'],
    ['inscricoes_territorio_idx', 'inscricoes_Territorio_idx']
  ] LOOP
    IF to_regclass(format('%I', par[1])) IS NOT NULL AND to_regclass(format('%I', par[2])) IS NULL THEN
      EXECUTE format('ALTER INDEX %I RENAME TO %I', par[1], par[2]);
    END IF;
  END LOOP;
END $$;
