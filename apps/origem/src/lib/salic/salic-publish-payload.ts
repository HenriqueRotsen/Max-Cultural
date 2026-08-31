/** Payload JSON enviado ao SALIC em `comprovante` (FormData). */
export type SalicComprovantePayload = {
  fornecedor: {
    nacionalidade: number;
    tipoPessoa: 1 | 2;
    CNPJCPF: string;
    nome: string;
    idAgente: string | number;
    eInternacional: false;
  };
  item?: number;
  idPlanilhaAprovacao: number;
  tipo: number;
  numero: string;
  serie: string;
  dataEmissao: string;
  dataPagamento: string;
  forma: number;
  numeroDocumento: string;
  valor: number;
  justificativa: string;
  id?: number;
  idComprovantePagamento?: number;
  foiAtualizado?: boolean;
};

export type BuildSalicPayloadInput = {
  supplierCnpjCpf: string;
  supplierName: string;
  idAgente: string | number;
  planilhaAprovacaoId: string;
  fiscalKind: "NF" | "RPA" | null;
  mergedWithFiscal: boolean;
  documentNumber: string;
  paymentDocumentNumber: string;
  amount: number;
  issueDate: Date;
  paymentDate: Date;
  paymentForm?: number;
  justificativa?: string;
  /** Preenchido ao republicar via PUT. */
  existingComprovanteId?: string | number;
};

/** 3=NF, 4=Recibo, 5=RPA */
export function mapSalicDocumentTipo(
  fiscalKind: "NF" | "RPA" | null,
  mergedWithFiscal: boolean,
): number {
  if (fiscalKind === "RPA") return 5;
  if (fiscalKind === "NF" || mergedWithFiscal) return 3;
  return 4;
}

/** 1=Cheque, 2=Transferência, 3=Saque/Dinheiro */
export function mapSalicPaymentForm(paymentMethod?: string | null): number {
  const m = String(paymentMethod || "").toLowerCase();
  if (/cheque/.test(m)) return 1;
  if (/saque|dinheiro/.test(m)) return 3;
  return 2;
}

export function formatSalicBrDate(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function buildSalicComprovantePayload(
  input: BuildSalicPayloadInput,
): SalicComprovantePayload {
  const doc = input.supplierCnpjCpf.replace(/\D/g, "");
  const tipoPessoa: 1 | 2 = doc.length === 11 ? 1 : 2;
  const planilhaId = Number(input.planilhaAprovacaoId);
  if (!Number.isFinite(planilhaId) || planilhaId <= 0) {
    throw new Error(
      "Rubrica sem idPlanilhaAprovacao do SALIC — sincronize a planilha homologada.",
    );
  }

  const payload: SalicComprovantePayload = {
    fornecedor: {
      nacionalidade: 31,
      tipoPessoa,
      CNPJCPF: doc,
      nome: input.supplierName.trim() || "Fornecedor",
      idAgente: input.idAgente,
      eInternacional: false,
    },
    idPlanilhaAprovacao: planilhaId,
    tipo: mapSalicDocumentTipo(input.fiscalKind, input.mergedWithFiscal),
    numero: input.documentNumber.trim() || "S/N",
    serie: "",
    dataEmissao: formatSalicBrDate(input.issueDate),
    dataPagamento: formatSalicBrDate(input.paymentDate),
    forma: input.paymentForm ?? mapSalicPaymentForm(null),
    numeroDocumento: input.paymentDocumentNumber.trim() || "0",
    valor: Math.round(input.amount * 100) / 100,
    justificativa: input.justificativa?.trim() || "",
  };

  if (input.existingComprovanteId != null) {
    const id = Number(input.existingComprovanteId);
    payload.id = id;
    payload.idComprovantePagamento = id;
    payload.foiAtualizado = true;
  }

  return payload;
}
