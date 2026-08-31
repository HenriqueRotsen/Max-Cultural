import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { DeleteNfButton } from "@/components/planning/DeleteNfButton";
import { EditFiscalNumberForm } from "@/components/planning/EditFiscalNumberForm";
import { ProofUploadForm } from "@/components/planning/ProofUploadForm";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import { resolveFiscalNumberFromExtracted } from "@/lib/nf/fiscal-number";
import { canDeleteNf } from "@/lib/planning/acl";
import {
  commitmentStatusLabel,
  nfPendingBadge,
} from "@/lib/planning/lifecycle";

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
      allocations: {
        where: {
          document: { kind: { in: ["NF", "RPA"] }, status: "IMPORTED" },
        },
        take: 1,
        select: { documentId: true },
      },
    },
  });
  if (!commitment) notFound();

  const sourceDocumentId =
    commitment.allocations[0]?.documentId ||
    commitment.documents.find((d) => d.kind === "NF" || d.kind === "RPA")?.id ||
    null;

  const sourceNf = sourceDocumentId
    ? await prisma.planningDocument.findFirst({
        where: {
          id: sourceDocumentId,
          workspaceId: entitlements.workspaceId,
          kind: { in: ["NF", "RPA"] },
        },
        include: {
          allocations: {
            include: {
              budgetLine: { select: { itemName: true, stageName: true } },
              commitment: {
                select: { id: true, amount: true, status: true },
              },
            },
            orderBy: { sharePct: "desc" },
          },
        },
      })
    : null;

  const paymentProof =
    !sourceNf && commitment.nfPending
      ? await prisma.planningDocument.findFirst({
          where: {
            workspaceId: entitlements.workspaceId,
            kind: "PAYMENT_PROOF",
            OR: [
              { commitmentId: commitment.id },
              { allocations: { some: { commitmentId: commitment.id } } },
            ],
          },
          include: {
            allocations: {
              include: {
                budgetLine: { select: { itemName: true, stageName: true } },
                commitment: {
                  select: { id: true, amount: true, status: true },
                },
              },
              orderBy: { sharePct: "desc" },
            },
          },
        })
      : null;

  const supplier = commitment.engagement.service.supplier;
  const siblingSlices =
    sourceNf?.allocations ?? paymentProof?.allocations ?? [];
  const multiRubric = siblingSlices.length > 1;
  const hasPaymentProof = commitment.documents.some(
    (d) => d.kind === "PAYMENT_PROOF",
  );
  const hasTaxProof = commitment.documents.some((d) => d.kind === "TAX_PROOF");
  const nfHasLinkedProof = sourceNf
    ? (await prisma.planningDocument.count({
        where: {
          workspaceId: entitlements.workspaceId,
          kind: { in: ["PAYMENT_PROOF", "TAX_PROOF"] },
          OR: [
            { sourceDocumentId: sourceNf.id },
            {
              allocations: {
                some: {
                  commitmentId: {
                    in: siblingSlices.map((s) => s.commitmentId),
                  },
                },
              },
            },
          ],
        },
      })) > 0
    : false;
  const allowDeleteNf = (await canDeleteNf()) && Boolean(sourceNf) && !nfHasLinkedProof;
  const paidViaGroup =
    commitment.status === "PAID" &&
    !hasPaymentProof &&
    !paymentProof &&
    siblingSlices.some((s) => s.commitmentId !== commitment.id);

  return (
    <div className="space-y-6">
      <PageHeader
        backHref={`/planejamento/${commitment.planningProject.id}/reservas`}
        breadcrumb={
          <>
            <Link href="/planejamento">Planejamento</Link> /{" "}
            <Link href={`/planejamento/${commitment.planningProject.id}`}>
              {commitment.planningProject.externalCode}
            </Link>{" "}
            / Reserva
          </>
        }
        title={
          <>
            {commitmentStatusLabel(commitment.status)} ·{" "}
            {formatCurrency(Number(commitment.amount))}
            {commitment.nfPending ? (
              <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
                {nfPendingBadge()}
              </span>
            ) : null}
          </>
        }
        description={`${supplier.name} · ${commitment.engagement.service.name}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {commitment.nfPending ? (
              <Link
                href={`/planejamento/compromissos/${commitment.id}/anexar-nf`}
                className="btn"
              >
                Anexar NF/RPA
              </Link>
            ) : null}
            {allowDeleteNf && sourceNf ? (
              <DeleteNfButton
                documentId={sourceNf.id}
                documentKind={sourceNf.kind}
                filename={sourceNf.filename}
                redirectTo={`/planejamento/${commitment.planningProject.id}`}
              />
            ) : null}
          </div>
        }
      />

      <div className="card space-y-2 p-5 text-sm">
        <p>
          <span className="text-[var(--gray-500)]">Rubrica:</span>{" "}
          {commitment.budgetLine.stageName} · {commitment.budgetLine.itemName}
          {commitment.allocationSharePct != null
            ? ` · ${Number(commitment.allocationSharePct)}%`
            : ""}
        </p>
        {sourceNf ? (
          <>
            <p>
              <span className="text-[var(--gray-500)]">{sourceNf.kind}:</span>{" "}
              {sourceNf.filename}
            </p>
            <EditFiscalNumberForm
              documentId={sourceNf.id}
              kind={sourceNf.kind === "RPA" ? "RPA" : "NF"}
              currentNumber={resolveFiscalNumberFromExtracted(
                (sourceNf.extractedJson || null) as {
                  fiscalNumber?: string | null;
                  nfNumber?: string | null;
                  invoiceNumber?: string | null;
                  nfseNumber?: string | null;
                  rpsNumber?: string | null;
                },
                sourceNf.kind === "RPA" ? "RPA" : "NF",
              )}
            />
          </>
        ) : commitment.nfPending ? (
          <p className="text-red-700">
            Pagamento registrado — aguardando NF/RPA para regularizar.
          </p>
        ) : null}
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
        {commitment.paymentReminderAt ? (
          <p>
            <span className="text-[var(--gray-500)]">Lembrete de pagamento:</span>{" "}
            {formatDate(commitment.paymentReminderAt)}
          </p>
        ) : null}
        {commitment.nfReminderAt && commitment.nfPending ? (
          <p>
            <span className="text-[var(--gray-500)]">Lembrete de NF/RPA:</span>{" "}
            {formatDate(commitment.nfReminderAt)}
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

      {multiRubric ? (
        <div className="card space-y-2 p-5">
          <h2 className="font-semibold text-[var(--navy)]">
            Rateio do pagamento ({siblingSlices.length} rubricas)
          </h2>
          <p className="text-xs text-[var(--gray-500)]">
            {sourceNf
              ? `O comprovante de pagamento vale para todas as rubricas abaixo, com o mesmo percentual da ${sourceNf.kind}.`
              : "Pagamento antecipado rateado entre as rubricas abaixo. A NF/RPA deve seguir o mesmo rateio."}
          </p>
          <ul className="space-y-1 text-sm">
            {siblingSlices.map((s) => (
              <li key={s.commitmentId} className="flex flex-wrap gap-x-2">
                <Link
                  href={`/planejamento/compromissos/${s.commitmentId}`}
                  className="text-[var(--gold)] hover:underline"
                >
                  {s.budgetLine.stageName} · {s.budgetLine.itemName}
                </Link>
                <span className="tabular-nums text-[var(--gray-500)]">
                  {Number(s.sharePct)}% · {formatCurrency(Number(s.amount))} ·{" "}
                  {commitmentStatusLabel(s.commitment.status)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card space-y-3 p-5">
          <h2 className="font-semibold text-[var(--navy)]">Nota fiscal</h2>
          {sourceNf ? (
            <p className="text-sm text-emerald-700">
              {sourceNf.kind} vinculada: {sourceNf.filename}
            </p>
          ) : commitment.nfPending ? (
            <Link
              href={`/planejamento/compromissos/${commitment.id}/anexar-nf`}
              className="btn w-full justify-center"
            >
              Anexar NF/RPA
            </Link>
          ) : (
            <p className="text-sm text-[var(--gray-500)]">
              Confirme a NF/RPA na página do projeto.
            </p>
          )}
        </div>

        <div className="card space-y-3 p-5">
          <h2 className="font-semibold text-[var(--navy)]">
            Comprovante de pagamento
          </h2>
          {commitment.status === "PAID" ? (
            <p className="text-sm text-emerald-700">
              {paidViaGroup
                ? "Pagamento registrado pelo comprovante da NF/RPA (rateio compartilhado)."
                : hasPaymentProof || paymentProof
                  ? multiRubric
                    ? `Pagamento registrado e rateado em ${siblingSlices.length} rubricas.`
                    : "Pagamento registrado."
                  : "Pagamento marcado como pago."}
            </p>
          ) : !sourceNf ? (
            <p className="text-sm text-[var(--gray-500)]">
              Confirme a NF/RPA antes de enviar o comprovante.
            </p>
          ) : (
            <ProofUploadForm
              commitmentId={commitment.id}
              kind="PAYMENT_PROOF"
              label="PDF ou imagem do comprovante"
              hint={
                multiRubric
                  ? `Este arquivo será vinculado à ${sourceNf.kind} e rateado automaticamente nas ${siblingSlices.length} rubricas.`
                  : `Vinculado à ${sourceNf.kind} ${sourceNf.filename}.`
              }
            />
          )}
        </div>

        <div className="card space-y-3 p-5">
          <h2 className="font-semibold text-[var(--navy)]">
            Comprovante de impostos (guias)
          </h2>
          {hasTaxProof ? (
            <p className="text-sm text-emerald-700">Guia(s) anexada(s).</p>
          ) : sourceNf || commitment.nfPending ? (
            <ProofUploadForm
              commitmentId={commitment.id}
              kind="TAX_PROOF"
              label="PDF ou imagem da guia/DARF"
              hint={
                multiRubric
                  ? "Também segue o mesmo rateio da NF/RPA."
                  : commitment.nfPending
                    ? "Pode anexar antes da NF; será vinculado ao compromisso."
                    : undefined
              }
            />
          ) : (
            <p className="text-sm text-[var(--gray-500)]">
              Disponível após confirmar a NF/RPA.
            </p>
          )}
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
