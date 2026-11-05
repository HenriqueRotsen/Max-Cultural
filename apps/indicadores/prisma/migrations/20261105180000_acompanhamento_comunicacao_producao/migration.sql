-- Acompanhamento de Comunicação e Produção (tarefas por projeto, ação e cidade).

-- CreateEnum
CREATE TYPE "AreaTarefa" AS ENUM ('COMUNICACAO', 'PRODUCAO');

-- CreateEnum
CREATE TYPE "FaseTarefa" AS ENUM ('PLANEJAMENTO', 'ESTRUTURACAO', 'FLUXO_CONTINUO', 'ENCERRAMENTO', 'ANTES', 'DURANTE', 'DEPOIS');

-- CreateEnum
CREATE TYPE "UnidadeTarefa" AS ENUM ('PROJETO', 'ACAO', 'CIDADE');

-- CreateEnum
CREATE TYPE "PrazoBase" AS ENUM ('INICIO_EXECUCAO', 'FIM_EXECUCAO', 'DATA_ACAO');

-- CreateEnum
CREATE TYPE "StatusTarefa" AS ENUM ('NAO_CONTEMPLADA', 'NAO_INICIADA', 'EM_ANDAMENTO', 'CONCLUIDA');

-- CreateEnum
CREATE TYPE "ImpactoOcorrencia" AS ENUM ('BAIXO', 'MEDIO', 'ALTO');

-- CreateEnum
CREATE TYPE "StatusOcorrencia" AS ENUM ('ABERTA', 'RESOLVIDA');

