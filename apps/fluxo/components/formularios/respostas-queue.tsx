"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Search,
  Send,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  mergeRespostasAction,
  updateRespostaReviewAction,
} from "@/app/actions/formularios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  formatCepDisplay,
  formatCpfDisplay,
  formatPhoneDisplay,
} from "@/lib/normalize";
import type { FormularioCampoTipoCode } from "@/lib/formularios/types";
import { ETNIAS, GENEROS } from "@/lib/schema";

export type RespostaRow = {
  id: string;
  cpf: string;
  status: "PENDING" | "READY" | "MERGED" | "REJECTED";
  selecionados: number;
  participantes: number;
  certificado: number;
  professorNome: string;
  submittedAt: string;
  payload: {
    answers?: Record<string, unknown>;
    sigaPartial?: Record<string, unknown>;
  };
};

export type RespostaCampoMeta = {
  id: string;
  rotulo: string;
  tipo: FormularioCampoTipoCode | string;
  sigaColumn: string | null;
  ocultoProfessor: boolean;
  ordem?: number;
  opcoes?: string[] | null;
};

type Props = {
  formularioId: string;
  oficinaLabel: string;
  respostas: RespostaRow[];
  canMerge: boolean;
  /** Quem cria/edita formulários — pode alterar dados, participação e descartar. */
  canEditData?: boolean;
  professorMode?: boolean;
  viewerName?: string;
  campos?: RespostaCampoMeta[];
};

type DisplayField = {
  key: string;
  label: string;
  tipo: string;
  value: unknown;
};

const STATUS_UI: Record<
  RespostaRow["status"],
  { label: string; hint: string; className: string }
> = {
  PENDING: {
    label: "Nova",
    hint: "Ainda não revisada",
    className: "bg-amber-100 text-amber-950 border-transparent",
  },
  READY: {
    label: "Pronta para a base",
    hint: "Pode ser enviada à planilha oficial",
    className: "bg-sky-100 text-sky-950 border-transparent",
  },
  MERGED: {
    label: "Já na base",
    hint: "Enviada para a planilha oficial",
    className: "bg-emerald-100 text-emerald-950 border-transparent",
  },
  REJECTED: {
    label: "Descartada",
    hint: "Não seguirá para a base",
    className: "bg-rose-100 text-rose-950 border-transparent",
  },
};

function participacaoFromFlags(participantes: number, certificado: number) {
  if (certificado) return "Certificou";
  if (participantes) return "Participou";
  return "Não Participou";
}

function isEmptyValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return !value.trim();
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).every(isEmptyValue);
  }
  return false;
}

function formatScalar(value: unknown, tipo: string, label: string): string {
  if (isEmptyValue(value)) return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean).join(", ") || "—";
  }
  if (typeof value === "object") return "";

  const raw = String(value);
  const lowerLabel = label.toLowerCase();
  if (tipo === "CPF" || lowerLabel.includes("cpf")) return formatCpfDisplay(raw);
  if (tipo === "PHONE_BR" || lowerLabel.includes("telefone") || lowerLabel.includes("celular")) {
    return formatPhoneDisplay(raw);
  }
  if (tipo === "EMAIL" || lowerLabel.includes("e-mail") || lowerLabel.includes("email")) {
    return raw.trim().toLowerCase();
  }
  if (
    tipo === "DATE" ||
    tipo === "BIRTHDATE" ||
    lowerLabel.includes("nascimento") ||
    lowerLabel.includes("data")
  ) {
    const d = Date.parse(raw);
    if (!Number.isNaN(d)) {
      return new Date(d).toLocaleDateString("pt-BR");
    }
  }
  return raw;
}

