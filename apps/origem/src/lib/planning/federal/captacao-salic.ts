/**
 * Captação de recursos (Dados do Projeto / área logada SALIC).
 * Fonte: GET /projeto/dados-projeto/get?idPronac={idPronacHash}
 * Campos: vlCaptado, vlRecebido, vlTransferido.
 */
import { prisma } from "@/lib/db";
import { decryptCredential, normalizeCgccpf } from "@/lib/crypto";
import {
  fetchJson,
  listProjectsUi,
  listProponentesUi,
  withAccountBrowser,
  type SalicUiProject,
} from "@/lib/salic/crawler";
import type { Page } from "playwright";

export class CaptacaoImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaptacaoImportError";
  }
}

export type SalicCaptacaoValues = {
  vlCaptado: number;
  vlRecebido: number;
  vlTransferido: number;
  percCaptado: number | null;
  projectName: string | null;
  idPronacHash: string;
  idPronac: number | null;
};

function parseSalicNumber(value: unknown): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, value) : 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  // SALIC às vezes manda "1.234,56" ou "1234.56"
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

type DadosProjetoPayload = {
  data?: {
    vlCaptado?: unknown;
    vlRecebido?: unknown;
    vlTransferido?: unknown;
    percCaptado?: unknown;
    PercentualCaptado?: unknown;
    NomeProjeto?: string;
    Pronac?: string;
    idPronac?: string | number;
  };
};

export function captacaoFromDadosProjeto(
  payload: DadosProjetoPayload,
  idPronacHash: string,
): SalicCaptacaoValues {
  const d = payload.data;
  if (!d) {
    throw new CaptacaoImportError("Resposta de Dados do Projeto sem data");
  }
  const percRaw = d.percCaptado ?? d.PercentualCaptado;
  const perc =
    percRaw == null || percRaw === ""
      ? null
      : (() => {
          const n = parseSalicNumber(percRaw);
          // SALIC devolve percentual 0–100
          return n > 1 ? n / 100 : n;
        })();
  return {
    vlCaptado: parseSalicNumber(d.vlCaptado),
    vlRecebido: parseSalicNumber(d.vlRecebido),
    vlTransferido: parseSalicNumber(d.vlTransferido),
    percCaptado: perc,
    projectName: d.NomeProjeto?.trim() || null,
    idPronacHash,
    idPronac:
      d.idPronac == null || d.idPronac === ""
        ? null
        : Number(d.idPronac) || null,
  };
}

/** Em sessão já autenticada. */
export async function fetchCaptacaoOnPage(
  page: Page,
  idPronacHash: string,
): Promise<SalicCaptacaoValues> {
  const url = `/projeto/dados-projeto/get?idPronac=${encodeURIComponent(idPronacHash)}`;
  const json = await fetchJson<DadosProjetoPayload>(page, url);
  return captacaoFromDadosProjeto(json, idPronacHash);
}

export async function fetchCaptacaoFromSalic(params: {
  accountId: string;
  pronac: string;
}): Promise<SalicCaptacaoValues> {
  const account = await prisma.salicAccount.findUniqueOrThrow({
    where: { id: params.accountId },
  });
  if (!account.salicUsernameEnc || !account.salicPasswordEnc) {
    throw new CaptacaoImportError("Conta sem credenciais SALIC");
  }
  const username = decryptCredential(account.salicUsernameEnc);
  const password = decryptCredential(account.salicPasswordEnc);
  if (!username || !password) {
    throw new CaptacaoImportError("Credenciais SALIC inválidas");
  }

  const wantCnpj = normalizeCgccpf(account.cgccpf);
  const wantPronac = String(params.pronac).trim();
  let result: SalicCaptacaoValues | null = null;

  await withAccountBrowser(account.id, username, password, async (page) => {
    const proponentes = await listProponentesUi(page);
    const match =
      proponentes.find((p) => normalizeCgccpf(p.CPF) === wantCnpj) ||
      proponentes.find((p) => normalizeCgccpf(p.Nome) === wantCnpj);
    if (!match) {
      throw new CaptacaoImportError(
        `CNPJ ${wantCnpj} não está entre os proponentes deste login SALIC`,
      );
    }

    const projects = await listProjectsUi(page, match.idAgenteProponente);
    const listed: SalicUiProject | undefined = projects.find(
      (p) => String(p.Pronac) === wantPronac,
    );
    if (!listed?.idPronacHash) {
      throw new CaptacaoImportError(
        `PRONAC ${wantPronac} não encontrado na área logada deste proponente`,
      );
    }

    result = await fetchCaptacaoOnPage(page, listed.idPronacHash);
  });

  if (!result) {
    throw new CaptacaoImportError("Falha ao obter captação no SALIC");
  }
  return result;
}

