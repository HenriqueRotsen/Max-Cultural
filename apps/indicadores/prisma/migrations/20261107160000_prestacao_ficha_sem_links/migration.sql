-- Prestação de contas: links do drive que viraram envio de arquivo na ficha
-- (release, relatórios, clipping, apostila e pastas). Fica só o link do Instagram.
DELETE FROM "prestacao_campos" WHERE "chave" IN (
  'pasta_prestacao', 'release', 'relatorio_redes', 'clipping', 'apostila',
  'midia_paga_relatorio', 'pasta_cobertura'
);
