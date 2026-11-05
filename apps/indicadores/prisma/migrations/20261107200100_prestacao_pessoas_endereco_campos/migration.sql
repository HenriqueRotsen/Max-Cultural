-- Professor/artista vira lista de nomes; Local (endereço) vira endereço completo.
UPDATE "prestacao_campos" SET "tipo" = 'PESSOAS', "rotulo" = 'Professores/artistas', "sugestao" = 'RESPONSAVEIS',
  "ajuda" = 'Escreva o nome e tecle Enter. Usuários do sistema aparecem como opção enquanto você digita.'
  WHERE "chave" = 'professor_artista';
UPDATE "prestacao_campos" SET "tipo" = 'ENDERECO', "rotulo" = 'Local', "sugestao" = 'LOCAL',
  "ajuda" = 'Nome do local e endereço. Digite o CEP para preencher o endereço.'
  WHERE "chave" = 'endereco';

-- Valores já preenchidos no formato antigo.
UPDATE "prestacao_fichas"
  SET "valores" = jsonb_set("valores", '{professor_artista,v}', jsonb_build_array("valores"->'professor_artista'->'v'))
  WHERE jsonb_typeof("valores"->'professor_artista'->'v') = 'string';
UPDATE "prestacao_fichas"
  SET "valores" = jsonb_set("valores", '{endereco,v}', jsonb_build_object('logradouro', "valores"->'endereco'->'v'))
  WHERE jsonb_typeof("valores"->'endereco'->'v') = 'string';
