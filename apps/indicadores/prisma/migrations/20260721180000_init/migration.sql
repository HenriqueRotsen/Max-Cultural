-- CreateTable
CREATE TABLE "inscricoes" (
    "id" TEXT NOT NULL,
    "id_projeto" TEXT NOT NULL,
    "id_oficina" TEXT NOT NULL,
    "PROPONENTE" TEXT NOT NULL,
    "PRONAC" TEXT NOT NULL,
    "Nome_projeto" TEXT NOT NULL,
    "Identificacao_ano_projeto" TEXT NOT NULL,
    "Nome_oficina" TEXT NOT NULL,
    "Data_inscricao" TEXT NOT NULL,
    "Nome" TEXT NOT NULL,
    "Apelido" TEXT NOT NULL DEFAULT '',
    "CPF" TEXT NOT NULL,
    "Data_nascimento" TEXT NOT NULL DEFAULT '',
    "Genero" TEXT NOT NULL DEFAULT '',
    "Etnia" TEXT NOT NULL DEFAULT '',
    "E-mail" TEXT NOT NULL DEFAULT '',
    "Telefone" TEXT NOT NULL DEFAULT '',
    "Possui_deficiencia" TEXT NOT NULL DEFAULT 'Não',
    "RestricaoAlimentar" TEXT NOT NULL DEFAULT '',
    "Ficousabendo" TEXT NOT NULL DEFAULT '',
    "Lougradouro" TEXT NOT NULL DEFAULT '',
    "Numero" TEXT NOT NULL DEFAULT '',
    "Complemento" TEXT NOT NULL DEFAULT '',
    "Bairro" TEXT NOT NULL DEFAULT '',
    "CEP" TEXT NOT NULL DEFAULT '',
    "Cidade" TEXT NOT NULL DEFAULT '',
    "Estado" TEXT NOT NULL DEFAULT '',
    "Redesocial" TEXT NOT NULL DEFAULT '',
    "Escolaridade" TEXT NOT NULL DEFAULT '',
    "idade_atual" INTEGER,
    "idade_inscricao" INTEGER,
    "Territorio" TEXT NOT NULL DEFAULT '',
    "Inscritos" INTEGER NOT NULL DEFAULT 1,
    "Selecionados" INTEGER NOT NULL DEFAULT 0,
    "Participantes" INTEGER NOT NULL DEFAULT 0,
    "Certificado" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inscricoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inscricoes_id_projeto_idx" ON "inscricoes"("id_projeto");
CREATE INDEX "inscricoes_id_oficina_idx" ON "inscricoes"("id_oficina");
CREATE INDEX "inscricoes_PRONAC_idx" ON "inscricoes"("PRONAC");
CREATE INDEX "inscricoes_CPF_idx" ON "inscricoes"("CPF");
