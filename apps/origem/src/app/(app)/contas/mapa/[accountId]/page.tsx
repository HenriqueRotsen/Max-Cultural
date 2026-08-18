import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { ProponentCorporateMapEditor } from "@/components/ProponentCorporateMapEditor";
import { corporateMapCopy } from "@/lib/corporate/copy";
import { formatCgccpf } from "@/lib/format";
import { fetchCnpjCompany } from "@/lib/lookup/cnpj";

export const dynamic = "force-dynamic";

type Params = Promise<{ accountId: string }>;

/** Só preenche data de abertura se ainda não houver — não recria intervalos. */
async function maybePrefillFoundedAt(account: {
  id: string;
  name: string;
  cgccpf: string;
  foundedAt: Date | null;
}) {
  if (account.foundedAt) return;
  const digits = account.cgccpf.replace(/\D/g, "");
  if (digits.length !== 14) return;

  try {
    const company = await fetchCnpjCompany(digits);
    if (!company?.foundedAt) return;
    await prisma.salicAccount.update({
      where: { id: account.id },
      data: {
        foundedAt: company.foundedAt,
        foundedAtPrecision: "DAY",
        foundedAtSource: "brasilapi",
        name: account.name || company.name,
      },
    });
  } catch {
    // Consulta indisponível.
  }
}

export default async function ProponentCorporateMapPage({
  params,
}: {
  params: Params;
}) {
  const { accountId } = await params;
  const { entitlements } = await getWorkspaceContext();
  const ws = entitlements.workspaceId;

  const account = await prisma.salicAccount.findFirst({
    where: { id: accountId, workspaceId: ws },
  });

  if (!account) notFound();

  await maybePrefillFoundedAt(account);

  const full = await prisma.salicAccount.findUniqueOrThrow({
    where: { id: account.id },
    include: {
      corporatePeriods: {
        orderBy: { validFrom: "desc" },
        include: {
          members: { orderBy: { name: "asc" } },
        },
      },
    },
  });

  const memberDocs = [
    ...new Set(
      full.corporatePeriods.flatMap((p) =>
        p.members
          .map((m) => m.cgccpf.replace(/\D/g, ""))
          .filter((d) => d.length === 11 || d.length === 14),
      ),
    ),
  ];

  const matchedSuppliers =
    memberDocs.length === 0
      ? []
      : await prisma.supplier.findMany({
          where: {
            cgccpf: { in: memberDocs },
            OR: [
              {
                payments: {
                  some: {
                    project: { salicAccountId: account.id },
                  },
                },
              },
              {
                watchedSuppliers: {
                  some: { workspaceId: ws },
                },
              },
            ],
          },
          select: { id: true, name: true, cgccpf: true },
          orderBy: { name: "asc" },
        });

  const copy = corporateMapCopy(full.institutionalMap);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/contas?tab=suas-contas"
          className="text-sm text-[var(--gray-500)] hover:text-[var(--navy)]"
        >
          ← Voltar às contas
        </Link>
      </div>

      <PageHeader
        breadcrumb={copy.breadcrumb}
        title={`${copy.mapName} · ${full.name}`}
        description={`CNPJ/CPF ${formatCgccpf(full.cgccpf)}`}
      />

      {matchedSuppliers.length > 0 ? (
        <div className="rounded-xl border border-[#b7e0c4] bg-[#e8f6ee] px-4 py-3 text-sm text-[#176b3a]">
          <strong>{matchedSuppliers.length}</strong> fornecedor
          {matchedSuppliers.length === 1 ? "" : "es"} com o mesmo CPF/CNPJ de{" "}
          {copy.matchedBanner(matchedSuppliers.length)}:{" "}
          {matchedSuppliers.map((s) => s.name).join(", ")}.
        </div>
      ) : null}

      <ProponentCorporateMapEditor
        accountId={full.id}
        accountName={full.name}
        accountCgccpf={full.cgccpf}
        foundedAt={full.foundedAt?.toISOString() || null}
        foundedAtPrecision={full.foundedAtPrecision}
        institutionalMap={full.institutionalMap}
        matchedSupplierDocs={
          new Set(matchedSuppliers.map((s) => s.cgccpf.replace(/\D/g, "")))
        }
        periods={full.corporatePeriods.map((p) => ({
          id: p.id,
          label: p.label,
          source: p.source,
          validFrom: p.validFrom.toISOString(),
          validFromPrecision: p.validFromPrecision,
          validTo: p.validTo?.toISOString() || null,
          validToPrecision: p.validToPrecision,
          members: p.members.map((m) => ({
            id: m.id,
            name: m.name,
            cgccpf: m.cgccpf,
            personType: m.personType,
            role: m.role,
            source: m.source,
          })),
        }))}
      />
    </div>
  );
}