-- CreateTable
CREATE TABLE "tarefa_modelos" (
    "id" TEXT NOT NULL,
    "area" "AreaTarefa" NOT NULL,
    "nivel" INTEGER NOT NULL,
    "fase" "FaseTarefa" NOT NULL,
    "titulo" TEXT NOT NULL,
    "detalhamento" TEXT NOT NULL DEFAULT '',
    "unidade" "UnidadeTarefa" NOT NULL,
    "prazo_base" "PrazoBase",
    "prazo_dias" INTEGER,
    "tipos_acao" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tarefa_modelos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acompanhamentos" (
    "id" TEXT NOT NULL,
    "projeto_id" TEXT NOT NULL,
    "inicio_execucao" TIMESTAMP(3),
    "fim_execucao" TIMESTAMP(3),
    "recurso_liberado_em" TIMESTAMP(3),
    "financeiro_project_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acompanhamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acao_agendas" (
    "id" TEXT NOT NULL,
    "acao_id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL DEFAULT '',
    "cidade" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acao_agendas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarefas" (
    "id" TEXT NOT NULL,
    "projeto_id" TEXT NOT NULL,
    "modelo_id" TEXT,
    "area" "AreaTarefa" NOT NULL,
    "nivel" INTEGER NOT NULL,
    "fase" "FaseTarefa" NOT NULL,
    "titulo" TEXT NOT NULL,
    "detalhamento" TEXT NOT NULL DEFAULT '',
    "unidade" "UnidadeTarefa" NOT NULL,
    "acao_id" TEXT,
    "agenda_id" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "status" "StatusTarefa" NOT NULL DEFAULT 'NAO_INICIADA',
    "prazo" TIMESTAMP(3),
    "responsavel_id" TEXT,
    "concluida_em" TIMESTAMP(3),
    "atualizado_por" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tarefas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarefa_comentarios" (
    "id" TEXT NOT NULL,
    "tarefa_id" TEXT NOT NULL,
    "autor_id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "escalada" BOOLEAN NOT NULL DEFAULT false,
    "resolvida_em" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarefa_comentarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocorrencias" (
    "id" TEXT NOT NULL,
    "projeto_id" TEXT NOT NULL,
    "area" "AreaTarefa" NOT NULL,
    "acao_id" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "impacto" "ImpactoOcorrencia" NOT NULL DEFAULT 'MEDIO',
    "descricao" TEXT NOT NULL,
    "decidir_ate" TIMESTAMP(3),
    "status" "StatusOcorrencia" NOT NULL DEFAULT 'ABERTA',
    "autor_id" TEXT NOT NULL,
    "resolvida_em" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ocorrencias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tarefa_modelos_area_nivel_ordem_idx" ON "tarefa_modelos"("area", "nivel", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "acompanhamentos_projeto_id_key" ON "acompanhamentos"("projeto_id");

-- CreateIndex
CREATE INDEX "acao_agendas_acao_id_data_idx" ON "acao_agendas"("acao_id", "data");

-- CreateIndex
CREATE INDEX "acao_agendas_cidade_uf_idx" ON "acao_agendas"("cidade", "uf");

-- CreateIndex
CREATE INDEX "tarefas_projeto_id_area_nivel_idx" ON "tarefas"("projeto_id", "area", "nivel");

-- CreateIndex
CREATE INDEX "tarefas_acao_id_idx" ON "tarefas"("acao_id");

-- CreateIndex
CREATE INDEX "tarefas_agenda_id_idx" ON "tarefas"("agenda_id");

-- CreateIndex
CREATE INDEX "tarefas_modelo_id_idx" ON "tarefas"("modelo_id");

-- CreateIndex
CREATE INDEX "tarefa_comentarios_tarefa_id_idx" ON "tarefa_comentarios"("tarefa_id");

-- CreateIndex
CREATE INDEX "ocorrencias_projeto_id_status_idx" ON "ocorrencias"("projeto_id", "status");

-- AddForeignKey
ALTER TABLE "acompanhamentos" ADD CONSTRAINT "acompanhamentos_projeto_id_fkey" FOREIGN KEY ("projeto_id") REFERENCES "projetos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acao_agendas" ADD CONSTRAINT "acao_agendas_acao_id_fkey" FOREIGN KEY ("acao_id") REFERENCES "acoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_projeto_id_fkey" FOREIGN KEY ("projeto_id") REFERENCES "projetos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_modelo_id_fkey" FOREIGN KEY ("modelo_id") REFERENCES "tarefa_modelos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_acao_id_fkey" FOREIGN KEY ("acao_id") REFERENCES "acoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_agenda_id_fkey" FOREIGN KEY ("agenda_id") REFERENCES "acao_agendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefa_comentarios" ADD CONSTRAINT "tarefa_comentarios_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "tarefas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocorrencias" ADD CONSTRAINT "ocorrencias_projeto_id_fkey" FOREIGN KEY ("projeto_id") REFERENCES "projetos"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Sem políticas: só a conexão do app (dona das tabelas) acessa.
ALTER TABLE "tarefa_modelos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "acompanhamentos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "acao_agendas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tarefas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tarefa_comentarios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ocorrencias" ENABLE ROW LEVEL SECURITY;

-- Modelos de tarefa (apresentação "Framework geral — Comunicação e Produção").
-- Prazos padrão, editáveis: dias a partir do início/fim da execução ou da data da ação.
INSERT INTO "tarefa_modelos" ("id", "area", "nivel", "fase", "titulo", "detalhamento", "unidade", "prazo_base", "prazo_dias", "tipos_acao", "ordem", "updatedAt") VALUES
  ('tm-com-1-01', 'COMUNICACAO', 1, 'PLANEJAMENTO', 'Identidade visual e régua de marcas', 'Logo, enxoval de marca, templates, manual de aplicação, régua de patrocinador e lei', 'PROJETO', 'INICIO_EXECUCAO', 15, ARRAY[]::text[], 1, CURRENT_TIMESTAMP),
  ('tm-com-1-02', 'COMUNICACAO', 1, 'PLANEJAMENTO', 'Validação com patrocinador e realizadores', 'Aprovação formal da identidade e da régua, ajustes e registro da aprovação', 'PROJETO', 'INICIO_EXECUCAO', 25, ARRAY[]::text[], 2, CURRENT_TIMESTAMP),
  ('tm-com-1-03', 'COMUNICACAO', 1, 'PLANEJAMENTO', 'Contratação da equipe de comunicação', 'Assessoria de imprensa, design, social media, audiovisual, fotografia, mobilizadores', 'PROJETO', 'INICIO_EXECUCAO', 15, ARRAY[]::text[], 3, CURRENT_TIMESTAMP),
  ('tm-com-1-04', 'COMUNICACAO', 1, 'PLANEJAMENTO', 'Plano de comunicação', 'Públicos, canais, cronograma, orçamento de mídia e impulsionamento, metas; acessibilidade comunicacional (Libras, legenda, audiodescrição, texto alternativo, linguagem simples)', 'PROJETO', 'INICIO_EXECUCAO', 30, ARRAY[]::text[], 4, CURRENT_TIMESTAMP),
  ('tm-com-1-05', 'COMUNICACAO', 1, 'ESTRUTURACAO', 'Canais do projeto ativos', 'Instagram, Linktree ou site, WhatsApp, e-mail, padrão de formulários', 'PROJETO', 'INICIO_EXECUCAO', 30, ARRAY[]::text[], 5, CURRENT_TIMESTAMP),
  ('tm-com-1-06', 'COMUNICACAO', 1, 'ESTRUTURACAO', 'Mapeamento de imprensa e rede local', 'Mailing por território, rádios, secretarias, lideranças, escolas, parceiros', 'PROJETO', 'INICIO_EXECUCAO', 40, ARRAY[]::text[], 6, CURRENT_TIMESTAMP),
  ('tm-com-1-07', 'COMUNICACAO', 1, 'ESTRUTURACAO', 'Lançamento do projeto', 'Release, post e vídeo de lançamento, evento ou coletiva se houver', 'PROJETO', 'INICIO_EXECUCAO', 45, ARRAY[]::text[], 7, CURRENT_TIMESTAMP),
  ('tm-com-1-08', 'COMUNICACAO', 1, 'FLUXO_CONTINUO', 'Gestão de redes e calendário editorial', 'Planejamento mensal, publicações, moderação, impulsionamento', 'PROJETO', 'FIM_EXECUCAO', 0, ARRAY[]::text[], 8, CURRENT_TIMESTAMP),
  ('tm-com-1-09', 'COMUNICACAO', 1, 'FLUXO_CONTINUO', 'Assessoria de imprensa e clipping contínuos', 'Pautas, entrevistas, monitoramento, clipping consolidado', 'PROJETO', 'FIM_EXECUCAO', 0, ARRAY[]::text[], 9, CURRENT_TIMESTAMP),
  ('tm-com-1-10', 'COMUNICACAO', 1, 'FLUXO_CONTINUO', 'Relacionamento com o patrocinador', 'Contrapartidas de marca, envio de materiais, relatórios parciais', 'PROJETO', 'FIM_EXECUCAO', 0, ARRAY[]::text[], 10, CURRENT_TIMESTAMP),
  ('tm-com-1-11', 'COMUNICACAO', 1, 'ENCERRAMENTO', 'Balanço e divulgação dos resultados', 'Vídeo-resumo, post de números, release de encerramento', 'PROJETO', 'FIM_EXECUCAO', 15, ARRAY[]::text[], 11, CURRENT_TIMESTAMP),
  ('tm-com-1-12', 'COMUNICACAO', 1, 'ENCERRAMENTO', 'Relatório de comunicação e comprovações', 'Peças aprovadas, prints, clipping, métricas, fotos e vídeos organizados, acervo', 'PROJETO', 'FIM_EXECUCAO', 30, ARRAY[]::text[], 12, CURRENT_TIMESTAMP),
  ('tm-com-2-01', 'COMUNICACAO', 2, 'ANTES', 'Informações da ação recebidas da produção', 'Data, local, horário, programação, professor ou artista, link de inscrição', 'ACAO', 'DATA_ACAO', -21, ARRAY[]::text[], 13, CURRENT_TIMESTAMP),
  ('tm-com-2-02', 'COMUNICACAO', 2, 'ANTES', 'Definição da programação (curadoria)', 'Grade, atrações, line-up, agenda', 'ACAO', 'DATA_ACAO', -21, ARRAY[]::text[], 14, CURRENT_TIMESTAMP),
  ('tm-com-2-03', 'COMUNICACAO', 2, 'ANTES', 'Chamada e inscrições', 'Abertura, acompanhamento de inscritos, reforço (últimos dias, prorrogação), divulgação dos selecionados ou do resultado', 'ACAO', 'DATA_ACAO', -14, ARRAY[]::text[], 15, CURRENT_TIMESTAMP),
  ('tm-com-2-04', 'COMUNICACAO', 2, 'ANTES', 'Peças de divulgação aprovadas', 'Cards para Instagram e WhatsApp, carrossel, cartaz, filipeta, vídeo convite; aprovação com coordenação e patrocinador, conferência da régua de marcas', 'ACAO', 'DATA_ACAO', -10, ARRAY[]::text[], 16, CURRENT_TIMESTAMP),
  ('tm-com-2-05', 'COMUNICACAO', 2, 'ANTES', 'Mobilização territorial', 'Mobilizador local, lideranças, escolas, secretarias, prefeitura, carro de som, rádio local, grupos de WhatsApp', 'ACAO', 'DATA_ACAO', -7, ARRAY[]::text[], 17, CURRENT_TIMESTAMP),
  ('tm-com-2-06', 'COMUNICACAO', 2, 'ANTES', 'Imprensa da ação', 'Release, envio para veículos locais, nota para rádio, agendas culturais, entrevistas', 'ACAO', 'DATA_ACAO', -3, ARRAY[]::text[], 18, CURRENT_TIMESTAMP),
  ('tm-com-2-07', 'COMUNICACAO', 2, 'DURANTE', 'Registro de foto e vídeo', 'Definir se é profissional ou da produção, briefing, entrega do material', 'ACAO', 'DATA_ACAO', 0, ARRAY[]::text[], 19, CURRENT_TIMESTAMP),
  ('tm-com-2-08', 'COMUNICACAO', 2, 'DURANTE', 'Cobertura em tempo real', 'Stories e posts do dia', 'ACAO', 'DATA_ACAO', 0, ARRAY[]::text[], 20, CURRENT_TIMESTAMP),
  ('tm-com-2-09', 'COMUNICACAO', 2, 'DEPOIS', 'Divulgação pós-ação', 'Agradecimento, depoimentos, galeria, vídeo-resumo, obra ou produto final', 'ACAO', 'DATA_ACAO', 7, ARRAY[]::text[], 21, CURRENT_TIMESTAMP),
  ('tm-com-2-10', 'COMUNICACAO', 2, 'DEPOIS', 'Comprovações da ação', 'Prints, clipping, peças finais, fotos selecionadas, métricas', 'ACAO', 'DATA_ACAO', 15, ARRAY[]::text[], 22, CURRENT_TIMESTAMP),
  ('tm-pro-1-01', 'PRODUCAO', 1, 'PLANEJAMENTO', 'Equipe de produção contratada', 'Coordenação, produtores, apoio administrativo', 'PROJETO', 'INICIO_EXECUCAO', 15, ARRAY[]::text[], 23, CURRENT_TIMESTAMP),
  ('tm-pro-1-02', 'PRODUCAO', 1, 'PLANEJAMENTO', 'Circulação planejada', 'Matriz cidades × ações × datas, cronograma geral, prazos-limite por cidade', 'PROJETO', 'INICIO_EXECUCAO', 20, ARRAY[]::text[], 24, CURRENT_TIMESTAMP),
  ('tm-pro-1-03', 'PRODUCAO', 1, 'PLANEJAMENTO', 'Escopo e padrões definidos', 'Lista de ações e ementas, oficineiros, escopo do produtor local (valor, período, serviço), padrão de lanche, compras centralizadas ou locais, lista de materiais', 'PROJETO', 'INICIO_EXECUCAO', 25, ARRAY[]::text[], 25, CURRENT_TIMESTAMP),
  ('tm-pro-1-04', 'PRODUCAO', 1, 'ESTRUTURACAO', 'Procedimentos e modelos prontos', 'Modelos de orçamento, contratação, briefing, logística, solicitação de pagamento, recibos e seguro', 'PROJETO', 'INICIO_EXECUCAO', 30, ARRAY[]::text[], 26, CURRENT_TIMESTAMP),
  ('tm-pro-1-05', 'PRODUCAO', 1, 'ESTRUTURACAO', 'Fornecedores centrais contratados', 'Gráfica, confecção de camisetas e ecobags, cadernos, certificados, banners', 'PROJETO', 'INICIO_EXECUCAO', 40, ARRAY[]::text[], 27, CURRENT_TIMESTAMP),
  ('tm-pro-1-06', 'PRODUCAO', 1, 'ESTRUTURACAO', 'Kit e materiais-padrão produzidos', 'Camiseta, ecobag, caderno, apostila, certificado, banner, selo, lista de presença, autorização de imagem', 'PROJETO', 'INICIO_EXECUCAO', 45, ARRAY[]::text[], 28, CURRENT_TIMESTAMP),
  ('tm-pro-1-07', 'PRODUCAO', 1, 'FLUXO_CONTINUO', 'Controle administrativo', 'Compras e saldo por rubrica, contratos e documentação, dados da equipe', 'PROJETO', 'FIM_EXECUCAO', 0, ARRAY[]::text[], 29, CURRENT_TIMESTAMP),
  ('tm-pro-1-08', 'PRODUCAO', 1, 'ENCERRAMENTO', 'Fechamento do projeto', 'Pagamentos finais, notas fiscais, contratos encerrados, documentação consolidada para a prestação de contas', 'PROJETO', 'FIM_EXECUCAO', 30, ARRAY[]::text[], 30, CURRENT_TIMESTAMP),
  ('tm-pro-2-01', 'PRODUCAO', 2, 'ANTES', 'Espaço garantido', 'Visita técnica e relatório, solução dos problemas da VT, mobiliário, equipamentos, internet, acessibilidade estrutural, limpeza e segurança, acesso no horário', 'CIDADE', 'DATA_ACAO', -21, ARRAY[]::text[], 31, CURRENT_TIMESTAMP),
  ('tm-pro-2-02', 'PRODUCAO', 2, 'ANTES', 'Produção local, fornecedores, logística e seguros', 'Produtor local com briefing, foto e vídeo, lanche, intérprete de Libras, limpeza, carro de som; transporte, hospedagem, logística da equipe, seguro-viagem, de responsabilidade civil e da produtora', 'CIDADE', 'DATA_ACAO', -14, ARRAY[]::text[], 32, CURRENT_TIMESTAMP),
  ('tm-pro-2-03', 'PRODUCAO', 2, 'ANTES', 'Inscrições e seleção', 'Informações enviadas à comunicação, formulário e fichas impressas, planilha de inscritos, comissão de seleção, resultado', 'ACAO', 'DATA_ACAO', -10, ARRAY[]::text[], 33, CURRENT_TIMESTAMP),
  ('tm-pro-2-04', 'PRODUCAO', 2, 'ANTES', 'Professor e materiais da oficina', 'Professor contratado e logística enviada, kit montado e entregue, PPT e modelo de relatório, lista de presença, restrições alimentares, cartazes distribuídos', 'ACAO', 'DATA_ACAO', -5, ARRAY['oficina']::text[], 34, CURRENT_TIMESTAMP),
  ('tm-pro-2-05', 'PRODUCAO', 2, 'DURANTE', 'Ação realizada', 'Montagem, recepção, presença, lanche, certificados, avaliação aplicada, registro, ocorrências', 'ACAO', 'DATA_ACAO', 0, ARRAY[]::text[], 35, CURRENT_TIMESTAMP),
  ('tm-pro-2-06', 'PRODUCAO', 2, 'DEPOIS', 'Fechamento da cidade', 'Recolher kit e banners, fechamento com o produtor local, pagamentos e notas fiscais, listas, certificados, avaliações e autorizações entregues para a prestação de contas', 'CIDADE', 'DATA_ACAO', 10, ARRAY[]::text[], 36, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