/** Persiste captado/recebido/transferido no planejamento (+ Project.valorCaptado). */
export async function applyCaptacaoToPlanningProject(params: {
  planningProjectId: string;
  captacao: SalicCaptacaoValues;
}): Promise<void> {
  const project = await prisma.planningProject.findUniqueOrThrow({
    where: { id: params.planningProjectId },
    select: { id: true, accountId: true, externalCode: true, projectId: true },
  });

  await prisma.planningProject.update({
    where: { id: project.id },
    data: {
      captadoRecebido: params.captacao.vlRecebido,
      captadoTransferido: params.captacao.vlTransferido,
      ...(params.captacao.projectName
        ? { name: params.captacao.projectName }
        : {}),
    },
  });

  if (project.projectId) {
    await prisma.project.update({
      where: { id: project.projectId },
      data: {
        valorCaptado: params.captacao.vlCaptado,
        ...(params.captacao.idPronacHash
          ? { salicProjectId: params.captacao.idPronacHash }
          : {}),
        ...(params.captacao.projectName
          ? { name: params.captacao.projectName }
          : {}),
        lastSyncedAt: new Date(),
      },
    });
  } else {
    const audit = await prisma.project.upsert({
      where: {
        salicAccountId_pronac: {
          salicAccountId: project.accountId,
          pronac: project.externalCode,
        },
      },
      create: {
        salicAccountId: project.accountId,
        pronac: project.externalCode,
        name: params.captacao.projectName,
        salicProjectId: params.captacao.idPronacHash,
        valorCaptado: params.captacao.vlCaptado,
        lastSyncedAt: new Date(),
      },
      update: {
        valorCaptado: params.captacao.vlCaptado,
        salicProjectId: params.captacao.idPronacHash || undefined,
        name: params.captacao.projectName || undefined,
        lastSyncedAt: new Date(),
      },
    });
    await prisma.planningProject.update({
      where: { id: project.id },
      data: { projectId: audit.id },
    });
  }
}

/**
 * Atualiza captação de todos os projetos federais de um workspace
 * (uma sessão Playwright por proponente).
 */
export async function syncCaptacaoForWorkspace(workspaceId: string): Promise<{
  synced: number;
  skipped: number;
  errors: string[];
}> {
  const projects = await prisma.planningProject.findMany({
    where: {
      workspaceId,
      jurisdiction: "FEDERAL",
    },
    include: {
      account: {
        select: {
          id: true,
          name: true,
          cgccpf: true,
          salicUsernameEnc: true,
          salicPasswordEnc: true,
        },
      },
    },
    orderBy: { externalCode: "asc" },
  });

  let synced = 0;
  let skipped = 0;
  const errors: string[] = [];

  const byAccount = new Map<string, typeof projects>();
  for (const p of projects) {
    const list = byAccount.get(p.accountId) || [];
    list.push(p);
    byAccount.set(p.accountId, list);
  }

  for (const [, group] of byAccount) {
    const account = group[0]!.account;
    if (!account.salicUsernameEnc || !account.salicPasswordEnc) {
      for (const p of group) {
        skipped += 1;
        errors.push(
          `${p.externalCode}: proponente «${account.name}» sem credenciais SALIC.`,
        );
      }
      continue;
    }
    const username = decryptCredential(account.salicUsernameEnc);
    const password = decryptCredential(account.salicPasswordEnc);
    if (!username || !password) {
      for (const p of group) {
        skipped += 1;
        errors.push(`${p.externalCode}: credenciais SALIC inválidas.`);
      }
      continue;
    }

    const wantCnpj = normalizeCgccpf(account.cgccpf);

    try {
      await withAccountBrowser(account.id, username, password, async (page) => {
        const proponentes = await listProponentesUi(page);
        const match =
          proponentes.find((p) => normalizeCgccpf(p.CPF) === wantCnpj) ||
          proponentes.find((p) => normalizeCgccpf(p.Nome) === wantCnpj);
        if (!match) {
          throw new CaptacaoImportError(
            `CNPJ ${wantCnpj} não está entre os proponentes deste login`,
          );
        }
        const listed = await listProjectsUi(page, match.idAgenteProponente);
        const byPronac = new Map(listed.map((p) => [String(p.Pronac), p]));

        for (const pp of group) {
          const ui = byPronac.get(pp.externalCode);
          if (!ui?.idPronacHash) {
            skipped += 1;
            errors.push(
              `${pp.externalCode}: não encontrado na área logada do proponente.`,
            );
            continue;
          }
          try {
            const captacao = await fetchCaptacaoOnPage(page, ui.idPronacHash);
            await applyCaptacaoToPlanningProject({
              planningProjectId: pp.id,
              captacao,
            });
            synced += 1;
          } catch (e) {
            skipped += 1;
            errors.push(
              `${pp.externalCode}: ${
                e instanceof Error ? e.message : "falha ao ler captação"
              }`,
            );
          }
        }
      });
    } catch (e) {
      for (const p of group) {
        skipped += 1;
        errors.push(
          `${p.externalCode}: ${
            e instanceof Error ? e.message : "falha na sessão SALIC"
          }`,
        );
      }
    }
  }

  return { synced, skipped, errors };
}
