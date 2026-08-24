"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check,
  CircleAlert,
  FileSpreadsheet,
  FolderOpen,
  Maximize2,
  Minimize2,
  Sparkles,
  Table2,
  Upload,
  Wand2,
} from "lucide-react";
import {
  confirmImportAction,
  mapColumnsAction,
  parseSpreadsheetAction,
  processMappedRowsAction,
  reprocessValuesAiAction,
} from "@/app/actions/inscricoes";
import {
  createContextoAction,
  createOficinaAction,
  createProjetoAction,
} from "@/app/actions/contextos";
import {
  oficinaToBatch,
  type ContextoDTO,
  type OficinaDTO,
  type ProjetoDTO,
  type HierarquiaBatch,
} from "@/lib/contexto";
import {
  emptySigaCulturalRow,
  type SigaCulturalColumn,
  type SigaCulturalRow,
} from "@/lib/schema";
import type { ColumnMappingEntry } from "@/lib/column-map";
import {
  CONTEXT_COLUMNS,
  PERSON_COLUMNS,
  RECOMMENDED_PERSON_COLUMNS,
  REQUIRED_PERSON_COLUMNS,
} from "@/lib/column-map";
import { columnLabel } from "@/lib/column-labels";
import {
  formatCellDisplay,
  parseCellInput,
  validatePreviewRows,
} from "@/lib/validate";
import { normalizeSimComDetalhe } from "@/lib/normalize";
import {
  DataSheet,
  SheetTable,
  SheetTd,
  SheetTh,
  SheetThead,
  SheetTr,
  useDataSheet,
} from "@/components/admin/data-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Step = "upload" | "context" | "columns" | "preview";

const STEPS: { id: Step; label: string; hint: string }[] = [
  { id: "upload", label: "Arquivo", hint: "Enviar planilha" },
  { id: "context", label: "Hierarquia", hint: "Contexto → projeto → oficina" },
  { id: "columns", label: "Colunas", hint: "O que entra" },
  { id: "preview", label: "Prévia", hint: "Ajustar e gravar" },
];

function acceptFile(f: File | null | undefined): File | null {
  if (!f) return null;
  const name = f.name.toLowerCase();
  if (!name.endsWith(".xlsx") && !name.endsWith(".xls") && !name.endsWith(".csv")) {
    toast.error("Use um arquivo .xlsx, .xls ou .csv");
    return null;
  }
  return f;
}

type Props = {
  contextos?: ContextoDTO[];
  projetos?: ProjetoDTO[];
  oficinas?: OficinaDTO[];
};

