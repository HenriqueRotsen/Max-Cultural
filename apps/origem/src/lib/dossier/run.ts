import { createHash, timingSafeEqual } from "crypto";
import { readFile, rm } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { buildPronacDossier } from "@/lib/dossier/build";
import { createZipFromFiles } from "@/lib/dossier/zip";
import {
  deletePronacDossier,
  uploadPronacDossier,
} from "@/lib/dossier/storage";
import {
  accountStoragePrefix,
  pronacStoragePrefix,
  pronacZipStoragePath,
} from "@/lib/dossier/paths";

export type DossierWorkState = {
  projectIds: string[];
  cursor: number;
  /** Lease para evitar dois workers no mesmo PRONAC (tick + handOff). */
  lockUntil?: string;
};

export type DossierZipEntry = {
  projectId: string;
  pronac: string;
  projectName: string | null;
  zipPath: string;
  folderPrefix: string;
  zipStoredBytes: number;
  limitations: string[];
};

function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "")
  ).replace(/\/$/, "");
}

export function dossierInternalToken(): string | null {
  const secret = (process.env.CRON_SECRET || process.env.AUTH_SECRET || "").trim();
  if (!secret) return null;
  return createHash("sha256").update(`origem:dossier-jobs:${secret}`).digest("hex");
}

export function isDossierInternalRequest(request: Request): boolean {
  const expected = dossierInternalToken();
  const got = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!expected || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

async function handOffDossier(jobId: string): Promise<boolean> {
  const token = dossierInternalToken();
  const site = siteUrl();
  if (!process.env.VERCEL || !token || !site) return false;
  try {
    const res = await fetch(`${site}/api/cron/dossier-run`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ jobId }),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Na Vercel, prefere o cron (maxDuration 300); senão executa no processo atual. */
export async function dispatchDossierJob(jobId: string): Promise<void> {
  if (await handOffDossier(jobId)) return;
  await runDossierJob(jobId);
}

async function setProgress(
  jobId: string,
  pct: number,
  msg: string,
  extra?: { workState?: DossierWorkState; zipPath?: string | null; manifestJson?: unknown },
) {
  await prisma.legalDossierJob.update({
    where: { id: jobId },
    data: {
      progressPct: Math.max(0, Math.min(100, Math.round(pct))),
      progressMsg: msg,
      ...(extra?.workState != null ? { workState: extra.workState } : {}),
      ...(extra?.zipPath !== undefined ? { zipPath: extra.zipPath } : {}),
      ...(extra?.manifestJson !== undefined
        ? { manifestJson: extra.manifestJson as object }
        : {}),
    },
  });
}

function parseWorkState(raw: unknown): DossierWorkState | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.projectIds) || typeof o.cursor !== "number") return null;
  return {
    projectIds: o.projectIds.filter((x): x is string => typeof x === "string"),
    cursor: o.cursor,
    ...(typeof o.lockUntil === "string" ? { lockUntil: o.lockUntil } : {}),
  };
}

function isLocked(work: DossierWorkState | null): boolean {
  if (!work?.lockUntil) return false;
  const t = Date.parse(work.lockUntil);
  return Number.isFinite(t) && t > Date.now();
}

function parseZips(manifest: unknown): DossierZipEntry[] {
  if (!manifest || typeof manifest !== "object") return [];
  const zips = (manifest as { zips?: unknown }).zips;
  return Array.isArray(zips) ? (zips as DossierZipEntry[]) : [];
}

/** Processa um PRONAC: delete prefixo → build → zip → upload. */
async function processOnePronac(params: {
  jobId: string;
  workspaceId: string;
  accountId: string;
  projectId: string;
}): Promise<DossierZipEntry> {
  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    select: { id: true, pronac: true, name: true },
  });
  if (!project) throw new Error(`Projeto ${params.projectId} não encontrado`);

  const folderPrefix = pronacStoragePrefix(
    params.workspaceId,
    params.accountId,
    project.pronac,
    project.name,
  );
  const zipPath = pronacZipStoragePath(
    params.workspaceId,
    params.accountId,
    project.pronac,
    project.name,
  );

  await deletePronacDossier({ folderPrefix, zipPath });

  const built = await buildPronacDossier({
    workspaceId: params.workspaceId,
    accountId: params.accountId,
    projectId: project.id,
    jobId: params.jobId,
  });

  const zipLocal = path.join(built.workDir, `${path.basename(folderPrefix)}.zip`);
  const { byteSize } = await createZipFromFiles({
    outPath: zipLocal,
    files: built.artifacts.map((a) => ({
      relativePath: a.relativePath,
      buffer: a.buffer,
    })),
  });

  const zipBuffer = await readFile(zipLocal);
  const manifest = {
    ...built.manifest,
    zipStoredBytes: byteSize,
  };

  await uploadPronacDossier({
    folderPrefix,
    zipPath,
    zipBuffer,
    artifacts: built.artifacts,
    manifest,
  });

  await rm(built.workDir, { recursive: true, force: true }).catch(() => undefined);

  return {
    projectId: project.id,
    pronac: project.pronac,
    projectName: project.name,
    zipPath,
    folderPrefix,
    zipStoredBytes: byteSize,
    limitations: built.limitations,
  };
}

/**
 * Executa (ou continua) o job de dossiê.
 * Em Vercel, faz handOff entre PRONACs da mesma conta.
 */
