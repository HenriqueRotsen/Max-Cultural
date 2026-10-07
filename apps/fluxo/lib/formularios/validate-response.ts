import {
  EMPTY_ADDRESS_BR,
  type AddressBrValue,
  type FormularioCampoTipoCode,
} from "@/lib/formularios/types";
import {
  normalizeCpf,
  normalizeEmail,
  normalizePhone,
  normalizeCep,
  normalizeUf,
  normalizeGenero,
  normalizeEtnia,
  normalizeSimComDetalhe,
  parseParticipacaoStatus,
} from "@/lib/normalize";
import { GENEROS, ETNIAS } from "@/lib/schema";

export type CampoValidavel = {
  id: string;
  rotulo: string;
  obrigatorio: boolean;
  tipo: FormularioCampoTipoCode;
  sigaColumn: string | null;
  opcoes: string[] | null;
};

export type ValidateResult = {
  ok: boolean;
  errors: Record<string, string>;
  /** Valores normalizados por campo id */
  values: Record<string, unknown>;
  cpf: string;
  /** Campos SIGA prontos para merge/normalizeRow */
  sigaPartial: Record<string, unknown>;
};

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    return Object.values(o).every((v) => String(v ?? "").trim() === "");
  }
  return false;
}

function asAddress(value: unknown): AddressBrValue {
  if (!value || typeof value !== "object") return { ...EMPTY_ADDRESS_BR };
  const o = value as Record<string, unknown>;
  return {
    CEP: String(o.CEP ?? o.cep ?? ""),
    Lougradouro: String(o.Lougradouro ?? o.logradouro ?? ""),
    Numero: String(o.Numero ?? o.numero ?? ""),
    Complemento: String(o.Complemento ?? o.complemento ?? ""),
    Bairro: String(o.Bairro ?? o.bairro ?? ""),
    Cidade: String(o.Cidade ?? o.cidade ?? ""),
    Estado: String(o.Estado ?? o.estado ?? o.uf ?? ""),
  };
}

