import { prisma } from "@/lib/db";
import {
  flattenHomologatedPlanilha,
  type HomologatedLine,
} from "@/lib/planning/homologada";
import {
  fetchHomologatedLinesFromSalic,
  fetchReadequadaLinesFromSalic,
  HomologadaImportError,
} from "@/lib/planning/federal/import-homologada";
import {
  applyCaptacaoToPlanningProject,
  fetchCaptacaoOnPage,
  type SalicCaptacaoValues,
} from "@/lib/planning/federal/captacao-salic";
import { budgetLineIdentityKey, moneyN } from "@/lib/planning/readequacao";
import { persistHomologatedSheet } from "@/lib/planning/persist-sheet";
import {
  fetchJsonAllowError,
  withAccountBrowser,
} from "@/lib/salic/crawler";

type BrowserPage = Parameters<Parameters<typeof withAccountBrowser>[3]>[0];

export type PreferredSheetResult = {
  lines: HomologatedLine[];
  totalApproved: number;
  importSource: "SALIC_READEQUADA" | "SALIC_HOMOLOGADA";
  captacao?: SalicCaptacaoValues | null;
  projectName?: string | null;
  idPronacHash?: string | null;
};

function sheetTotal(lines: HomologatedLine[]): number {
  return (
    Math.round(lines.reduce((s, l) => s + moneyN(l.approvedAmount), 0) * 100) /
    100
  );
}

function isUsableSheet(lines: HomologatedLine[]): boolean {
  return lines.length > 0 && sheetTotal(lines) >= 0.005;
}

async function tryReadequadaOnPage(
  page: BrowserPage,
  idPronac: number | string,
): Promise<HomologatedLine[] | null> {
  const candidates = [
    `/projeto/orcamento/obter-planilha-readequada-ajax?idPronac=${idPronac}`,
    `/projeto/orcamento/planilha-readequada?idPronac=${idPronac}`,
    `/planilha-readequada?idPronac=${idPronac}`,
  ];
  for (const url of candidates) {
    const res = await fetchJsonAllowError(page, url);
    if (res.status === 412 || !res.ok) continue;
    const payload = res.json as { success?: string; data?: unknown; msg?: string };
    if (payload.success === "false" || payload.data == null) continue;
    const flat = flattenHomologatedPlanilha(payload.data);
    if (isUsableSheet(flat.lines)) return flat.lines;
  }
  return null;
}

async function tryHomologadaOnPage(
  page: BrowserPage,
  idPronac: number | string,
): Promise<HomologatedLine[] | null> {
  const url = `/projeto/orcamento/obter-planilha-homologada-ajax?idPronac=${idPronac}`;
  const res = await fetchJsonAllowError(page, url);
  if (res.status === 412 || !res.ok) return null;
  const payload = res.json as { success?: string; data?: unknown };
  if (payload.success === "false" || payload.data == null) return null;
  const flat = flattenHomologatedPlanilha(payload.data);
  if (isUsableSheet(flat.lines)) return flat.lines;
  return null;
}

/** Preferência: readequada válida; senão homologada. */
export async function resolvePreferredSheetOnPage(
  page: BrowserPage,
  idPronac: number | string,
  opts?: { idPronacHash?: string | null },
): Promise<PreferredSheetResult | null> {
  const readequada = await tryReadequadaOnPage(page, idPronac);
  if (readequada) {
    let captacao: SalicCaptacaoValues | null = null;
    if (opts?.idPronacHash) {
      try {
        captacao = await fetchCaptacaoOnPage(page, opts.idPronacHash);
      } catch {
        captacao = null;
      }
    }
    return {
      lines: readequada,
      totalApproved: sheetTotal(readequada),
      importSource: "SALIC_READEQUADA",
      captacao,
    };
  }

  const homologada = await tryHomologadaOnPage(page, idPronac);
  if (!homologada) return null;

  let captacao: SalicCaptacaoValues | null = null;
  if (opts?.idPronacHash) {
    try {
      captacao = await fetchCaptacaoOnPage(page, opts.idPronacHash);
    } catch {
      captacao = null;
    }
  }
  return {
    lines: homologada,
    totalApproved: sheetTotal(homologada),
    importSource: "SALIC_HOMOLOGADA",
    captacao,
  };
}

