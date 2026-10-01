import { readFile } from "fs/promises";
import path from "path";
import { formatCurrency, formatDate } from "@/lib/format";
import type { ContasAPagarRow } from "@/lib/planning/contas-a-pagar";

const NAVY = "#192d5c";
const GRAY_500 = "#6b7280";
const BORDER = "#e8eaef";
const NAVY_SOFT = "#eef1f7";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatNow() {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value || "";
  return `${get("day")}/${get("month")}/${get("year")} · ${get("hour")}:${get("minute")}`;
}

async function loadLogoDataUri() {
  const file = path.join(process.cwd(), "public/brand/max-origem.png");
  const buf = await readFile(file);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

export async function renderContasAPagarReportHtml(params: {
  rows: ContasAPagarRow[];
  filterLabels: string[];
}): Promise<string> {
  const logoDataUri = await loadLogoDataUri();
  const generatedAt = formatNow();
  const total = params.rows.reduce((s, r) => s + r.amount, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const filterChips = params.filterLabels.length
    ? params.filterLabels
        .map(
          (l) =>
            `<span style="display:inline-block;margin:0 6px 6px 0;padding:4px 8px;border-radius:999px;background:${NAVY_SOFT};color:${NAVY};font-size:10px;font-weight:600;">${escapeHtml(l)}</span>`,
        )
        .join("")
    : `<span style="color:${GRAY_500}">Sem filtros aplicados</span>`;

  const bodyRows =
    params.rows.length === 0
      ? `<tr><td colspan="6" style="padding:16px;color:${GRAY_500};text-align:center;">Nenhum compromisso com os filtros atuais.</td></tr>`
      : params.rows
          .map((r) => {
            const due = new Date(r.expectedPayAt);
            due.setHours(0, 0, 0, 0);
            const overdue = due < today;
            const origin =
              r.origin === "pedido"
                ? `Pedido${r.installmentNumber ? ` · parc. ${r.installmentNumber}` : ""}`
                : "Reserva";
            return `<tr>
              <td style="padding:8px 10px;border-bottom:1px solid ${BORDER};${overdue ? `color:#b91c1c;font-weight:700;` : ""}">${escapeHtml(formatDate(r.expectedPayAt))}</td>
              <td style="padding:8px 10px;border-bottom:1px solid ${BORDER};font-weight:600;">${escapeHtml(r.externalCode)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid ${BORDER};">${escapeHtml(r.supplierName)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid ${BORDER};color:${GRAY_500};">${escapeHtml(r.rubricLabel)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid ${BORDER};text-align:right;font-weight:700;white-space:nowrap;">${escapeHtml(formatCurrency(r.amount))}</td>
              <td style="padding:8px 10px;border-bottom:1px solid ${BORDER};color:${GRAY_500};">${escapeHtml(origin)}</td>
            </tr>`;
          })
          .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="max-origem-generated-at" content="${escapeHtml(generatedAt)}" />
  <title>Contas a pagar</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    @page { size: A4; margin: 14mm 12mm 16mm; }
    body {
      margin: 0;
      color: ${NAVY};
      font-family: "Montserrat", system-ui, sans-serif;
      font-size: 11px;
      line-height: 1.4;
      background: #fff;
    }
    .header {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      border-bottom: 2px solid ${NAVY};
      padding-bottom: 14px;
      margin-bottom: 16px;
    }
    .logo { height: 36px; width: auto; }
    h1 { margin: 0; font-size: 20px; }
    .subtitle { margin: 4px 0 0; color: ${GRAY_500}; }
    .meta { text-align: right; color: ${GRAY_500}; font-size: 10px; }
    .kpi {
      display: flex;
      gap: 12px;
      margin: 0 0 14px;
    }
    .kpi div {
      flex: 1;
      border: 1px solid ${BORDER};
      border-radius: 10px;
      padding: 10px 12px;
      background: ${NAVY_SOFT};
    }
    .kpi .label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: ${GRAY_500}; font-weight: 700; }
    .kpi .value { margin-top: 4px; font-size: 16px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; }
    th {
      text-align: left;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: ${GRAY_500};
      border-bottom: 1px solid ${BORDER};
      padding: 8px 10px;
      background: #f8f9fc;
    }
    th.right, td.right { text-align: right; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <img class="logo" src="${logoDataUri}" alt="MAX Origem" />
      <h1>Contas a pagar</h1>
      <p class="subtitle">Compromissos reservados — planejamento</p>
    </div>
    <div class="meta">
      <div>MAX Origem</div>
      <div style="margin-top:4px;font-size:12px;color:${NAVY};font-weight:600;">${escapeHtml(generatedAt)}</div>
    </div>
  </div>

  <div style="margin-bottom:12px;">${filterChips}</div>

  <div class="kpi">
    <div>
      <div class="label">Itens</div>
      <div class="value">${params.rows.length}</div>
    </div>
    <div>
      <div class="label">Total a pagar</div>
      <div class="value">${escapeHtml(formatCurrency(total))}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Vencimento</th>
        <th>Projeto</th>
        <th>Fornecedor</th>
        <th>Rubrica</th>
        <th class="right">Valor</th>
        <th>Origem</th>
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>
</body>
</html>`;
}
