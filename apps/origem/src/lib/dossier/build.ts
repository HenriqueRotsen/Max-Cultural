import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import {
  getPronacDetail,
  getWatchedSupplierCount,
  listWatchedSuppliers,
} from "@/lib/audit";
import { loadComplianceBundle, metaForAccount } from "@/lib/compliance/context";
import { rulesForProject } from "@/lib/compliance/rules";
import { renderPronacDetailHtml } from "@/lib/reports/html";
import { htmlToPdf } from "@/lib/reports/pdf";
import { readPlanningDocumentBytes } from "@/lib/nf/read-document-bytes";
import {
  exportReadequacaoCsv,
  type ReadequacaoSnapshot,
} from "@/lib/planning/readequacao";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  prepareArtifact,
  type CompressedArtifact,
  type DossierManifest,
  type ManifestEntry,
} from "@/lib/dossier/compress";
import { DOSSIER_FOLDERS } from "@/lib/dossier/paths";
import { downloadPronacSalicFiles } from "@/lib/salic/download-arquivo";

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function money(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "object" && typeof (v as { toNumber?: () => number }).toNumber === "function") {
    return (v as { toNumber: () => number }).toNumber();
  }
  const n = Number(String(v));
  return Number.isFinite(n) ? n : 0;
}

async function writeArtifact(
  workDir: string,
  compressDir: string,
  relativePath: string,
  buffer: Buffer,
  mimeType: string,
  out: CompressedArtifact[],
) {
  const art = await prepareArtifact({
    buffer,
    relativePath,
    mimeType,
    workDir: compressDir,
  });
  const abs = path.join(workDir, art.relativePath);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, art.buffer);
  out.push(art);
}

export type BuildPronacResult = {
  artifacts: CompressedArtifact[];
  manifest: DossierManifest;
  limitations: string[];
  workDir: string;
};

