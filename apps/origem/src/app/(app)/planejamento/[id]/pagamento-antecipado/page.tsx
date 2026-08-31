import Link from "next/link";
import { notFound } from "next/navigation";
import { PageBackLink } from "@/components/ui";
import { AdvancePaymentForm } from "@/components/planning/AdvancePaymentForm";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getNotificationPrefs } from "@/lib/planning/notification-prefs";
import { defaultNfReminderDate } from "@/lib/planning/reminder-dates";
import {
  computeProjectBalance,
  isAdminProduct,
} from "@/lib/planning/rubric-balance";
import { rubricSelectLabel } from "@/lib/planning/rubric-label";
import type { RubricSelectOption } from "@/components/planning/RubricSearchSelect";

export const dynamic = "force-dynamic";

export default async function PagamentoAntecipadoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { entitlements, session } = await getWorkspaceContext();
  const prefs = await getNotificationPrefs(
    entitlements.workspaceId,
    session?.id,
  );
  const defaultNfReminderAt = defaultNfReminderDate(prefs.nfPendingDaysAfterPaid);

  const project = await prisma.planningProject.findFirst({
    where: { id, workspaceId: entitlements.workspaceId },
    include: {
      sheet: { include: { lines: { orderBy: { sortOrder: "asc" } } } },
      project: { select: { valorCaptado: true } },
      commitments: {
        where: { status: { in: ["RESERVED", "PAID"] } },
        select: { budgetLineId: true, amount: true, status: true },
      },
    },
  });
  if (!project?.sheet) notFound();

  const valorCaptado =
    project.project?.valorCaptado != null
      ? Number(project.project.valorCaptado)
      : 0;
  const bal = computeProjectBalance({
    lines: project.sheet.lines,
    commitments: project.commitments,
    valorCaptado,
    captadoRecebido: project.captadoRecebido,
    captadoTransferido: project.captadoTransferido,
    rendimentos: project.rendimentos,
  });

  const rubricOptions: RubricSelectOption[] = project.sheet.lines.map((l) => {
    const lineBal = bal.lines.get(l.id);
    return {
      id: l.id,
      label: rubricSelectLabel(l),
      sortOrder: l.sortOrder,
      available: lineBal?.available ?? 0,
      isAdmin: isAdminProduct(l.productName),
      stageName: l.stageName,
      itemName: l.itemName,
      productName: l.productName,
      city: l.city,
      state: l.state,
      categoryHint: l.categoryHint,
    };
  });

  return (
    <div className="space-y-6">
      <PageBackLink href={`/planejamento/${id}`} label="Voltar ao projeto" />
      <div className="flex flex-wrap items-start gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--navy)] to-[#2d4a8a] text-white shadow-md">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect
              x="2"
              y="5"
              width="20"
              height="14"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <path d="M2 10h20" stroke="currentColor" strokeWidth="1.8" />
            <path
              d="M6 15h4"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-[var(--gray-400)]">
            <Link href="/planejamento" className="hover:text-[var(--navy)]">
              Planejamento
            </Link>
            {" / "}
            <Link
              href={`/planejamento/${id}`}
              className="hover:text-[var(--navy)]"
            >
              {project.externalCode}
            </Link>
            {" / Pagamento antecipado"}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--navy)]">
            Pagamento sem NF
          </h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--gray-500)]">
            Para quando o fornecedor já foi pago, mas a nota fiscal ainda não
            chegou. O valor entra no saldo agora; a NF fica para depois.
          </p>
        </div>
        <Link
          href={`/planejamento/${id}/nf/nova`}
          className="btn btn-ghost shrink-0 text-sm"
        >
          Prefiro subir NF primeiro →
        </Link>
      </div>

      <AdvancePaymentForm
        planningProjectId={id}
        lines={rubricOptions.filter((l) => l.available > 0 || l.isAdmin)}
        defaultNfReminderAt={defaultNfReminderAt}
      />
    </div>
  );
}