/**
 * Aplica planilha do SALIC ao planejamento:
 * - atualiza homologatedAmount quando diverge;
 * - approvedAmount só se ainda igual ao homologado antigo (sem redistribuição);
 * - não apaga linhas com reserva/pagamento;
 * - não reduz homologado abaixo do reservado/pago.
 */
export async function applyPlanningSheetFromSalic(params: {
  planningProjectId: string;
  lines: HomologatedLine[];
  importSource: "SALIC_READEQUADA" | "SALIC_HOMOLOGADA";
}): Promise<{ updated: number; created: number; skipped: number }> {
  const project = await prisma.planningProject.findUnique({
    where: { id: params.planningProjectId },
    include: {
      sheet: { include: { lines: { orderBy: { sortOrder: "asc" } } } },
      commitments: {
        where: { status: { in: ["RESERVED", "PAID"] } },
        select: { budgetLineId: true, amount: true },
      },
    },
  });
  if (!project?.sheet) {
    throw new HomologadaImportError("Projeto sem planilha");
  }
  if (!isUsableSheet(params.lines)) {
    throw new HomologadaImportError("Planilha do SALIC vazia ou zerada");
  }

  const reservedByLine = new Map<string, number>();
  for (const c of project.commitments) {
    reservedByLine.set(
      c.budgetLineId,
      (reservedByLine.get(c.budgetLineId) || 0) + moneyN(c.amount),
    );
  }

  const existingByAprovacaoId = new Map(
    project.sheet.lines
      .filter((l) => l.planilhaAprovacaoId)
      .map((l) => [String(l.planilhaAprovacaoId).trim(), l] as const),
  );
  const existingByComposite = new Map(
    project.sheet.lines.map(
      (l) =>
        [budgetLineIdentityKey({ ...l, planilhaAprovacaoId: null }), l] as const,
    ),
  );

  function matchExisting(salic: HomologatedLine) {
    const byId = salic.planilhaAprovacaoId
      ? existingByAprovacaoId.get(String(salic.planilhaAprovacaoId).trim())
      : undefined;
    if (byId) return byId;
    return existingByComposite.get(
      budgetLineIdentityKey({ ...salic, planilhaAprovacaoId: null }),
    );
  }

  const now = new Date();
  const sheetId = project.sheet.id;
  let updated = 0;
  let created = 0;
  let skipped = 0;

  await prisma.$transaction(async (tx) => {
    let sortOrder = 0;
    let totalApproved = 0;
    const keepIds = new Set<string>();

    for (const l of params.lines) {
      const amount = moneyN(l.approvedAmount);
      totalApproved += amount;
      const existing = matchExisting(l);

      if (existing) {
        const reserved = reservedByLine.get(existing.id) || 0;
        if (reserved > amount + 1e-6) {
          skipped += 1;
          keepIds.add(existing.id);
          sortOrder += 1;
          continue;
        }

        const oldHomologated = moneyN(existing.homologatedAmount);
        const oldApproved = moneyN(existing.approvedAmount);
        const untouchedApproved = Math.abs(oldApproved - oldHomologated) < 0.015;
        const nextApproved = untouchedApproved ? amount : oldApproved;

        const same =
          Math.abs(oldHomologated - amount) < 0.015 &&
          Math.abs(oldApproved - nextApproved) < 0.015 &&
          String(existing.planilhaAprovacaoId || "") ===
            String(l.planilhaAprovacaoId || "");

        if (!same) {
          await tx.projectBudgetLine.update({
            where: { id: existing.id },
            data: {
              planilhaAprovacaoId: l.planilhaAprovacaoId,
              fonteRecurso: l.fonteRecurso,
              productName: l.productName,
              stageName: l.stageName,
              state: l.state,
              city: l.city,
              itemName: l.itemName,
              categoryHint: l.categoryHint,
              unit: l.unit || "Unidade",
              days: l.days || 1,
              quantity: l.quantity || 1,
              occurrences: l.occurrences || 1,
              unitPrice: l.unitPrice || 0,
              homologatedAmount: amount,
              approvedAmount: nextApproved,
              salicComprovado: l.salicComprovado,
              sortOrder,
            },
          });
          updated += 1;
        } else {
          await tx.projectBudgetLine.update({
            where: { id: existing.id },
            data: { sortOrder },
          });
        }
        keepIds.add(existing.id);
      } else {
        await tx.projectBudgetLine.create({
          data: {
            sheetId,
            planilhaAprovacaoId: l.planilhaAprovacaoId,
            fonteRecurso: l.fonteRecurso,
            productName: l.productName,
            stageName: l.stageName,
            state: l.state,
            city: l.city,
            itemName: l.itemName,
            categoryHint: l.categoryHint,
            unit: l.unit || "Unidade",
            days: l.days || 1,
            quantity: l.quantity || 1,
            occurrences: l.occurrences || 1,
            unitPrice: l.unitPrice || 0,
            homologatedAmount: amount,
            approvedAmount: amount,
            salicComprovado: l.salicComprovado,
            sortOrder,
          },
        });
        created += 1;
      }
      sortOrder += 1;
    }

    const staleIds = project.sheet!.lines
      .filter((l) => !keepIds.has(l.id))
      .filter((l) => !(reservedByLine.get(l.id) || 0))
      .map((l) => l.id);
    if (staleIds.length > 0) {
      await tx.projectBudgetLine.deleteMany({
        where: { id: { in: staleIds }, sheetId },
      });
    }

    const remaining = await tx.projectBudgetLine.findMany({
      where: { sheetId },
      select: { approvedAmount: true },
    });
    const sheetTotalApproved =
      Math.round(
        remaining.reduce((s, l) => s + moneyN(l.approvedAmount), 0) * 100,
      ) / 100;

    await tx.projectBudgetSheet.update({
      where: { id: sheetId },
      data: {
        totalApproved: sheetTotalApproved || Math.round(totalApproved * 100) / 100,
        importedAt: now,
        sourceFilename:
          params.importSource === "SALIC_READEQUADA"
            ? "SALIC planilha readequada"
            : "SALIC planilha homologada",
        available: true,
      },
    });

    await tx.planningProject.update({
      where: { id: params.planningProjectId },
      data: {
        importSource: params.importSource,
        importedAt: now,
      },
    });
  });

  return { updated, created, skipped };
}

