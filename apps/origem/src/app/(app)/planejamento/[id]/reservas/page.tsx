import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import {
  ReservationsList,
  type ReservationRow,
} from "@/components/planning/ReservationsList";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { canPublishToSalic } from "@/lib/planning/acl";
import { isFederalPlanning } from "@/lib/planning/lifecycle";
import {
  buildSalicPublishPackages,
  type SalicPublishDoc,
} from "@/lib/planning/federal/salic-publish-packages";
import { buildSalicUploadFilenameForRow } from "@/lib/salic/salic-publish-metadata";
import { ensureFiscalDocumentNumber } from "@/lib/nf/ensure-fiscal-number";
import { resolveFiscalNumberFromExtracted } from "@/lib/nf/fiscal-number";

export const dynamic = "force-dynamic";

function salicStateForCommitment(
  commitment: {
    id: string;
    status: string;
    nfPending: boolean;
  },
  proof: SalicPublishDoc | null,
  packages: ReturnType<typeof buildSalicPublishPackages>,
  fiscal: {
    uploadFilename: string | null;
    fiscalDocumentId: string | null;
    fiscalKind: "NF" | "RPA" | null;
    fiscalNumber: string | null;
  },
): ReservationRow["salic"] {
  const emptyFiscal = {
    uploadFilename: null as string | null,
    fiscalDocumentId: null as string | null,
    fiscalKind: null as "NF" | "RPA" | null,
    fiscalNumber: null as string | null,
  };
  if (commitment.status !== "PAID") {
    return {
      canUpload: false,
      uploaded: false,
      publishMode: null,
      reason: "Registre o pagamento (comprovante) antes de enviar ao SALIC.",
      proofId: null,
      ...emptyFiscal,
    };
  }
  if (commitment.nfPending) {
    return {
      canUpload: false,
      uploaded: false,
      publishMode: null,
      reason: "Anexe a NF/RPA antes de enviar ao SALIC.",
      proofId: null,
      ...emptyFiscal,
    };
  }
  if (!proof) {
    return {
      canUpload: false,
      uploaded: false,
      publishMode: null,
      reason: "Comprovante de pagamento ainda não importado.",
      proofId: null,
      ...emptyFiscal,
    };
  }

  const pkg = packages.find((p) => p.proofId === proof.id);
  const uploaded = Boolean(proof.salicComprovanteId);
  const pendingMode =
    pkg?.action === "UPLOAD_PROOF_ONLY"
      ? "PROOF_ONLY"
      : pkg?.action === "UPLOAD_MERGED" || pkg?.action === "REPUBLISH_MERGED"
        ? "MERGED"
        : proof.salicPublishMode;

  if (!pkg) {
    if (uploaded && proof.salicPublishMode === "MERGED") {
      return {
        canUpload: false,
        uploaded: true,
        publishMode: proof.salicPublishMode,
        reason: null,
        proofId: proof.id,
        ...fiscal,
      };
    }
    return {
      canUpload: false,
      uploaded,
      publishMode: proof.salicPublishMode,
      reason: uploaded ? "Já enviado ao SALIC." : null,
      proofId: proof.id,
      ...fiscal,
    };
  }

  return {
    canUpload: true,
    uploaded,
    publishMode: pendingMode,
    reason: uploaded ? "Republicar versão atualizada (NF + comprovante)." : null,
    proofId: proof.id,
    ...fiscal,
  };
}