function formatAddress(value: unknown): { lines: string[]; cep?: string } | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const cep = formatCepDisplay(o.CEP ?? o.cep ?? "");
  const log = String(o.Lougradouro ?? o.logradouro ?? "").trim();
  const num = String(o.Numero ?? o.numero ?? "").trim();
  const comp = String(o.Complemento ?? o.complemento ?? "").trim();
  const bairro = String(o.Bairro ?? o.bairro ?? "").trim();
  const cidade = String(o.Cidade ?? o.cidade ?? "").trim();
  const uf = String(o.Estado ?? o.estado ?? o.UF ?? "").trim();

  const line1 = [log, num].filter(Boolean).join(", ");
  const line1b = [line1, comp].filter(Boolean).join(" — ");
  const line2 = [bairro, [cidade, uf].filter(Boolean).join(" / ")].filter(Boolean).join(" · ");
  const lines = [line1b, line2].filter(Boolean);
  if (!lines.length && !cep) return null;
  return { lines, cep: cep || undefined };
}

function displayName(r: RespostaRow, campos: RespostaCampoMeta[]): string {
  const answers = r.payload?.answers ?? {};
  const siga = r.payload?.sigaPartial ?? {};
  const nameCampo = campos.find(
    (c) =>
      c.tipo === "NAME" ||
      c.sigaColumn === "Nome" ||
      c.rotulo.toLowerCase().includes("nome"),
  );
  if (nameCampo) {
    const fromAnswer = answers[nameCampo.id];
    if (typeof fromAnswer === "string" && fromAnswer.trim()) return fromAnswer.trim();
    if (nameCampo.sigaColumn && typeof siga[nameCampo.sigaColumn] === "string") {
      const v = String(siga[nameCampo.sigaColumn]).trim();
      if (v) return v;
    }
  }
  for (const key of ["Nome", "Nome completo", "Nome social"]) {
    if (typeof siga[key] === "string" && String(siga[key]).trim()) {
      return String(siga[key]).trim();
    }
  }
  return "Inscrição sem nome";
}

function buildFields(r: RespostaRow, campos: RespostaCampoMeta[], professorMode: boolean): DisplayField[] {
  const answers = r.payload?.answers ?? {};
  const siga = r.payload?.sigaPartial ?? {};
  const visible = professorMode
    ? campos.filter((c) => !c.ocultoProfessor && c.tipo !== "SECTION")
    : campos.filter((c) => c.tipo !== "SECTION");

  const fields: DisplayField[] = [];
  const usedSiga = new Set<string>();

  for (const c of visible) {
    let value: unknown;
    if (c.id in answers) value = answers[c.id];
    else if (c.sigaColumn && c.sigaColumn in siga) value = siga[c.sigaColumn];
    else continue;
    if (c.sigaColumn) usedSiga.add(c.sigaColumn);
    if (isEmptyValue(value)) continue;
    fields.push({
      key: c.id,
      label: c.rotulo,
      tipo: c.tipo,
      value,
    });
  }

  if (!professorMode || !campos.length) {
    for (const [k, v] of Object.entries(siga)) {
      if (usedSiga.has(k) || isEmptyValue(v)) continue;
      if (
        professorMode &&
        campos.some((c) => c.sigaColumn === k && c.ocultoProfessor)
      ) {
        continue;
      }
      fields.push({ key: `siga-${k}`, label: k, tipo: "SHORT_TEXT", value: v });
    }
  }

  return fields;
}

