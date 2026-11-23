"use client";

import { useState } from "react";
import type { PaymentAmountReview } from "@/lib/nf/document-cross-check";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Revisão do valor do comprovante: aparece quando o sistema não leu o valor,
 * leu diferente ou o pagamento foi maior que a nota. A pessoa informa o valor
 * pago e, se foi multa/juros, marca a opção (a diferença vai para o relatório
 * de inconsistências e não sai do projeto). Fica registrado no histórico.
 */
export function PaymentAmountReviewField({ review }: { review: PaymentAmountReview }) {
  const [typed, setTyped] = useState(
    review.extracted != null ? review.extracted.toFixed(2).replace(".", ",") : "",
  );
  const [fine, setFine] = useState(false);
  const paid = Number(typed.replace(/\./g, "").replace(",", "."));
  const diff = Number.isFinite(paid) ? Math.round((paid - review.expected) * 100) / 100 : 0;

  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
      <p>
        Valor esperado: <strong>{brl(review.expected)}</strong>
        {review.extracted != null ? (
          <>
            {" · "}lido no comprovante: <strong>{brl(review.extracted)}</strong>
          </>
        ) : (
          " · o sistema não leu o valor do comprovante"
        )}
      </p>
      <label className="field">
        <span>Valor pago no comprovante (R$)</span>
        <input
          name="typedAmount"
          inputMode="decimal"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Ex.: 1.549,95"
          className="bg-white"
          required
        />
      </label>
      {diff > 0.02 ? (
        <label className="flex items-start gap-2">
          <input type="checkbox" name="hasFine" checked={fine} onChange={(e) => setFine(e.target.checked)} />
          <span>
            A diferença de <strong>{brl(diff)}</strong> é multa ou juros por atraso. Ela vai ao SALIC no valor do
            comprovante, com justificativa, e entra no relatório de inconsistências para devolução.
          </span>
        </label>
      ) : null}
      <p className="text-xs text-amber-900">
        Escolha o arquivo de novo antes de enviar. A correção fica registrada no histórico.
      </p>
    </div>
  );
}
