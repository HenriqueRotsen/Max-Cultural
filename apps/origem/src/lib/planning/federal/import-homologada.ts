import { prisma } from "@/lib/db";
import { decryptCredential, normalizeCgccpf } from "@/lib/crypto";
import {
  fetchJsonAllowError,
  listProjectsUi,
  listProponentesUi,
  withAccountBrowser,
  type SalicUiProject,
} from "@/lib/salic/crawler";
import {
  flattenHomologatedPlanilha,
  type HomologatedLine,
} from "@/lib/planning/homologada";
import {
  fetchCaptacaoOnPage,
  type SalicCaptacaoValues,
} from "@/lib/planning/federal/captacao-salic";
import { persistHomologatedSheet } from "@/lib/planning/persist-sheet";

export { persistHomologatedSheet } from "@/lib/planning/persist-sheet";

export class HomologadaImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HomologadaImportError";
  }
}

async function fetchPlanilhaHomologadaData(
  page: Parameters<Parameters<typeof withAccountBrowser>[3]>[0],
  idPronac: number | string,
) {
  const url = `/projeto/orcamento/obter-planilha-homologada-ajax?idPronac=${idPronac}`;
  const res = await fetchJsonAllowError(page, url);
  if (res.status === 412 || !res.ok) {
    const msg =
      (res.json as { msg?: string } | null)?.msg ||
      "Projeto ainda sem planilha homologada no SALIC";
    throw new HomologadaImportError(msg);
  }
  const payload = res.json as { success?: string; data?: unknown; msg?: string };
  if (payload.success === "false" || payload.data == null) {
    throw new HomologadaImportError(
      payload.msg || "Nenhuma planilha homologada encontrada",
    );
  }
  return payload.data;
}

export async function fetchHomologatedLinesFromSalic(params: {
  accountId: string;
  pronac: string;
}): Promise<{
  lines: HomologatedLine[];
  totalApproved: number;
  projectName: string | null;
  idPronacHash: string | null;
  idPronac: number | null;
  captacao: SalicCaptacaoValues | null;
}> {
  const account = await prisma.salicAccount.findUniqueOrThrow({
    where: { id: params.accountId },
  });
  if (!account.salicUsernameEnc || !account.salicPasswordEnc) {
    throw new HomologadaImportError("Conta sem credenciais SALIC");
  }
  const username = decryptCredential(account.salicUsernameEnc);
  const password = decryptCredential(account.salicPasswordEnc);
  if (!username || !password) {
    throw new HomologadaImportError("Credenciais SALIC inválidas");
  }

  const wantCnpj = normalizeCgccpf(account.cgccpf);
  const wantPronac = String(params.pronac).trim();

  let lines: HomologatedLine[] = [];
  let totalApproved = 0;
  let projectName: string | null = null;
  let idPronacHash: string | null = null;
  let idPronac: number | null = null;
  let captacao: SalicCaptacaoValues | null = null;

  await withAccountBrowser(account.id, username, password, async (page) => {
    const proponentes = await listProponentesUi(page);
    const match =
      proponentes.find((p) => normalizeCgccpf(p.CPF) === wantCnpj) ||
      proponentes.find((p) => normalizeCgccpf(p.Nome) === wantCnpj);
    if (!match) {
      throw new HomologadaImportError(
        `CNPJ ${wantCnpj} não está entre os proponentes deste login SALIC`,
      );
    }

    const projects = await listProjectsUi(page, match.idAgenteProponente);
    const listed: SalicUiProject | undefined = projects.find(
      (p) => String(p.Pronac) === wantPronac,
    );
    if (!listed?.IdPRONAC) {
      throw new HomologadaImportError(
        `PRONAC ${wantPronac} não encontrado na área logada deste proponente`,
      );
    }

    projectName = listed.NomeProjeto || null;
    idPronacHash = listed.idPronacHash || null;
    idPronac = listed.IdPRONAC;

    const data = await fetchPlanilhaHomologadaData(page, listed.IdPRONAC);
    const flat = flattenHomologatedPlanilha(data);
    if (flat.lines.length === 0) {
      throw new HomologadaImportError("Planilha homologada veio vazia");
    }
    lines = flat.lines;
    totalApproved = flat.totalApproved;

    if (listed.idPronacHash) {
      try {
        captacao = await fetchCaptacaoOnPage(page, listed.idPronacHash);
        if (captacao.projectName) projectName = captacao.projectName;
      } catch {
        captacao = null;
      }
    }
  });

  return { lines, totalApproved, projectName, idPronacHash, idPronac, captacao };
}

