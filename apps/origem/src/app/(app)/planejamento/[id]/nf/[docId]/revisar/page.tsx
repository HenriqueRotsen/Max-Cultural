import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { NfReviewForm } from "@/components/planning/NfReviewForm";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { computeProjectBalance } from "@/lib/planning/rubric-balance";
import { lookupCnpj } from "@/lib/catalog/brasil-api";
import { normalizeCgccpf } from "@/lib/format";
import type { ExtractedNf } from "@/lib/nf/extract";
import { extractPaymentDetails } from "@/lib/nf/payment-details";

export const dynamic = "force-dynamic";

export default async function RevisarNfPage({
  params,
}: {
  params: Promise<{ id: string; docId: string }>;
}) {
  const { id, docId } = await params;
  const { entitlements } = await getWorkspaceContext();
  const doc = await prisma.planningDocument.findFirst({
    where: {
      id: docId,
      planningProjectId: id,
      workspaceId: entitlements.workspaceId,
      kind: "NF",
    },
  });
  if (!doc) notFound();

  const project = await prisma.planningProject.findFirst({
    where: { id, workspaceId: entitlements.workspaceId },
    include: {
      sheet: { include: { lines: { orderBy: { sortOrder: "asc" } } } },
      commitments: {
        where: { status: { in: ["RESERVED", "PAID"] } },
        select: { budgetLineId: true, amount: true, status: true },
      },
    },
  });
  if (!project?.sheet) notFound();

  const bal = computeProjectBalance({
    lines: project.sheet.lines,
    commitments: project.commitments,
  });
  const lineOpts = project.sheet.lines
    .map((l) => {
      const b = bal.lines.get(l.id)!;
      return {
        id: l.id,
        label: `${l.stageName} · ${l.itemName}`,
        available: b.available,
      };
    })
    .filter((l) => l.available > 0);

  let extracted = (doc.extractedJson || { items: [] }) as ExtractedNf;
  if (!extracted.payment) {
    extracted = {
      ...extracted,
      payment: extractPaymentDetails(
        [extracted.serviceDescription, extracted.items?.[0]?.name]
          .filter(Boolean)
          .join("\n"),
      ),
    };
  }

  const cnpj = normalizeCgccpf(extracted.cnpj || "");
  if (cnpj.length === 14 && !extracted.cnaeCode) {
    const company = await lookupCnpj(cnpj);
    if (company?.cnaeCode) {
      extracted = {
        ...extracted,
        cnaeCode: company.cnaeCode,
        cnaeDescription: extracted.cnaeDescription || company.cnaeDescription,
      };
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={
          <>
            <Link href={`/planejamento/${id}`}>{project.externalCode}</Link> / Revisar NF
          </>
        }
        title="Revisar e reservar"
        description={doc.filename}
      />
      <NfReviewForm
        documentId={doc.id}
        extracted={extracted}
        lines={lineOpts}
        complianceWarning={
          extracted.notes?.includes("sem texto")
            ? "PDF sem texto — preencha os campos manualmente."
            : null
        }
      />
    </div>
  );
}
