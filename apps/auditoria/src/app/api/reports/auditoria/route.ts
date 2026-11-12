import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/session";
import {
  getPronacDetail,
  listWatchedSuppliers,
} from "@/lib/audit";
import { loadComplianceBundle, metaForProject } from "@/lib/compliance/context";
import { rulesForProject } from "@/lib/compliance/rules";
import { evaluatePronacSupplierCompliance } from "@/lib/compliance/rouanet";
import { corporateMapCopy, corporateRoleLabel } from "@/lib/corporate/copy";
import { mapWindowForProject, periodsInYears } from "@/lib/corporate/at-year";
import { pronacYear } from "@/lib/compliance/choose-ruleset";
import { prisma } from "@/lib/db";
import { formatCgccpf } from "@/lib/format";
import {
  renderAuditoriaReportHtml,
  type AuditoriaPronacBlock,
} from "@/lib/reports/html";
import { htmlToPdf, reportFileStamp } from "@/lib/reports/pdf";
import { hiddenProjectIds } from "@/lib/compliance/over-limit-visibility";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    const { entitlements } = await getWorkspaceContext();
    const workspaceId = entitlements.workspaceId;
    const url = new URL(request.url);
    const pronacs = (url.searchParams.get("pronacs") || "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    if (!pronacs.length) {
      return NextResponse.json(
        { error: "Informe ao menos um PRONAC" },
        { status: 400 },
      );
    }
    if (pronacs.length > 40) {
      return NextResponse.json(
        { error: "Selecione no máximo 40 PRONACs por relatório" },
        { status: 400 },
      );
    }

    const watchedSuppliers = await listWatchedSuppliers(workspaceId);
    const { formatPrecisionDate: fmtDate } = await import(
      "@/lib/corporate/dates"
    );

    const blocks: AuditoriaPronacBlock[] = [];

    const hidden = await hiddenProjectIds();
    for (const pronac of pronacs) {
      const detail = await getPronacDetail(pronac, { workspaceId, hiddenProjectIds: hidden });
      const account = detail.accounts[0];
      if (!account) continue;

      const rules = await rulesForProject({
        complianceRulesetId: detail.compliance?.rulesetId,
      });
      const bundle = await loadComplianceBundle([account.id], { workspaceId });
      const meta = metaForProject(bundle, account.id, detail.projectId);

      const alerts = evaluatePronacSupplierCompliance({
        pronac: detail.pronac,
        projectName: detail.name,
        projectTotal: detail.projectTotal,
        accountCgccpf: account.cgccpf,
        personType: meta.personType || account.personType,
        relatedParties: meta.relatedParties,
        rules,
        suppliers: detail.allSuppliers,
        bondSuppliers: detail.bondSuppliers,
      });
      const critical = alerts.filter((a) => a.level === "critical").length;
      const attention = alerts.filter((a) => a.level === "attention").length;
      const alertsSummary =
        alerts.length === 0
          ? "Nenhum alerta de teto neste PRONAC."
          : `${alerts.length} alerta(s): ${critical} crítico(s), ${attention} atenção.`;

      const fullAccount = await prisma.salicAccount.findUnique({
        where: { id: account.id },
        include: {
          corporatePeriods: {
            orderBy: { validFrom: "desc" },
            include: { members: { orderBy: { name: "asc" } } },
          },
        },
      });

      const institutional = Boolean(fullAccount?.institutionalMap);
      const copy = corporateMapCopy(institutional);

      // Só a composição do período dos pagamentos (sem pagamentos, o ano do PRONAC),
      // igual ao lembrete do mapa na tela do PRONAC.
      const paymentRange = detail.projectId
        ? await prisma.payment.aggregate({
            where: { projectId: detail.projectId, paymentDate: { not: null } },
            _min: { paymentDate: true },
            _max: { paymentDate: true },
          })
        : null;
      const mapWindow = mapWindowForProject({
        pronacYear: pronacYear(detail.pronac),
        firstPayment: paymentRange?._min.paymentDate,
        lastPayment: paymentRange?._max.paymentDate,
      });
      const periodosDoProjeto = periodsInYears(
        fullAccount?.corporatePeriods ?? [],
        mapWindow.fromYear,
        mapWindow.toYear,
      ).reverse();
      const mapIntro = `<p style="color:#6b7280;font-size:12px;margin:0 0 8px">${copy.membersCap} em ${escape(mapWindow.label)}. ${escape(mapWindow.basis)} As datas são de entrada e saída de cada um, não de pagamento.</p>`;

      let corporateMapHtml = fullAccount?.corporatePeriods.length
        ? `${mapIntro}<p style="color:#6b7280;font-size:12px">Nenhum período do mapa cobre ${escape(mapWindow.label)}.</p>`
        : `<p style="color:#6b7280;font-size:12px">${copy.reportEmpty}</p>`;
      if (periodosDoProjeto.length) {
        corporateMapHtml = mapIntro + periodosDoProjeto
          .map((p) => {
            const from = fmtDate(p.validFrom, p.validFromPrecision);
            const to = p.validTo
              ? fmtDate(p.validTo, p.validToPrecision)
              : "vigente";
            const rows =
              p.members.length === 0
                ? `<tr><td colspan="4">${copy.emptyMembersShort}</td></tr>`
                : p.members
                    .map(
                      (m) => `
                  <tr>
                    <td>${escape(m.name)}</td>
                    <td>${escape(m.personType)}</td>
                    <td>${escape(formatCgccpf(m.cgccpf))}</td>
                    <td>${escape(corporateRoleLabel(m.role, institutional))}</td>
                  </tr>`,
                    )
                    .join("");
            return `
              <div class="panel keep" style="margin-bottom:10px">
                <strong>${escape(p.label || "Intervalo")}</strong>
                <div style="font-size:11px;color:#6b7280;margin:4px 0 8px">${escape(from)} → ${escape(to)}</div>
                <table>
                  <thead><tr><th>Nome</th><th>Tipo</th><th>CPF/CNPJ</th><th>Papel</th></tr></thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>`;
          })
          .join("");
      }

      blocks.push({
        pronac: detail.pronac,
        name: detail.name || detail.pronac,
        accountName: account.name,
        accountCgccpf: account.cgccpf,
        rules,
        personType: meta.personType || account.personType,
        relatedParties: meta.relatedParties,
        projectTotal: detail.projectTotal,
        paidTotal: detail.paidTotal,
        suppliers: detail.allSuppliers.map((s) => ({
          name: s.name,
          cgccpf: s.cgccpf,
          total: s.total,
          percent: s.percent,
          count: s.count,
        })),
        bondSuppliers: detail.bondSuppliers.map((s) => ({
          name: s.name,
          cgccpf: s.cgccpf,
          total: s.total,
          percent: s.percent,
          count: s.count,
        })),
        watchedSuppliers: watchedSuppliers
          .filter((w) => {
            const dig = (w.cgccpf || "").replace(/\D/g, "");
            return (
              dig.length >= 11 &&
              detail.allSuppliers.some(
                (s) => s.cgccpf.replace(/\D/g, "") === dig,
              )
            );
          })
          .map((w) => ({
            name: w.name,
            cgccpf: w.cgccpf,
            label: w.label,
          })),
        payments: detail.payments.map((p) => ({
          paymentDate: p.paymentDate?.toISOString() ?? null,
          supplierName: p.supplier.name,
          itemName: p.itemName,
          countsForBond: p.countsForBond,
          documentNumber: p.documentNumber,
          amount: Number(p.amount),
        })),
        corporateMapHtml,
        alertsSummary,
        alertLevels: alerts.map((a) => a.level),
        alertTitles: alerts.filter((a) => a.level !== "info").map((a) => a.title),
        institutionalMap: institutional,
      });
    }

    if (!blocks.length) {
      return NextResponse.json(
        { error: "Nenhum PRONAC válido no workspace" },
        { status: 404 },
      );
    }

    const html = await renderAuditoriaReportHtml({ blocks });
    const pdf = await htmlToPdf(html);
    const filename = `max-auditoria-auditoria-${reportFileStamp()}.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao gerar relatório";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function escape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