async function fetchPlanilhaReadequadaData(
  page: Parameters<Parameters<typeof withAccountBrowser>[3]>[0],
  idPronac: number | string,
) {
  // Endpoint da planilha readequada (fase 5 / PLANILHA ATUAL). Fallbacks comuns do SALIC.
  const candidates = [
    `/projeto/orcamento/obter-planilha-readequada-ajax?idPronac=${idPronac}`,
    `/projeto/orcamento/planilha-readequada?idPronac=${idPronac}`,
    `/planilha-readequada?idPronac=${idPronac}`,
  ];
  let lastMsg = "Nenhuma planilha readequada encontrada";
  for (const url of candidates) {
    const res = await fetchJsonAllowError(page, url);
    if (res.status === 412 || !res.ok) {
      lastMsg =
        (res.json as { msg?: string } | null)?.msg || lastMsg;
      continue;
    }
    const payload = res.json as { success?: string; data?: unknown; msg?: string };
    if (payload.success === "false" || payload.data == null) {
      lastMsg = payload.msg || lastMsg;
      continue;
    }
    return payload.data;
  }
  throw new HomologadaImportError(lastMsg);
}

/** Linhas da planilha readequada (aprovados atuais no SALIC). */
export async function fetchReadequadaLinesFromSalic(params: {
  accountId: string;
  pronac: string;
}): Promise<
  Array<
    HomologatedLine & {
      homologatedAmount: number;
    }
  >
> {
  const account = await prisma.salicAccount.findUniqueOrThrow({
    where: { id: params.accountId },
  });
  if (!account.salicUsernameEnc || !account.salicPasswordEnc) {
    throw new HomologadaImportError("Conta sem credenciais SALIC");
  }
  const username = decryptCredential(account.salicUsernameEnc);
  const password = decryptCredential(account.salicPasswordEnc);
  if (!username || !password) {
    throw new HomologadaImportError("Credenciais SALIC inválidas");
  }

  const wantCnpj = normalizeCgccpf(account.cgccpf);
  const wantPronac = String(params.pronac).trim();
  let lines: Array<HomologatedLine & { homologatedAmount: number }> = [];

  await withAccountBrowser(account.id, username, password, async (page) => {
    const proponentes = await listProponentesUi(page);
    const match =
      proponentes.find((p) => normalizeCgccpf(p.CPF) === wantCnpj) ||
      proponentes.find((p) => normalizeCgccpf(p.Nome) === wantCnpj);
    if (!match) {
      throw new HomologadaImportError(
        `CNPJ ${wantCnpj} não está entre os proponentes deste login SALIC`,
      );
    }

    const projects = await listProjectsUi(page, match.idAgenteProponente);
    const listed: SalicUiProject | undefined = projects.find(
      (p) => String(p.Pronac) === wantPronac,
    );
    if (!listed?.IdPRONAC) {
      throw new HomologadaImportError(
        `PRONAC ${wantPronac} não encontrado na área logada deste proponente`,
      );
    }

    const data = await fetchPlanilhaReadequadaData(page, listed.IdPRONAC);
    const flat = flattenHomologatedPlanilha(data);
    if (flat.lines.length === 0) {
      throw new HomologadaImportError("Planilha readequada veio vazia");
    }
    lines = flat.lines.map((l) => ({
      ...l,
      homologatedAmount: l.approvedAmount,
    }));
  });

  return lines;
}

