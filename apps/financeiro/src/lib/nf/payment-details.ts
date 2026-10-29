/**
 * Heurísticas para dados de pagamento embutidos na descrição da NF / DANFS-e.
 */

export type NfPaymentDetails = {
  pixKey: string | null;
  bankName: string | null;
  bankAgency: string | null;
  bankAccount: string | null;
  paymentNotes: string | null;
};

function clean(value: string | null | undefined): string | null {
  const s = String(value || "").trim();
  return s || null;
}

function pickGroup(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return clean(m[1]);
  }
  return null;
}

/** Extrai PIX / banco / agência / conta de um bloco de texto livre. */
export function extractPaymentDetails(text: string | null | undefined): NfPaymentDetails {
  const raw = String(text || "").replace(/\r/g, "\n");
  if (!raw.trim()) {
    return {
      pixKey: null,
      bankName: null,
      bankAgency: null,
      bankAccount: null,
      paymentNotes: null,
    };
  }

  const pixKey = pickGroup(raw, [
    /(?:chave\s*)?pix[:\s]+([^\n;|]{5,120}?)(?=\s*(?:banco|ag[eê]ncia|\bag\b|conta|forma\s+de\s+pagamento)|$)/i,
    /pagamento\s+via\s+pix[:\s]+([^\n;|]{5,120}?)(?=\s*(?:banco|ag[eê]ncia|conta)|$)/i,
  ]);

  const bankName = pickGroup(raw, [
    /banco[:\s]+([^\n;|]{2,80}?)(?=\s*(?:ag[eê]ncia|\bag\b|conta|pix)|$)/i,
    /institui[cç][aã]o\s+financeira[:\s]+([^\n;|]{2,80}?)(?=\s*(?:ag[eê]ncia|conta)|$)/i,
  ]);

  const bankAgency = pickGroup(raw, [
    /ag[eê]ncia[:\s]*([0-9]{1,6}(?:-?\d)?)/i,
    /\bag[:\s]*([0-9]{1,6}(?:-?\d)?)\b/i,
  ]);

  const bankAccount = pickGroup(raw, [
    /conta\s*(?:corrente|poupan[cç]a)?[:\s]*([0-9.\-]{3,20})/i,
    /\bcc[:\s]*([0-9.\-]{3,20})\b/i,
  ]);

  const paymentBlock =
    pickGroup(raw, [
      /(?:dados\s+para\s+pagamento|forma\s+de\s+pagamento|pagamento)[:\s]*([\s\S]{10,500})/i,
    ]) || null;

  const paymentNotes =
    paymentBlock ||
    (pixKey || bankName || bankAgency || bankAccount
      ? raw
          .split("\n")
          .map((l) => l.trim())
          .filter((l) =>
            /pix|banco|ag[eê]ncia|\bag\b|conta|pagamento/i.test(l),
          )
          .slice(0, 8)
          .join("\n") || null
      : null);

  return {
    pixKey: pixKey?.replace(/^[:\-\s]+/, "").slice(0, 120) || null,
    bankName: bankName?.slice(0, 80) || null,
    bankAgency: bankAgency || null,
    bankAccount: bankAccount || null,
    paymentNotes: clean(paymentNotes)?.slice(0, 800) || null,
  };
}

/** Mantém valores já salvos; preenche só o que veio vazio no cadastro. */
export function mergePaymentDetails(
  current: Partial<NfPaymentDetails> | null | undefined,
  incoming: NfPaymentDetails,
): NfPaymentDetails {
  return {
    pixKey: clean(current?.pixKey) || incoming.pixKey,
    bankName: clean(current?.bankName) || incoming.bankName,
    bankAgency: clean(current?.bankAgency) || incoming.bankAgency,
    bankAccount: clean(current?.bankAccount) || incoming.bankAccount,
    paymentNotes: clean(current?.paymentNotes) || incoming.paymentNotes,
  };
}
