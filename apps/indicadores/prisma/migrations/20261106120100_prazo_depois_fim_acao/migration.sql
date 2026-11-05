-- Tarefas de "Depois" da ação contam do fim da execução da ação
-- (migração separada: o valor FIM_ACAO só pode ser usado depois de criado).
UPDATE "tarefa_modelos" SET "prazo_base" = 'FIM_ACAO' WHERE "prazo_base" = 'INICIO_ACAO' AND "fase" = 'DEPOIS';
