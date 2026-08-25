import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ProofUploadForm } from "@/components/planning/ProofUploadForm";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CompromissoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { entitlements } = await getWorkspaceContext();
  const commitment = await prisma.rubricCommitment.findFirst({
    where: { id, workspaceId: entitlements.workspaceId },
    include: {
      planningProject: { select: { id: true, externalCode: true } },
      budgetLine: {
        select: { itemName: true, stageName: true, productName: true },
      },
      engagement: {
        include: {
          service: { include: { supplier: true } },
        },
      },
      documents: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!commitment) notFound();

  const supplier = commitment.engagement.service.supplier;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={
          <>
            <Link href="/planejamento">Planejamento</Link> /{" "}
            <Link href={`/planejamento/${commitment.planningProject.id}`}>
              {commitment.planningProject.externalCode}
            </Link>{" "}
            / Reserva
          </>
        }
        title={`${commitment.status} · ${formatCurrency(Number(commitment.amount))}`}
        description={`${supplier.name} · ${commitment.engagement.service.name}`}
      />

      <div className="card space-y-2 p-5 text-sm">
        <p>
          <span className="text-[var(--gray-500)]">Rubrica:</span>{" "}
          {commitment.budgetLine.stageName} · {commitment.budgetLine.itemName}
        </p>
        <p>
          <span className="text-[var(--gray-500)]">Pagamento esperado:</span>{" "}
          {formatDate(commitment.expectedPayAt)}
        </p>
        {commitment.paidAt ? (
          <p>
            <span className="text-[var(--gray-500)]">Pago em:</span>{" "}
            {formatDate(commitment.paidAt)}
          </p>
        ) : null}
        <p>
          <span className="text-[var(--gray-500)]">Vínculo declarado:</span>{" "}
          {commitment.hasBond ? "Sim" : "Não"}
        </p>
        <p>
          <Link
            href={`/fornecedores/contratacoes`}
            className="text-[var(--gold)] hover:underline"
          >
            Ver no módulo Fornecedores
          </Link>
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-3 p-5">
          <h2 className="font-semibold text-[var(--navy)]">Comprovante de pagamento</h2>
          {commitment.status === "PAID" ? (
            <p className="text-sm text-emerald-700">Pagamento registrado.</p>
          ) : (
            <ProofUploadForm
              commitmentId={commitment.id}
              kind="PAYMENT_PROOF"
              label="PDF ou imagem do comprovante"
            />
          )}
        </div>
        <div className="card space-y-3 p-5">
          <h2 className="font-semibold text-[var(--navy)]">
            Comprovante de impostos (opcional)
          </h2>
          <ProofUploadForm
            commitmentId={commitment.id}
            kind="TAX_PROOF"
            label="PDF ou imagem"
          />
        </div>
      </div>

      {commitment.documents.length > 0 ? (
        <div className="card p-5">
          <h2 className="mb-2 font-semibold text-[var(--navy)]">Arquivos</h2>
          <ul className="space-y-1 text-sm text-[var(--gray-600)]">
            {commitment.documents.map((d) => (
              <li key={d.id}>
                {d.kind} · {d.filename} · {(d.byteSize / 1024).toFixed(1)} KB
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