/** Sync de planilha + captado (abre browser se preciso). */
export async function syncPlanningSheetFromSalic(params: {
  planningProjectId: string;
}): Promise<{
  importSource: "SALIC_READEQUADA" | "SALIC_HOMOLOGADA";
  updated: number;
  created: number;
  skipped: number;
}> {
  const project = await prisma.planningProject.findUniqueOrThrow({
    where: { id: params.planningProjectId },
  });
  if (project.jurisdiction !== "FEDERAL") {
    throw new HomologadaImportError("Só para projetos federais");
  }

  let preferred: PreferredSheetResult | null = null;

  try {
    const readequada = await fetchReadequadaLinesFromSalic({
      accountId: project.accountId,
      pronac: project.externalCode,
    });
    const lines = readequada.map((l) => ({
      ...l,
      approvedAmount: moneyN(l.approvedAmount ?? l.homologatedAmount),
    }));
    if (isUsableSheet(lines)) {
      preferred = {
        lines,
        totalApproved: sheetTotal(lines),
        importSource: "SALIC_READEQUADA",
      };
    }
  } catch {
    preferred = null;
  }

  if (!preferred) {
    const homologada = await fetchHomologatedLinesFromSalic({
      accountId: project.accountId,
      pronac: project.externalCode,
    });
    if (!isUsableSheet(homologada.lines)) {
      throw new HomologadaImportError("Nenhuma planilha utilizável no SALIC");
    }
    preferred = {
      lines: homologada.lines,
      totalApproved: homologada.totalApproved,
      importSource: "SALIC_HOMOLOGADA",
      captacao: homologada.captacao,
      projectName: homologada.projectName,
      idPronacHash: homologada.idPronacHash,
    };
  }

  const stats = await applyPlanningSheetFromSalic({
    planningProjectId: params.planningProjectId,
    lines: preferred.lines,
    importSource: preferred.importSource,
  });

  if (preferred.captacao) {
    await applyCaptacaoToPlanningProject({
      planningProjectId: params.planningProjectId,
      captacao: preferred.captacao,
    });
  } else if (preferred.importSource === "SALIC_READEQUADA") {
    try {
      const homologada = await fetchHomologatedLinesFromSalic({
        accountId: project.accountId,
        pronac: project.externalCode,
      });
      if (homologada.captacao) {
        await applyCaptacaoToPlanningProject({
          planningProjectId: params.planningProjectId,
          captacao: homologada.captacao,
        });
      }
    } catch {
      // captacao opcional
    }
  }

  return { importSource: preferred.importSource, ...stats };
}

