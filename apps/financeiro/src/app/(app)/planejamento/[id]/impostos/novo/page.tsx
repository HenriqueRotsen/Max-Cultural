import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { retainedTaxes, type TaxKind } from "@/lib/planning/tax-docs";
import { TaxDocumentsForm, type TaxPaymentOption } from "@/components/planning/TaxDocumentsForm";

export const dynamic = "force-dynamic";

/** Atalho: lança os documentos do imposto retido de um pagamento. */
export default async function NovoImpostoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nf?: string }>;
}) {
  const { id } = await params;
  const { nf } = await searchParams;
  const { entitlements } = await getWorkspaceContext();
  const project = await prisma.planningProject.findFirst({
    where: { id, workspaceId: entitlements.workspaceId },
    select: { id: true, externalCode: true },
  });
  if (!project) notFound();

  const docs = await prisma.planningDocument.findMany({
    where: {
      planningProjectId: project.id,
      workspaceId: entitlements.workspaceId,
      kind: { in: ["NF", "RPA"] },
      status: "IMPORTED",
      allocations: { some: {} },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      kind: true,
      grossAmount: true,
      taxesJson: true,
      extractedJson: true,
      commitment: {
        select: { engagement: { select: { service: { select: { supplier: { select: { name: true } } } } } } },
      },
      derivedProofs: { where: { kind: "TAX_PROOF" }, select: { extractedJson: true } },
    },
  });

  const payments: TaxPaymentOption[] = docs
    .map((d) => {
      const ext = (d.extractedJson ?? {}) as { fiscalNumber?: string; nfNumber?: string };
      const number = ext.fiscalNumber || ext.nfNumber;
      const taxes = retainedTaxes(d.taxesJson);
      const done = d.derivedProofs
        .map((p) => (p.extractedJson as { taxKind?: TaxKind } | null)?.taxKind)
        .filter((k): k is TaxKind => Boolean(k));
      const supplier = d.commitment?.engagement.service.supplier.name ?? "Fornecedor";
      const taxText = taxes.length ? ` · ${taxes.map((t) => `${t.label} ${formatCurrency(t.amount)}`).join(", ")}` : "";
      return {
        nfId: d.id,
        label: `${supplier} · ${d.kind}${number ? ` ${number}` : ""} · ${formatCurrency(Number(d.grossAmount ?? 0))}${taxText}`,
        taxes,
        done,
      };
    })
    // Primeiro as notas com imposto retido ainda sem documentos.
    .sort((a, b) => {
      const pa = a.taxes.some((t) => !a.done.includes(t.kind)) ? 0 : 1;
      const pb = b.taxes.some((t) => !b.done.includes(t.kind)) ? 0 : 1;
      return pa - pb;
    });

  return (
    <div className="space-y-6">
      <PageHeader
        backHref={`/planejamento/${project.id}/reservas/nova`}
        breadcrumb={
          <>
            <Link href="/planejamento">Planejamento</Link> /{" "}
            <Link href={`/planejamento/${project.id}`}>{project.externalCode}</Link> / Imposto
          </>
        }
        title="Imposto"
        description="Escolha o pagamento e o imposto retido nele, e anexe a guia, a nota fiscal do imposto e o comprovante de pagamento do imposto."
      />
      <section className="card p-5">
        <TaxDocumentsForm planningProjectId={project.id} payments={payments} initialNfId={nf} />
      </section>
    </div>
  );
}
