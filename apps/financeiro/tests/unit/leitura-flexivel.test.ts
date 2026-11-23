import { describe, expect, it } from "vitest";
import { pickPronac } from "@/lib/nf/extract";
import { checkProjectCodeInDocument, parseTypedAmount, reviewPaymentAmount } from "@/lib/nf/document-cross-check";
import { withFineJustification } from "@/lib/salic/publish-robot";

describe("PRONAC escrito de jeitos diferentes", () => {
  it.each(["PRONAC 257797", "Pronac: 25-7797", "PRONAC 25 7797", "PRONAC nº 25.7797"])("%s", (t) => {
    expect(pickPronac(`Recibo ${t} referente a alimentação`)).toBe("257797");
  });
  it("não chuta PRONAC de qualquer número do documento", () => {
    expect(pickPronac("Recibo nº 12345678 CPF 123.456.789-00 valor 600,00")).toBeNull();
  });
  it("não acusa outro projeto quando o PRONAC vem com espaço", () => {
    const r = checkProjectCodeInDocument({ text: "PRONAC 25 7797 - diárias", expectedCode: "257797" });
    expect(r.warning).toBeUndefined();
  });
});

describe("revisão do valor do comprovante", () => {
  it("passa quando o valor lido bate com a nota", () => {
    const r = reviewPaymentAmount({ extractedAmount: 1500, expectedAmount: 1500 });
    expect(r).toMatchObject({ ok: true, fineAmount: 0, corrected: false });
  });
  it("não lido: pede o valor em vez de travar", () => {
    const r = reviewPaymentAmount({ extractedAmount: null, expectedAmount: 1500 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.review).toEqual({ expected: 1500, extracted: null, overpaid: false });
  });
  it("lido errado e corrigido: passa e marca a correção", () => {
    const r = reviewPaymentAmount({ extractedAmount: 150, expectedAmount: 600, typedAmount: 600 });
    expect(r).toMatchObject({ ok: true, paidAmount: 600, corrected: true });
  });
  it("valor digitado que não bate com a nota continua barrado", () => {
    const r = reviewPaymentAmount({ extractedAmount: null, expectedAmount: 1500, typedAmount: 200 });
    expect(r.ok).toBe(false);
  });
  it("pago a mais só passa marcado como multa", () => {
    const sem = reviewPaymentAmount({ extractedAmount: 1549.95, expectedAmount: 1500 });
    expect(sem.ok).toBe(false);
    if (!sem.ok) expect(sem.review.overpaid).toBe(true);
    const com = reviewPaymentAmount({ extractedAmount: 1549.95, expectedAmount: 1500, hasFine: true });
    expect(com).toMatchObject({ ok: true, paidAmount: 1549.95, fineAmount: 49.95 });
  });
  it("lê o valor digitado em reais", () => {
    expect(parseTypedAmount("1.549,95")).toBe(1549.95);
    expect(parseTypedAmount("R$ 600")).toBe(600);
    expect(parseTypedAmount("")).toBeNull();
  });
});

describe("justificativa da multa no SALIC", () => {
  it("entra sozinha antes do texto da pessoa", () => {
    const j = withFineJustification("Hospedagem da equipe", { paymentReview: { fineAmount: 49.95 } });
    expect(j).toMatch(/^Pagamento com multa\/juros por atraso de R\$\s?49,95/);
    expect(j).toContain("Hospedagem da equipe");
    expect(withFineJustification("ok", {})).toBe("ok");
  });
});