export function ImportWizard({
  contextos = [],
  projetos = [],
  oficinas = [],
}: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>("upload");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  const [selContextoId, setSelContextoId] = useState<string>("");
  const [selProjetoId, setSelProjetoId] = useState<string>("");
  const [selOficinaId, setSelOficinaId] = useState<string>("");
  /** Após Continuar sem hierarquia completa, pede o cadastro do que falta. */
  const [hierarchyPhase, setHierarchyPhase] = useState<"select" | "register">(
    "select",
  );

  const [newCtxNome, setNewCtxNome] = useState("");
  const [newProj, setNewProj] = useState({
    nome: "",
    pronac: "",
    proponente: "",
    ano: String(new Date().getFullYear()),
  });
  const [newOficinaNome, setNewOficinaNome] = useState("");

  const needCreateContexto = !selContextoId;
  const needCreateProjeto = !selProjetoId;
  const needCreateOficina = !selOficinaId;
  const hierarchyComplete = Boolean(
    selContextoId && selProjetoId && selOficinaId,
  );

  const [context, setContext] = useState<HierarquiaBatch>({
    contextoId: "",
    Nome_contexto: "",
    id_projeto: "",
    id_oficina: "",
    PROPONENTE: "",
    PRONAC: "",
    Nome_projeto: "",
    Identificacao_ano_projeto: String(new Date().getFullYear()),
    Nome_oficina: "",
  });

  const projetosFiltrados = useMemo(
    () =>
      selContextoId
        ? projetos.filter((p) => p.contextoId === selContextoId)
        : projetos,
    [projetos, selContextoId],
  );

  const oficinasFiltradas = useMemo(
    () =>
      selProjetoId
        ? oficinas.filter((o) => o.projetoId === selProjetoId)
        : oficinas,
    [oficinas, selProjetoId],
  );

  const contextoSelectItems = useMemo(
    () => ({
      __blank__: "Cadastrar Novo",
      ...Object.fromEntries(
        contextos.map((c) => [c.id, c.nome.trim() || "(sem nome)"]),
      ),
    }),
    [contextos],
  );

  const projetoSelectItems = useMemo(
    () => ({
      __blank__: "Cadastrar Novo",
      ...Object.fromEntries(
        projetosFiltrados.map((p) => [
          p.id,
          p.pronac ? `${p.nome} · ${p.pronac}` : p.nome,
        ]),
      ),
    }),
    [projetosFiltrados],
  );

  const oficinaSelectItems = useMemo(
    () => ({
      __blank__: "Cadastrar Novo",
      ...Object.fromEntries(oficinasFiltradas.map((o) => [o.id, o.nome])),
    }),
    [oficinasFiltradas],
  );

  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappingEntries, setMappingEntries] = useState<ColumnMappingEntry[]>([]);
  const [fullMapping, setFullMapping] = useState<Record<string, SigaCulturalColumn>>(
    {},
  );
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [previewRows, setPreviewRows] = useState<SigaCulturalRow[]>([]);
  const previewColumns = PERSON_COLUMNS;

  const [aiValuesOpen, setAiValuesOpen] = useState(false);
  const [aiValueColumns, setAiValueColumns] = useState<Set<SigaCulturalColumn>>(
    new Set(),
  );
  const [previewExpanded, setPreviewExpanded] = useState(false);

  const activeMapping = useMemo(() => {
    const out: Record<string, SigaCulturalColumn> = {};
    for (const [source, target] of Object.entries(fullMapping)) {
      if (selectedSources.has(source)) out[source] = target;
    }
    return out;
  }, [fullMapping, selectedSources]);

  const selectedTargets = useMemo(
    () => new Set(Object.values(activeMapping)),
    [activeMapping],
  );

  const requiredCoverage = useMemo(() => {
    return REQUIRED_PERSON_COLUMNS.map((col) => ({
      col,
      ok: selectedTargets.has(col),
    }));
  }, [selectedTargets]);

  const recommendedCoverage = useMemo(() => {
    return RECOMMENDED_PERSON_COLUMNS.map((col) => ({
      col,
      ok: selectedTargets.has(col),
    }));
  }, [selectedTargets]);

  const missingRequired = requiredCoverage.filter((c) => !c.ok);
  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const rowIssues = useMemo(
    () => validatePreviewRows(previewRows),
    [previewRows],
  );

  const issuesByRow = useMemo(() => {
    const map = new Map<number, ReturnType<typeof validatePreviewRows>[number]["issues"]>();
    for (const entry of rowIssues) {
      map.set(entry.rowIndex, entry.issues);
    }
    return map;
  }, [rowIssues]);

  const indexedPreview = useMemo(
    () => previewRows.map((row, __idx) => ({ ...row, __idx })),
    [previewRows],
  );

  const searchPreview = useCallback(
    (row: SigaCulturalRow & { __idx: number }) =>
      previewColumns.map((col) => String(row[col] ?? "")).join(" "),
    [previewColumns],
  );

  const previewSheet = useDataSheet(indexedPreview, searchPreview, 50);

  useEffect(() => {
    if (step !== "preview") setPreviewExpanded(false);
  }, [step]);

  useEffect(() => {
    if (!previewExpanded) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPreviewExpanded(false);
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [previewExpanded]);

  function pickFile(f: File | null) {
    const ok = acceptFile(f);
    setFile(ok);
    setFileName(ok?.name ?? "");
  }

  function applyOficina(oficinaId: string | null) {
    const id = oficinaId && oficinaId !== "__blank__" ? oficinaId : "";
    if (!id) {
      setSelOficinaId("");
      return;
    }
    const found = oficinas.find((o) => o.id === id);
    if (!found) return;
    setSelOficinaId(id);
    setSelProjetoId(found.projetoId);
    setSelContextoId(found.contextoId);
    setContext(oficinaToBatch(found));
    setHierarchyPhase("select");
  }

  function applyProjeto(projetoId: string | null) {
    const id = projetoId && projetoId !== "__blank__" ? projetoId : "";
    setSelProjetoId(id);
    setSelOficinaId("");
    setHierarchyPhase("select");
    if (!id) return;
    const p = projetos.find((x) => x.id === id);
    if (p) setSelContextoId(p.contextoId);
  }

  function applyContextoPick(contextoId: string | null) {
    const id = contextoId && contextoId !== "__blank__" ? contextoId : "";
    setSelContextoId(id);
    setSelProjetoId("");
    setSelOficinaId("");
    setHierarchyPhase("select");
  }

  async function proceedAfterHierarchy() {
    setStep("columns");
    await runColumnDetection(false);
  }

  function toggleSource(source: string, checked: boolean) {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (checked) next.add(source);
      else next.delete(source);
      return next;
    });
  }

  function selectAllSuggested() {
    const next = new Set<string>();
    for (const e of mappingEntries) {
      if (e.target) next.add(e.source);
    }
    setSelectedSources(next);
  }

  function clearSelection() {
    setSelectedSources(new Set());
  }

  async function runColumnDetection(useAi: boolean) {
    setBusy(true);
    setProgress(20);
    try {
      const mapped = await mapColumnsAction({
        headers,
        sampleRows: rawRows.slice(0, 5),
        useAi,
      });
      setMappingEntries(mapped.entries);
      setFullMapping(mapped.mapping);

      const suggested = new Set(Object.keys(mapped.mapping));
      setSelectedSources((prev) => {
        if (prev.size === 0 || !useAi) return suggested;
        const merged = new Set(prev);
        for (const s of suggested) merged.add(s);
        return merged;
      });

      if (mapped.aiError) {
        toast.warning(mapped.aiError);
      } else {
        toast.success(
          useAi
            ? `Colunas atualizadas (${suggested.size} reconhecidas)`
            : "Colunas sugeridas automaticamente",
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao detectar colunas");
    } finally {
      setBusy(false);
      setProgress(0);
    }
  }

  async function runValueFormatting() {
    if (Object.keys(activeMapping).length === 0) {
      toast.error("Selecione ao menos uma coluna");
      return false;
    }
    setBusy(true);
    setProgress(0);
    try {
      const collected: SigaCulturalRow[] = [];
      let offset = 0;
      while (offset < rawRows.length) {
        const result = await processMappedRowsAction({
          rawRows,
          mapping: activeMapping,
          context,
          offset,
        });
        collected.push(...result.rows);
        offset += result.batchSize;
        setProgress(
          Math.round((Math.min(offset, rawRows.length) / rawRows.length) * 100),
        );
      }

      setPreviewRows(collected.length ? collected : [emptySigaCulturalRow(context)]);
      setAiValueColumns(new Set(Object.values(activeMapping)));
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao processar valores");
      return false;
    } finally {
      setBusy(false);
      setProgress(0);
    }
  }

  async function handleUploadNext() {
    if (!file) {
      toast.error("Selecione um arquivo");
      return;
    }
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const parsed = await parseSpreadsheetAction(formData);
      if (parsed.count === 0) {
        toast.error("Nenhuma linha encontrada no arquivo");
        return;
      }
      setRawRows(parsed.rows);
      setHeaders(
        parsed.headers.length ? parsed.headers : Object.keys(parsed.rows[0] ?? {}),
      );
      setFileName(file.name);
      setStep("context");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao ler arquivo");
    } finally {
      setBusy(false);
    }
  }

  async function handleContextNext() {
    if (hierarchyComplete && hierarchyPhase === "select") {
      const found = oficinas.find((o) => o.id === selOficinaId);
      if (!found) {
        toast.error("Oficina inválida");
        return;
      }
      setContext(oficinaToBatch(found));
      await proceedAfterHierarchy();
      return;
    }

    if (hierarchyPhase === "select") {
      setHierarchyPhase("register");
      return;
    }

    if (needCreateContexto && !newCtxNome.trim()) {
      toast.error("Preencha o nome do contexto");
      return;
    }
    if (needCreateProjeto && (!newProj.nome.trim() || !newProj.pronac.trim())) {
      toast.error("Preencha nome e PRONAC do projeto");
      return;
    }
    if (needCreateOficina && !newOficinaNome.trim()) {
      toast.error("Preencha o nome da oficina");
      return;
    }

    try {
      let contextoId = selContextoId;

      if (needCreateContexto) {
        const createdCtx = await createContextoAction({ nome: newCtxNome });
        if (!createdCtx.ok) {
          toast.error(createdCtx.error);
          return;
        }
        contextoId = createdCtx.contexto.id;
      }

      let projetoId = selProjetoId;

      if (needCreateProjeto) {
        const createdProj = await createProjetoAction({
          contextoId,
          nome: newProj.nome,
          pronac: newProj.pronac,
          proponente: newProj.proponente,
          ano: newProj.ano,
        });
        if (!createdProj.ok) {
          toast.error(createdProj.error);
          return;
        }
        projetoId = createdProj.projeto.id;
      }

      if (needCreateOficina) {
        const createdOf = await createOficinaAction({
          projetoId,
          nome: newOficinaNome,
        });
        if (!createdOf.ok) {
          toast.error(createdOf.error);
          return;
        }
        setContext(oficinaToBatch(createdOf.oficina));
        setSelContextoId(contextoId);
        setSelProjetoId(projetoId);
        setSelOficinaId(createdOf.oficina.id);
        toast.success("Cadastro concluído");
        router.refresh();
        await proceedAfterHierarchy();
        return;
      }

      const found = oficinas.find((o) => o.id === selOficinaId);
      if (!found) {
        toast.error("Oficina inválida");
        return;
      }
      setContext(oficinaToBatch(found));
      toast.success("Cadastro concluído");
      router.refresh();
    } catch {
      toast.error("Falha ao cadastrar hierarquia");
      return;
    }

    await proceedAfterHierarchy();
  }

  async function handleColumnsNext() {
    if (selectedSources.size === 0) {
      toast.error("Marque as colunas que devem entrar");
      return;
    }
    if (missingRequired.length > 0) {
      toast.error(
        `Falta mapear o essencial: ${missingRequired.map((m) => columnLabel(m.col)).join(", ")}`,
      );
      return;
    }
    setStep("preview");
    const ok = await runValueFormatting();
    if (!ok) setStep("columns");
  }

  async function handleAiValues() {
    const cols = [...aiValueColumns];
    if (cols.length === 0) {
      toast.error("Escolha ao menos uma coluna");
      return;
    }
    setAiValuesOpen(false);
    setBusy(true);
    setProgress(10);
    try {
      const { rows } = await reprocessValuesAiAction({
        rows: previewRows,
        columns: cols,
        context,
      });
      setPreviewRows(rows);
      toast.success("Valores atualizados com a IA");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha na IA");
    } finally {
      setBusy(false);
      setProgress(0);
    }
  }

  function updateCell(rowIndex: number, column: SigaCulturalColumn, value: string) {
    setPreviewRows((prev) => {
      const next = [...prev];
      const row = { ...next[rowIndex] } as Record<string, unknown>;
      if (column === "Possui_deficiencia" || column === "RestricaoAlimentar") {
        row[column] = value;
      } else {
        row[column] = parseCellInput(column, value);
      }
      next[rowIndex] = row as SigaCulturalRow;
      return next;
    });
  }

  function commitSimDetalhe(
    rowIndex: number,
    column: "Possui_deficiencia" | "RestricaoAlimentar",
    value: string,
  ) {
    setPreviewRows((prev) => {
      const next = [...prev];
      const row = { ...next[rowIndex] } as Record<string, unknown>;
      row[column] = normalizeSimComDetalhe(value);
      next[rowIndex] = row as SigaCulturalRow;
      return next;
    });
  }

  function handleConfirm() {
    startTransition(async () => {
      try {
        const result = await confirmImportAction(previewRows, {
          contextoId: context.contextoId,
          nomeContexto: context.Nome_contexto ?? "",
        });
        toast.success(`${result.inserted} registro(s) adicionados à base`);
        router.push("/dashboard");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Falha ao importar");
      }
    });
  }

  const mappedEntries = mappingEntries.filter((e) => e.target);
  const otherEntries = mappingEntries.filter((e) => !e.target);

  return (
    <div className="space-y-6">
      <nav className="rounded-2xl border border-[var(--border)] bg-white/70 p-4 shadow-sm backdrop-blur">
        <ol className="grid gap-3 sm:grid-cols-4">
          {STEPS.map((s, i) => {
            const active = i === stepIndex;
            const done = i < stepIndex;
            return (
              <li key={s.id} className="relative flex items-start gap-3">
                <div
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition",
                    active && "bg-brand text-white shadow-md shadow-brand/20",
                    done && "bg-brand-soft text-brand-deep",
                    !active && !done && "bg-[var(--gray-100)] text-[var(--gray-400)]",
                  )}
                >
                  {done ? <Check className="size-4" /> : i + 1}
                </div>
                <div className="min-w-0 pt-0.5">
                  <div
                    className={cn(
                      "text-sm font-medium",
                      active ? "text-brand-deep" : "text-[var(--gray-500)]",
                    )}
                  >
                    {s.label}
                  </div>
                  <div className="text-xs text-muted-foreground">{s.hint}</div>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--gray-100)]">
          <div
            className="h-full rounded-full bg-brand transition-all duration-500"
            style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </nav>

      {busy ? (
        <div className="space-y-2 rounded-2xl border bg-white/90 px-5 py-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium text-brand-deep">
            <Wand2 className="size-4 animate-pulse" />
            Processando…
          </div>
          <Progress value={progress || null} />
        </div>
      ) : null}

      {step === "upload" ? (
        <Card className="gap-0 overflow-hidden border-[var(--border)] pt-0 shadow-sm">
          <CardHeader className="rounded-none border-b border-[var(--border)] bg-gradient-to-br from-[var(--navy-soft)] to-transparent py-4">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Upload className="size-5 text-brand" />
              Importar arquivo
            </CardTitle>
            <CardDescription>
              Arraste a planilha ou clique para escolher (.xlsx ou .csv).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 pt-6">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                pickFile(e.dataTransfer.files?.[0] ?? null);
              }}
              className={cn(
                "group relative flex w-full flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition",
                dragOver
                  ? "border-brand bg-[var(--navy-soft)]"
                  : file
                    ? "border-brand/40 bg-[var(--navy-soft)]/80"
                    : "border-[var(--gray-200)] bg-[var(--gray-50)]/80 hover:border-brand hover:bg-[var(--navy-soft)]/70",
              )}
            >
              <div
                className={cn(
                  "flex size-16 items-center justify-center rounded-2xl transition",
                  file
                    ? "bg-brand text-white"
                    : "bg-white text-brand shadow-sm group-hover:scale-105",
                )}
              >
                {file ? (
                  <FileSpreadsheet className="size-8" />
                ) : (
                  <FolderOpen className="size-8" />
                )}
              </div>
              {file ? (
                <div>
                  <p className="text-base font-semibold text-brand-deep">{fileName}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB · clique para trocar
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-base font-semibold text-[var(--navy)]">
                    Solte o arquivo aqui
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    ou clique para procurar no computador
                  </p>
                </div>
              )}
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border bg-white px-2.5 py-1">XLSX</span>
                <span className="rounded-full border bg-white px-2.5 py-1">CSV</span>
              </div>
            </button>

            <div className="flex justify-end">
              <Button
                type="button"
                size="lg"
                onClick={handleUploadNext}
                disabled={busy || !file}
              >
                Continuar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === "context" ? (
        <Card className="gap-0 overflow-hidden border-[var(--border)] pt-0 shadow-sm">
          <CardHeader className="rounded-none border-b border-[var(--border)] bg-gradient-to-br from-[var(--navy-soft)] to-transparent py-4">
            <CardTitle className="text-xl">Contexto → Projeto → Oficina</CardTitle>
            <CardDescription>
              Selecione o que já existe. O que ficar em branco será cadastrado ao
              continuar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 pt-6">
            {fileName ? (
              <div className="flex items-center gap-3 rounded-xl border border-brand/20 bg-[var(--navy-soft)] px-4 py-3">
                <FileSpreadsheet className="size-5 text-brand" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{fileName}</div>
                  <div className="text-xs text-muted-foreground">
                    {rawRows.length} linha(s) · {headers.length} coluna(s)
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end">
              <Link
                href="/dashboard/contextos"
                className="text-sm text-brand underline-offset-4 hover:underline"
              >
                Gerenciar hierarquia
              </Link>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Contexto</Label>
                <Select
                  value={selContextoId || "__blank__"}
                  onValueChange={(v) => applyContextoPick(v)}
                  items={contextoSelectItems}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Cadastrar Novo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__blank__">Cadastrar Novo</SelectItem>
                    {contextos.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome.trim() || "(sem nome)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Projeto</Label>
                <Select
                  value={selProjetoId || "__blank__"}
                  onValueChange={(v) => applyProjeto(v)}
                  disabled={needCreateContexto}
                  items={projetoSelectItems}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        needCreateContexto
                          ? "Cadastre o contexto primeiro"
                          : "Cadastrar Novo"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__blank__">Cadastrar Novo</SelectItem>
                    {projetosFiltrados.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome}
                        {p.pronac ? ` · ${p.pronac}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Oficina</Label>
                <Select
                  value={selOficinaId || "__blank__"}
                  onValueChange={(v) => applyOficina(v)}
                  disabled={needCreateProjeto}
                  items={oficinaSelectItems}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        needCreateProjeto
                          ? "Cadastre o projeto primeiro"
                          : "Cadastrar Novo"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__blank__">Cadastrar Novo</SelectItem>
                    {oficinasFiltradas.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!hierarchyComplete ? (
              <p className="text-sm text-muted-foreground">
                Falta cadastrar:{" "}
                {[
                  needCreateContexto ? "contexto" : null,
                  needCreateProjeto ? "projeto" : null,
                  needCreateOficina ? "oficina" : null,
                ]
                  .filter(Boolean)
                  .join(", ")}
                . Clique em Continuar para preencher.
              </p>
            ) : selOficinaId ? (
              <p className="text-sm text-muted-foreground">
                Lote:{" "}
                <span className="font-medium text-brand-deep">
                  {context.Nome_contexto ||
                    contextos.find((c) => c.id === selContextoId)?.nome ||
                    "(sem nome)"}
                </span>
                {" → "}
                {context.Nome_projeto ||
                  projetos.find((p) => p.id === selProjetoId)?.nome}
                {" → "}
                {context.Nome_oficina ||
                  oficinas.find((o) => o.id === selOficinaId)?.nome}
              </p>
            ) : null}

            {hierarchyPhase === "register" && !hierarchyComplete ? (
              <div className="space-y-4 rounded-xl border border-brand/20 bg-[var(--navy-soft)]/70 p-4">
                <p className="text-sm font-medium text-brand-deep">
                  Cadastre o que falta na hierarquia
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {needCreateContexto ? (
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="newCtxNome">Nome do contexto</Label>
                      <Input
                        id="newCtxNome"
                        value={newCtxNome}
                        placeholder="Ex.: Arte em Rede"
                        onChange={(e) => setNewCtxNome(e.target.value)}
                      />
                    </div>
                  ) : null}
                  {needCreateProjeto ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="newProjNome">Nome do projeto</Label>
                        <Input
                          id="newProjNome"
                          value={newProj.nome}
                          onChange={(e) =>
                            setNewProj((p) => ({ ...p, nome: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="newPronac">PRONAC</Label>
                        <Input
                          id="newPronac"
                          value={newProj.pronac}
                          onChange={(e) =>
                            setNewProj((p) => ({ ...p, pronac: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="newProponente">Proponente</Label>
                        <Input
                          id="newProponente"
                          value={newProj.proponente}
                          onChange={(e) =>
                            setNewProj((p) => ({
                              ...p,
                              proponente: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="newAno">Ano</Label>
                        <Input
                          id="newAno"
                          inputMode="numeric"
                          maxLength={4}
                          value={newProj.ano}
                          onChange={(e) =>
                            setNewProj((p) => ({
                              ...p,
                              ano: e.target.value.replace(/\D/g, "").slice(0, 4),
                            }))
                          }
                        />
                      </div>
                    </>
                  ) : null}
                  {needCreateOficina ? (
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="newOficina">Nome da oficina</Label>
                      <Input
                        id="newOficina"
                        value={newOficinaNome}
                        onChange={(e) => setNewOficinaNome(e.target.value)}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="flex justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (hierarchyPhase === "register") {
                    setHierarchyPhase("select");
                    return;
                  }
                  setStep("upload");
                }}
              >
                Voltar
              </Button>
              <Button
                type="button"
                size="lg"
                onClick={handleContextNext}
                disabled={
                  busy ||
                  (hierarchyPhase === "register" &&
                    ((needCreateContexto && !newCtxNome.trim()) ||
                      (needCreateProjeto &&
                        (!newProj.nome.trim() || !newProj.pronac.trim())) ||
                      (needCreateOficina && !newOficinaNome.trim())))
                }
              >
                {hierarchyPhase === "select" && !hierarchyComplete
                  ? "Continuar e cadastrar"
                  : "Continuar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === "columns" ? (
        <Card className="gap-0 overflow-hidden border-[var(--border)] pt-0 shadow-sm">
          <CardHeader className="rounded-none border-b border-[var(--border)] bg-gradient-to-br from-[var(--navy-soft)] to-transparent py-4">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Table2 className="size-5 text-brand" />
              Escolher colunas
            </CardTitle>
            <CardDescription>
              Veja o que já está coberto e marque na planilha o que ainda falta.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="grid gap-3 lg:grid-cols-3">
              <div className="rounded-xl border bg-white px-4 py-3 lg:col-span-1">
                <div className="text-xs font-medium text-brand-deep">Já vem da hierarquia</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Preenchido na etapa anterior — não precisa estar na planilha.
                </p>
                {context.Nome_contexto || context.Nome_projeto ? (
                  <p className="mt-2 text-xs text-brand-deep/80">
                    {[context.Nome_contexto, context.Nome_projeto, context.Nome_oficina]
                      .filter(Boolean)
                      .join(" → ")}
                  </p>
                ) : null}
                <ul className="mt-3 space-y-1.5">
                  {[...CONTEXT_COLUMNS, ...(context.Nome_oficina ? (["Nome_oficina"] as const) : [])].map(
                    (col) => (
                      <li
                        key={col}
                        className="flex items-center gap-2 text-sm text-brand-deep"
                      >
                        <Check className="size-3.5 shrink-0 text-brand" />
                        {columnLabel(col)}
                      </li>
                    ),
                  )}
                </ul>
              </div>

              <div
                className={cn(
                  "rounded-xl border px-4 py-3 lg:col-span-1",
                  missingRequired.length
                    ? "border-amber-300 bg-amber-50/80"
                    : "border-brand/20 bg-[var(--navy-soft)]",
                )}
              >
                <div className="flex items-center gap-1.5 text-xs font-medium text-brand-deep">
                  {missingRequired.length ? (
                    <CircleAlert className="size-3.5 text-amber-700" />
                  ) : (
                    <Check className="size-3.5 text-brand" />
                  )}
                  Essencial na planilha
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Obrigatório para gravar a inscrição.
                </p>
                <ul className="mt-3 space-y-1.5">
                  {requiredCoverage.map(({ col, ok }) => (
                    <li
                      key={col}
                      className={cn(
                        "flex items-center gap-2 text-sm",
                        ok ? "text-brand-deep" : "text-amber-900",
                      )}
                    >
                      {ok ? (
                        <Check className="size-3.5 shrink-0 text-brand" />
                      ) : (
                        <CircleAlert className="size-3.5 shrink-0 text-amber-700" />
                      )}
                      {columnLabel(col)}
                      <span className="text-[11px] text-muted-foreground">
                        {ok ? "ok" : "faltando"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border bg-white px-4 py-3 lg:col-span-1">
                <div className="text-xs font-medium text-brand-deep">Recomendado</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Melhora a base, mas não bloqueia a importação.
                </p>
                <ul className="mt-3 max-h-40 space-y-1.5 overflow-auto">
                  {recommendedCoverage.map(({ col, ok }) => (
                    <li
                      key={col}
                      className={cn(
                        "flex items-center gap-2 text-sm",
                        ok ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {ok ? (
                        <Check className="size-3.5 shrink-0 text-brand" />
                      ) : (
                        <span className="inline-block size-3.5 shrink-0 rounded-full border border-dashed border-muted-foreground/40" />
                      )}
                      {columnLabel(col)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border bg-white px-4 py-3">
                <div className="text-xs text-muted-foreground">Na planilha</div>
                <div className="text-2xl font-semibold tabular-nums">{headers.length}</div>
              </div>
              <div className="rounded-xl border bg-white px-4 py-3">
                <div className="text-xs text-muted-foreground">Reconhecidas</div>
                <div className="text-2xl font-semibold tabular-nums text-brand">
                  {mappedEntries.length}
                </div>
              </div>
              <div className="rounded-xl border bg-white px-4 py-3">
                <div className="text-xs text-muted-foreground">Selecionadas</div>
                <div className="text-2xl font-semibold tabular-nums">
                  {selectedSources.size}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={selectAllSuggested}>
                Marcar sugeridas
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={clearSelection}>
                Limpar
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => runColumnDetection(true)}
                className="gap-1.5"
              >
                <Sparkles className="size-3.5" />
                Reprocessar com IA
              </Button>
            </div>

            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Usar</TableHead>
                    <TableHead>Na planilha</TableHead>
                    <TableHead>No MAX Fluxo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mappedEntries.map((entry) => (
                    <TableRow
                      key={entry.source}
                      className={cn(
                        selectedSources.has(entry.source) && "bg-[var(--navy-soft)]",
                      )}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedSources.has(entry.source)}
                          onCheckedChange={(v) =>
                            toggleSource(entry.source, v === true)
                          }
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{entry.source}</TableCell>
                      <TableCell className="font-medium">
                        {columnLabel(entry.target!)}
                        {REQUIRED_PERSON_COLUMNS.includes(entry.target!) ? (
                          <span className="ml-2 text-[11px] font-normal text-amber-800">
                            essencial
                          </span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                  {otherEntries.map((entry) => (
                    <TableRow key={entry.source} className="opacity-55">
                      <TableCell>
                        <Checkbox checked={false} disabled />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{entry.source}</TableCell>
                      <TableCell className="text-muted-foreground">
                        Não reconhecida
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-between gap-2">
              <Button type="button" variant="outline" onClick={() => setStep("context")}>
                Voltar
              </Button>
              <Button
                type="button"
                size="lg"
                onClick={handleColumnsNext}
                disabled={busy || selectedSources.size === 0 || missingRequired.length > 0}
              >
                Continuar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === "preview" ? (
        <Card className="gap-0 overflow-hidden border-[var(--border)] pt-0 shadow-sm">
          <CardHeader className="flex flex-col gap-3 rounded-none border-b border-[var(--border)] bg-gradient-to-br from-[var(--navy-soft)] to-transparent py-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Wand2 className="size-5 text-brand" />
                Prévia e ajustes
              </CardTitle>
              <CardDescription>
                Os valores já foram padronizados. Veja a planilha ao vivo, edite o que
                quiser e só então importe.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="lg" onClick={handleConfirm} disabled={pending || busy || previewRows.length === 0}>
                {pending ? "Importando…" : "Importar para a base"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-brand/20 bg-[var(--navy-soft)] px-4 py-3">
                <div className="text-xs text-[var(--gray-400)]">Linhas na prévia</div>
                <div className="mt-0.5 text-2xl font-semibold tabular-nums text-brand-deep">
                  {previewRows.length}
                </div>
              </div>
              <div className="rounded-xl border bg-white px-4 py-3">
                <div className="text-xs text-muted-foreground">
                  Colunas (sem contexto)
                </div>
                <div className="mt-0.5 text-2xl font-semibold tabular-nums">
                  {previewColumns.length}
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    const ok = await runValueFormatting();
                    if (ok) toast.success("Prévia atualizada");
                  }}
                >
                  Reprocessar automaticamente
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  className="gap-1.5"
                  onClick={() => {
                    setAiValueColumns(new Set(Object.values(activeMapping)));
                    setAiValuesOpen(true);
                  }}
                >
                  <Sparkles className="size-3.5" />
                  Ajustar colunas com IA
                </Button>
              </div>
            </div>

            {rowIssues.length > 0 ? (
              <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" />
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">
                    {rowIssues.length} linha(s) com valor suspeito (CPF, e-mail,
                    telefone, CEP, datas etc.)
                  </p>
                  <p className="text-xs text-amber-900/80">
                    Células com problema ficam destacadas. Você pode corrigir aqui
                    antes de importar — a importação não é bloqueada.
                  </p>
                  <ul className="max-h-28 overflow-auto text-xs text-amber-900/90">
                    {rowIssues.slice(0, 8).map((entry) => (
                      <li key={entry.rowIndex}>
                        Linha {entry.rowIndex + 1}:{" "}
                        {entry.issues
                          .map((i) => `${columnLabel(i.column)} (${i.message})`)
                          .join(" · ")}
                      </li>
                    ))}
                    {rowIssues.length > 8 ? (
                      <li>… e mais {rowIssues.length - 8} linha(s)</li>
                    ) : null}
                  </ul>
                </div>
              </div>
            ) : null}

            <p className="text-xs text-muted-foreground">
              Sempre as {previewColumns.length} colunas que vão para a base (contexto
              do lote fica de fora). Valores mascarados na tela; no banco ficam sem
              formatação quando aplicável.
            </p>

            <DataSheet
              title={`${previewRows.length} linha(s) · ${previewColumns.length} coluna(s)`}
              searchPlaceholder="Buscar na prévia (nome, CPF…)"
              query={previewSheet.query}
              onQueryChange={previewSheet.setQuery}
              page={previewSheet.page}
              pageSize={previewSheet.pageSize}
              totalPages={previewSheet.totalPages}
              rangeLabel={previewSheet.rangeLabel}
              total={previewSheet.total}
              totalAll={previewSheet.totalAll}
              onPageChange={previewSheet.setPage}
              onPageSizeChange={previewSheet.setPageSize}
              toolbarExtra={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1"
                  onClick={() => setPreviewExpanded(true)}
                >
                  <Maximize2 className="size-3.5" />
                  Expandir
                </Button>
              }
            >
              <SheetTable>
                <SheetThead>
                  <tr>
                    <SheetTh sticky className="w-12">
                      #
                    </SheetTh>
                    {previewColumns.map((col) => (
                      <SheetTh key={col} className="min-w-40">
                        {columnLabel(col)}
                      </SheetTh>
                    ))}
                  </tr>
                </SheetThead>
                <tbody>
                  {previewSheet.pageItems.length === 0 ? (
                    <SheetTr>
                      <SheetTd
                        colSpan={previewColumns.length + 1}
                        className="py-10 text-center text-muted-foreground"
                      >
                        {busy
                          ? "Montando prévia…"
                          : "Nenhum resultado nesta busca."}
                      </SheetTd>
                    </SheetTr>
                  ) : (
                    previewSheet.pageItems.map((row) => {
                      const issues = issuesByRow.get(row.__idx);
                      const issueCols = new Set(issues?.map((i) => i.column) ?? []);
                      const issueTitle = issues
                        ?.map((i) => `${columnLabel(i.column)}: ${i.message}`)
                        .join(" · ");
                      return (
                        <SheetTr
                          key={row.__idx}
                          className={
                            issues ? "bg-amber-50/70 hover:bg-amber-50" : undefined
                          }
                          title={issueTitle}
                        >
                          <SheetTd sticky className="tabular-nums text-muted-foreground">
                            {issues ? (
                              <span className="inline-flex items-center gap-1 text-amber-800">
                                <CircleAlert className="size-3.5" />
                                {row.__idx + 1}
                              </span>
                            ) : (
                              row.__idx + 1
                            )}
                          </SheetTd>
                          {previewColumns.map((col) => (
                            <SheetTd key={col} className="p-1">
                              <Input
                                className={
                                  issueCols.has(col)
                                    ? "h-8 min-w-36 border-amber-400 bg-amber-50"
                                    : "h-8 min-w-36 bg-white"
                                }
                                value={formatCellDisplay(col, row[col])}
                                title={
                                  issueCols.has(col)
                                    ? issues?.find((i) => i.column === col)?.message
                                    : undefined
                                }
                                onChange={(e) =>
                                  updateCell(row.__idx, col, e.target.value)
                                }
                                onBlur={(e) => {
                                  if (
                                    col === "Possui_deficiencia" ||
                                    col === "RestricaoAlimentar"
                                  ) {
                                    commitSimDetalhe(row.__idx, col, e.target.value);
                                  }
                                }}
                              />
                            </SheetTd>
                          ))}
                        </SheetTr>
                      );
                    })
                  )}
                </tbody>
              </SheetTable>
            </DataSheet>

            <div className="flex justify-between gap-2">
              <Button type="button" variant="outline" onClick={() => setStep("columns")}>
                Voltar
              </Button>
              <Button
                type="button"
                size="lg"
                onClick={handleConfirm}
                disabled={pending || busy || previewRows.length === 0}
              >
                {pending ? "Importando…" : "Importar para a base"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {previewExpanded ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-[linear-gradient(180deg,var(--brand-mist)_0%,#faf8f5_50%,#f3efe8_100%)] p-3 sm:p-5">
          <div className="mx-auto flex w-full max-w-[95vw] flex-1 flex-col gap-3 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/15 bg-white/90 px-4 py-3 shadow-sm backdrop-blur">
              <div>
                <div className="font-heading text-lg font-semibold text-brand-deep">
                  Planilha da prévia
                </div>
                <div className="text-xs text-muted-foreground">
                  {previewRows.length} linha(s) · {previewColumns.length} colunas ·
                  Esc para sair
                  {rowIssues.length > 0
                    ? ` · ${rowIssues.length} com aviso`
                    : ""}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    const ok = await runValueFormatting();
                    if (ok) toast.success("Prévia atualizada");
                  }}
                >
                  Reprocessar automaticamente
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  className="gap-1.5"
                  onClick={() => {
                    setAiValueColumns(new Set(Object.values(activeMapping)));
                    setAiValuesOpen(true);
                  }}
                >
                  <Sparkles className="size-3.5" />
                  IA
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setPreviewExpanded(false)}
                >
                  <Minimize2 className="size-4" />
                  Recolher
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirm}
                  disabled={pending || busy}
                >
                  {pending ? "Importando…" : "Importar para a base"}
                </Button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <DataSheet
                className="flex h-full min-h-0 flex-col"
                scrollClassName="min-h-0 max-h-none flex-1"
                title="Edição em tela cheia"
                searchPlaceholder="Buscar na prévia…"
                query={previewSheet.query}
                onQueryChange={previewSheet.setQuery}
                page={previewSheet.page}
                pageSize={previewSheet.pageSize}
                totalPages={previewSheet.totalPages}
                rangeLabel={previewSheet.rangeLabel}
                total={previewSheet.total}
                totalAll={previewSheet.totalAll}
                onPageChange={previewSheet.setPage}
                onPageSizeChange={previewSheet.setPageSize}
              >
                <SheetTable>
                  <SheetThead>
                    <tr>
                      <SheetTh sticky className="w-12">
                        #
                      </SheetTh>
                      {previewColumns.map((col) => (
                        <SheetTh key={col} className="min-w-44">
                          {columnLabel(col)}
                        </SheetTh>
                      ))}
                    </tr>
                  </SheetThead>
                  <tbody>
                    {previewSheet.pageItems.length === 0 ? (
                      <SheetTr>
                        <SheetTd
                          colSpan={previewColumns.length + 1}
                          className="py-10 text-center text-muted-foreground"
                        >
                          Nenhum resultado nesta busca.
                        </SheetTd>
                      </SheetTr>
                    ) : (
                      previewSheet.pageItems.map((row) => {
                        const issues = issuesByRow.get(row.__idx);
                        const issueCols = new Set(
                          issues?.map((i) => i.column) ?? [],
                        );
                        const issueTitle = issues
                          ?.map((i) => `${columnLabel(i.column)}: ${i.message}`)
                          .join(" · ");
                        return (
                          <SheetTr
                            key={row.__idx}
                            className={
                              issues
                                ? "bg-amber-50/70 hover:bg-amber-50"
                                : undefined
                            }
                            title={issueTitle}
                          >
                            <SheetTd sticky className="tabular-nums text-muted-foreground">
                              {issues ? (
                                <span className="inline-flex items-center gap-1 text-amber-800">
                                  <CircleAlert className="size-3.5" />
                                  {row.__idx + 1}
                                </span>
                              ) : (
                                row.__idx + 1
                              )}
                            </SheetTd>
                            {previewColumns.map((col) => (
                              <SheetTd key={col} className="p-1">
                                <Input
                                  className={
                                    issueCols.has(col)
                                      ? "h-8 min-w-40 border-amber-400 bg-amber-50"
                                      : "h-8 min-w-40 bg-white"
                                  }
                                  value={formatCellDisplay(col, row[col])}
                                  title={
                                    issueCols.has(col)
                                      ? issues?.find((i) => i.column === col)
                                          ?.message
                                      : undefined
                                  }
                                  onChange={(e) =>
                                    updateCell(row.__idx, col, e.target.value)
                                  }
                                  onBlur={(e) => {
                                    if (
                                      col === "Possui_deficiencia" ||
                                      col === "RestricaoAlimentar"
                                    ) {
                                      commitSimDetalhe(
                                        row.__idx,
                                        col,
                                        e.target.value,
                                      );
                                    }
                                  }}
                                />
                              </SheetTd>
                            ))}
                          </SheetTr>
                        );
                      })
                    )}
                  </tbody>
                </SheetTable>
              </DataSheet>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog open={aiValuesOpen} onOpenChange={setAiValuesOpen}>
        <DialogContent className="max-h-[80vh] max-w-lg overflow-auto">
          <DialogHeader>
            <DialogTitle>Reprocessar com IA</DialogTitle>
            <DialogDescription>
              Escolha quais campos a IA deve revisar. Use só se o ajuste automático não
              bastar.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2 py-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setAiValueColumns(new Set(Object.values(activeMapping)))}
            >
              Todas as colunas
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setAiValueColumns(new Set())}
            >
              Limpar
            </Button>
          </div>
          <div className="space-y-2">
            {[...new Set(Object.values(activeMapping))].map((col) => (
              <label
                key={col}
                className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
              >
                <Checkbox
                  checked={aiValueColumns.has(col)}
                  onCheckedChange={(v) => {
                    setAiValueColumns((prev) => {
                      const next = new Set(prev);
                      if (v === true) next.add(col);
                      else next.delete(col);
                      return next;
                    });
                  }}
                />
                <span>{columnLabel(col)}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAiValuesOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleAiValues} disabled={busy}>
              Aplicar IA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
