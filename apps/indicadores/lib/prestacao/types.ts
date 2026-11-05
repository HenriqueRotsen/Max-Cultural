import type { EquipePrestacao, TipoCampoPrestacao, ValoresFicha } from "@/lib/prestacao/regras";

export type { EquipePrestacao, TipoCampoPrestacao, ValoresFicha };

export const EQUIPE_LABEL: Record<EquipePrestacao, string> = {
  PRODUCAO: "Produção",
  COMUNICACAO: "Comunicação",
  GESTAO: "Gestão",
};

export const TIPO_CAMPO_LABEL: Record<TipoCampoPrestacao, string> = {
  TEXTO: "Texto curto",
  TEXTO_LONGO: "Texto longo",
  NUMERO: "Número",
  DATA: "Data",
  LINK: "Link (drive, Instagram…)",
  OPCOES: "Opções",
  SIM_NAO: "Sim ou não",
};

export const LEIS = [
  { value: "FEDERAL", label: "Lei federal (Rouanet)" },
  { value: "ESTADUAL", label: "Lei estadual" },
  { value: "MUNICIPAL", label: "Lei municipal" },
  { value: "EDITAL", label: "Edital / incentivo direto" },
  { value: "RECURSOS_PROPRIOS", label: "Recursos próprios" },
  { value: "OUTRA", label: "Outra" },
] as const;

export const LEI_LABEL: Record<string, string> = Object.fromEntries(LEIS.map((l) => [l.value, l.label]));

export type CampoDTO = {
  id: string;
  chave: string;
  rotulo: string;
  ajuda: string;
  tipo: TipoCampoPrestacao;
  opcoes: string[];
  equipe: EquipePrestacao;
  obrigatorio: boolean;
  ordem: number;
  ativo: boolean;
};

export type ProgressoDTO = Record<EquipePrestacao, { pct: number; faltando: string[] }>;

export type DadosProjetoDTO = {
  lei: string | null;
  identificacao: string;
  patrocinador: string;
  /** yyyy-mm-dd */
  entregueEm: string | null;
};

export type ProdutoDTO = { id: string; nome: string; meta: string; fichas: number };

export type ExecucaoDTO = {
  agendaId: string;
  acaoId: string;
  acaoNome: string;
  tipoNome: string;
  /** "Buritis, Belo Horizonte, MG" ou "Online". */
  local: string;
  /** yyyy-mm-dd */
  data: string;
  dataFim: string | null;
  titulo: string;
  produtoId: string | null;
  progresso: ProgressoDTO;
};

export type PrestacaoProjetoDTO = {
  projeto: { id: string; nome: string; pronac: string; proponente: string; ano: string; contextoNome: string };
  dados: DadosProjetoDTO;
  produtos: ProdutoDTO[];
  execucoes: ExecucaoDTO[];
  /** Ações sem nenhuma execução na agenda (ainda sem ficha). */
  acoesSemAgenda: Array<{ id: string; nome: string }>;
  relatorios: RelatorioDTO[];
  progresso: ProgressoDTO;
  pode: Record<EquipePrestacao, boolean>;
};

/** Dados que vêm do sistema (ação, agenda e inscrições), com as correções da gestão. */
export type SistemaDTO = {
  ano: string;
  proponente: string;
  projeto: string;
  identificacao: string;
  acao: string;
  tipoAcao: string;
  local: string;
  cidadeUf: string;
  dataInicio: string;
  dataFim: string;
  meses: string;
  quantidadeMeses: number;
  numeros: Array<{ chave: string; rotulo: string; valor: number; doSistema: number; ajustado: boolean }>;
  /** A ação tem mais de uma execução: os números das inscrições são da ação toda. */
  numerosDaAcaoToda: boolean;
};

export type FichaDTO = {
  agendaId: string;
  projetoId: string;
  projetoNome: string;
  produtoId: string | null;
  produtos: Array<{ id: string; nome: string }>;
  campos: CampoDTO[];
  valores: ValoresFicha;
  arquivos: ArquivoDTO[];
  sistema: SistemaDTO;
  progresso: ProgressoDTO;
  atualizadoEm: string | null;
  pode: Record<EquipePrestacao, boolean>;
};

export type PrestacaoResumoDTO = {
  id: string;
  nome: string;
  pronac: string;
  contextoNome: string;
  lei: string | null;
  identificacao: string;
  patrocinador: string;
  execucoes: number;
  progresso: Record<EquipePrestacao, number>;
  entregueEm: string | null;
};

export type ListaPrestacaoDTO = {
  items: PrestacaoResumoDTO[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  contextos: Array<{ id: string; nome: string }>;
};

/** Categorias das fotos: definem a seção do relatório onde cada uma entra. */
export const CATEGORIAS_FOTO = [
  { value: "comprovacao", label: "Comprovação da realização" },
  { value: "acessibilidade", label: "Acessibilidade" },
  { value: "divulgacao", label: "Divulgação (posts, prints)" },
  { value: "presenca", label: "Lista de presença ou borderô" },
  { value: "certificados", label: "Certificados" },
  { value: "pos_evento", label: "Making of ou pós-evento" },
  { value: "materiais", label: "Materiais (apostila)" },
  { value: "outros", label: "Outros" },
] as const;

/** Categorias dos documentos (PDF), que entram como anexos. */
export const CATEGORIAS_DOC = [
  { value: "presenca", label: "Lista de presença ou borderô" },
  { value: "certificados", label: "Certificados" },
  { value: "release", label: "Release de divulgação" },
  { value: "clipping", label: "Clipping" },
  { value: "redes", label: "Relatório de redes sociais" },
  { value: "midia_paga", label: "Relatório de mídia paga" },
  { value: "apostila", label: "Apostila" },
  { value: "outros", label: "Outros" },
] as const;

export const CATEGORIA_LABEL: Record<string, string> = Object.fromEntries(
  [...CATEGORIAS_FOTO, ...CATEGORIAS_DOC].map((c) => [c.value, c.label]),
);

export type ArquivoDTO = {
  id: string;
  tipo: "FOTO" | "DOCUMENTO";
  categoria: string;
  descricao: string;
  ordem: number;
  noRelatorio: boolean;
  nomeOriginal: string;
  tamanho: number;
  /** URL para ver/baixar (rota protegida). */
  url: string;
  enviadoEm: string;
};

export type RelatorioDTO = {
  id: string;
  titulo: string;
  produtoNome: string | null;
  tamanho: number;
  paginas: number | null;
  geradoEm: string;
  geradoPorNome: string;
  url: string;
};
