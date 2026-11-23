export type ActionState = {
  error?: string;
  ok?: boolean;
  id?: string;
  message?: string;
  /** Link útil quando o erro tem ação (ex.: NF duplicada em revisão). */
  href?: string;
  /**
   * Documento de outro PRONAC: true quando a pessoa tem permissão para liberar
   * (o formulário mostra o campo do motivo); false quando não tem.
   */
  pronacOverride?: boolean;
  /** Valor do comprovante precisa de revisão (não lido, diferente ou pago a mais). */
  amountReview?: import("@/lib/nf/document-cross-check").PaymentAmountReview;
};
