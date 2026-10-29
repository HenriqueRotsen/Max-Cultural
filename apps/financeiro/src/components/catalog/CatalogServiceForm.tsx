"use client";

import { useActionState } from "react";
import { upsertCatalogService, type CatalogActionState } from "@/lib/catalog/actions";
import { SERVICE_CATEGORIES } from "@/lib/catalog/categories";
import { PRICE_UNITS } from "@/lib/catalog/price-units";

const initial: CatalogActionState = {};

export function CatalogServiceForm({
  suppliers,
  defaultSupplierId,
}: {
  suppliers: { id: string; name: string }[];
  defaultSupplierId?: string;
}) {
  const [state, action, pending] = useActionState(upsertCatalogService, initial);
  return (
    <form action={action} className="card space-y-4 p-5">
      {state.error ? <p className="auth-alert">{state.error}</p> : null}
      <div className="field">
        <label htmlFor="supplierId">Fornecedor</label>
        <select id="supplierId" name="supplierId" defaultValue={defaultSupplierId ?? ""} required>
          <option value="">Selecione</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="name">Serviço ou produto</label>
        <input id="name" name="name" required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="category">Categoria</label>
          <select id="category" name="category">
            <option value="">—</option>
            {SERVICE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="defaultPriceUnit">Unidade padrão</label>
          <select id="defaultPriceUnit" name="defaultPriceUnit" defaultValue="closed">
            {PRICE_UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="description">Descrição</label>
        <textarea id="description" name="description" rows={3} />
      </div>
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Salvando…" : "Salvar serviço"}
      </button>
    </form>
  );
}
