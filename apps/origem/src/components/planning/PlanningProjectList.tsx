"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/format";
import { jurisdictionLabel } from "@/lib/planning/lifecycle";

export type PlanningProjectCard = {
  id: string;
  externalCode: string;
  name: string | null;
  jurisdiction: string;
  accountName: string;
  importedAt: string | null;
  importSource: string | null;
  situacao: string | null;
  lifecycleStatus: string;
  totalApproved: number;
  totalAvailable: number;
};

type SortKey = "name" | "code" | "approved" | "balance" | "imported";
type LifecycleFilter = "all" | "open" | "closed";

function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function ProjectListCard({
  href,
  externalCode,
  name,
  jurisdiction,
  accountName,
  importedAt,
  importSource,
  situacao,
  totalApproved,
  totalAvailable,
  muted,
}: {
  href: string;
  externalCode: string;
  name: string | null;
  jurisdiction: string;
  accountName: string;
  importedAt: string | null;
  importSource: string | null;
  situacao: string | null;
  totalApproved: number;
  totalAvailable: number;
  muted?: boolean;
}) {
  const meta = [
    jurisdictionLabel(jurisdiction),
    accountName,
    importedAt
      ? `planilha em ${formatDate(importedAt)}`
      : importSource === "SALIC_HOMOLOGADA"
        ? "Planilha do SALIC"
        : importSource === "STATE_FILE"
          ? "Arquivo estadual"
          : "Sem planilha",
  ].join(" · ");

  return (
    <Link
      href={href}
      className={`group card relative flex overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md ${
        muted
          ? "border-[var(--border)] bg-[var(--gray-50)] opacity-80 hover:opacity-100"
          : "hover:border-[#b8b0e8]"
      }`}
    >
      <span
        className={`absolute inset-y-0 left-0 w-1.5 ${
          muted
            ? "bg-[var(--gray-300)]"
            : "bg-[linear-gradient(180deg,#6b4fc9_0%,#3b82d6_100%)]"
        }`}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-5 pl-6 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <span
            className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-1 ${
              muted
                ? "bg-[var(--gray-100)] text-[var(--gray-500)] ring-[var(--border)]"
                : "bg-[linear-gradient(135deg,#ebe9f8_0%,#ddd6fe_100%)] text-[#5b52c9] ring-[#d4cff0]"
            }`}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M5 4h14v16H5V4Z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-lg px-2.5 py-1 text-xs font-bold tracking-wide ${
                  muted
                    ? "bg-[var(--gray-200)] text-[var(--gray-600)]"
                    : "bg-[var(--navy-soft)] text-[var(--navy)]"
                }`}
              >
                {externalCode}
              </span>
              {situacao ? (
                <span className="max-w-[14rem] truncate rounded-lg bg-[var(--gray-100)] px-2.5 py-1 text-xs font-medium text-[var(--gray-600)]">
                  {situacao}
                </span>
              ) : null}
            </div>
            {name ? (
              <p
                className={`mt-2 truncate text-base font-semibold ${
                  muted ? "text-[var(--gray-500)]" : "text-[var(--navy)]"
                }`}
              >
                {name}
              </p>
            ) : null}
            <p className="mt-1 text-sm leading-relaxed text-[var(--gray-500)]">{meta}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 sm:pl-2">
          <div className="flex flex-1 gap-2 sm:flex-none">
            <div className="min-w-[7.5rem] flex-1 rounded-xl border border-[var(--border)] bg-white px-3 py-2 sm:flex-none">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--gray-400)]">
                Aprovado
              </p>
              <p
                className={`mt-0.5 text-sm font-semibold tabular-nums ${
                  muted ? "text-[var(--gray-500)]" : "text-[var(--navy)]"
                }`}
              >
                {formatCurrency(totalApproved)}
              </p>
            </div>
            <div
              className={`min-w-[7.5rem] flex-1 rounded-xl px-3 py-2 sm:flex-none ${
                muted
                  ? "border border-[var(--border)] bg-[var(--gray-100)]"
                  : "border border-[#d4cff0] bg-[#ebe9f8]"
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--gray-400)]">
                Saldo
              </p>
              <p
                className={`mt-0.5 text-sm font-semibold tabular-nums ${
                  muted ? "text-[var(--gray-500)]" : "text-[#5b52c9]"
                }`}
              >
                {formatCurrency(totalAvailable)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function PlanningProjectList({ projects }: { projects: PlanningProjectCard[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [lifecycle, setLifecycle] = useState<LifecycleFilter>("open");
  const [jurisdiction, setJurisdiction] = useState<string>("all");

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    let list = projects.filter((p) => {
      if (lifecycle === "open" && p.lifecycleStatus === "ENCERRADO") return false;
      if (lifecycle === "closed" && p.lifecycleStatus !== "ENCERRADO") return false;
      if (jurisdiction !== "all" && p.jurisdiction !== jurisdiction) return false;
      if (!q) return true;
      const hay = norm(
        [p.externalCode, p.name || "", p.accountName, p.situacao || ""].join(" "),
      );
      return q.split(/\s+/).every((part) => hay.includes(part));
    });

    list = [...list].sort((a, b) => {
      switch (sort) {
        case "code":
          return a.externalCode.localeCompare(b.externalCode, "pt-BR");
        case "approved":
          return b.totalApproved - a.totalApproved;
        case "balance":
          return b.totalAvailable - a.totalAvailable;
        case "imported":
          return (b.importedAt || "").localeCompare(a.importedAt || "");
        case "name":
        default:
          return (a.name || a.externalCode).localeCompare(
            b.name || b.externalCode,
            "pt-BR",
          );
      }
    });
    return list;
  }, [projects, query, sort, lifecycle, jurisdiction]);

  const openCount = projects.filter((p) => p.lifecycleStatus !== "ENCERRADO").length;
  const closedCount = projects.length - openCount;

  if (projects.length === 0) {
    return (
      <div className="card space-y-3 px-5 py-12 text-center">
        <p className="text-sm text-[var(--gray-500)]">
          Nenhum projeto no planejamento. Inicie um novo com a planilha homologada.
        </p>
        <Link href="/planejamento/novo" className="btn inline-flex">
          Começar projeto
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <label className="field min-w-[12rem] flex-1">
          <span className="text-xs text-[var(--gray-500)]">Buscar</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="PRONAC, nome, proponente…"
          />
        </label>
        <label className="field min-w-[10rem]">
          <span className="text-xs text-[var(--gray-500)]">Situação</span>
          <select value={lifecycle} onChange={(e) => setLifecycle(e.target.value as LifecycleFilter)}>
            <option value="open">Em andamento ({openCount})</option>
            <option value="closed">Encerrados ({closedCount})</option>
            <option value="all">Todos ({projects.length})</option>
          </select>
        </label>
        <label className="field min-w-[10rem]">
          <span className="text-xs text-[var(--gray-500)]">Esfera</span>
          <select value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)}>
            <option value="all">Todas</option>
            <option value="FEDERAL">Federal</option>
            <option value="ESTADUAL">Estadual</option>
          </select>
        </label>
        <label className="field min-w-[10rem]">
          <span className="text-xs text-[var(--gray-500)]">Ordenar por</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="name">Nome</option>
            <option value="code">PRONAC</option>
            <option value="balance">Saldo</option>
            <option value="approved">Aprovado</option>
            <option value="imported">Importação</option>
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-[var(--gray-400)]">Nenhum projeto corresponde aos filtros.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <ProjectListCard
              key={p.id}
              href={`/planejamento/${p.id}`}
              externalCode={p.externalCode}
              name={p.name}
              jurisdiction={p.jurisdiction}
              accountName={p.accountName}
              importedAt={p.importedAt}
              importSource={p.importSource}
              situacao={p.situacao}
              totalApproved={p.totalApproved}
              totalAvailable={p.totalAvailable}
              muted={p.lifecycleStatus === "ENCERRADO"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
