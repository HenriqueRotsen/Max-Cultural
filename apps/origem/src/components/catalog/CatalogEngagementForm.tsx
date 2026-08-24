"use client";

import { useActionState } from "react";
import { upsertCatalogEngagement, type CatalogActionState } from "@/lib/catalog/actions";
import { PRICE_UNITS } from "@/lib/catalog/price-units";

const initial: CatalogActionState = {};

export function CatalogEngagementForm({
  services,
  defaultServiceId,
}: {
  services: { id: string; name: string; supplierName: string }[];
  defaultServiceId?: string;
}) {
  const [state, action, pending] = useActionState(upsertCatalogEngagement, initial);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={action} className="card space-y-4 p-5">
      {state.error ? <p className="auth-alert">{state.error}</p> : null}
      <div className="field">
        <label htmlFor="serviceId">Serviço</label>
        <select id="serviceId" name="serviceId" defaultValue={defaultServiceId ?? ""} required>
          <option value="">Selecione</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.supplierName} — {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="field">
          <label htmlFor="hiredAt">Data</label>
          <input id="hiredAt" name="hiredAt" type="date" defaultValue={today} required />
        </div>
        <div className="field">
          <label htmlFor="priceUnit">Unidade</label>
          <select id="priceUnit" name="priceUnit" defaultValue="closed">
            {PRICE_UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="quantity">Quantidade</label>
          <input id="quantity" name="quantity" defaultValue="1" />
        </div>
        <div className="field">
          <label htmlFor="unitPrice">Preço unitário (R$)</label>
          <input id="unitPrice" name="unitPrice" required />
        </div>
        <div className="field">
          <label htmlFor="rating">Avaliação (1–5)</label>
          <select id="rating" name="rating" defaultValue="">
            <option value="">Sem nota</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} estrela{n > 1 ? "s" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="location">Local</label>
          <input id="location" name="location" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-[var(--gray-600)]">
        <input type="checkbox" name="delayed" value="1" />
        Houve atraso
      </label>
      <div className="field">
        <label htmlFor="notes">Notas</label>
        <textarea id="notes" name="notes" rows={3} />
      </div>
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Salvando…" : "Salvar contratação"}
      </button>
    </form>
  );
}