export async function runDossierJob(jobId: string): Promise<void> {
  const job = await prisma.legalDossierJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  if (job.status === "success" || job.status === "error" || job.status === "replaced") {
    return;
  }

  if (job.status === "pending") {
    await prisma.legalDossierJob.update({
      where: { id: jobId },
      data: {
        status: "running",
        startedAt: new Date(),
        progressMsg: "Iniciando dossiê…",
        progressPct: 1,
      },
    });
  }

  try {
    let work = parseWorkState(job.workState);
    if (isLocked(work)) {
      // Outra invocação (handOff/tick) já está gerando este PRONAC.
      return;
    }

    if (!work) {
      const projects = job.projectId
        ? await prisma.project.findMany({
            where: {
              id: job.projectId,
              salicAccountId: job.accountId,
              salicAccount: { workspaceId: job.workspaceId },
            },
            select: { id: true },
            orderBy: { pronac: "asc" },
          })
        : await prisma.project.findMany({
            where: {
              salicAccountId: job.accountId,
              salicAccount: { workspaceId: job.workspaceId },
            },
            select: { id: true },
            orderBy: { pronac: "asc" },
          });

      if (!projects.length) {
        throw new Error("Nenhum PRONAC encontrado para este proponente/escopo");
      }

      work = { projectIds: projects.map((p) => p.id), cursor: 0 };
      await setProgress(jobId, 2, `Fila: ${work.projectIds.length} PRONAC(s)`, {
        workState: work,
      });
    }

    const zips = parseZips(job.manifestJson);
    const total = work.projectIds.length;
    /** Na Vercel: 1 PRONAC por invocação (evita timeout após o 1º). */
    const onePronacPerInvoke = Boolean(process.env.VERCEL);

    while (work.cursor < total) {
      // Re-check lease (tick concorrente).
      const latest = await prisma.legalDossierJob.findUnique({
        where: { id: jobId },
        select: { workState: true, status: true },
      });
      if (!latest || latest.status === "success" || latest.status === "error" || latest.status === "replaced") {
        return;
      }
      const latestWork = parseWorkState(latest.workState);
      if (latestWork) work = latestWork;
      if (isLocked(work) || work.cursor >= total) return;

      const projectId = work.projectIds[work.cursor]!;
      const pctBase = 5 + (work.cursor / total) * 90;
      const lockUntil = new Date(Date.now() + 4 * 60 * 1000).toISOString();
      await setProgress(
        jobId,
        pctBase,
        `Gerando PRONAC ${work.cursor + 1}/${total}…`,
        { workState: { ...work, lockUntil } },
      );

      const entry = await processOnePronac({
        jobId,
        workspaceId: job.workspaceId,
        accountId: job.accountId,
        projectId,
      });
      zips.push(entry);

      work = { projectIds: work.projectIds, cursor: work.cursor + 1 };
      const singleZip = total === 1 ? entry.zipPath : null;
      const manifestJson = {
        version: 1,
        accountId: job.accountId,
        workspaceId: job.workspaceId,
        projectId: job.projectId,
        zips,
        generatedAt: new Date().toISOString(),
      };

      if (work.cursor < total) {
        await setProgress(
          jobId,
          5 + (work.cursor / total) * 90,
          `Concluído PRONAC ${work.cursor}/${total} · próxima fatia…`,
          { workState: work, zipPath: singleZip, manifestJson },
        );
        if (await handOffDossier(jobId)) return;
        if (onePronacPerInvoke) {
          // handOff falhou (URL/secret) — deixa running; o tick da UI continua.
          await setProgress(
            jobId,
            5 + (work.cursor / total) * 90,
            `Concluído PRONAC ${work.cursor}/${total} · aguardando continuação…`,
            { workState: work, zipPath: singleZip, manifestJson },
          );
          return;
        }
        // Dev local: segue o próximo PRONAC no mesmo processo.
        continue;
      }

      await setProgress(
        jobId,
        5 + (work.cursor / total) * 90,
        `Concluído PRONAC ${work.cursor}/${total}`,
        { workState: work, zipPath: singleZip, manifestJson },
      );
    }

    // Marca jobs anteriores do mesmo escopo como replaced
    await prisma.legalDossierJob.updateMany({
      where: {
        workspaceId: job.workspaceId,
        accountId: job.accountId,
        projectId: job.projectId ?? null,
        id: { not: jobId },
        status: { in: ["success", "error"] },
      },
      data: { status: "replaced" },
    });

    const finalZip = zips.length === 1 ? zips[0]!.zipPath : null;
    await prisma.legalDossierJob.update({
      where: { id: jobId },
      data: {
        status: "success",
        progressPct: 100,
        progressMsg:
          zips.length === 1
            ? `Dossiê pronto (${formatBytes(zips[0]!.zipStoredBytes)})`
            : `Dossiê pronto · ${zips.length} ZIPs`,
        zipPath: finalZip,
        finishedAt: new Date(),
        workState: work,
        manifestJson: {
          version: 1,
          accountId: job.accountId,
          workspaceId: job.workspaceId,
          projectId: job.projectId,
          storagePrefix: accountStoragePrefix(job.workspaceId, job.accountId),
          zips,
          generatedAt: new Date().toISOString(),
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.legalDossierJob.update({
      where: { id: jobId },
      data: {
        status: "error",
        errorMessage: message,
        progressMsg: "Falhou",
        finishedAt: new Date(),
      },
    });
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
