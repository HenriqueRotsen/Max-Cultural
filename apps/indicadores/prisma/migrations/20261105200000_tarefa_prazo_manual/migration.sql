-- Prazo de tarefa alterado à mão não é recalculado pelo modelo.
ALTER TABLE "tarefas" ADD COLUMN IF NOT EXISTS "prazo_manual" BOOLEAN NOT NULL DEFAULT false;
