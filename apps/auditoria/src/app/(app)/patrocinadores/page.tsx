import Link from "next/link";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { PageHeader, StatCard } from "@/components/ui";
import { formatCgccpf, formatCurrency, normalizeCgccpf } from "@/lib/format";
import { excludeProjects, hiddenProjectIds } from "@/lib/compliance/over-limit-visibility";
import { findSponsorConflicts, summarizeSponsors } from "@/lib/sponsors";
import { loadSponsorSyncStates, needsSponsorRefresh } from "@/lib/salic/sponsors-sync";
import { SponsorSyncButton } from "@/components/SponsorSyncButton";

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
  const { entitlements } = await getWorkspaceContext();
  const hidden = await hiddenProjectIds();
  const projectScope = {
    salicAccount: { workspaceId: entitlements.workspaceId },
    ...excludeProjects(hidden),
  };

  const [rows, syncStates] = await Promise.all([
    prisma.projectSponsorship.findMany({
      where: { project: projectScope },
      select: {
        cgccpf: true,
        name: true,
        amount: true,
        receivedAt: true,
        project: { select: { id: true, pronac: true, name: true } },
      },
    }),
    loadSponsorSyncStates(entitlements.workspaceId).then((all) => {
      const h = new Set(hidden);
      return all.filter((s) => !h.has(s.id));
    }),
  ]);
  const pendingCount = syncStates.filter((s) => needsSponsorRefresh(s)).length;
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
  for (const pid of projectIds) {
    const projSponsors = rows.filter((r) => r.project.id === pid);
    const projSuppliers = paid
      .filter((p) => p.projectId === pid)
      .map((p) => {
        const s = supplierById.get(p.supplierId);
        return { cgccpf: s?.cgccpf || "", name: s?.name || "", total: Number(p._sum.amount || 0) };
      });
    for (const c of findSponsorConflicts(projSponsors, projSuppliers)) conflictDocs.add(c.sponsorCgccpf);
  }

  type Sponsor = ReturnType<typeof summarizeSponsors>[number] & {
    projects: Array<{ pronac: string; name: string | null; total: number }>;
    conflict: boolean;
  };
  const byDoc = new Map<string, typeof rows>();
  for (const r of rows) {
    const doc = normalizeCgccpf(r.cgccpf) || r.name;
    byDoc.set(doc, [...(byDoc.get(doc) || []), r]);
  }
  let sponsors: Sponsor[] = [...byDoc.entries()].map(([doc, list]) => {
    const [sum] = summarizeSponsors(
      list.map((r) => ({ cgccpf: r.cgccpf, name: r.name, amount: Number(r.amount), receivedAt: r.receivedAt })),
    );
    const perProject = new Map<string, { pronac: string; name: string | null; total: number }>();
    for (const r of list) {
      const cur = perProject.get(r.project.pronac) || { pronac: r.project.pronac, name: r.project.name, total: 0 };
      cur.total += Number(r.amount);
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

  if (q) {
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
        <StatCard label="Patrocinadores" value={String(byDoc.size)} hint={`${projectIds.length} projeto(s) com captação`} />
        <StatCard label="Total aportado" value={formatCurrency(grandTotal)} hint="Soma de todos os aportes" />
        <StatCard
          label="Também receberam"
          value={String(conflictCount)}
          hint={conflictCount ? "Patrocinaram e receberam pagamento do mesmo projeto" : "Nenhum patrocinador recebeu pagamento"}
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
        </div>
        {pendingCount > 0 ? <SponsorSyncButton pending={pendingCount} /> : null}
      </section>

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
                      {formatCgccpf(s.cgccpf)} · {s.count} aporte{s.count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <p className="font-semibold text-[var(--navy)]">{formatCurrency(s.total)}</p>
                </div>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {s.projects.map((p) => (
                    <li key={p.pronac}>
                      <Link
                        href={`/panorama/pronac/${p.pronac}?tab=patrocinadores`}
                        className="badge badge-muted hover:underline"
                        title={p.name || undefined}
                      >
                        PRONAC {p.pronac} · {formatCurrency(p.total)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