function FieldValue({ field }: { field: DisplayField }) {
  if (field.tipo === "ADDRESS_BR" || field.label.toLowerCase().includes("endereço")) {
    const addr = formatAddress(field.value);
    if (addr) {
      return (
        <div className="space-y-0.5">
          {addr.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          {addr.cep ? (
            <p className="text-muted-foreground">CEP {addr.cep}</p>
          ) : null}
        </div>
      );
    }
  }

  if (field.tipo === "FILE_UPLOAD" && typeof field.value === "string") {
    const url = field.value.trim();
    if (url.startsWith("/") || url.startsWith("http")) {
      return (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-brand-deep underline-offset-2 hover:underline"
        >
          Abrir anexo
        </a>
      );
    }
  }

  if (field.tipo === "LONG_TEXT") {
    return (
      <p className="whitespace-pre-wrap leading-relaxed">
        {formatScalar(field.value, field.tipo, field.label)}
      </p>
    );
  }

  if (field.tipo === "DECLARACAO") {
    const ok =
      field.value === true ||
      field.value === 1 ||
      String(field.value).toLowerCase() === "true" ||
      String(field.value).toLowerCase() === "sim";
    return <p>{ok ? "Declarado" : "Não declarado"}</p>;
  }

  if (typeof field.value === "object" && field.value && !Array.isArray(field.value)) {
    const addr = formatAddress(field.value);
    if (addr) {
      return (
        <div className="space-y-0.5">
          {addr.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          {addr.cep ? (
            <p className="text-muted-foreground">CEP {addr.cep}</p>
          ) : null}
        </div>
      );
    }
    const entries = Object.entries(field.value as Record<string, unknown>).filter(
      ([, v]) => !isEmptyValue(v),
    );
    if (entries.length) {
      return (
        <dl className="space-y-1">
          {entries.map(([k, v]) => (
            <div key={k} className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">{k}:</dt>
              <dd>{formatScalar(v, field.tipo, k)}</dd>
            </div>
          ))}
        </dl>
      );
    }
  }

  return <p>{formatScalar(field.value, field.tipo, field.label)}</p>;
}

function answersFromRow(r: RespostaRow, campos: RespostaCampoMeta[]): Record<string, unknown> {
  const answers = { ...(r.payload?.answers ?? {}) };
  const siga = r.payload?.sigaPartial ?? {};
  for (const c of campos) {
    if (c.tipo === "SECTION") continue;
    if (c.id in answers) continue;
    if (c.sigaColumn && c.sigaColumn in siga) {
      answers[c.id] = siga[c.sigaColumn];
    }
  }
  return answers;
}

function AddressEditor({
  value,
  onChange,
  disabled,
}: {
  value: unknown;
  onChange: (next: Record<string, string>) => void;
  disabled?: boolean;
}) {
  const addr =
    value && typeof value === "object"
      ? (value as Record<string, string>)
      : {};
  const fields: Array<[string, string]> = [
    ["CEP", "CEP"],
    ["Lougradouro", "Logradouro"],
    ["Numero", "Número"],
    ["Complemento", "Complemento"],
    ["Bairro", "Bairro"],
    ["Cidade", "Cidade"],
    ["Estado", "UF"],
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {fields.map(([key, label]) => (
        <label key={key} className="space-y-1 text-xs">
          <span className="text-muted-foreground">{label}</span>
          <Input
            disabled={disabled}
            value={String(addr[key] ?? "")}
            onChange={(e) =>
              onChange({
                ...addr,
                [key]:
                  key === "CEP"
                    ? formatCepDisplay(e.target.value)
                    : e.target.value,
              })
            }
          />
        </label>
      ))}
    </div>
  );
}

export function RespostasQueue({
  formularioId,
  oficinaLabel,
  respostas: initial,
  canMerge,
  canEditData = false,
  professorMode = false,
  viewerName = "",
  campos = [],
}: Props) {
  const [rows, setRows] = useState(initial);
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, unknown>>({});
  const [mergeOpen, setMergeOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "new" | "selected" | RespostaRow["status"]>(
    "all",
  );
  const [pending, start] = useTransition();

  const showStaffActions = canEditData && !professorMode;
  const hideCpf =
    professorMode &&
    campos.some(
      (c) =>
        c.ocultoProfessor &&
        (c.tipo === "CPF" ||
          c.sigaColumn === "CPF" ||
          c.rotulo.toLowerCase().includes("cpf")),
    );

  const readySelected = useMemo(
    () => selected.filter((id) => rows.find((r) => r.id === id)?.status === "READY"),
    [selected, rows],
  );

  const counts = useMemo(() => {
    return {
      total: rows.length,
      novas: rows.filter((r) => r.status === "PENDING").length,
      selecionadas: rows.filter((r) => r.selecionados === 1).length,
      prontas: rows.filter((r) => r.status === "READY").length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "new" && r.status !== "PENDING") return false;
      if (filter === "selected" && r.selecionados !== 1) return false;
      if (
        filter !== "all" &&
        filter !== "new" &&
        filter !== "selected" &&
        r.status !== filter
      ) {
        return false;
      }
      if (!q) return true;
      const nome = displayName(r, campos).toLowerCase();
      const prof = r.professorNome.toLowerCase();
      if (nome.includes(q) || prof.includes(q)) return true;
      if (hideCpf) return false;
      const cpf = formatCpfDisplay(r.cpf).toLowerCase();
      return cpf.includes(q) || r.cpf.includes(q);
    });
  }, [rows, query, filter, campos, hideCpf]);

  function toggleSelect(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function selectAllReady() {
    setSelected(rows.filter((r) => r.status === "READY").map((r) => r.id));
  }

  function saveReview(
    id: string,
    patch: {
      selecionados?: number;
      participacao?: string;
      status?: "PENDING" | "READY" | "REJECTED";
      professor?: boolean;
      answers?: Record<string, unknown>;
    },
  ) {
    start(async () => {
      try {
        const result = await updateRespostaReviewAction(id, patch);
        setRows((prev) =>
          prev.map((r) => {
            if (r.id !== id) return r;
            const next = { ...r };
            if (patch.selecionados != null) next.selecionados = patch.selecionados;
            if (patch.status) next.status = patch.status;
            if (patch.professor != null) {
              next.professorNome =
                result.professorNome ?? (patch.professor ? viewerName : "");
            }
            if (patch.participacao) {
              if (patch.participacao === "Certificou") {
                next.participantes = 1;
                next.certificado = 1;
              } else if (patch.participacao === "Participou") {
                next.participantes = 1;
                next.certificado = 0;
              } else {
                next.participantes = 0;
                next.certificado = 0;
              }
            }
            if (patch.answers) {
              next.payload = {
                ...next.payload,
                answers: patch.answers,
              };
            }
            return next;
          }),
        );
        if (patch.answers) {
          setEditingId(null);
        }
        toast.success("Salvo");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Falha ao salvar");
      }
    });
  }

  function startEdit(r: RespostaRow) {
    setEditingId(r.id);
    setDraftAnswers(answersFromRow(r, campos));
    setExpanded(r.id);
  }

  function setDraftField(campoId: string, value: unknown) {
    setDraftAnswers((prev) => ({ ...prev, [campoId]: value }));
  }

  function runMerge() {
    start(async () => {
      try {
        const result = await mergeRespostasAction({
          formularioId,
          respostaIds: readySelected,
          confirmText,
        });
        const failed = result.results.filter((r) => !r.ok);
        setRows((prev) =>
          prev.map((r) => {
            const ok = result.results.find((x) => x.id === r.id && x.ok);
            return ok ? { ...r, status: "MERGED" as const } : r;
          }),
        );
        setSelected([]);
        setMergeOpen(false);
        setConfirmText("");
        if (failed.length) {
          toast.warning(
            `${result.okCount} enviada(s); ${failed.length} com erro: ${failed.map((f) => f.error).join("; ")}`,
          );
        } else {
          toast.success(`${result.okCount} inscrição(ões) enviada(s) à base`);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Falha ao enviar");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border/70 bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Inscrições</p>
          <p className="mt-1 text-2xl font-semibold text-brand-deep">{counts.total}</p>
        </div>
        <div className="rounded-xl border border-border/70 bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Novas</p>
          <p className="mt-1 text-2xl font-semibold text-amber-800">{counts.novas}</p>
        </div>
        <div className="rounded-xl border border-border/70 bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Selecionadas</p>
          <p className="mt-1 text-2xl font-semibold text-sky-800">{counts.selecionadas}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              hideCpf ? "Buscar por nome…" : "Buscar por nome ou CPF…"
            }
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["all", "Todas"],
              ["new", "Novas"],
              ["selected", "Selecionadas"],
              ...(showStaffActions
                ? ([
                    ["READY", "Prontas"],
                    ["MERGED", "Na base"],
                    ["REJECTED", "Descartadas"],
                  ] as const)
                : []),
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                filter === id
                  ? "bg-brand-deep text-white"
                  : "bg-muted/70 text-muted-foreground hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {showStaffActions ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border/80 bg-muted/20 px-3 py-2.5">
          <Button type="button" variant="outline" size="sm" onClick={selectAllReady}>
            Marcar todas as prontas
          </Button>
          {canMerge ? (
            <Button
              type="button"
              size="sm"
              disabled={readySelected.length === 0 || pending}
              onClick={() => {
                setConfirmText("");
                setMergeOpen(true);
              }}
            >
              <Send className="size-3.5" />
              Enviar {readySelected.length || ""} para a base
            </Button>
          ) : null}
          <p className="text-xs text-muted-foreground sm:ml-auto">
            {counts.prontas} inscrição(ões) pronta(s) para a base
          </p>
        </div>
      ) : professorMode ? (
        <p className="rounded-xl border border-border/70 bg-card px-4 py-3 text-sm text-muted-foreground">
          Marque quem foi <strong>selecionado</strong> e, se quiser, assinale com o
          seu nome em <strong>Professor</strong>. Você não pode descartar nem
          editar os dados da inscrição.
        </p>
      ) : null}

      <div className="space-y-3">
        {filtered.map((r) => {
          const open = expanded === r.id;
          const locked = r.status === "MERGED" || pending;
          const status = STATUS_UI[r.status];
          const nome = displayName(r, campos);
          const fields = open ? buildFields(r, campos, professorMode) : [];
          const selectedOn = r.selecionados === 1;
          const professorOn = Boolean(r.professorNome.trim());

          return (
            <article
              key={r.id}
              className={cn(
                "overflow-hidden rounded-2xl border bg-card shadow-sm transition-colors",
                open ? "border-brand-deep/30" : "border-border/70",
              )}
            >
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {showStaffActions || canMerge ? (
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        disabled={r.status !== "READY"}
                        checked={selected.includes(r.id)}
                        onChange={() => toggleSelect(r.id)}
                        aria-label="Selecionar para enviar à base"
                      />
                    ) : null}
                    <h3 className="truncate font-heading text-base font-semibold text-brand-deep">
                      {nome}
                    </h3>
                    <Badge className={status.className}>{status.label}</Badge>
                    {selectedOn ? (
                      <Badge className="border-transparent bg-sky-100 text-sky-950">
                        Selecionado
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    {!hideCpf && r.cpf ? (
                      <span>CPF {formatCpfDisplay(r.cpf)}</span>
                    ) : null}
                    <span>
                      Enviada em{" "}
                      {new Date(r.submittedAt).toLocaleString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                    {professorOn ? (
                      <span className="inline-flex items-center gap-1">
                        <UserRound className="size-3.5" />
                        {r.professorNome}
                      </span>
                    ) : null}
                  </div>
                  {showStaffActions ? (
                    <p className="text-xs text-muted-foreground">{status.hint}</p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  {canEditData && r.status !== "MERGED" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        editingId === r.id ? setEditingId(null) : startEdit(r)
                      }
                    >
                      {editingId === r.id ? "Cancelar edição" : "Editar dados"}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant={open ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => {
                      if (open) {
                        setExpanded(null);
                        if (editingId === r.id) setEditingId(null);
                      } else {
                        setExpanded(r.id);
                      }
                    }}
                  >
                    {open ? (
                      <>
                        Ocultar dados <ChevronUp className="size-3.5" />
                      </>
                    ) : (
                      <>
                        Ver inscrição <ChevronDown className="size-3.5" />
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {open ? (
                <div className="space-y-4 border-t border-border/60 bg-[#fafbfc] px-4 py-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition-colors",
                        selectedOn
                          ? "border-sky-300 bg-sky-50"
                          : "border-border/70 bg-white",
                        locked && "cursor-not-allowed opacity-60",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="size-4"
                        disabled={locked}
                        checked={selectedOn}
                        onChange={(e) =>
                          saveReview(r.id, {
                            selecionados: e.target.checked ? 1 : 0,
                          })
                        }
                      />
                      <span>
                        <span className="block text-sm font-medium text-brand-deep">
                          Selecionado
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          Pessoa escolhida para a oficina
                        </span>
                      </span>
                    </label>

                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition-colors",
                        professorOn
                          ? "border-violet-300 bg-violet-50"
                          : "border-border/70 bg-white",
                        locked && "cursor-not-allowed opacity-60",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="size-4"
                        disabled={locked}
                        checked={professorOn}
                        onChange={(e) =>
                          saveReview(r.id, { professor: e.target.checked })
                        }
                      />
                      <span>
                        <span className="block text-sm font-medium text-brand-deep">
                          Professor
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {professorOn
                            ? `Assinado por ${r.professorNome}`
                            : viewerName
                              ? `Marcar com seu nome (${viewerName})`
                              : "Assinar com seu nome"}
                        </span>
                      </span>
                    </label>

                    {showStaffActions ? (
                      <div className="rounded-xl border border-border/70 bg-white px-3 py-3">
                        <Label className="text-xs text-muted-foreground">
                          Participação
                        </Label>
                        <select
                          className="mt-1.5 h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                          disabled={locked}
                          value={participacaoFromFlags(
                            r.participantes,
                            r.certificado,
                          )}
                          onChange={(e) =>
                            saveReview(r.id, { participacao: e.target.value })
                          }
                        >
                          <option>Não Participou</option>
                          <option>Participou</option>
                          <option>Certificou</option>
                        </select>
                      </div>
                    ) : null}
                  </div>

                  {showStaffActions && r.status !== "MERGED" ? (
                    <div className="flex flex-wrap gap-2">
                      {r.status !== "READY" ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={pending}
                          onClick={() => saveReview(r.id, { status: "READY" })}
                        >
                          <Check className="size-3.5" />
                          Marcar como pronta para a base
                        </Button>
                      ) : (
                        <Badge className="border-transparent bg-sky-100 text-sky-950">
                          Já marcada como pronta
                        </Badge>
                      )}
                      {r.status !== "REJECTED" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            saveReview(r.id, { status: "REJECTED" })
                          }
                        >
                          <X className="size-3.5" />
                          Descartar inscrição
                        </Button>
                      ) : (
                        <Badge variant="destructive">Descartada</Badge>
                      )}
                    </div>
                  ) : null}

                  <div>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold text-brand-deep">
                        Dados da inscrição
                      </h4>
                      {editingId === r.id ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={pending || locked}
                          onClick={() =>
                            saveReview(r.id, { answers: draftAnswers })
                          }
                        >
                          Salvar alterações
                        </Button>
                      ) : null}
                    </div>

                    {editingId === r.id ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {campos
                          .filter((c) => c.tipo !== "SECTION")
                          .map((c) => {
                            const val = draftAnswers[c.id];
                            const opts =
                              c.tipo === "GENERO"
                                ? [...GENEROS]
                                : c.tipo === "ETNIA"
                                  ? [...ETNIAS]
                                  : (c.opcoes?.filter(Boolean) ?? []);
                            return (
                              <div
                                key={c.id}
                                className={cn(
                                  "rounded-xl border border-border/60 bg-white px-3 py-2.5",
                                  (c.tipo === "ADDRESS_BR" ||
                                    c.tipo === "LONG_TEXT") &&
                                    "sm:col-span-2",
                                )}
                              >
                                <Label className="text-xs text-muted-foreground">
                                  {c.rotulo}
                                </Label>
                                <div className="mt-1.5">
                                  {c.tipo === "ADDRESS_BR" ? (
                                    <AddressEditor
                                      value={val}
                                      disabled={pending || locked}
                                      onChange={(next) =>
                                        setDraftField(c.id, next)
                                      }
                                    />
                                  ) : c.tipo === "LONG_TEXT" ? (
                                    <textarea
                                      className="min-h-20 w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm"
                                      disabled={pending || locked}
                                      value={String(val ?? "")}
                                      onChange={(e) =>
                                        setDraftField(c.id, e.target.value)
                                      }
                                    />
                                  ) : c.tipo === "DECLARACAO" ? (
                                    <label className="flex items-center gap-2 text-sm">
                                      <input
                                        type="checkbox"
                                        disabled={pending || locked}
                                        checked={val === true}
                                        onChange={(e) =>
                                          setDraftField(c.id, e.target.checked)
                                        }
                                      />
                                      Declarado
                                    </label>
                                  ) : c.tipo === "CHECKBOXES" ? (
                                    <div className="space-y-1">
                                      {opts.map((opt) => {
                                        const arr = Array.isArray(val)
                                          ? (val as string[])
                                          : [];
                                        return (
                                          <label
                                            key={opt}
                                            className="flex items-center gap-2 text-sm"
                                          >
                                            <input
                                              type="checkbox"
                                              disabled={pending || locked}
                                              checked={arr.includes(opt)}
                                              onChange={(e) => {
                                                const next = e.target.checked
                                                  ? [...arr, opt]
                                                  : arr.filter((x) => x !== opt);
                                                setDraftField(c.id, next);
                                              }}
                                            />
                                            {opt}
                                          </label>
                                        );
                                      })}
                                    </div>
                                  ) : c.tipo === "MULTIPLE_CHOICE" ||
                                    c.tipo === "DROPDOWN" ||
                                    c.tipo === "TERRITORIO_OFICINA" ||
                                    c.tipo === "GENERO" ||
                                    c.tipo === "ETNIA" ? (
                                    <select
                                      className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                                      disabled={pending || locked}
                                      value={String(val ?? "")}
                                      onChange={(e) =>
                                        setDraftField(c.id, e.target.value)
                                      }
                                    >
                                      <option value="">—</option>
                                      {(opts.length
                                        ? opts
                                        : [String(val ?? "")].filter(Boolean)
                                      ).map((opt) => (
                                        <option key={opt} value={opt}>
                                          {opt}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <Input
                                      disabled={pending || locked}
                                      value={String(val ?? "")}
                                      onChange={(e) => {
                                        let v = e.target.value;
                                        if (c.tipo === "CPF")
                                          v = formatCpfDisplay(v);
                                        if (c.tipo === "PHONE_BR")
                                          v = formatPhoneDisplay(v);
                                        setDraftField(c.id, v);
                                      }}
                                    />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    ) : fields.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nenhum dado disponível para exibir.
                      </p>
                    ) : (
                      <dl className="grid gap-3 sm:grid-cols-2">
                        {fields.map((field) => (
                          <div
                            key={field.key}
                            className="rounded-xl border border-border/60 bg-white px-3 py-2.5"
                          >
                            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                              {field.label}
                            </dt>
                            <dd className="mt-1 text-sm text-foreground">
                              <FieldValue field={field} />
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/80 px-4 py-14 text-center text-muted-foreground">
            {rows.length === 0
              ? "Ainda não há respostas neste formulário."
              : "Nenhuma inscrição encontrada com esse filtro."}
          </div>
        ) : null}
      </div>

      {mergeOpen && (showStaffActions || canMerge) ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-lg"
          >
            <h2 className="text-lg font-semibold text-brand-deep">
              Enviar para a base?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Você vai enviar <strong>{readySelected.length}</strong> inscrição(ões)
              para a planilha oficial da oficina <strong>{oficinaLabel}</strong>.
              Depois disso, esses dados entram na base completa.
            </p>
            <div className="mt-4 space-y-1">
              <Label htmlFor="confirm-merge">
                Digite <span className="font-semibold">ENVIAR</span> para confirmar
              </Label>
              <Input
                id="confirm-merge"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                placeholder="ENVIAR"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setMergeOpen(false)}
                disabled={pending}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={
                  confirmText.trim().toUpperCase() !== "ENVIAR" || pending
                }
                onClick={runMerge}
              >
                {pending ? "Enviando…" : "Confirmar envio"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
