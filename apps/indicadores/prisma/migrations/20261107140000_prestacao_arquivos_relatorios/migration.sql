-- Prestação de contas: fotos e documentos das fichas, e relatórios em PDF gerados.

CREATE TABLE "prestacao_arquivos" (
    "id" TEXT NOT NULL,
    "ficha_id" TEXT NOT NULL,
    "projeto_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "descricao" TEXT NOT NULL DEFAULT '',
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "no_relatorio" BOOLEAN NOT NULL DEFAULT true,
    "storage_path" TEXT NOT NULL,
    "nome_original" TEXT NOT NULL DEFAULT '',
    "mime" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "largura" INTEGER,
    "altura" INTEGER,
    "drive_file_id" TEXT,
    "enviado_por" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "prestacao_arquivos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "prestacao_arquivos_ficha_id_categoria_ordem_idx" ON "prestacao_arquivos"("ficha_id", "categoria", "ordem");
CREATE INDEX "prestacao_arquivos_projeto_id_idx" ON "prestacao_arquivos"("projeto_id");
ALTER TABLE "prestacao_arquivos" ADD CONSTRAINT "prestacao_arquivos_ficha_id_fkey" FOREIGN KEY ("ficha_id") REFERENCES "prestacao_fichas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "prestacao_relatorios" (
    "id" TEXT NOT NULL,
    "projeto_id" TEXT NOT NULL,
    "produto_id" TEXT,
    "modelo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "paginas" INTEGER,
    "drive_file_id" TEXT,
    "gerado_por" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "prestacao_relatorios_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "prestacao_relatorios_projeto_id_createdAt_idx" ON "prestacao_relatorios"("projeto_id", "createdAt");
ALTER TABLE "prestacao_relatorios" ADD CONSTRAINT "prestacao_relatorios_projeto_id_fkey" FOREIGN KEY ("projeto_id") REFERENCES "projetos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prestacao_relatorios" ADD CONSTRAINT "prestacao_relatorios_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "prestacao_produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "prestacao_arquivos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prestacao_relatorios" ENABLE ROW LEVEL SECURITY;

-- Campos que agora vêm do sistema (formulários, inscrições, avaliações) ou viram
-- fotos/documentos enviados na ficha. Saem do modelo inicial (ainda sem uso).
DELETE FROM "prestacao_campos" WHERE "chave" IN (
  'formulario_inscricao', 'planilha_respostas', 'lista_certificados', 'pesquisa_avaliacao',
  'print_selecionados', 'lista_presenca', 'print_presenca', 'print_certificado',
  'foto_1', 'foto_2', 'foto_acessibilidade_1', 'foto_acessibilidade_2',
  'print_pos_evento', 'print_divulgacao'
);
