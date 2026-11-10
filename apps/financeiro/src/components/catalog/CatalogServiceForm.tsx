"use client";

import { useActionState } from "react";
import { SearchSelect } from "@max/ui";
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
        <SearchSelect
          id="supplierId"
          name="supplierId"
          defaultValue={defaultSupplierId ?? ""}
          required
          emptyOption="Selecione"
          options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
        />
      </div>
      <div className="field">
        <label htmlFor="name">Serviço ou produto</label>
        <input id="name" name="name" required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="category">Categoria</label>
          <SearchSelect
            id="category"
            name="category"
            emptyOption="—"
            options={SERVICE_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
          />
        </div>
        <div className="field">
          <label htmlFor="defaultPriceUnit">Unidade padrão</label>
          <SearchSelect
            id="defaultPriceUnit"
            name="defaultPriceUnit"
            defaultValue="closed"
            options={PRICE_UNITS.map((u) => ({ value: u.value, label: u.label }))}
          />
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