export default async function PlanningReservasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { entitlements } = await getWorkspaceContext();

  const project = await prisma.planningProject.findFirst({
    where: { id, workspaceId: entitlements.workspaceId },
    select: { id: true, externalCode: true, name: true, jurisdiction: true },
  });
  if (!project) notFound();

  const isFederal = isFederalPlanning(project.jurisdiction);
  const canPublishSalic = isFederal && (await canPublishToSalic());

  const [commitments, salicDocs] = await Promise.all([
    prisma.rubricCommitment.findMany({
      where: {
        planningProjectId: id,
        workspaceId: entitlements.workspaceId,
        status: { in: ["RESERVED", "PAID", "CANCELLED"] },
      },
      orderBy: { createdAt: "desc" },
      include: {
        budgetLine: {
          select: {
            sortOrder: true,
            itemName: true,
            stageName: true,
            productName: true,
          },
        },
        engagement: {
          select: {
            service: {
              select: {
                name: true,
                supplier: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
    prisma.planningDocument.findMany({
      where: {
        planningProjectId: id,
        status: "IMPORTED",
        kind: "PAYMENT_PROOF",
      },
      select: {
        id: true,
        kind: true,
        status: true,
        filename: true,
        mimeType: true,
        storagePath: true,
        sourceDocumentId: true,
        salicComprovanteId: true,
        salicPublishMode: true,
        salicRepublishPending: true,
        commitmentId: true,
        allocations: { select: { commitmentId: true } },
      },
    }),
  ]);

  const salicDocRows: SalicPublishDoc[] = await prisma.planningDocument.findMany({
    where: { planningProjectId: id, status: "IMPORTED" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      kind: true,
      status: true,
      filename: true,
      mimeType: true,
      storagePath: true,
      sourceDocumentId: true,
      salicComprovanteId: true,
      salicPublishMode: true,
      salicRepublishPending: true,
    },
  });
  const packages = buildSalicPublishPackages(salicDocRows);

  const fiscalSourceIds = [
    ...new Set(
      salicDocs
        .map((d) => d.sourceDocumentId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const fiscalById = new Map(
    (
      await prisma.planningDocument.findMany({
        where: { id: { in: fiscalSourceIds } },
        select: {
          id: true,
          kind: true,
          filename: true,
          mimeType: true,
          storagePath: true,
          extractedJson: true,
        },
      })
    ).map((d) => [d.id, d] as const),
  );

  await Promise.all(
    [...fiscalById.values()].map((fiscal) => ensureFiscalDocumentNumber(fiscal)),
  );

  // Recarrega extractedJson após possível backfill do número da NF.
  const refreshedFiscals = await prisma.planningDocument.findMany({
    where: { id: { in: fiscalSourceIds } },
    select: { id: true, kind: true, extractedJson: true },
  });
  for (const f of refreshedFiscals) {
    fiscalById.set(f.id, { ...fiscalById.get(f.id)!, ...f });
  }

  function salicUploadFilename(
    proof: (typeof salicDocs)[number],
    supplierName: string,
    sortOrder: number,
  ): string | null {
    const fiscal = proof.sourceDocumentId
      ? fiscalById.get(proof.sourceDocumentId)
      : null;
    const fiscalKind =
      fiscal?.kind === "NF" || fiscal?.kind === "RPA" ? fiscal.kind : null;
    return buildSalicUploadFilenameForRow({
      sortOrder,
      supplierName,
      fiscalExtracted: (fiscal?.extractedJson || null) as {
        nfNumber?: string | null;
        invoiceNumber?: string | null;
      },
      fiscalKind,
    });
  }

  function salicFiscalMeta(
    proof: (typeof salicDocs)[number] | undefined,
    supplierName: string,
    sortOrder: number,
  ) {
    if (!proof) {
      return {
        uploadFilename: null,
        fiscalDocumentId: null,
        fiscalKind: null as "NF" | "RPA" | null,
        fiscalNumber: null as string | null,
      };
    }
    const fiscal = proof.sourceDocumentId
      ? fiscalById.get(proof.sourceDocumentId)
      : null;
    const fiscalKind =
      fiscal?.kind === "NF" || fiscal?.kind === "RPA" ? fiscal.kind : null;
    const fiscalNumber = fiscal
      ? resolveFiscalNumberFromExtracted(
          (fiscal.extractedJson || null) as {
            fiscalNumber?: string | null;
            nfNumber?: string | null;
            invoiceNumber?: string | null;
            nfseNumber?: string | null;
            rpsNumber?: string | null;
          },
          fiscalKind,
        )
      : null;
    return {
      fiscalDocumentId: fiscal?.id ?? null,
      fiscalKind,
      fiscalNumber,
      uploadFilename: salicUploadFilename(proof, supplierName, sortOrder),
    };
  }

  const proofByCommitment = new Map<string, SalicPublishDoc>();
  const proofDocByCommitment = new Map<string, (typeof salicDocs)[number]>();
  for (const doc of salicDocs) {
    const proof: SalicPublishDoc = {
      id: doc.id,
      kind: doc.kind,
      status: doc.status,
      filename: doc.filename,
      mimeType: doc.mimeType,
      storagePath: doc.storagePath,
      sourceDocumentId: doc.sourceDocumentId,
      salicComprovanteId: doc.salicComprovanteId,
      salicPublishMode: doc.salicPublishMode,
      salicRepublishPending: doc.salicRepublishPending,
    };
    if (doc.commitmentId) {
      proofByCommitment.set(doc.commitmentId, proof);
      proofDocByCommitment.set(doc.commitmentId, doc);
    }
    for (const a of doc.allocations) {
      proofByCommitment.set(a.commitmentId, proof);
      proofDocByCommitment.set(a.commitmentId, doc);
    }
  }

  const rows: ReservationRow[] = commitments.map((c) => ({
    id: c.id,
    amount: Number(c.amount),
    status: c.status,
    nfPending: c.nfPending,
    createdAt: c.createdAt.toISOString(),
    paidAt: c.paidAt?.toISOString() ?? null,
    supplierName: c.engagement.service.supplier.name,
    serviceName: c.engagement.service.name,
    budgetLine: c.budgetLine,
    salic: salicStateForCommitment(
      c,
      proofByCommitment.get(c.id) ?? null,
      packages,
      salicFiscalMeta(
        proofDocByCommitment.get(c.id),
        c.engagement.service.supplier.name,
        c.budgetLine.sortOrder,
      ),
    ),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        backHref={`/planejamento/${project.id}`}
        breadcrumb={
          <>
            <Link href="/planejamento">Planejamento</Link> /{" "}
            <Link href={`/planejamento/${project.id}`}>{project.externalCode}</Link> / Reservas
          </>
        }
        title="Reservas"
        description={project.name || project.externalCode}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/planejamento/${project.id}/pagamento-antecipado`}
              className="btn btn-ghost"
            >
              Pagamento sem NF
            </Link>
            <Link href={`/planejamento/${project.id}/nf/nova`} className="btn">
              Subir NF/RPA
            </Link>
          </div>
        }
      />

      <ReservationsList
        planningProjectId={project.id}
        isFederal={isFederal}
        canPublishSalic={canPublishSalic}
        rows={rows}
      />
    </div>
  );
}
