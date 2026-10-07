"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { submitPublicFormularioAction } from "@/app/actions/formularios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GENEROS, ETNIAS } from "@/lib/schema";
import type { FormularioCampoTipoCode } from "@/lib/formularios/types";
import { executeRecaptcha } from "@/components/formularios/recaptcha-execute";

type CampoPublico = {
  id: string;
  tipo: FormularioCampoTipoCode;
  rotulo: string;
  descricao: string | null;
  obrigatorio: boolean;
  opcoes: string[] | null;
  config: Record<string, unknown> | null;
};

type Props = {
  slug: string;
  titulo: string;
  descricao: string;
  capaUrl: string;
  mensagemConfirmacao: string;
  campos: CampoPublico[];
  recaptchaSiteKey: string;
};

type AddressValue = {
  CEP?: string;
  Lougradouro?: string;
  Numero?: string;
  Complemento?: string;
  Bairro?: string;
  Cidade?: string;
  Estado?: string;
};

type FormPage = {
  key: string;
  titulo: string;
  descricao: string;
  campos: CampoPublico[];
};

function asOptions(opcoes: string[] | null): string[] {
  return Array.isArray(opcoes) ? opcoes.map(String) : [];
}

function onlyDigits(v: string) {
  return v.replace(/\D/g, "");
}

function maskCpf(value: string) {
  const d = onlyDigits(value).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function maskPhone(value: string) {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3").replace(/[-\s]+$/, "");
  }
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3").replace(/[-\s]+$/, "");
}

function maskCep(value: string) {
  const d = onlyDigits(value).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function formatEmailInput(value: string) {
  return value.trim().toLowerCase();
}

function formatNameInput(value: string) {
  return value.replace(/\s+/g, " ");
}

function formatPadraoInput(tipo: FormularioCampoTipoCode, raw: string): string {
  switch (tipo) {
    case "CPF":
      return maskCpf(raw);
    case "PHONE_BR":
      return maskPhone(raw);
    case "EMAIL":
      return formatEmailInput(raw);
    case "NAME":
      return formatNameInput(raw);
    default:
      return raw;
  }
}

/** Agrupa perguntas por SECTION — cada grupo vira uma “página”. */
function buildPages(campos: CampoPublico[]): FormPage[] {
  const pages: FormPage[] = [];
  let orphan: CampoPublico[] = [];
  let current: FormPage | null = null;

  for (const c of campos) {
    if (c.tipo === "PARTICIPACAO") continue;
    if (c.tipo === "SECTION") {
      if (orphan.length) {
        pages.push({
          key: "intro",
          titulo: "Antes de começar",
          descricao: "",
          campos: orphan,
        });
        orphan = [];
      }
      if (current) pages.push(current);
      current = {
        key: c.id,
        titulo: c.rotulo.trim() || "Seção",
        descricao: c.descricao?.trim() || "",
        campos: [],
      };
    } else if (current) {
      current.campos.push(c);
    } else {
      orphan.push(c);
    }
  }

  if (orphan.length) {
    pages.push({
      key: pages.length ? "intro" : "all",
      titulo: pages.length ? "Antes de começar" : "",
      descricao: "",
      campos: orphan,
    });
  }
  if (current) pages.push(current);

  return pages.filter((p) => p.campos.length > 0);
}

function isEmptyValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "boolean") return value !== true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if ("name" in o) return !String(o.name ?? "").trim();
    return Object.values(o).every((v) => String(v ?? "").trim() === "");
  }
  return false;
}

function validatePageFields(
  page: FormPage,
  values: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const campo of page.campos) {
    if (!campo.obrigatorio) continue;
    const v = values[campo.id];
    if (campo.tipo === "DECLARACAO") {
      if (v !== true) errors[campo.id] = "É necessário declarar o cumprimento.";
      continue;
    }
    if (isEmptyValue(v)) {
      errors[campo.id] = "Campo obrigatório.";
    }
  }
  return errors;
}

