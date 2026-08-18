"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Trophy } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DataSheet,
  SheetTable,
  SheetTd,
  SheetTh,
  SheetThead,
  SheetTr,
  useDataSheet,
} from "@/components/admin/data-sheet";
import type { AnaliseResult, AnaliseRow, AnaliseTopPessoa } from "@/app/actions/inscricoes";
import { StatusKindBadge, type StatusKind } from "@/components/status-badges";
import { SocioBreakdownPanel } from "@/components/analise/socio-breakdown";
import { PageLoading } from "@/components/page-loading";
import { formatCpfDisplay } from "@/lib/normalize";
import { buildTerritorioPath } from "@/lib/territorio-slug";

function MetricBar({
  value,
  max,
  tone = "emerald",
}: {
  value: number;
  max: number;
  tone?: "emerald" | "amber" | "sky" | "teal";
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const colors = {
    emerald: "bg-emerald-600",
    amber: "bg-amber-500",
    sky: "bg-sky-500",
    teal: "bg-teal-600",
  };
  return (
    <div className="min-w-[5.5rem] space-y-0.5">
      <div className="flex justify-between text-[11px] tabular-nums">
        <span className="font-medium">{value}</span>
        <span className="text-muted-foreground">{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", colors[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  status,
  barPct,
  barTone = "emerald",
}: {
  label: string;
  value: number | string;
  hint?: string;
  status?: StatusKind;
  barPct?: number;
  barTone?: "emerald" | "amber" | "sky" | "teal";
}) {
  const tones = {
    emerald: "bg-emerald-600",
    amber: "bg-amber-500",
    sky: "bg-sky-500",
    teal: "bg-teal-600",
  };
  return (
    <div className="rounded-xl border bg-white/80 px-4 py-4 shadow-sm">
      {status ? (
        <StatusKindBadge kind={status} className="mb-1" />
      ) : (
        <div className="text-sm text-muted-foreground">{label}</div>
      )}
      <div className="mt-1 font-heading text-3xl font-semibold tracking-tight tabular-nums text-brand-deep">
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
      {barPct != null ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all", tones[barTone])}
            style={{ width: `${Math.max(0, Math.min(100, barPct))}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function searchAnaliseRow(row: AnaliseRow) {
  return [
    row.Nome_oficina,
    row.Nome_projeto,
    row.id_oficina,
    row.id_projeto,
    row.Estado,
    row.Cidade,
    row.Territorio,
  ].join(" ");
}

function TopPessoaRow({
  pessoa,
  maxParticipacoes,
}: {
  pessoa: AnaliseTopPessoa;
  maxParticipacoes: number;
}) {
  const medal =
    pessoa.posicao === 1
      ? "bg-amber-400 text-amber-950 ring-2 ring-amber-200"
      : pessoa.posicao === 2
        ? "bg-slate-300 text-slate-800"
        : pessoa.posicao === 3
          ? "bg-orange-300 text-orange-950"
          : "bg-brand-mist text-brand-deep";

  const cpfDigits = pessoa.cpf.replace(/\D/g, "");
  const cpfOk = cpfDigits.length === 11;
  const cpfLabel = cpfOk ? formatCpfDisplay(cpfDigits) : "CPF inválido";
  const barPct =
    maxParticipacoes > 0
      ? Math.min(100, (pessoa.participantes / maxParticipacoes) * 100)
      : 0;

  const name = (
    <span className="font-medium leading-snug text-brand-deep">{pessoa.nome}</span>
  );

  return (
    <li className="grid grid-cols-[2rem_1fr_auto] items-center gap-x-3 gap-y-2 border-b border-border/50 py-3 last:border-0 sm:grid-cols-[2.25rem_minmax(0,1fr)_5.5rem_4.5rem_4.5rem_4.5rem]">
      <span
        className={cn(
          "grid size-8 place-items-center rounded-full text-xs font-semibold tabular-nums",
          medal,
        )}
      >
        {pessoa.posicao}
      </span>

      <div className="min-w-0">
        {cpfOk ? (
          <Link
            href={`/pessoa/${cpfDigits}`}
            className="underline-offset-2 hover:underline"
          >
            {name}
          </Link>
        ) : (
          name
        )}
        <div
          className={cn(
            "mt-0.5 font-mono text-[11px]",
            cpfOk ? "text-muted-foreground" : "text-amber-700",
          )}
        >
          {cpfLabel}
        </div>
        {/* barra só no mobile, sob o nome */}
        <div className="mt-2 sm:hidden">
          <div className="mb-0.5 flex justify-between text-[11px] tabular-nums">
            <span className="text-muted-foreground">Participações</span>
            <span className="font-semibold text-brand-deep">
              {pessoa.participantes}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-brand-mist">
            <div
              className="h-full rounded-full bg-emerald-700"
              style={{ width: `${barPct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="hidden sm:block">
        <div className="flex items-baseline justify-end gap-2">
          <span className="font-heading text-lg font-semibold tabular-nums text-brand-deep">
            {pessoa.participantes}
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-brand-mist">
          <div
            className="h-full rounded-full bg-emerald-700 transition-all"
            style={{ width: `${barPct}%` }}
          />
        </div>
      </div>

      <div className="hidden text-right tabular-nums sm:block">
        <div className="text-sm font-medium text-brand-deep">{pessoa.inscricoes}</div>
      </div>
      <div className="hidden text-right tabular-nums sm:block">
        <div className="text-sm font-medium text-brand-deep">{pessoa.selecionados}</div>
      </div>
      <div className="col-span-2 flex justify-end gap-4 text-[11px] tabular-nums text-muted-foreground sm:col-span-1 sm:block sm:text-right">
        <span className="sm:hidden">
          Insc. <strong className="text-foreground">{pessoa.inscricoes}</strong>
        </span>
        <span className="sm:hidden">
          Sel. <strong className="text-foreground">{pessoa.selecionados}</strong>
        </span>
        <span className="sm:hidden">
          Cert. <strong className="text-foreground">{pessoa.certificados}</strong>
        </span>
        <div className="hidden text-sm font-medium text-brand-deep sm:block">
          {pessoa.certificados}
        </div>
      </div>
    </li>
  );
}

type Props = {
  data: AnaliseResult;
};

export function AnaliseDashboard({ data }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [topOpen, setTopOpen] = useState(false);
  const { rows, totais, filterOptions, topParticipantes, socio, programas } =
    data;
  const maxInscritos = Math.max(...rows.map((r) => r.Inscritos), 1);
  const maxParticipacoes = Math.max(
    ...topParticipantes.map((p) => p.participantes),
    1,
  );
  const searchText = useCallback(searchAnaliseRow, []);
  const sheet = useDataSheet(rows, searchText, 50);

  const filterSelectItems = useMemo(
    () => ({
      projeto: {
        all: "Todos",
        ...Object.fromEntries(
          filterOptions.projetos.map((p) => [
            p.idProjeto,
            p.nomeProjeto || p.idProjeto,
          ]),
        ),
      },
      oficina: {
        all: "Todas",
        ...Object.fromEntries(
          filterOptions.oficinas.map((o) => [
            o.idOficina,
            o.nomeOficina || o.idOficina,
          ]),
        ),
      },
      estado: {
        all: "Todos",
        ...Object.fromEntries(filterOptions.estados.map((e) => [e, e])),
      },
      cidade: {
        all: "Todas",
        ...Object.fromEntries(filterOptions.cidades.map((c) => [c, c])),
      },
      territorio: {
        all: "Todos",
        ...Object.fromEntries(filterOptions.territorios.map((t) => [t, t])),
      },
    }),
    [filterOptions],
  );

  const pageTotals = useMemo(() => {
    return sheet.pageItems.reduce(
      (acc, r) => {
        acc.Inscritos += r.Inscritos;
        acc.Selecionados += r.Selecionados;
        acc.Participantes += r.Participantes;
        acc.Certificado += r.Certificado;
        return acc;
      },
      { Inscritos: 0, Selecionados: 0, Participantes: 0, Certificado: 0 },
    );
  }, [sheet.pageItems]);

  function updateParams(patch: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value || value === "all") params.delete(key);
      else params.set(key, value);
    }
    startTransition(() => {
      router.push(`/dashboard/analise?${params.toString()}`);
    });
  }

  const taxaSel = totais.Inscritos
    ? Math.round((totais.Selecionados / totais.Inscritos) * 1000) / 10
    : 0;
  const taxaPart = totais.Selecionados
    ? Math.round((totais.Participantes / totais.Selecionados) * 1000) / 10
    : 0;
  const taxaCert = totais.Participantes
    ? Math.round((totais.Certificado / totais.Participantes) * 1000) / 10
    : 0;

  const exportQs = searchParams.toString();

  return (
    <div className="relative space-y-6">
      {pending ? (
        <div className="absolute inset-0 z-20 flex items-start justify-center rounded-xl bg-white/70 pt-24 backdrop-blur-[1px]">
          <PageLoading
            label="Atualizando análise…"
            className="min-h-0 py-0"
          />
        </div>
      ) : null}
      <div
        className={cn("space-y-6", pending && "pointer-events-none opacity-50")}
        aria-busy={pending}
      >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Inscritos"
          value={totais.Inscritos}
          hint={`${totais.oficinas} oficina(s) · ${totais.projetos} projeto(s)`}
          barPct={100}
          barTone="emerald"
        />
        <KpiCard
          label="Selecionados"
          status="selecionado"
          value={totais.Selecionados}
          hint={`${taxaSel}% dos inscritos`}
          barPct={totais.Inscritos ? (totais.Selecionados / totais.Inscritos) * 100 : 0}
          barTone="sky"
        />
        <KpiCard
          label="Participantes"
          status="participante"
          value={totais.Participantes}
          hint={`${taxaPart}% dos selecionados`}
          barPct={totais.Inscritos ? (totais.Participantes / totais.Inscritos) * 100 : 0}
          barTone="teal"
        />
        <KpiCard
          label="Certificados"
          status="certificado"
          value={totais.Certificado}
          hint={`${taxaCert}% dos participantes`}
          barPct={totais.Inscritos ? (totais.Certificado / totais.Inscritos) * 100 : 0}
          barTone="amber"
        />
      </div>

      <div className="rounded-xl border border-brand/10 bg-white/80 p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <div className="space-y-2">
            <Label>Projeto</Label>
            <Select
              value={searchParams.get("idProjeto") ?? "all"}
              onValueChange={(v) => updateParams({ idProjeto: v ?? "all" })}
              items={filterSelectItems.projeto}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {filterOptions.projetos.map((p) => (
                  <SelectItem key={p.idProjeto} value={p.idProjeto}>
                    {p.nomeProjeto || p.idProjeto}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Oficina</Label>
            <Select
              value={searchParams.get("idOficina") ?? "all"}
              onValueChange={(v) => updateParams({ idOficina: v ?? "all" })}
              items={filterSelectItems.oficina}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {filterOptions.oficinas.map((o) => (
                  <SelectItem key={o.idOficina} value={o.idOficina}>
                    {o.nomeOficina || o.idOficina}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Estado</Label>
            <Select
              value={searchParams.get("estado") ?? "all"}
              onValueChange={(v) =>
                updateParams({
                  estado: v ?? "all",
                  cidade: "all",
                  territorio: "all",
                })
              }
              items={filterSelectItems.estado}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {filterOptions.estados.map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Cidade</Label>
            <Select
              value={searchParams.get("cidade") ?? "all"}
              onValueChange={(v) =>
                updateParams({ cidade: v ?? "all", territorio: "all" })
              }
              items={filterSelectItems.cidade}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {filterOptions.cidades.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2 lg:col-span-1 xl:col-span-1">
            <Label>Território (comunidade)</Label>
            <Select
              value={searchParams.get("territorio") ?? "all"}
              onValueChange={(v) => updateParams({ territorio: v ?? "all" })}
              items={filterSelectItems.territorio}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {filterOptions.territorios.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setTopOpen(true)}
          >
            <Trophy className="size-3.5" />
            Top 10 participantes
          </Button>
          <a
            href={`/api/export/analise?format=csv${exportQs ? `&${exportQs}` : ""}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Exportar CSV
          </a>
          <a
            href={`/api/export/analise?format=xlsx${exportQs ? `&${exportQs}` : ""}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Exportar XLSX
          </a>
          <Link
            href="/territorio"
            className={cn(buttonVariants({ size: "sm" }), "sm:ml-auto")}
          >
            Mapa
          </Link>
        </div>
      </div>

      <Dialog open={topOpen} onOpenChange={setTopOpen}>
        <DialogContent className="flex max-h-[85vh] w-[calc(100%-2rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-4 pr-12 text-left">
            <DialogTitle className="font-heading text-xl">
              Top 10 — quem mais participou
            </DialogTitle>
            <DialogDescription className="text-pretty">
              Ranking por vezes marcado como participante. Respeita os filtros
              de projeto, oficina e território.
            </DialogDescription>
          </DialogHeader>

          {topParticipantes.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">
              Nenhuma pessoa encontrada neste recorte.
            </p>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-2">
              <div className="sticky top-0 z-10 hidden grid-cols-[2.25rem_minmax(0,1fr)_5.5rem_4.5rem_4.5rem_4.5rem] gap-x-3 border-b border-border/60 bg-popover py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase sm:grid">
                <span>#</span>
                <span>Nome</span>
                <span className="text-right">Part.</span>
                <span className="text-right">Insc.</span>
                <span className="text-right">Sel.</span>
                <span className="text-right">Cert.</span>
              </div>
              <ol>
                {topParticipantes.map((pessoa) => (
                  <TopPessoaRow
                    key={pessoa.cpf || pessoa.posicao}
                    pessoa={pessoa}
                    maxParticipacoes={maxParticipacoes}
                  />
                ))}
              </ol>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {programas.length > 0 ? (
        <section className="space-y-3 rounded-2xl border border-brand/10 bg-white/80 px-5 py-5 shadow-sm">
          <div>
            <h2 className="font-heading text-xl font-semibold text-brand-deep">
              Programas / edições
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Contextos com mais de uma edição (projeto) cadastrada.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {programas.map((p) => (
              <Link
                key={p.id}
                href={p.href}
                className="rounded-xl border border-brand/10 px-4 py-3 transition hover:border-emerald-700/30 hover:bg-brand-mist/40"
              >
                <div className="font-medium text-brand-deep">{p.label}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {p.edicoes} edições · {p.inscritos} insc. ·{" "}
                  {p.anos.join(", ") || "—"}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <SocioBreakdownPanel socio={socio} />

      <DataSheet
        title="Por oficina"
        searchPlaceholder="Buscar oficina, projeto ou território…"
        query={sheet.query}
        onQueryChange={sheet.setQuery}
        page={sheet.page}
        pageSize={sheet.pageSize}
        totalPages={sheet.totalPages}
        rangeLabel={sheet.rangeLabel}
        total={sheet.total}
        totalAll={sheet.totalAll}
        onPageChange={sheet.setPage}
        onPageSizeChange={sheet.setPageSize}
        footer={
          sheet.total > 0 ? (
            <div className="grid grid-cols-2 gap-2 border-t bg-brand-mist/40 px-4 py-2.5 text-xs sm:grid-cols-5">
              <div className="font-medium text-brand-deep sm:col-span-1">
                Total filtrado
              </div>
              <div className="tabular-nums">
                Inscritos{" "}
                <strong>
                  {sheet.filtered.reduce((s, r) => s + r.Inscritos, 0)}
                </strong>
              </div>
              <div className="flex items-center gap-1.5 tabular-nums">
                <StatusKindBadge kind="selecionado" />
                <strong>
                  {sheet.filtered.reduce((s, r) => s + r.Selecionados, 0)}
                </strong>
              </div>
              <div className="flex items-center gap-1.5 tabular-nums">
                <StatusKindBadge kind="participante" />
                <strong>
                  {sheet.filtered.reduce((s, r) => s + r.Participantes, 0)}
                </strong>
              </div>
              <div className="flex items-center gap-1.5 tabular-nums">
                <StatusKindBadge kind="certificado" />
                <strong>
                  {sheet.filtered.reduce((s, r) => s + r.Certificado, 0)}
                </strong>
              </div>
            </div>
          ) : null
        }
      >
        <SheetTable>
          <SheetThead>
            <tr>
              <SheetTh sticky>Oficina</SheetTh>
              <SheetTh>Projeto</SheetTh>
              <SheetTh>Estado</SheetTh>
              <SheetTh>Cidade</SheetTh>
              <SheetTh>Território</SheetTh>
              <SheetTh>Inscritos</SheetTh>
              <SheetTh>
                <StatusKindBadge kind="selecionado" />
              </SheetTh>
              <SheetTh>
                <StatusKindBadge kind="participante" />
              </SheetTh>
              <SheetTh>
                <StatusKindBadge kind="certificado" />
              </SheetTh>
            </tr>
          </SheetThead>
          <tbody>
            {sheet.pageItems.length === 0 ? (
              <SheetTr>
                <SheetTd colSpan={9} className="py-10 text-center text-muted-foreground">
                  {pending ? "Carregando…" : "Nenhum resultado nesta busca."}
                </SheetTd>
              </SheetTr>
            ) : (
              <>
                {sheet.pageItems.map((row, index) => (
                  <SheetTr
                    key={`${row.id_projeto}-${row.id_oficina}-${row.Estado}-${row.Cidade}-${row.Territorio}-${index}`}
                  >
                    <SheetTd sticky className="whitespace-normal">
                      <Link
                        href={`/projeto/${encodeURIComponent(row.id_projeto)}/${encodeURIComponent(row.id_oficina)}`}
                        className="font-medium leading-snug text-brand-deep underline-offset-2 hover:underline"
                      >
                        {row.Nome_oficina}
                      </Link>
                    </SheetTd>
                    <SheetTd className="text-sm">
                      <Link
                        href={`/projeto/${encodeURIComponent(row.id_projeto)}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {row.Nome_projeto}
                      </Link>
                    </SheetTd>
                    <SheetTd className="text-sm">
                      {row.Estado !== "—" ? (
                        <Link
                          href={buildTerritorioPath({ estado: row.Estado })}
                          className="underline-offset-2 hover:underline"
                        >
                          {row.Estado}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </SheetTd>
                    <SheetTd className="max-w-[10rem] truncate text-sm">
                      {row.Cidade !== "—" && row.Estado !== "—" ? (
                        <Link
                          href={buildTerritorioPath({
                            estado: row.Estado,
                            cidade: row.Cidade,
                          })}
                          className="underline-offset-2 hover:underline"
                        >
                          {row.Cidade}
                        </Link>
                      ) : (
                        row.Cidade
                      )}
                    </SheetTd>
                    <SheetTd className="max-w-[10rem] truncate text-sm">
                      {row.Territorio !== "—" ? (
                        <Link
                          href={buildTerritorioPath({
                            estado: row.Estado !== "—" ? row.Estado : "",
                            cidade: row.Cidade !== "—" ? row.Cidade : "",
                            territorio: row.Territorio,
                          })}
                          className="underline-offset-2 hover:underline"
                        >
                          {row.Territorio}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </SheetTd>
                    <SheetTd>
                      <MetricBar value={row.Inscritos} max={maxInscritos} tone="emerald" />
                    </SheetTd>
                    <SheetTd>
                      <MetricBar
                        value={row.Selecionados}
                        max={row.Inscritos || 1}
                        tone="sky"
                      />
                    </SheetTd>
                    <SheetTd>
                      <MetricBar
                        value={row.Participantes}
                        max={row.Selecionados || row.Inscritos || 1}
                        tone="amber"
                      />
                    </SheetTd>
                    <SheetTd>
                      <MetricBar
                        value={row.Certificado}
                        max={row.Participantes || row.Selecionados || row.Inscritos || 1}
                        tone="teal"
                      />
                    </SheetTd>
                  </SheetTr>
                ))}
                <SheetTr className="bg-muted/30">
                  <SheetTd sticky className="font-medium">
                    Soma da página
                  </SheetTd>
                  <SheetTd colSpan={2} />
                  <SheetTd className="tabular-nums font-medium">
                    {pageTotals.Inscritos}
                  </SheetTd>
                  <SheetTd className="tabular-nums font-medium">
                    {pageTotals.Selecionados}
                  </SheetTd>
                  <SheetTd className="tabular-nums font-medium">
                    {pageTotals.Participantes}
                  </SheetTd>
                  <SheetTd className="tabular-nums font-medium">
                    {pageTotals.Certificado}
                  </SheetTd>
                </SheetTr>
              </>
            )}
          </tbody>
        </SheetTable>
      </DataSheet>
      </div>
    </div>
  );
}
