-- Modelos editáveis de formulário (inscrição / avaliação)

CREATE TABLE "formulario_modelos" (
  "id" TEXT NOT NULL,
  "tipo" "FormularioTipo" NOT NULL,
  "nome" TEXT NOT NULL,
  "titulo_default" TEXT NOT NULL DEFAULT '',
  "descricao_default" TEXT NOT NULL DEFAULT '',
  "mensagem_confirmacao" TEXT NOT NULL DEFAULT '',
  "capa_url_default" TEXT NOT NULL DEFAULT '',
  "campos" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "formulario_modelos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "formulario_modelos_tipo_key" ON "formulario_modelos"("tipo");

DO $$
DECLARE
  sch text := current_schema();
BEGIN
  IF to_regclass(format('%I.%I', sch, 'formulario_modelos')) IS NOT NULL THEN
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', sch, 'formulario_modelos');
  END IF;
END $$;