export function validateFormularioAnswers(
  campos: CampoValidavel[],
  raw: Record<string, unknown>,
): ValidateResult {
  const errors: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const sigaPartial: Record<string, unknown> = {};
  let cpf = "";

  for (const campo of campos) {
    if (campo.tipo === "SECTION") continue;
    const rawVal = raw[campo.id];

    if (campo.obrigatorio && isEmpty(rawVal)) {
      if (campo.tipo === "DECLARACAO" && rawVal !== true) {
        errors[campo.id] = "É necessário declarar o cumprimento.";
      } else if (campo.tipo !== "DECLARACAO") {
        errors[campo.id] = "Campo obrigatório.";
      }
    }

    switch (campo.tipo) {
      case "CPF": {
        const n = normalizeCpf(rawVal);
        values[campo.id] = n;
        if (n && n.replace(/\D/g, "").length !== 11) {
          errors[campo.id] = "CPF inválido.";
        } else if (n) {
          cpf = n.replace(/\D/g, "");
          if (campo.sigaColumn) sigaPartial[campo.sigaColumn] = n;
        }
        break;
      }
      case "EMAIL": {
        const n = normalizeEmail(rawVal);
        values[campo.id] = n;
        if (n && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n)) {
          errors[campo.id] = "E-mail inválido.";
        } else if (campo.sigaColumn && n) {
          sigaPartial[campo.sigaColumn] = n;
        }
        break;
      }
      case "PHONE_BR": {
        const n = normalizePhone(rawVal);
        values[campo.id] = n;
        const digits = n.replace(/\D/g, "");
        if (n && digits.length < 10) {
          errors[campo.id] = "Telefone inválido.";
        } else if (campo.sigaColumn && n) {
          sigaPartial[campo.sigaColumn] = n;
        }
        break;
      }
      case "NAME": {
        const n = String(rawVal ?? "").trim();
        values[campo.id] = n;
        if (campo.sigaColumn && n) sigaPartial[campo.sigaColumn] = n;
        break;
      }
      case "BIRTHDATE":
      case "DATE": {
        const n = String(rawVal ?? "").trim();
        values[campo.id] = n;
        if (campo.sigaColumn && n) sigaPartial[campo.sigaColumn] = n;
        break;
      }
      case "GENERO": {
        const n = normalizeGenero(rawVal);
        values[campo.id] = n;
        if (n && !(GENEROS as readonly string[]).includes(n) && campo.obrigatorio) {
          // allow custom "Outro" etc. from normalizeGenero
        }
        if (campo.sigaColumn && n) sigaPartial[campo.sigaColumn] = n;
        break;
      }
      case "ETNIA": {
        const n = normalizeEtnia(rawVal);
        values[campo.id] = n;
        if (campo.sigaColumn && n) sigaPartial[campo.sigaColumn] = n;
        void ETNIAS;
        break;
      }
      case "SIM_NAO_DETALHE": {
        const n = normalizeSimComDetalhe(rawVal);
        values[campo.id] = n;
        if (campo.sigaColumn && n) sigaPartial[campo.sigaColumn] = n;
        break;
      }
      case "ADDRESS_BR": {
        const addr = asAddress(rawVal);
        addr.CEP = normalizeCep(addr.CEP);
        addr.Estado = normalizeUf(addr.Estado);
        values[campo.id] = addr;
        if (campo.obrigatorio) {
          if (addr.CEP.replace(/\D/g, "").length !== 8) {
            errors[campo.id] = "CEP inválido.";
          } else if (!addr.Lougradouro.trim() || !addr.Numero.trim() || !addr.Bairro.trim() || !addr.Cidade.trim() || !addr.Estado.trim()) {
            errors[campo.id] = "Preencha logradouro, número, bairro, cidade e estado.";
          }
        }
        Object.assign(sigaPartial, {
          CEP: addr.CEP,
          Lougradouro: addr.Lougradouro,
          Numero: addr.Numero,
          Complemento: addr.Complemento,
          Bairro: addr.Bairro,
          Cidade: addr.Cidade,
          Estado: addr.Estado,
        });
        break;
      }
      case "DECLARACAO": {
        const ok = rawVal === true || rawVal === "true" || rawVal === 1;
        values[campo.id] = ok;
        if (campo.obrigatorio && !ok) {
          errors[campo.id] = "É necessário declarar o cumprimento.";
        }
        break;
      }
      case "CHECKBOXES": {
        const arr = Array.isArray(rawVal)
          ? rawVal.map((v) => String(v))
          : String(rawVal ?? "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
        const allowed = new Set((campo.opcoes ?? []).map(String));
        if (allowed.size && arr.some((v) => !allowed.has(v))) {
          errors[campo.id] = "Opção inválida.";
          values[campo.id] = [];
        } else {
          values[campo.id] = arr;
          if (campo.sigaColumn && arr.length) {
            sigaPartial[campo.sigaColumn] = arr.join("; ");
          }
        }
        break;
      }
      case "MULTIPLE_CHOICE":
      case "DROPDOWN": {
        const n = String(rawVal ?? "").trim();
        const allowed = campo.opcoes ?? [];
        if (n && allowed.length && !allowed.includes(n)) {
          errors[campo.id] = "Opção inválida.";
          values[campo.id] = "";
        } else {
          values[campo.id] = n;
          if (campo.sigaColumn && n) sigaPartial[campo.sigaColumn] = n;
        }
        break;
      }
      case "SHORT_TEXT":
      case "LONG_TEXT": {
        const n = String(rawVal ?? "").trim().slice(0, 10_000);
        values[campo.id] = n;
        if (campo.sigaColumn && n) sigaPartial[campo.sigaColumn] = n;
        break;
      }
      case "FILE_UPLOAD": {
        const file =
          rawVal && typeof rawVal === "object"
            ? (rawVal as {
                name?: string;
                size?: number;
                type?: string;
                dataUrl?: string;
              })
            : null;
        const name = String(file?.name ?? "").trim().slice(0, 255);
        const dataUrl = String(file?.dataUrl ?? "");
        const size = Number(file?.size) || 0;
        const maxBytes = 1_500_000;
        if (name && (size > maxBytes || dataUrl.length > 2_100_000)) {
          errors[campo.id] = "Arquivo muito grande (máx. ~1,5 MB).";
          values[campo.id] = null;
          break;
        }
        if (dataUrl && !/^data:[a-z0-9.+/-]+;base64,/i.test(dataUrl)) {
          errors[campo.id] = "Arquivo inválido.";
          values[campo.id] = null;
          break;
        }
        values[campo.id] = file
          ? {
              name,
              size,
              type: String(file.type ?? "").slice(0, 100),
              dataUrl: dataUrl.slice(0, 2_100_000),
            }
          : null;
        if (campo.obrigatorio && !name) {
          errors[campo.id] = "Envie um arquivo.";
        }
        if (name && campo.opcoes?.length) {
          const ext = name.includes(".")
            ? name.slice(name.lastIndexOf(".") + 1).toLowerCase()
            : "";
          const allowed = campo.opcoes.map((o) =>
            o.replace(/^\./, "").trim().toLowerCase(),
          );
          if (ext && !allowed.includes(ext)) {
            errors[campo.id] = `Formato não permitido. Use: ${allowed.join(", ")}`;
          }
        }
        break;
      }
      case "PARTICIPACAO": {
        const parsed = parseParticipacaoStatus(rawVal);
        values[campo.id] = String(rawVal ?? "");
        if (parsed) {
          sigaPartial.Participantes = parsed.participante;
          sigaPartial.Certificado = parsed.certificado;
        }
        break;
      }
      default:
        values[campo.id] = rawVal;
    }
  }

  if (!cpf) {
    // tenta achar CPF em qualquer campo tipado
    for (const campo of campos) {
      if (campo.tipo === "CPF" && values[campo.id]) {
        cpf = String(values[campo.id]).replace(/\D/g, "");
      }
    }
  }

  return {
    ok: Object.keys(errors).length === 0 && cpf.length === 11,
    errors: {
      ...errors,
      ...(cpf.length !== 11 ? { _cpf: "CPF é obrigatório para a inscrição." } : {}),
    },
    values,
    cpf,
    sigaPartial,
  };
}