/** Monta pastas 01–05 em /tmp para um PRONAC (Project). */
export async function buildPronacDossier(params: {
  workspaceId: string;
  accountId: string;
  projectId: string;
  jobId: string;
}): Promise<BuildPronacResult> {
  const project = await prisma.project.findFirst({
    where: {
      id: params.projectId,
      salicAccountId: params.accountId,
      salicAccount: { workspaceId: params.workspaceId },
    },
    include: {
      salicAccount: true,
      payments: {
        include: { supplier: true },
        orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
      },
      planningProject: {
        include: {
          sheet: { include: { lines: { orderBy: { sortOrder: "asc" } } } },
          documents: { orderBy: { createdAt: "asc" } },
          readequacaoDrafts: {
            where: { status: "OPEN" },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
    },
  });
  if (!project) throw new Error("Projeto não encontrado para o dossiê");

  const workDir = path.join("/tmp", `dossier-${params.jobId}`, project.pronac);
  const compressDir = path.join(workDir, "_compress");
  await mkdir(workDir, { recursive: true });
  for (const folder of DOSSIER_FOLDERS) {
    await mkdir(path.join(workDir, folder), { recursive: true });
  }

  const artifacts: CompressedArtifact[] = [];
  const limitations: string[] = [];
  const account = project.salicAccount;
  const planning = project.planningProject;

  // —— 01 Espelho PRONAC (PDF) ——
  try {
    const watchedCount = await getWatchedSupplierCount(params.workspaceId);
    const watchedOnly = watchedCount > 0;
    const [detail, watchedSuppliers] = await Promise.all([
      getPronacDetail(project.pronac, {
        accountId: params.accountId,
        workspaceId: params.workspaceId,
        watchedOnly,
      }),
      listWatchedSuppliers(params.workspaceId),
    ]);
    const rules = await rulesForProject({
      complianceRulesetId: detail.compliance?.rulesetId,
    });
    const bundle = await loadComplianceBundle([params.accountId], {
      workspaceId: params.workspaceId,
    });
    const meta = metaForAccount(bundle, params.accountId, rules.version);
    const html = await renderPronacDetailHtml({
      filters: {
        accountName: account.name,
        pronac: project.pronac,
        from: null,
        to: null,
        watchedOnly,
        watchedCount,
      },
      rules,
      personType: meta.personType || account.personType,
      relatedParties: meta.relatedParties,
      watchedSuppliers: watchedSuppliers.filter((w) => {
        const dig = (w.cgccpf || "").replace(/\D/g, "");
        return (
          dig.length >= 11 &&
          detail.allSuppliers.some((s) => s.cgccpf.replace(/\D/g, "") === dig)
        );
      }),
      pronac: detail.pronac,
      name: detail.name,
      accountName: account.name,
      accountCgccpf: account.cgccpf,
      projectTotal: detail.projectTotal,
      paidTotal: detail.paidTotal,
      total: detail.total,
      paymentCount: detail.paymentCount,
      supplierCount: detail.supplierCount,
      watchedOnly: detail.watchedOnly,
      suppliers: detail.suppliers,
      allSuppliers: detail.allSuppliers,
      bondSuppliers: detail.bondSuppliers,
      payments: detail.payments.map((p) => ({
        paymentDate: p.paymentDate,
        supplierName: p.supplier.name,
        itemName: p.itemName,
        amount: Number(p.amount),
        documentType: p.documentType,
        documentNumber: p.documentNumber,
        source: p.source,
      })),
    });
    const pdf = await htmlToPdf(html);
    await writeArtifact(
      workDir,
      compressDir,
      `${DOSSIER_FOLDERS[0]}/espelho-pronac-${project.pronac}.pdf`,
      pdf,
      "application/pdf",
      artifacts,
    );
  } catch (err) {
    limitations.push(
      `01_espelho_pronac: falha ao gerar PDF (${err instanceof Error ? err.message : String(err)})`,
    );
  }

  // —— 02 Planilha homologada (CSV) ——
  if (planning?.sheet?.lines?.length) {
    const header = [
      "fonteRecurso",
      "produto",
      "etapa",
      "uf",
      "cidade",
      "item",
      "unidade",
      "dias",
      "quantidade",
      "ocorrencias",
      "valorUnitario",
      "homologado",
      "aprovado",
      "salicComprovado",
      "planilhaAprovacaoId",
    ];
    const rows = planning.sheet.lines.map((l) =>
      [
        l.fonteRecurso,
        l.productName,
        l.stageName,
        l.state,
        l.city,
        l.itemName,
        l.unit,
        l.days,
        money(l.quantity),
        money(l.occurrences),
        money(l.unitPrice),
        money(l.homologatedAmount),
        money(l.approvedAmount),
        l.salicComprovado == null ? "" : money(l.salicComprovado),
        l.planilhaAprovacaoId || "",
      ]
        .map(csvEscape)
        .join(","),
    );
    const csv = `\uFEFF${header.join(",")}\n${rows.join("\n")}\n`;
    await writeArtifact(
      workDir,
      compressDir,
      `${DOSSIER_FOLDERS[1]}/planilha-homologada-${project.pronac}.csv`,
      Buffer.from(csv, "utf8"),
      "text/csv",
      artifacts,
    );
  } else {
    limitations.push(
      "02_planilha_homologada: planilha homologada não disponível no banco (importe no Planejamento).",
    );
  }

  // —— 03 Situação + diligências ——
  {
    const situacao = project.situacao || "(não informada)";
    const lifecycle = project.lifecycleStatus;
    const notifs = await prisma.appNotification.findMany({
      where: {
        workspaceId: params.workspaceId,
        type: "SALIC_DILIGENCIA",
        OR: [
          { href: { contains: project.pronac } },
          { body: { contains: project.pronac } },
          { title: { contains: project.pronac } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const rowsHtml = notifs.length
      ? notifs
          .map(
            (n) =>
              `<tr><td>${escapeHtml(formatDate(n.createdAt))}</td><td>${escapeHtml(n.title)}</td><td>${escapeHtml(n.body)}</td></tr>`,
          )
          .join("")
      : `<tr><td colspan="3">Nenhuma notificação de diligência registrada no Max Origem para este PRONAC.</td></tr>`;

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Situação ${escapeHtml(project.pronac)}</title>
<style>body{font-family:Georgia,serif;color:#192d5c;padding:32px}h1{font-size:22px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}th,td{border:1px solid #e8eaef;padding:8px;text-align:left}th{background:#eef1f7}</style></head>
<body>
<h1>Situação SALIC — PRONAC ${escapeHtml(project.pronac)}</h1>
<p><strong>Projeto:</strong> ${escapeHtml(project.name || "—")}</p>
<p><strong>Situação:</strong> ${escapeHtml(situacao)}</p>
<p><strong>Ciclo de vida (Max):</strong> ${escapeHtml(lifecycle)}</p>
<h2>Diligências registradas</h2>
<table><thead><tr><th>Data</th><th>Título</th><th>Detalhe</th></tr></thead><tbody>${rowsHtml}</tbody></table>
<p style="margin-top:24px;font-size:11px;color:#6b7280">Gerado pelo Max Origem. Anexos de diligência do SALIC entram em 03_…/anexos/ quando o RPA conseguir baixá-los.</p>
</body></html>`;

    try {
      const pdf = await htmlToPdf(html);
      await writeArtifact(
        workDir,
        compressDir,
        `${DOSSIER_FOLDERS[2]}/situacao-diligencias-${project.pronac}.pdf`,
        pdf,
        "application/pdf",
        artifacts,
      );
    } catch (err) {
      limitations.push(
        `03_situacao_diligencias: falha no PDF (${err instanceof Error ? err.message : String(err)})`,
      );
    }
  }

  // —— 04 Readequação ——
  const draft = planning?.readequacaoDrafts?.[0];
  if (draft) {
    try {
      const csv = exportReadequacaoCsv(draft.snapshotJson as unknown as ReadequacaoSnapshot);
      await writeArtifact(
        workDir,
        compressDir,
        `${DOSSIER_FOLDERS[3]}/readequacao-rascunho-${project.pronac}.csv`,
        Buffer.from(csv, "utf8"),
        "text/csv",
        artifacts,
      );
    } catch (err) {
      limitations.push(
        `04_readequacao: falha ao exportar rascunho (${err instanceof Error ? err.message : String(err)})`,
      );
    }
  } else {
    limitations.push("04_readequacao: nenhum rascunho OPEN de readequação no banco.");
  }

  // —— 05 Pagamentos + comprovantes ——
  {
    const payRows = project.payments
      .map(
        (p) =>
          `<tr>
            <td>${escapeHtml(formatDate(p.paymentDate))}</td>
            <td>${escapeHtml(p.supplier.name)}</td>
            <td>${escapeHtml(p.itemName || "—")}</td>
            <td>${escapeHtml(formatCurrency(Number(p.amount)))}</td>
            <td>${escapeHtml(p.documentType || "—")}</td>
            <td>${escapeHtml(p.documentNumber || "—")}</td>
            <td>${escapeHtml(p.source)}</td>
          </tr>`,
      )
      .join("");

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Pagamentos ${escapeHtml(project.pronac)}</title>
<style>body{font-family:Georgia,serif;color:#192d5c;padding:32px}h1{font-size:22px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:11px}th,td{border:1px solid #e8eaef;padding:6px;text-align:left}th{background:#eef1f7}</style></head>
<body>
<h1>Relação de pagamentos — PRONAC ${escapeHtml(project.pronac)}</h1>
<p>${project.payments.length} pagamento(s) no banco do Max Origem.</p>
<table><thead><tr><th>Data</th><th>Fornecedor</th><th>Item</th><th>Valor</th><th>Doc</th><th>Nº</th><th>Fonte</th></tr></thead>
<tbody>${payRows || `<tr><td colspan="7">Nenhum pagamento sincronizado.</td></tr>`}</tbody></table>
</body></html>`;

    try {
      const pdf = await htmlToPdf(html);
      await writeArtifact(
        workDir,
        compressDir,
        `${DOSSIER_FOLDERS[4]}/relacao-pagamentos-${project.pronac}.pdf`,
        pdf,
        "application/pdf",
        artifacts,
      );
    } catch (err) {
      limitations.push(
        `05_pagamentos: falha no PDF (${err instanceof Error ? err.message : String(err)})`,
      );
    }

    const docs = planning?.documents || [];
    const localPacked = new Set<string>();
    let localOk = 0;
    let localMissing = 0;

    for (const doc of docs) {
      const paths = [doc.storagePath, doc.salicMergedStoragePath].filter(
        (p): p is string => Boolean(p),
      );
      for (const storagePath of paths) {
        try {
          const bytes = await readPlanningDocumentBytes(storagePath);
          const safeName = doc.filename.replace(/[^\w.\-]+/g, "_").slice(0, 120);
          const suffix = storagePath === doc.salicMergedStoragePath ? "merged" : "doc";
          await writeArtifact(
            workDir,
            compressDir,
            `${DOSSIER_FOLDERS[4]}/docs/${doc.id.slice(0, 8)}_${suffix}_${safeName}`,
            bytes,
            doc.mimeType || "application/octet-stream",
            artifacts,
          );
          localOk += 1;
          if (doc.salicComprovanteId) localPacked.add(String(doc.salicComprovanteId));
        } catch {
          localMissing += 1;
        }
      }
    }
    if (!docs.length) {
      limitations.push(
        "05_pagamentos_comprovantes: nenhum PlanningDocument (NF/comprovante) no planejamento.",
      );
    } else if (localMissing > 0) {
      limitations.push(
        `05_pagamentos_comprovantes: ${localMissing} path(s) local(is) indisponível(is) (comum na Vercel).`,
      );
    }

    // Fase 2 — RPA: baixa idArquivo do SALIC para pagamentos sem arquivo local.
    const needSalic = project.payments
      .filter((p) => p.fileId && (!p.externalId || !localPacked.has(String(p.externalId))))
      .map((p) => ({ fileId: String(p.fileId), fileName: p.fileName }));

    if (needSalic.length) {
      const token = project.salicProjectId || "";
      const numericIdPronac = /^\d+$/.test(token) ? token : null;
      const rpa = await downloadPronacSalicFiles({
        accountId: params.accountId,
        salicProjectId: numericIdPronac,
        pronac: project.pronac,
        files: needSalic,
        maxFiles: 100,
      });
      for (const note of rpa.notes) limitations.push(`05_salic_rpa: ${note}`);
      for (const file of rpa.payments) {
        await writeArtifact(
          workDir,
          compressDir,
          `${DOSSIER_FOLDERS[4]}/salic/${file.fileId}_${file.filename}`,
          file.buffer,
          file.mimeType,
          artifacts,
        );
      }
    } else if (localOk === 0) {
      limitations.push(
        "05_pagamentos_comprovantes: sem arquivos locais nem idArquivo para RPA.",
      );
    }
  }

  const readme = [
    "LIMITAÇÕES DO DOSSIÊ (Max Origem)",
    "================================",
    "",
    "Pacote montado com dados locais + tentativa de download RPA no SALIC (idArquivo).",
    "Se o endpoint /file/getfile do SALIC estiver fora (erro 500), os anexos remotos ficam pendentes.",
    "",
    ...limitations.map((l) => `- ${l}`),
    "",
  ].join("\n");

  await writeArtifact(
    workDir,
    compressDir,
    "README_LIMITACOES.txt",
    Buffer.from(readme, "utf8"),
    "text/plain",
    artifacts,
  );

  const files: ManifestEntry[] = artifacts.map((a) => ({
    path: a.relativePath,
    mime: a.mimeType,
    originalBytes: a.originalBytes,
    storedBytes: a.storedBytes,
    sha256: a.sha256,
  }));

  const manifest: DossierManifest = {
    version: 1,
    workspaceId: params.workspaceId,
    accountId: params.accountId,
    pronac: project.pronac,
    projectName: project.name,
    generatedAt: new Date().toISOString(),
    files,
    limitations,
  };

  await writeFile(
    path.join(workDir, "MANIFEST.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  return { artifacts, manifest, limitations, workDir };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
