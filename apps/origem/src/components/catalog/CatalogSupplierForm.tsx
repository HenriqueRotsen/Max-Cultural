"use client";

import { useActionState, useState } from "react";
import {
  lookupCepAction,
  lookupCnpjAction,
  upsertCatalogSupplier,
  type CatalogActionState,
} from "@/lib/catalog/actions";
import { BRAZIL_UF } from "@/lib/catalog/address";

const initial: CatalogActionState = {};

export function CatalogSupplierForm({
  supplier,
}: {
  supplier?: {
    id: string;
    cnpj: string;
    name: string;
    tradeName: string | null;
    phone: string | null;
    email: string | null;
    streetType: string | null;
    streetName: string | null;
    streetNumber: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    notes: string | null;
  };
}) {
  const [state, action, pending] = useActionState(upsertCatalogSupplier, initial);
  const [cnpj, setCnpj] = useState(supplier?.cnpj ?? "");
  const [name, setName] = useState(supplier?.name ?? "");
  const [tradeName, setTradeName] = useState(supplier?.tradeName ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [email, setEmail] = useState(supplier?.email ?? "");
  const [streetType, setStreetType] = useState(supplier?.streetType ?? "");
  const [streetName, setStreetName] = useState(supplier?.streetName ?? "");
  const [streetNumber, setStreetNumber] = useState(supplier?.streetNumber ?? "");
  const [complement, setComplement] = useState(supplier?.complement ?? "");
  const [neighborhood, setNeighborhood] = useState(supplier?.neighborhood ?? "");
  const [city, setCity] = useState(supplier?.city ?? "");
  const [stateUf, setStateUf] = useState(supplier?.state ?? "");
  const [zipCode, setZipCode] = useState(supplier?.zipCode ?? "");

  async function fillCnpj() {
    const data = await lookupCnpjAction(cnpj);
    if (!data) return;
    setCnpj(data.cnpj);
    if (data.name) setName(data.name);
    if (data.tradeName) setTradeName(data.tradeName);
    if (data.phone) setPhone(data.phone);
    if (data.email) setEmail(data.email);
    if (data.streetType) setStreetType(data.streetType);
    if (data.streetName) setStreetName(data.streetName);
    if (data.streetNumber) setStreetNumber(data.streetNumber);
    if (data.complement) setComplement(data.complement);
    if (data.neighborhood) setNeighborhood(data.neighborhood);
    if (data.city) setCity(data.city);
    if (data.state) setStateUf(data.state);
    if (data.zipCode) setZipCode(data.zipCode);
  }

  async function fillCep() {
    const data = await lookupCepAction(zipCode);
    if (!data) return;
    if (data.streetType) setStreetType(data.streetType);
    if (data.streetName) setStreetName(data.streetName);
    if (data.neighborhood) setNeighborhood(data.neighborhood);
    if (data.city) setCity(data.city);
    if (data.state) setStateUf(data.state);
  }

  return (
    <form action={action} className="card space-y-4 p-5">
      {supplier ? <input type="hidden" name="id" value={supplier.id} /> : null}
      {state.error ? <p className="auth-alert">{state.error}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="cnpj">CNPJ ou CPF</label>
          <div className="flex gap-2">
            <input id="cnpj" name="cnpj" value={cnpj} onChange={(e) => setCnpj(e.target.value)} required />
            <button type="button" className="btn btn-ghost" onClick={fillCnpj}>
              Buscar
            </button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="tradeName">Nome fantasia</label>
          <input id="tradeName" name="tradeName" value={tradeName} onChange={(e) => setTradeName(e.target.value)} />
        </div>
        <div className="field sm:col-span-2">
          <label htmlFor="name">Razão social</label>
          <input id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="phone">Telefone</label>
          <input id="phone" name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="zipCode">CEP</label>
          <div className="flex gap-2">
            <input id="zipCode" name="zipCode" value={zipCode} onChange={(e) => setZipCode(e.target.value)} />
            <button type="button" className="btn btn-ghost" onClick={fillCep}>
              CEP
            </button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="state">UF</label>
          <select id="state" name="state" value={stateUf} onChange={(e) => setStateUf(e.target.value)}>
            <option value="">—</option>
            {BRAZIL_UF.map((uf) => (
              <option key={uf.sigla} value={uf.sigla}>
                {uf.sigla}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="streetType">Tipo</label>
          <input id="streetType" name="streetType" value={streetType} onChange={(e) => setStreetType(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="streetName">Logradouro</label>
          <input id="streetName" name="streetName" value={streetName} onChange={(e) => setStreetName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="streetNumber">Número</label>
          <input id="streetNumber" name="streetNumber" value={streetNumber} onChange={(e) => setStreetNumber(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="complement">Complemento</label>
          <input id="complement" name="complement" value={complement} onChange={(e) => setComplement(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="neighborhood">Bairro</label>
          <input id="neighborhood" name="neighborhood" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
        </div>
        <div className="field sm:col-span-2">
          <label htmlFor="city">Cidade</label>
          <input id="city" name="city" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div className="field sm:col-span-2">
          <label htmlFor="notes">Notas</label>
          <textarea id="notes" name="notes" rows={3} defaultValue={supplier?.notes ?? ""} />
        </div>
      </div>
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Salvando…" : "Salvar fornecedor"}
      </button>
    </form>
  );
}