/** Só consulta nome do projeto no SALIC (sem baixar planilha homologada). */
export async function fetchSalicProjectPreview(params: {
  accountId: string;
  pronac: string;
}): Promise<{
  projectName: string | null;
  idPronacHash: string | null;
  idPronac: number | null;
}> {
  const account = await prisma.salicAccount.findUniqueOrThrow({
    where: { id: params.accountId },
  });
  if (!account.salicUsernameEnc || !account.salicPasswordEnc) {
    throw new HomologadaImportError("Conta sem credenciais SALIC");
  }
  const username = decryptCredential(account.salicUsernameEnc);
  const password = decryptCredential(account.salicPasswordEnc);
  if (!username || !password) {
    throw new HomologadaImportError("Credenciais SALIC inválidas");
  }

  const wantCnpj = normalizeCgccpf(account.cgccpf);
  const wantPronac = String(params.pronac).trim();

  let projectName: string | null = null;
  let idPronacHash: string | null = null;
  let idPronac: number | null = null;

  await withAccountBrowser(account.id, username, password, async (page) => {
    const proponentes = await listProponentesUi(page);
    const match =
      proponentes.find((p) => normalizeCgccpf(p.CPF) === wantCnpj) ||
      proponentes.find((p) => normalizeCgccpf(p.Nome) === wantCnpj);
    if (!match) {
      throw new HomologadaImportError(
        `CNPJ ${wantCnpj} não está entre os proponentes deste login SALIC`,
      );
    }

    const projects = await listProjectsUi(page, match.idAgenteProponente);
    const listed: SalicUiProject | undefined = projects.find(
      (p) => String(p.Pronac) === wantPronac,
    );
    if (!listed?.IdPRONAC) {
      throw new HomologadaImportError(
        `PRONAC ${wantPronac} não encontrado na área logada deste proponente`,
      );
    }

    projectName = listed.NomeProjeto || null;
    idPronacHash = listed.idPronacHash || null;
    idPronac = listed.IdPRONAC;
  });

  return { projectName, idPronacHash, idPronac };
}

/**
 * Para projetos federais em andamento sem planilha, busca a homologada na área logada
 * (uma sessão por proponente) e vincula no Planejamento.
 */
export async function linkHomologatedSheetsForOpenProjects(workspaceId: string): Promise<{
  linked: number;
  skipped: number;
  errors: string[];
}> {
  const open = await prisma.planningProject.findMany({
    where: {
      workspaceId,
      lifecycleStatus: "EM_ANDAMENTO",
      jurisdiction: "FEDERAL",
      sheet: null,
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

  let linked = 0;
  let skipped = 0;
  const errors: string[] = [];

  const byAccount = new Map<string, typeof open>();
  for (const p of open) {
    const list = byAccount.get(p.accountId) || [];
    list.push(p);
    byAccount.set(p.accountId, list);
  }

  for (const [, projects] of byAccount) {
    const account = projects[0]!.account;
    if (!account.salicUsernameEnc || !account.salicPasswordEnc) {
      for (const p of projects) {
        skipped += 1;
        errors.push(
          `${p.externalCode}: proponente «${account.name}» sem usuário e senha do SALIC.`,
        );
      }
      continue;
    }

    const username = decryptCredential(account.salicUsernameEnc);
    const password = decryptCredential(account.salicPasswordEnc);
    if (!username || !password) {
      for (const p of projects) {
        skipped += 1;
        errors.push(
          `${p.externalCode}: usuário ou senha do SALIC inválidos no proponente «${account.name}».`,
        );
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
          for (const p of projects) {
            skipped += 1;
            errors.push(
              `${p.externalCode}: CNPJ do proponente não encontrado neste login do SALIC.`,
            );
          }
          return;
        }

        const listedProjects = await listProjectsUi(page, match.idAgenteProponente);
        const byPronac = new Map(
          listedProjects.map((row) => [String(row.Pronac), row] as const),
        );

        for (const pp of projects) {
          const listed = byPronac.get(String(pp.externalCode));
          if (!listed?.IdPRONAC) {
            skipped += 1;
            errors.push(
              `${pp.externalCode}: projeto não aparece na área logada deste proponente.`,
            );
            continue;
          }

          try {
            const data = await fetchPlanilhaHomologadaData(page, listed.IdPRONAC);
            const flat = flattenHomologatedPlanilha(data);
            if (flat.lines.length === 0) {
              skipped += 1;
              errors.push(`${pp.externalCode}: planilha homologada veio vazia.`);
              continue;
            }

            await persistHomologatedSheet({
              planningProjectId: pp.id,
              lines: flat.lines,
              totalApproved: flat.totalApproved,
              importSource: "SALIC_HOMOLOGADA",
            });

            if (listed.NomeProjeto) {
              await prisma.planningProject.update({
                where: { id: pp.id },
                data: { name: listed.NomeProjeto },
              });
            }

            linked += 1;
          } catch (e) {
            skipped += 1;
            const msg =
              e instanceof HomologadaImportError
                ? e.message
                : e instanceof Error
                  ? e.message
                  : "Falha ao vincular planilha";
            errors.push(`${pp.externalCode}: ${msg}`);
          }
        }
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha na área logada do SALIC";
      for (const p of projects) {
        skipped += 1;
        errors.push(`${p.externalCode}: ${msg}`);
      }
    }
  }

  return { linked, skipped, errors };
}
