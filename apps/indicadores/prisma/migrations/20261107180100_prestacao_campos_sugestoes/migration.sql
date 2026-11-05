-- Sugestões dos campos do modelo inicial (migração separada: os tipos novos
-- só podem ser usados depois de criados).
UPDATE "prestacao_campos" SET "sugestao" = 'STATUS_DATA' WHERE "chave" = 'status';
UPDATE "prestacao_campos" SET "sugestao" = 'SIM' WHERE "chave" = 'conta_como_acao';
UPDATE "prestacao_campos" SET "sugestao" = 'PARTICIPANTES',
  "ajuda" = 'Sugestão: participantes das inscrições. Para ações sem inscrição (apresentações, eventos), informe o público estimado.'
  WHERE "chave" = 'publico';
UPDATE "prestacao_campos" SET "tipo" = 'HORARIO', "rotulo" = 'Horário', "ajuda" = 'Início e fim de cada dia da execução.'
  WHERE "chave" = 'horarios';
UPDATE "prestacao_campos" SET "sugestao" = 'CARGA_HORARIA', "ajuda" = 'Calculada pelo horário × dias da execução; corrija se precisar.'
  WHERE "chave" = 'carga_horaria_min';
UPDATE "prestacao_campos" SET "sugestao" = 'HISTORICO' WHERE "chave" IN ('endereco', 'categoria');
UPDATE "prestacao_campos" SET "sugestao" = 'RESPONSAVEIS' WHERE "chave" = 'professor_artista';
UPDATE "prestacao_campos" SET "tipo" = 'MULTIPLA', "sugestao" = 'PERFIL',
  "opcoes" = ARRAY['Crianças e adolescentes', 'Jovens', 'Adultos', 'Pessoas idosas', 'Mulheres', 'Pessoas negras',
    'Povos indígenas', 'Comunidades quilombolas', 'Pessoas com deficiência', 'LGBTQIA+',
    'Pessoas em situação de vulnerabilidade', 'Estudantes de escola pública', 'Público geral']::TEXT[],
  "ajuda" = 'Grupos atendidos. Sugestão a partir do perfil das inscrições.'
  WHERE "chave" = 'identidade_inclusao';
UPDATE "prestacao_campos" SET "ajuda" = 'Endereço do post no Instagram (instagram.com/…).' WHERE "chave" = 'instagram';