export function PublicFormClient({
  slug,
  titulo,
  descricao,
  capaUrl,
  mensagemConfirmacao,
  campos,
  recaptchaSiteKey,
}: Props) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState(mensagemConfirmacao);
  const [confirmCapa, setConfirmCapa] = useState(capaUrl);
  const [pending, startTransition] = useTransition();
  const [cepLoading, setCepLoading] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  const pages = useMemo(() => buildPages(campos), [campos]);
  const pageCount = Math.max(1, pages.length);
  const safeStep = Math.min(step, pageCount - 1);
  const page = pages[safeStep];
  const isLast = safeStep >= pageCount - 1;
  const isFirst = safeStep <= 0;

  useEffect(() => {
    if (!Object.keys(fieldErrors).length || !pages.length) return;
    const idx = pages.findIndex((p) =>
      p.campos.some((c) => fieldErrors[c.id]),
    );
    if (idx >= 0 && idx !== step) setStep(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage a erros do servidor
  }, [fieldErrors, pages]);

  function setField(id: string, value: unknown) {
    setValues((prev) => ({ ...prev, [id]: value }));
    setFieldErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function lookupCep(campoId: string, cep: string) {
    const digits = onlyDigits(cep);
    if (digits.length !== 8) return;
    setCepLoading(campoId);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = (await res.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (data.erro) return;
      const current = (values[campoId] as AddressValue) || {};
      setField(campoId, {
        ...current,
        CEP: maskCep(digits),
        Lougradouro: data.logradouro || current.Lougradouro || "",
        Bairro: data.bairro || current.Bairro || "",
        Cidade: data.localidade || current.Cidade || "",
        Estado: data.uf || current.Estado || "",
      });
    } finally {
      setCepLoading(null);
    }
  }

  function goNext() {
    if (!page) return;
    setError(null);
    const errs = validatePageFields(page, values);
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      setError("Preencha os campos obrigatórios desta seção.");
      return;
    }
    setFieldErrors({});
    setStep((s) => Math.min(s + 1, pageCount - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack() {
    setError(null);
    setFieldErrors({});
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isLast) {
      goNext();
      return;
    }
    if (page) {
      const errs = validatePageFields(page, values);
      if (Object.keys(errs).length) {
        setFieldErrors(errs);
        setError("Preencha os campos obrigatórios desta seção.");
        return;
      }
    }
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      try {
        const token = await executeRecaptcha(recaptchaSiteKey, "formulario_inscricao");
        const result = await submitPublicFormularioAction({
          slug,
          answers: values,
          recaptchaToken: token,
        });
        if (!result.ok) {
          setError(result.error);
          if (result.fieldErrors) setFieldErrors(result.fieldErrors);
          return;
        }
        setConfirmMsg(result.mensagemConfirmacao);
        setConfirmCapa(result.capaUrl);
        setDone(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao enviar.");
      }
    });
  }

  function renderCampo(campo: CampoPublico) {
    const err = fieldErrors[campo.id];
    const errEl = err ? <p className="text-xs text-red-600">{err}</p> : null;
    const help = campo.descricao ? (
      <p className="text-xs text-slate-500">{campo.descricao}</p>
    ) : null;

    if (campo.tipo === "ADDRESS_BR") {
      const addr = (values[campo.id] as AddressValue) || {};
      return (
        <fieldset
          key={campo.id}
          className="space-y-3 rounded-lg border border-slate-200 p-4"
        >
          <legend className="px-1 text-sm font-medium text-slate-800">
            {campo.rotulo}
            {campo.obrigatorio ? " *" : ""}
          </legend>
          {help}
          {errEl}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>CEP</Label>
              <Input
                value={maskCep(addr.CEP || "")}
                onChange={(e) => {
                  const CEP = maskCep(e.target.value);
                  setField(campo.id, { ...addr, CEP });
                  if (onlyDigits(CEP).length === 8) {
                    void lookupCep(campo.id, CEP);
                  }
                }}
                inputMode="numeric"
                placeholder="00000-000"
                autoComplete="postal-code"
              />
              {cepLoading === campo.id ? (
                <p className="text-xs text-slate-500">Buscando CEP…</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label>Número</Label>
              <Input
                value={addr.Numero || ""}
                onChange={(e) =>
                  setField(campo.id, { ...addr, Numero: e.target.value })
                }
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Logradouro</Label>
              <Input
                value={addr.Lougradouro || ""}
                onChange={(e) =>
                  setField(campo.id, { ...addr, Lougradouro: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Complemento</Label>
              <Input
                value={addr.Complemento || ""}
                onChange={(e) =>
                  setField(campo.id, { ...addr, Complemento: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Bairro</Label>
              <Input
                value={addr.Bairro || ""}
                onChange={(e) =>
                  setField(campo.id, { ...addr, Bairro: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Cidade</Label>
              <Input
                value={addr.Cidade || ""}
                onChange={(e) =>
                  setField(campo.id, { ...addr, Cidade: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>UF</Label>
              <Input
                value={addr.Estado || ""}
                onChange={(e) =>
                  setField(campo.id, {
                    ...addr,
                    Estado: e.target.value
                      .replace(/[^a-zA-Z]/g, "")
                      .toUpperCase()
                      .slice(0, 2),
                  })
                }
                maxLength={2}
                placeholder="UF"
                autoComplete="address-level1"
              />
            </div>
          </div>
        </fieldset>
      );
    }

    if (campo.tipo === "FILE_UPLOAD") {
      const current = values[campo.id] as
        | { name?: string; size?: number; type?: string; dataUrl?: string }
        | null
        | undefined;
      const accept = asOptions(campo.opcoes)
        .map((o) => {
          const ext = o.replace(/^\./, "").trim();
          return ext ? `.${ext}` : "";
        })
        .filter(Boolean)
        .join(",");
      return (
        <div key={campo.id} className="space-y-1.5">
          <Label>
            {campo.rotulo}
            {campo.obrigatorio ? " *" : ""}
          </Label>
          {help}
          {errEl}
          <Input
            type="file"
            accept={accept || undefined}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) {
                setField(campo.id, null);
                return;
              }
              const maxBytes = 1_500_000;
              if (file.size > maxBytes) {
                setFieldErrors((prev) => ({
                  ...prev,
                  [campo.id]: "Arquivo muito grande (máx. ~1,5 MB).",
                }));
                e.target.value = "";
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                setField(campo.id, {
                  name: file.name,
                  size: file.size,
                  type: file.type,
                  dataUrl: String(reader.result ?? ""),
                });
              };
              reader.onerror = () => {
                setFieldErrors((prev) => ({
                  ...prev,
                  [campo.id]: "Não foi possível ler o arquivo.",
                }));
              };
              reader.readAsDataURL(file);
            }}
          />
          {current?.name ? (
            <p className="text-xs text-slate-500">
              Selecionado: {current.name}
              {current.size ? ` (${Math.round(current.size / 1024)} KB)` : ""}
            </p>
          ) : null}
          {accept ? (
            <p className="text-xs text-slate-400">Formatos: {accept}</p>
          ) : null}
        </div>
      );
    }

    if (campo.tipo === "DECLARACAO") {
      const texto = String(campo.config?.texto ?? "");
      const checked = Boolean(values[campo.id]);
      return (
        <div
          key={campo.id}
          className="space-y-2 rounded-lg border border-slate-200 p-4"
        >
          <p className="text-sm font-medium text-slate-800">
            {campo.rotulo}
            {campo.obrigatorio ? " *" : ""}
          </p>
          {texto ? (
            <p className="whitespace-pre-wrap text-sm text-slate-600">{texto}</p>
          ) : null}
          {help}
          {errEl}
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-1"
              checked={checked}
              onChange={(e) => setField(campo.id, e.target.checked)}
            />
            <span>Declaro o cumprimento do texto acima.</span>
          </label>
        </div>
      );
    }

    if (campo.tipo === "LONG_TEXT") {
      return (
        <div key={campo.id} className="space-y-1.5">
          <Label>
            {campo.rotulo}
            {campo.obrigatorio ? " *" : ""}
          </Label>
          {help}
          {errEl}
          <Textarea
            value={String(values[campo.id] ?? "")}
            onChange={(e) => setField(campo.id, e.target.value)}
            rows={4}
          />
        </div>
      );
    }

    if (campo.tipo === "MULTIPLE_CHOICE" || campo.tipo === "DROPDOWN") {
      const opts = asOptions(campo.opcoes);
      if (campo.tipo === "DROPDOWN") {
        return (
          <div key={campo.id} className="space-y-1.5">
            <Label>
              {campo.rotulo}
              {campo.obrigatorio ? " *" : ""}
            </Label>
            {help}
            {errEl}
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={String(values[campo.id] ?? "")}
              onChange={(e) => setField(campo.id, e.target.value)}
            >
              <option value="">Selecione…</option>
              {opts.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        );
      }
      return (
        <fieldset key={campo.id} className="space-y-2">
          <legend className="text-sm font-medium">
            {campo.rotulo}
            {campo.obrigatorio ? " *" : ""}
          </legend>
          {help}
          {errEl}
          {opts.map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={campo.id}
                value={o}
                checked={values[campo.id] === o}
                onChange={() => setField(campo.id, o)}
              />
              {o}
            </label>
          ))}
        </fieldset>
      );
    }

    if (campo.tipo === "CHECKBOXES") {
      const opts = asOptions(campo.opcoes);
      const selected = Array.isArray(values[campo.id])
        ? (values[campo.id] as string[])
        : [];
      return (
        <fieldset key={campo.id} className="space-y-2">
          <legend className="text-sm font-medium">
            {campo.rotulo}
            {campo.obrigatorio ? " *" : ""}
          </legend>
          {help}
          {errEl}
          {opts.map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(o)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...selected, o]
                    : selected.filter((x) => x !== o);
                  setField(campo.id, next);
                }}
              />
              {o}
            </label>
          ))}
        </fieldset>
      );
    }

    if (campo.tipo === "GENERO" || campo.tipo === "ETNIA") {
      const opts = campo.tipo === "GENERO" ? [...GENEROS] : [...ETNIAS];
      return (
        <div key={campo.id} className="space-y-1.5">
          <Label>
            {campo.rotulo}
            {campo.obrigatorio ? " *" : ""}
          </Label>
          {help}
          {errEl}
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={String(values[campo.id] ?? "")}
            onChange={(e) => setField(campo.id, e.target.value)}
          >
            <option value="">Selecione…</option>
            {opts.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (campo.tipo === "SIM_NAO_DETALHE") {
      const raw = String(values[campo.id] ?? "");
      const isSim = raw.toLowerCase().startsWith("sim");
      const detalhe = isSim ? raw.replace(/^sim\s*,?\s*/i, "") : "";
      return (
        <div key={campo.id} className="space-y-2">
          <Label>
            {campo.rotulo}
            {campo.obrigatorio ? " *" : ""}
          </Label>
          {help}
          {errEl}
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={campo.id}
                checked={
                  raw.toLowerCase() === "não" || raw.toLowerCase() === "nao"
                }
                onChange={() => setField(campo.id, "Não")}
              />
              Não
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={campo.id}
                checked={isSim}
                onChange={() => setField(campo.id, "Sim, ")}
              />
              Sim
            </label>
          </div>
          {isSim ? (
            <Input
              placeholder="Detalhe"
              value={detalhe}
              onChange={(e) => setField(campo.id, `Sim, ${e.target.value}`)}
            />
          ) : null}
        </div>
      );
    }

    const inputType =
      campo.tipo === "EMAIL"
        ? "email"
        : campo.tipo === "DATE" || campo.tipo === "BIRTHDATE"
          ? "date"
          : campo.tipo === "PHONE_BR"
            ? "tel"
            : "text";

    const placeholder =
      campo.tipo === "CPF"
        ? "000.000.000-00"
        : campo.tipo === "PHONE_BR"
          ? "(00) 00000-0000"
          : campo.tipo === "EMAIL"
            ? "nome@email.com"
            : undefined;

    const autoComplete =
      campo.tipo === "CPF"
        ? "off"
        : campo.tipo === "PHONE_BR"
          ? "tel"
          : campo.tipo === "EMAIL"
            ? "email"
            : campo.tipo === "NAME"
              ? "name"
              : campo.tipo === "BIRTHDATE"
                ? "bday"
                : undefined;

    return (
      <div key={campo.id} className="space-y-1.5">
        <Label>
          {campo.rotulo}
          {campo.obrigatorio ? " *" : ""}
        </Label>
        {help}
        {errEl}
        <Input
          type={inputType}
          value={String(values[campo.id] ?? "")}
          onChange={(e) =>
            setField(campo.id, formatPadraoInput(campo.tipo, e.target.value))
          }
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={
            campo.tipo === "CPF" || campo.tipo === "PHONE_BR"
              ? "numeric"
              : undefined
          }
        />
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        {confirmCapa ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={confirmCapa}
            alt=""
            className="mx-auto mb-8 max-h-48 w-full rounded-lg object-cover"
          />
        ) : null}
        <h1 className="text-2xl font-semibold text-slate-900">Inscrição recebida</h1>
        <p className="mt-4 whitespace-pre-wrap text-slate-600">{confirmMsg}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      {capaUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={capaUrl} alt="" className="mb-6 max-h-56 w-full rounded-lg object-cover" />
      ) : null}
      <h1 className="text-3xl font-semibold text-slate-900">{titulo}</h1>
      {descricao ? (
        <p className="mt-3 whitespace-pre-wrap text-slate-600">{descricao}</p>
      ) : null}

      {pageCount > 1 ? (
        <div className="mt-6 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              Etapa {safeStep + 1} de {pageCount}
            </span>
            <span>{Math.round(((safeStep + 1) / pageCount) * 100)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-slate-800 transition-[width] duration-300"
              style={{ width: `${((safeStep + 1) / pageCount) * 100}%` }}
            />
          </div>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="mt-8 space-y-6">
        {page ? (
          <section className="space-y-6">
            {page.titulo ? (
              <div>
                <h2 className="text-xl font-semibold text-slate-900">{page.titulo}</h2>
                {page.descricao ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                    {page.descricao}
                  </p>
                ) : null}
              </div>
            ) : null}
            {page.campos.map((campo) => renderCampo(campo))}
          </section>
        ) : (
          <p className="text-sm text-slate-500">Nenhuma pergunta neste formulário.</p>
        )}

        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 pt-2">
          {!isFirst ? (
            <Button type="button" variant="outline" onClick={goBack} disabled={pending}>
              Voltar
            </Button>
          ) : null}
          {isLast ? (
            <Button type="submit" disabled={pending} className="sm:ml-auto">
              {pending ? "Enviando…" : "Enviar inscrição"}
            </Button>
          ) : (
            <Button type="button" onClick={goNext} disabled={pending} className="sm:ml-auto">
              Continuar
            </Button>
          )}
        </div>
        {recaptchaSiteKey ? (
          <p className="text-xs text-slate-400">
            Protegido por reCAPTCHA. Aplicam-se a Política de Privacidade e os Termos
            de Serviço do Google.
          </p>
        ) : null}
      </form>
    </div>
  );
}
