import Link from "next/link";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { PageHeader, StatCard } from "@/components/ui";
import { formatCgccpf, formatCurrency, normalizeCgccpf } from "@/lib/format";
import { excludeProjects, hiddenProjectIds } from "@/lib/compliance/over-limit-visibility";
import { findSponsorConflicts, summarizeSponsors } from "@/lib/sponsors";
import { loadSponsorSyncStates, needsSponsorRefresh } from "@/lib/salic/sponsors-sync";
import { SponsorSyncButton } from "@/components/SponsorSyncButton";
import { ProponentSponsorsView } from "@/components/sponsors/ProponentSponsorsView";
import { buildProponentAnalysis, conflictKey } from "@/lib/sponsors-by-proponent";
import { SponsorGroupView } from "@/components/sponsors/SponsorGroupView";
import { buildSponsorGroup, sponsorOptions, type GroupSponsorshipRow } from "@/lib/sponsor-group";

export const dynamic = "force-dynamic";
/** O botão "Buscar agora" roda aqui (até ~4 min). */
export const maxDuration = 300;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const plain = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Auditoria › Patrocinadores — quem aportou recurso nos projetos (captação no
 * SALIC), quanto e em quais PRONACs, e quem também recebeu pagamento.
 */
export default async function PatrocinadoresPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 120) : "";
  const aba = sp.aba === "proponente" ? "proponente" : sp.aba === "grupo" ? "grupo" : "patrocinador";
  const groupKeys = (Array.isArray(sp.s) ? sp.s : typeof sp.s === "string" ? [sp.s] : [])
    .map((k) => k.trim().slice(0, 200))
    .filter(Boolean)
    .slice(0, 200);
  const selectedProponent = typeof sp.proponente === "string" ? sp.proponente : null;
  const { entitlements } = await getWorkspaceContext();
  const hidden = await hiddenProjectIds();
  const projectScope = {
    salicAccount: { workspaceId: entitlements.workspaceId },
    ...excludeProjects(hidden),
  };

  const [rows, syncStates, scopedProjects] = await Promise.all([
    prisma.projectSponsorship.findMany({
      where: { project: projectScope },
      select: {
        cgccpf: true,
        name: true,
        amount: true,
        receivedAt: true,
        project: { select: { id: true, pronac: true, name: true } },
        projectId: true,
      },
    }),
    loadSponsorSyncStates(entitlements.workspaceId).then((all) => {
      const h = new Set(hidden);
      return all.filter((s) => !h.has(s.id));
    }),
    prisma.project.findMany({
      where: projectScope,
      select: {
        id: true,
        pronac: true,
        name: true,
        valorCaptado: true,
        salicAccount: { select: { id: true, name: true, cgccpf: true } },
      },
    }),
  ]);
  const pendingCount = syncStates.filter((s) => needsSponsorRefresh(s)).length;
  const neverPronacs = [...new Set(syncStates.filter((s) => !s.sponsorsSyncedAt).map((s) => s.pronac))].sort();
  const neverCount = syncStates.filter((s) => !s.sponsorsSyncedAt).length;
  const captadoTotal = syncStates.reduce((n, s) => n + (s.valorCaptado ?? 0), 0);

  // Patrocinador que recebeu pagamento do mesmo projeto.
  const projectIds = [...new Set(rows.map((r) => r.project.id))];
  const paid = projectIds.length
    ? await prisma.payment.groupBy({
        by: ["projectId", "supplierId"],
        where: { projectId: { in: projectIds } },
        _sum: { amount: true },
      })
    : [];
  const supplierIds = [...new Set(paid.map((p) => p.supplierId))];
  const suppliers = supplierIds.length
    ? await prisma.supplier.findMany({
        where: { id: { in: supplierIds } },
        select: { id: true, name: true, cgccpf: true },
      })
    : [];
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));
  const conflictDocs = new Set<string>();
  const conflictPairs = new Set<string>();
  for (const pid of projectIds) {
    const projSponsors = rows.filter((r) => r.project.id === pid);
    const projSuppliers = paid
      .filter((p) => p.projectId === pid)
      .map((p) => {
        const s = supplierById.get(p.supplierId);
        return {
          cgccpf: s?.cgccpf || "",
          name: s?.name || "",
          total: Number(p._sum.amount || 0),
        };
      });
    for (const c of findSponsorConflicts(projSponsors, projSuppliers)) {
      conflictDocs.add(c.sponsorCgccpf);
      conflictPairs.add(conflictKey(pid, c.sponsorCgccpf));
    }
  }

  type Sponsor = ReturnType<typeof summarizeSponsors>[number] & {
    projects: Array<{
      pronac: string;
      name: string | null;
      total: number;
      count: number;
    }>;
    conflict: boolean;
  };
  const byDoc = new Map<string, typeof rows>();
  for (const r of rows) {
    const doc = normalizeCgccpf(r.cgccpf) || r.name;
    byDoc.set(doc, [...(byDoc.get(doc) || []), r]);
  }
  let sponsors: Sponsor[] = [...byDoc.entries()].map(([doc, list]) => {
    const [sum] = summarizeSponsors(
      list.map((r) => ({
        cgccpf: r.cgccpf,
        name: r.name,
        amount: Number(r.amount),
        receivedAt: r.receivedAt,
      })),
    );
    const perProject = new Map<string, { pronac: string; name: string | null; total: number; count: number }>();
    for (const r of list) {
      const cur = perProject.get(r.project.pronac) || {
        pronac: r.project.pronac,
        name: r.project.name,
        total: 0,
        count: 0,
      };
      cur.total += Number(r.amount);
      cur.count += 1;
      perProject.set(r.project.pronac, cur);
    }
    return {
      ...sum!,
      projects: [...perProject.values()].sort((a, b) => b.total - a.total),
      conflict: conflictDocs.has(doc),
    };
  });
  sponsors.sort((a, b) => b.total - a.total);
  const grandTotal = sponsors.reduce((n, s) => n + s.total, 0);
  const conflictCount = sponsors.filter((s) => s.conflict).length;

  const accountsById = new Map(scopedProjects.map((p) => [p.salicAccount.id, p.salicAccount]));
  const accountByProject = new Map(scopedProjects.map((p) => [p.id, p.salicAccount]));
  const groupRows: GroupSponsorshipRow[] =
    aba === "grupo"
      ? rows.map((r) => ({
          cgccpf: r.cgccpf,
          name: r.name,
          amount: Number(r.amount),
          receivedAt: r.receivedAt,
          projectId: r.projectId,
          pronac: r.project.pronac,
          projectName: r.project.name,
          accountId: accountByProject.get(r.projectId)?.id ?? "",
          accountName: accountByProject.get(r.projectId)?.name ?? "",
        }))
      : [];
  const group =
    aba === "grupo" && groupKeys.length
      ? buildSponsorGroup({ rows: groupRows, keys: groupKeys, conflicts: conflictPairs })
      : null;
  let proponents = buildProponentAnalysis({
    accounts: [...accountsById.values()],
    projects: scopedProjects.map((p) => ({
      id: p.id,
      pronac: p.pronac,
      name: p.name,
      accountId: p.salicAccount.id,
      valorCaptado: p.valorCaptado != null ? Number(p.valorCaptado) : null,
    })),
    rows: rows.map((r) => ({
      cgccpf: r.cgccpf,
      name: r.name,
      amount: Number(r.amount),
      receivedAt: r.receivedAt,
      projectId: r.projectId,
    })),
    conflicts: conflictPairs,
  });
  if (aba === "proponente" && q && !selectedProponent) {
    const terms = plain(q).split(/\s+/).filter(Boolean);
    const qDigits = normalizeCgccpf(q);
    proponents = proponents.filter((p) => {
      const hay = plain(`${p.name} ${p.sponsors.map((s) => s.name).join(" ")}`);
      return (
        (qDigits.length >= 3 && (p.cgccpf.includes(qDigits) || p.sponsors.some((s) => s.cgccpf.includes(qDigits)))) ||
        terms.every((t) => hay.includes(t))
      );
    });
  }

  if (q && aba === "patrocinador") {
    const terms = plain(q).split(/\s+/).filter(Boolean);
    const qDigits = normalizeCgccpf(q);
    sponsors = sponsors.filter((s) => {
      const hay = plain(`${s.name} ${s.projects.map((p) => `${p.pronac} ${p.name || ""}`).join(" ")}`);
      return (qDigits.length >= 3 && s.cgccpf.includes(qDigits)) || terms.every((t) => hay.includes(t));
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Auditoria › Patrocinadores"
        title="Patrocinadores"
        description="Quem aportou recurso nos projetos, segundo a captação no SALIC. A lista é atualizada todo dia junto com o SALIC."
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Patrocinadores"
          value={String(byDoc.size)}
          hint={`${projectIds.length} projeto(s) com captação`}
        />
        <StatCard label="Total aportado" value={formatCurrency(grandTotal)} hint="Soma de todos os aportes" />
        <StatCard
          label="Também receberam"
          value={String(conflictCount)}
          hint={
            conflictCount
              ? "Patrocinaram e receberam pagamento do mesmo projeto"
              : "Nenhum patrocinador recebeu pagamento"
          }
        />
      </section>

      <section className="card flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="min-w-0 text-sm text-[var(--gray-600)]">
          <p>
            Captado nos projetos: <strong className="text-[var(--navy)]">{formatCurrency(captadoTotal)}</strong>
            {" · "}com patrocinador identificado:{" "}
            <strong className="text-[var(--navy)]">{formatCurrency(grandTotal)}</strong>
          </p>
          <p className="mt-0.5">
            {pendingCount === 0
              ? "Tudo em dia. A rotina diária busca só o que mudar."
              : [
                  neverCount > 0 ? `${neverCount} projeto(s) ainda sem busca` : null,
                  pendingCount > neverCount ? `${pendingCount - neverCount} com dinheiro novo para conferir` : null,
                ]
                  .filter(Boolean)
                  .join(" e ") + "."}
          </p>
          {neverPronacs.length ? (
            <p className="mt-0.5 text-xs text-[var(--gray-500)]">Sem busca: PRONAC {neverPronacs.join(", ")}</p>
          ) : null}
        </div>
        {pendingCount > 0 ? <SponsorSyncButton pending={pendingCount} /> : null}
      </section>

      <nav className="accounts-tabs" aria-label="Visualização dos patrocinadores">
        <Link href="/patrocinadores" aria-current={aba === "patrocinador" ? "page" : undefined}>
          Por patrocinador
        </Link>
        <Link href="/patrocinadores?aba=proponente" aria-current={aba === "proponente" ? "page" : undefined}>
          Por proponente ({accountsById.size})
        </Link>
        <Link href="/patrocinadores?aba=grupo" aria-current={aba === "grupo" ? "page" : undefined}>
          Grupo empresarial
        </Link>
      </nav>

      {aba === "grupo" ? (
        <SponsorGroupView options={sponsorOptions(groupRows)} selected={groupKeys} group={group} />
      ) : aba === "proponente" ? (
        <ProponentSponsorsView proponents={proponents} selectedId={selectedProponent} q={q} />
      ) : (
        <section className="card overflow-hidden">
          <div className="border-b border-[var(--border)] bg-[var(--navy-soft)]/50 px-5 py-4">
            <form action="/patrocinadores" className="flex max-w-xl gap-2">
              <input
                name="q"
                defaultValue={q}
                placeholder="Patrocinador, CNPJ, PRONAC ou projeto"
                className="flex-1"
                aria-label="Buscar patrocinador"
              />
              <button type="submit" className="btn">
                Buscar
              </button>
            </form>
          </div>
          {sponsors.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-[var(--gray-500)]">
              {q ? `Nenhum patrocinador encontrado para “${q}”.` : "Nenhum patrocinador encontrado ainda."}
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {sponsors.map((s) => (
                <li key={s.cgccpf || s.name} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--navy)]">
                        {s.name}
                        {s.conflict ? (
                          <span className="badge badge-warn ml-2 align-middle">Também recebeu pagamento</span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-sm text-[var(--gray-500)]">
                        {formatCgccpf(s.cgccpf)} · {s.count} aporte
                        {s.count === 1 ? "" : "s"} em {s.projects.length} PRONAC
                        {s.projects.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <p className="font-semibold text-[var(--navy)]">{formatCurrency(s.total)}</p>
                  </div>
                  <PronacChips projects={s.projects.slice(0, VISIBLE_PRONACS)} />
                  {s.projects.length > VISIBLE_PRONACS ? (
                    <details className="group mt-2">
                      <summary className="cursor-pointer text-sm font-medium text-[var(--navy)] hover:underline">
                        <span className="group-open:hidden">Ver todos os {s.projects.length} PRONACs</span>
                        <span className="hidden group-open:inline">Recolher</span>
                      </summary>
                      <PronacChips projects={s.projects.slice(VISIBLE_PRONACS)} />
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/** PRONACs mostrados antes de "Ver todos". */
const VISIBLE_PRONACS = 3;

function PronacChips({
  projects,
}: {
  projects: Array<{
    pronac: string;
    name: string | null;
    total: number;
    count: number;
  }>;
}) {
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {projects.map((p) => (
        <li key={p.pronac}>
          <Link
            href={`/panorama/pronac/${p.pronac}?tab=patrocinadores`}
            className="badge badge-muted hover:underline"
            title={p.name || undefined}
          >
            PRONAC {p.pronac} · {formatCurrency(p.total)}
            {p.count > 1 ? ` · ${p.count} aportes` : ""}
          </Link>
        </li>
      ))}
    </ul>
  );
}
