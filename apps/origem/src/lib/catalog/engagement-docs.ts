/** Docs de contratação para o módulo Fornecedores (somente leitura / arquivo original). */

export type EngagementDocItem = {
  id: string;
  kind: string;
  filename: string;
  mimeType: string;
};

type DocLike = {
  id: string;
  kind: string;
  filename: string;
  mimeType: string;
};

/**
 * Une documentos ligados diretamente à contratação e os da NF/RPA/comprovante
 * via rateio do compromisso — sem expor fatias de rubrica.
 */
export function resolveEngagementDocuments(input: {
  documents?: DocLike[] | null;
  commitment?: {
    documents?: DocLike[] | null;
    allocations?: Array<{ document: DocLike }> | null;
  } | null;
}): EngagementDocItem[] {
  const map = new Map<string, EngagementDocItem>();

  const push = (doc: DocLike | null | undefined) => {
    if (!doc?.id) return;
    const kind = doc.kind;
    if (
      kind !== "NF" &&
      kind !== "RPA" &&
      kind !== "PAYMENT_PROOF" &&
      kind !== "TAX_PROOF"
    ) {
      return;
    }
    if (map.has(doc.id)) return;
    map.set(doc.id, {
      id: doc.id,
      kind: doc.kind,
      filename: doc.filename,
      mimeType: doc.mimeType,
    });
  };

  for (const d of input.documents || []) push(d);
  for (const d of input.commitment?.documents || []) push(d);
  for (const a of input.commitment?.allocations || []) push(a.document);

  const rank = (kind: string) => {
    if (kind === "NF" || kind === "RPA") return 0;
    if (kind === "PAYMENT_PROOF") return 1;
    if (kind === "TAX_PROOF") return 2;
    return 9;
  };

  return [...map.values()].sort(
    (a, b) => rank(a.kind) - rank(b.kind) || a.filename.localeCompare(b.filename),
  );
}

export function engagementHasFiscalDoc(docs: EngagementDocItem[]) {
  return docs.some((d) => d.kind === "NF" || d.kind === "RPA");
}

export function engagementHasPaymentDoc(docs: EngagementDocItem[]) {
  return docs.some(
    (d) => d.kind === "PAYMENT_PROOF" || d.kind === "TAX_PROOF",
  );
}
