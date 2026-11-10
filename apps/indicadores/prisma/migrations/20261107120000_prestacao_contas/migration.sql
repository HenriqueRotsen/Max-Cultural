-- Prestação de contas: dados do projeto, produtos e metas, modelo da ficha e
-- uma ficha por execução da ação (item da agenda).

CREATE TYPE "EquipePrestacao" AS ENUM ('PRODUCAO', 'COMUNICACAO', 'GESTAO');
CREATE TYPE "TipoCampoPrestacao" AS ENUM ('TEXTO', 'TEXTO_LONGO', 'NUMERO', 'DATA', 'LINK', 'OPCOES', 'SIM_NAO');

CREATE TABLE "prestacao_projetos" (
    "id" TEXT NOT NULL,
    "projeto_id" TEXT NOT NULL,
    "lei" TEXT,
    "identificacao" TEXT NOT NULL DEFAULT '',
    "patrocinador" TEXT NOT NULL DEFAULT '',
    "entregue_em" TIMESTAMP(3),
    "entregue_por" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "prestacao_projetos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "prestacao_projetos_projeto_id_key" ON "prestacao_projetos"("projeto_id");
ALTER TABLE "prestacao_projetos" ADD CONSTRAINT "prestacao_projetos_projeto_id_fkey" FOREIGN KEY ("projeto_id") REFERENCES "projetos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "prestacao_produtos" (
    "id" TEXT NOT NULL,
    "projeto_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "meta" TEXT NOT NULL DEFAULT '',
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "prestacao_produtos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "prestacao_produtos_projeto_id_ordem_idx" ON "prestacao_produtos"("projeto_id", "ordem");
ALTER TABLE "prestacao_produtos" ADD CONSTRAINT "prestacao_produtos_projeto_id_fkey" FOREIGN KEY ("projeto_id") REFERENCES "projetos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "prestacao_campos" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,
    "ajuda" TEXT NOT NULL DEFAULT '',
    "tipo" "TipoCampoPrestacao" NOT NULL,
    "opcoes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "equipe" "EquipePrestacao" NOT NULL,
    "obrigatorio" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "prestacao_campos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "prestacao_campos_chave_key" ON "prestacao_campos"("chave");
CREATE INDEX "prestacao_campos_equipe_ordem_idx" ON "prestacao_campos"("equipe", "ordem");

CREATE TABLE "prestacao_fichas" (
    "id" TEXT NOT NULL,
    "agenda_id" TEXT NOT NULL,
    "projeto_id" TEXT NOT NULL,
    "produto_id" TEXT,
    "valores" JSONB NOT NULL DEFAULT '{}',
    "ajustes" JSONB NOT NULL DEFAULT '{}',
    "atualizado_por" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "prestacao_fichas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "prestacao_fichas_agenda_id_key" ON "prestacao_fichas"("agenda_id");
CREATE INDEX "prestacao_fichas_projeto_id_idx" ON "prestacao_fichas"("projeto_id");
ALTER TABLE "prestacao_fichas" ADD CONSTRAINT "prestacao_fichas_agenda_id_fkey" FOREIGN KEY ("agenda_id") REFERENCES "acao_agendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prestacao_fichas" ADD CONSTRAINT "prestacao_fichas_projeto_id_fkey" FOREIGN KEY ("projeto_id") REFERENCES "projetos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prestacao_fichas" ADD CONSTRAINT "prestacao_fichas_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "prestacao_produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Mesmo padrão das outras tabelas: acesso só pelo servidor (sem políticas para anon/authenticated).
ALTER TABLE "prestacao_projetos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prestacao_produtos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prestacao_campos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prestacao_fichas" ENABLE ROW LEVEL SECURITY;

-- Modelo inicial da ficha: os campos da apresentação "framework PRESTAÇÃO DE CONTAS".
-- (Ano, proponente, projeto, PRONAC, ação, tipo, cidade/UF, datas, mês, inscritos,
-- participantes, PCDs e certificados vêm do sistema e não entram aqui.)
INSERT INTO "prestacao_campos" ("id", "chave", "rotulo", "ajuda", "tipo", "opcoes", "equipe", "ordem", "updatedAt") VALUES
  ('pc-status', 'status', 'Status', '', 'OPCOES', ARRAY['Confirmada','Agendada','Realizada']::TEXT[], 'PRODUCAO', 1, CURRENT_TIMESTAMP),
  ('pc-conta_como_acao', 'conta_como_acao', 'Conta como ação', '', 'SIM_NAO', ARRAY[]::TEXT[], 'PRODUCAO', 2, CURRENT_TIMESTAMP),
  ('pc-tipo_instituicao', 'tipo_instituicao', 'Tipo de escola ou instituição atendida', '', 'OPCOES', ARRAY['Escola particular','Instituição pública','Instituição social']::TEXT[], 'PRODUCAO', 3, CURRENT_TIMESTAMP),
  ('pc-vagas', 'vagas', 'Quantidade de vagas', '', 'NUMERO', ARRAY[]::TEXT[], 'PRODUCAO', 4, CURRENT_TIMESTAMP),
  ('pc-publico', 'publico', 'Quantidade de público', 'Para ações sem inscrição (apresentações, eventos).', 'NUMERO', ARRAY[]::TEXT[], 'PRODUCAO', 5, CURRENT_TIMESTAMP),
  ('pc-carga_horaria_min', 'carga_horaria_min', 'Carga horária total (minutos)', 'O sistema mostra também em horas.', 'NUMERO', ARRAY[]::TEXT[], 'PRODUCAO', 6, CURRENT_TIMESTAMP),
  ('pc-endereco', 'endereco', 'Local (endereço)', '', 'TEXTO', ARRAY[]::TEXT[], 'PRODUCAO', 7, CURRENT_TIMESTAMP),
  ('pc-horarios', 'horarios', 'Horários', '', 'TEXTO', ARRAY[]::TEXT[], 'PRODUCAO', 8, CURRENT_TIMESTAMP),
  ('pc-categoria', 'categoria', 'Categoria', '', 'TEXTO', ARRAY[]::TEXT[], 'PRODUCAO', 9, CURRENT_TIMESTAMP),
  ('pc-identidade_inclusao', 'identidade_inclusao', 'Identidade/inclusão', 'Grupo atendido: mulheres, crianças, jovens, PCDs etc.', 'TEXTO', ARRAY[]::TEXT[], 'PRODUCAO', 10, CURRENT_TIMESTAMP),
  ('pc-professor_artista', 'professor_artista', 'Professor/artista', '', 'TEXTO', ARRAY[]::TEXT[], 'PRODUCAO', 11, CURRENT_TIMESTAMP),
  ('pc-pesquisa_avaliacao', 'pesquisa_avaliacao', 'Pesquisa de avaliação', '', 'LINK', ARRAY[]::TEXT[], 'PRODUCAO', 12, CURRENT_TIMESTAMP),
  ('pc-pasta_prestacao', 'pasta_prestacao', 'Pasta com fotos e prints para a prestação de contas', '', 'LINK', ARRAY[]::TEXT[], 'PRODUCAO', 13, CURRENT_TIMESTAMP),
  ('pc-observacoes', 'observacoes', 'Observações', '', 'TEXTO_LONGO', ARRAY[]::TEXT[], 'PRODUCAO', 14, CURRENT_TIMESTAMP),
  ('pc-release', 'release', 'Release de divulgação', '', 'LINK', ARRAY[]::TEXT[], 'COMUNICACAO', 1, CURRENT_TIMESTAMP),
  ('pc-relatorio_redes', 'relatorio_redes', 'Relatório de redes sociais do período (PDF)', '', 'LINK', ARRAY[]::TEXT[], 'COMUNICACAO', 2, CURRENT_TIMESTAMP),
  ('pc-clipping', 'clipping', 'Relatório de clipping', '', 'LINK', ARRAY[]::TEXT[], 'COMUNICACAO', 3, CURRENT_TIMESTAMP),
  ('pc-apostila', 'apostila', 'Apostila utilizada na atividade', '', 'LINK', ARRAY[]::TEXT[], 'COMUNICACAO', 4, CURRENT_TIMESTAMP),
  ('pc-midia_paga', 'midia_paga', 'Houve mídia paga? Descreva', '', 'TEXTO_LONGO', ARRAY[]::TEXT[], 'COMUNICACAO', 5, CURRENT_TIMESTAMP),
  ('pc-midia_paga_relatorio', 'midia_paga_relatorio', 'Relatório da mídia paga (PDF)', '', 'LINK', ARRAY[]::TEXT[], 'COMUNICACAO', 6, CURRENT_TIMESTAMP),
  ('pc-pasta_cobertura', 'pasta_cobertura', 'Pasta da cobertura', '', 'LINK', ARRAY[]::TEXT[], 'COMUNICACAO', 7, CURRENT_TIMESTAMP),
  ('pc-formulario_inscricao', 'formulario_inscricao', 'Formulário de inscrição', '', 'LINK', ARRAY[]::TEXT[], 'GESTAO', 1, CURRENT_TIMESTAMP),
  ('pc-planilha_respostas', 'planilha_respostas', 'Planilha de respostas do formulário de inscrição', '', 'LINK', ARRAY[]::TEXT[], 'GESTAO', 2, CURRENT_TIMESTAMP),
  ('pc-lista_presenca', 'lista_presenca', 'Lista de presença ou borderô (PDF)', '', 'LINK', ARRAY[]::TEXT[], 'GESTAO', 3, CURRENT_TIMESTAMP),
  ('pc-lista_certificados', 'lista_certificados', 'Lista de certificados (PDF)', '', 'LINK', ARRAY[]::TEXT[], 'GESTAO', 4, CURRENT_TIMESTAMP),
  ('pc-instagram', 'instagram', 'Instagram (post de divulgação)', '', 'LINK', ARRAY[]::TEXT[], 'GESTAO', 5, CURRENT_TIMESTAMP),
  ('pc-print_divulgacao', 'print_divulgacao', 'Print do post de divulgação', '', 'LINK', ARRAY[]::TEXT[], 'GESTAO', 6, CURRENT_TIMESTAMP),
  ('pc-print_selecionados', 'print_selecionados', 'Print da lista de selecionados', '', 'LINK', ARRAY[]::TEXT[], 'GESTAO', 7, CURRENT_TIMESTAMP),
  ('pc-foto_1', 'foto_1', 'Foto 1', '', 'LINK', ARRAY[]::TEXT[], 'GESTAO', 8, CURRENT_TIMESTAMP),
  ('pc-foto_2', 'foto_2', 'Foto 2', '', 'LINK', ARRAY[]::TEXT[], 'GESTAO', 9, CURRENT_TIMESTAMP),
  ('pc-print_presenca', 'print_presenca', 'Print da lista de presença ou borderô', '', 'LINK', ARRAY[]::TEXT[], 'GESTAO', 10, CURRENT_TIMESTAMP),
  ('pc-print_certificado', 'print_certificado', 'Print do certificado', '', 'LINK', ARRAY[]::TEXT[], 'GESTAO', 11, CURRENT_TIMESTAMP),
  ('pc-foto_acessibilidade_1', 'foto_acessibilidade_1', 'Foto de acessibilidade 1', '', 'LINK', ARRAY[]::TEXT[], 'GESTAO', 12, CURRENT_TIMESTAMP),
  ('pc-foto_acessibilidade_2', 'foto_acessibilidade_2', 'Foto de acessibilidade 2', '', 'LINK', ARRAY[]::TEXT[], 'GESTAO', 13, CURRENT_TIMESTAMP),
  ('pc-print_pos_evento', 'print_pos_evento', 'Print do making of ou post pós-evento', '', 'LINK', ARRAY[]::TEXT[], 'GESTAO', 14, CURRENT_TIMESTAMP)
ON CONFLICT ("chave") DO NOTHING;