/** Primeiro import (onboard): escolhe readequada ou homologada. */
export async function importPreferredSheetForNewProject(params: {
  accountId: string;
  pronac: string;
  planningProjectId: string;
}): Promise<PreferredSheetResult> {
  let preferred: PreferredSheetResult | null = null;
  try {
    const readequada = await fetchReadequadaLinesFromSalic({
      accountId: params.accountId,
      pronac: params.pronac,
    });
    const lines = readequada.map((l) => ({
      ...l,
      approvedAmount: moneyN(l.approvedAmount ?? l.homologatedAmount),
    }));
    if (isUsableSheet(lines)) {
      preferred = {
        lines,
        totalApproved: sheetTotal(lines),
        importSource: "SALIC_READEQUADA",
      };
    }
  } catch {
    preferred = null;
  }

  if (!preferred) {
    const homologada = await fetchHomologatedLinesFromSalic({
      accountId: params.accountId,
      pronac: params.pronac,
    });
    preferred = {
      lines: homologada.lines,
      totalApproved: homologada.totalApproved,
      importSource: "SALIC_HOMOLOGADA",
      captacao: homologada.captacao,
      projectName: homologada.projectName,
      idPronacHash: homologada.idPronacHash,
    };
  }

  await persistHomologatedSheet({
    planningProjectId: params.planningProjectId,
    lines: preferred.lines,
    totalApproved: preferred.totalApproved,
    importSource: preferred.importSource,
  });

  if (preferred.captacao) {
    await applyCaptacaoToPlanningProject({
      planningProjectId: params.planningProjectId,
      captacao: preferred.captacao,
    });
  } else if (preferred.importSource === "SALIC_READEQUADA") {
    try {
      const homologada = await fetchHomologatedLinesFromSalic({
        accountId: params.accountId,
        pronac: params.pronac,
      });
      preferred.projectName = preferred.projectName || homologada.projectName;
      preferred.idPronacHash = preferred.idPronacHash || homologada.idPronacHash;
      if (homologada.captacao) {
        await applyCaptacaoToPlanningProject({
          planningProjectId: params.planningProjectId,
          captacao: homologada.captacao,
        });
        preferred.captacao = homologada.captacao;
      }
    } catch {
      // ok
    }
  }

  return preferred;
}

/** Sync de planilha durante crawler (página já autenticada). */
export async function syncPlanningSheetOnPage(params: {
  page: BrowserPage;
  planningProjectId: string;
  idPronac: number | string;
  idPronacHash?: string | null;
}): Promise<{
  importSource: "SALIC_READEQUADA" | "SALIC_HOMOLOGADA";
  updated: number;
  created: number;
  skipped: number;
} | null> {
  const preferred = await resolvePreferredSheetOnPage(
    params.page,
    params.idPronac,
    { idPronacHash: params.idPronacHash },
  );
  if (!preferred) return null;

  const stats = await applyPlanningSheetFromSalic({
    planningProjectId: params.planningProjectId,
    lines: preferred.lines,
    importSource: preferred.importSource,
  });

  if (preferred.captacao) {
    await applyCaptacaoToPlanningProject({
      planningProjectId: params.planningProjectId,
      captacao: preferred.captacao,
    });
  }

  return { importSource: preferred.importSource, ...stats };
}
