"use client";

import { FieldLabel } from "@/components/FieldHelp";

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export type ContactAddressValues = {
  contactEmail: string;
  contactPhone: string;
  addressZip: string;
  addressStreet: string;
  addressNumber: string;
  addressComplement: string;
  addressNeighborhood: string;
  addressCity: string;
  addressState: string;
};

export const emptyContactAddress = (): ContactAddressValues => ({
  contactEmail: "",
  contactPhone: "",
  addressZip: "",
  addressStreet: "",
  addressNumber: "",
  addressComplement: "",
  addressNeighborhood: "",
  addressCity: "",
  addressState: "",
});

type Props = {
  idPrefix?: string;
  /** Modo controlado (create/autocomplete). */
  values?: ContactAddressValues;
  onChange?: (patch: Partial<ContactAddressValues>) => void;
  onCepBlur?: (cep: string) => void;
  cepPending?: boolean;
  /** Valores iniciais no modo não controlado (edição). */
  defaults?: Partial<ContactAddressValues>;
};

/** Campos obrigatórios de contato e endereço (exceto complemento). */
export function ContactAddressFields({
  idPrefix = "",
  values,
  onChange,
  onCepBlur,
  cepPending,
  defaults,
}: Props) {
  const controlled = Boolean(values && onChange);
  const id = (name: string) => (idPrefix ? `${name}-${idPrefix}` : name);

  function fieldProps(key: keyof ContactAddressValues) {
    if (controlled && values && onChange) {
      return {
        value: values[key],
        onChange: (
          e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
        ) => onChange({ [key]: e.target.value }),
      };
    }
    return {
      defaultValue: values?.[key] ?? defaults?.[key] ?? "",
    };
  }

  return (
    <>
      <div className="md:col-span-2">
        <h3 className="text-sm font-semibold text-[var(--navy)]">Contato</h3>
        <p className="mt-0.5 text-xs text-[var(--gray-500)]">
          E-mail e telefone de contato obrigatórios.
        </p>
      </div>
      <div className="field">
        <FieldLabel htmlFor={id("contactEmail")}>E-mail de contato</FieldLabel>
        <input
          id={id("contactEmail")}
          name="contactEmail"
          type="email"
          required
          autoComplete="email"
          placeholder="contato@empresa.com"
          {...fieldProps("contactEmail")}
        />
      </div>
      <div className="field">
        <FieldLabel htmlFor={id("contactPhone")}>Telefone de contato</FieldLabel>
        <input
          id={id("contactPhone")}
          name="contactPhone"
          type="tel"
          required
          autoComplete="tel"
          placeholder="(11) 98888-0000"
          {...fieldProps("contactPhone")}
        />
      </div>

      <div className="md:col-span-2 pt-1">
        <h3 className="text-sm font-semibold text-[var(--navy)]">Endereço</h3>
        <p className="mt-0.5 text-xs text-[var(--gray-500)]">
          Digite o CEP para buscar logradouro, bairro, cidade e UF (ViaCEP). Complemento é opcional.
        </p>
      </div>
      <div className="field">
        <FieldLabel htmlFor={id("addressZip")}>CEP</FieldLabel>
        <input
          id={id("addressZip")}
          name="addressZip"
          required
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="00000-000"
          {...fieldProps("addressZip")}
          onBlur={(e) => {
            onCepBlur?.(e.target.value);
          }}
        />
        {cepPending && (
          <p className="mt-1 text-xs text-[var(--gray-400)]">Buscando CEP…</p>
        )}
      </div>
      <div className="field md:col-span-1">
        <FieldLabel htmlFor={id("addressStreet")}>Logradouro</FieldLabel>
        <input
          id={id("addressStreet")}
          name="addressStreet"
          required
          autoComplete="street-address"
          placeholder="Rua, avenida…"
          {...fieldProps("addressStreet")}
        />
      </div>
      <div className="field">
        <FieldLabel htmlFor={id("addressNumber")}>Número</FieldLabel>
        <input
          id={id("addressNumber")}
          name="addressNumber"
          required
          placeholder="123"
          {...fieldProps("addressNumber")}
        />
      </div>
      <div className="field">
        <FieldLabel htmlFor={id("addressComplement")}>Complemento</FieldLabel>
        <input
          id={id("addressComplement")}
          name="addressComplement"
          placeholder="Opcional — sala, andar…"
          {...fieldProps("addressComplement")}
        />
      </div>
      <div className="field">
        <FieldLabel htmlFor={id("addressNeighborhood")}>Bairro</FieldLabel>
        <input
          id={id("addressNeighborhood")}
          name="addressNeighborhood"
          required
          placeholder="Bairro"
          {...fieldProps("addressNeighborhood")}
        />
      </div>
      <div className="field">
        <FieldLabel htmlFor={id("addressCity")}>Cidade</FieldLabel>
        <input
          id={id("addressCity")}
          name="addressCity"
          required
          autoComplete="address-level2"
          placeholder="Cidade"
          {...fieldProps("addressCity")}
        />
      </div>
      <div className="field">
        <FieldLabel htmlFor={id("addressState")}>UF</FieldLabel>
        <select
          id={id("addressState")}
          name="addressState"
          required
          autoComplete="address-level1"
          {...fieldProps("addressState")}
        >
          <option value="" disabled>
            Selecione
          </option>
          {UFS.map((uf) => (
            <option key={uf} value={uf}>
              {uf}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
