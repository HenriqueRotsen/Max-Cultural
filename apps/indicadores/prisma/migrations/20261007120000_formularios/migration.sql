-- Formulários de inscrição (V1)

CREATE TYPE "FormularioTipo" AS ENUM ('INSCRICAO', 'AVALIACAO');
CREATE TYPE "FormularioRespostaStatus" AS ENUM ('PENDING', 'READY', 'MERGED', 'REJECTED');
CREATE TYPE "FormularioCampoTipo" AS ENUM (
  'SECTION',
  'SHORT_TEXT',
  'LONG_TEXT',
  'MULTIPLE_CHOICE',
  'CHECKBOXES',
  'DROPDOWN',
  'DATE',
  'EMAIL',
  'CPF',
  'PHONE_BR',
  'NAME',
  'BIRTHDATE',
  'GENERO',
  'ETNIA',
  'SIM_NAO_DETALHE',
  'ADDRESS_BR',
  'DECLARACAO',
  'PARTICIPACAO'
);

CREATE TABLE "formularios" (
  "id" TEXT NOT NULL,
  "oficina_id" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "descricao" TEXT NOT NULL DEFAULT '',
  "slug" TEXT NOT NULL,
  "abre_em" TIMESTAMP(3),
  "encerra_em" TIMESTAMP(3),
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "tipo" "FormularioTipo" NOT NULL DEFAULT 'INSCRICAO',
  "capa_url" TEXT NOT NULL DEFAULT '',
  "mensagem_confirmacao" TEXT NOT NULL DEFAULT 'Inscrição enviada com sucesso. Aguarde o contato da equipe.',
  "created_by_user_id" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "formularios_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "formulario_campos" (
  "id" TEXT NOT NULL,
  "formulario_id" TEXT NOT NULL,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "rotulo" TEXT NOT NULL,
  "descricao" TEXT NOT NULL DEFAULT '',
  "obrigatorio" BOOLEAN NOT NULL DEFAULT false,
  "tipo" "FormularioCampoTipo" NOT NULL,
  "siga_column" TEXT,
  "opcoes" JSONB,
  "config" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "formulario_campos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "formulario_respostas" (
  "id" TEXT NOT NULL,
  "formulario_id" TEXT NOT NULL,
  "cpf" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "FormularioRespostaStatus" NOT NULL DEFAULT 'PENDING',
  "selecionados" INTEGER NOT NULL DEFAULT 0,
  "participantes" INTEGER NOT NULL DEFAULT 0,
  "certificado" INTEGER NOT NULL DEFAULT 0,
  "merged_inscricao_id" TEXT,
  "reviewed_by_user_id" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "formulario_respostas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "oficina_professores" (
  "id" TEXT NOT NULL,
  "oficina_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "oficina_professores_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "formularios_slug_key" ON "formularios"("slug");
CREATE INDEX "formularios_oficina_id_idx" ON "formularios"("oficina_id");
CREATE INDEX "formularios_ativo_idx" ON "formularios"("ativo");

CREATE INDEX "formulario_campos_formulario_id_ordem_idx" ON "formulario_campos"("formulario_id", "ordem");

CREATE UNIQUE INDEX "formulario_respostas_formulario_id_cpf_key" ON "formulario_respostas"("formulario_id", "cpf");
CREATE INDEX "formulario_respostas_formulario_id_status_idx" ON "formulario_respostas"("formulario_id", "status");
CREATE INDEX "formulario_respostas_cpf_idx" ON "formulario_respostas"("cpf");

CREATE UNIQUE INDEX "oficina_professores_oficina_id_user_id_key" ON "oficina_professores"("oficina_id", "user_id");
CREATE INDEX "oficina_professores_user_id_idx" ON "oficina_professores"("user_id");
CREATE INDEX "oficina_professores_oficina_id_idx" ON "oficina_professores"("oficina_id");

ALTER TABLE "formularios" ADD CONSTRAINT "formularios_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "formulario_campos" ADD CONSTRAINT "formulario_campos_formulario_id_fkey" FOREIGN KEY ("formulario_id") REFERENCES "formularios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "formulario_respostas" ADD CONSTRAINT "formulario_respostas_formulario_id_fkey" FOREIGN KEY ("formulario_id") REFERENCES "formularios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "oficina_professores" ADD CONSTRAINT "oficina_professores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (mesmo padrão das demais tabelas do app)
DO $$
DECLARE
  sch text := current_schema();
  t text;
  tables text[] := ARRAY[
    'formularios',
    'formulario_campos',
    'formulario_respostas',
    'oficina_professores'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    IF to_regclass(format('%I.%I', sch, t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', sch, t);
    END IF;
  END LOOP;
END $$;
