import { readFile } from "fs/promises";
import path from "path";
import { formatCurrency, formatCgccpf, formatDate, normalizeCgccpf } from "@/lib/crypto";
import { formatPercent, sharePercent } from "@/lib/audit";
import {
  computeProponentGroupShare,
  evaluatePronacSupplierCompliance,
  isExcludedFromBondItem,
  isNearLimit,
  legalBasisNote,
  proponentLimitPct,
  relatedPartyCountsTowardCap,
  type ComplianceAlert,
  type PersonTypeInput,
  type RelatedPartyInput,
} from "@/lib/compliance/rouanet";
import {
  DEFAULT_RULES,
  RELATION_LABELS,
  type ActiveRules,
  type RelationKind,
} from "@/lib/compliance/defaults";
import { corporateMapCopy, corporateRoleLabel } from "@/lib/corporate/copy";

const NAVY = "#192d5c";
const GOLD = "#be9f79";
const GOLD_SOFT = "#f5efe8";
const NAVY_SOFT = "#eef1f7";
const GRAY_500 = "#6b7280";
const GRAY_100 = "#eef0f4";
const BORDER = "#e8eaef";

export type ReportWarning = {
  level: "info" | "attention" | "critical";
  title: string;
  detail: string;
};

export type ReportFiltersMeta = {
  accountName?: string | null;
  pronac?: string | null;
  from?: string | null;
  to?: string | null;
  watchedOnly: boolean;
  watchedCount: number;
};

async function loadLogoDataUri() {
  const file = path.join(process.cwd(), "public/brand/max-origem.png");
  const buf = await readFile(file);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

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

function barChartSvg(
  items: Array<{ label: string; value: number; percent: number }>,
  options?: { maxBars?: number; /** percent = escala 0–100% (padrão; rótulo = largura) */ scale?: "value" | "percent" },
) {
  const maxBars = options?.maxBars ?? 8;
  const scale = options?.scale ?? "percent";
  const rows = items.slice(0, maxBars);
  const max =
    scale === "percent" ? 100 : Math.max(...rows.map((r) => r.value), 1);
  const rowH = 28;
  const width = 680;
  const labelW = 210;
  const barMax = width - labelW - 90;
  const height = Math.max(80, rows.length * rowH + 16);

  const bars = rows
    .map((row, i) => {
      const y = 12 + i * rowH;
      const amount = scale === "percent" ? row.percent : row.value;
      const w = Math.max(4, (amount / max) * barMax);
      const label = escapeHtml(row.label.slice(0, 28));
      return `
        <text x="0" y="${y + 14}" font-size="11" fill="${NAVY}" font-family="Montserrat, sans-serif">${label}</text>
        <rect x="${labelW}" y="${y}" width="${barMax}" height="16" rx="8" fill="${GRAY_100}" />
        <rect x="${labelW}" y="${y}" width="${w}" height="16" rx="8" fill="${GOLD}" />
        <text x="${labelW + barMax + 8}" y="${y + 13}" font-size="11" fill="${GRAY_500}" font-family="Montserrat, sans-serif">${row.percent.toFixed(4).replace(".", ",")}%</text>
      `;
    })
    .join("");

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`;
}

function donutSvg(watched: number, rest: number) {
  const total = watched + rest;
  if (total <= 0) {
    return `<p style="color:${GRAY_500}">Sem dados para o gráfico.</p>`;
  }
  const r = 54;
  const c = 2 * Math.PI * r;
  const watchedPct = watched / total;
  const dash = watchedPct * c;
  return `
    <svg viewBox="0 0 160 160" width="150" height="150" xmlns="http://www.w3.org/2000/svg">
      <circle cx="80" cy="80" r="${r}" fill="none" stroke="${GRAY_100}" stroke-width="18" />
      <circle cx="80" cy="80" r="${r}" fill="none" stroke="${GOLD}" stroke-width="18"
        stroke-dasharray="${dash} ${c - dash}" stroke-linecap="round"
        transform="rotate(-90 80 80)" />
      <text x="80" y="76" text-anchor="middle" font-size="18" font-weight="700" fill="${NAVY}" font-family="Montserrat, sans-serif">${(watchedPct * 100).toFixed(0)}%</text>
      <text x="80" y="96" text-anchor="middle" font-size="10" fill="${GRAY_500}" font-family="Montserrat, sans-serif">observados</text>
    </svg>
  `;
}

function warningsHtml(warnings: ReportWarning[]) {
  if (warnings.length === 0) {
    return `
      <div class="alert info">
        <strong>Sem alertas críticos</strong>
        <p>Com os filtros atuais, não há concentrações ou sinais fora dos limiares configurados.</p>
      </div>
    `;
  }

  return warnings
    .map((w) => {
      const cls = w.level === "critical" ? "critical" : w.level === "attention" ? "attention" : "info";
      return `
        <div class="alert ${cls}">
          <strong>${escapeHtml(w.title)}</strong>
          <p>${escapeHtml(w.detail)}</p>
        </div>
      `;
    })
    .join("");
}

type ReportSupplier = {
  name: string;
  cgccpf: string;
  total: number;
  percent?: number;
  count?: number;
};

type ReportWatched = {
  name: string;
  cgccpf: string | null;
  label: string | null;
};

function relationLabel(relation?: string | null) {
  if (!relation) return "—";
  return RELATION_LABELS[relation as RelationKind] || relation;
}

/** Seção prioritária: soma % só de quem gera vínculo art. 23 + lista de todos os observados. */
function bondAndWatchedHtml(params: {
  projectTotal: number;
  paidTotal?: number;
  accountCgccpf?: string | null;
  personType?: PersonTypeInput | null;
  relatedParties?: RelatedPartyInput[];
  rules: ActiveRules;
  /** Base completa do PRONAC (não só filtro de observados). */
  suppliers: ReportSupplier[];
  /** Totais §1º sem alimentação/refeição. */
  bondSuppliers?: ReportSupplier[];
  watchedSuppliers?: ReportWatched[];
}) {
  const rules = params.rules;
  const comprovado =
    params.paidTotal && params.paidTotal > 0
      ? params.paidTotal
      : params.projectTotal;
  const bondList = params.bondSuppliers?.length
    ? params.bondSuppliers
    : params.suppliers;
  const group = computeProponentGroupShare({
    projectTotal: params.projectTotal,
    accountCgccpf: params.accountCgccpf,
    personType: params.personType,
    suppliers: bondList.map((s) => ({
      name: s.name,
      cgccpf: s.cgccpf,
      total: s.total,
    })),
    relatedParties: params.relatedParties,
    rules,
  });

  const relatedCounting = (params.relatedParties || []).filter((r) =>
    relatedPartyCountsTowardCap(r, rules),
  );
  const bondSet = new Set(relatedCounting.map((r) => normalizeCgccpf(r.cgccpf)));
  if (params.accountCgccpf) {
    bondSet.add(normalizeCgccpf(params.accountCgccpf));
  }
  const relationByCgccpf = new Map(
    (params.relatedParties || []).map((r) => [
      normalizeCgccpf(r.cgccpf),
      r.relation || null,
    ]),
  );

  const paidByCgccpf = new Map(
    params.suppliers.map((s) => [normalizeCgccpf(s.cgccpf), s]),
  );

  const limitPct =
    params.personType === "PF" || params.personType === "MEI"
      ? rules.caps.proponentMeiCapPct
      : rules.caps.proponentCapPct;

  const bondSection = group
    ? `
    <h2>Vínculos art. 23 — soma prioritária</h2>
    <div class="panel keep" style="border-color:${GOLD};background:${GOLD_SOFT}">
      <p style="margin:0 0 10px;font-size:12px;color:${NAVY}">
        Soma apenas de <strong>proponente + observados com vínculo ligado</strong> na IN
        ${escapeHtml(rules.sourceCode)} (${escapeHtml(rules.caps.articles.proponent)}).
        Limite: <strong>${limitPct}%</strong> do captado.
      </p>
      <table>
        <thead>
          <tr>
            <th>Parte</th>
            <th>Papel</th>
            <th>Vínculo</th>
            <th class="num">Total</th>
            <th class="num">% captado</th>
            <th class="num">% comprovado</th>
          </tr>
        </thead>
        <tbody>
          ${group.members
            .map((m) => {
              const rel =
                m.role === "proponent" ? "Proponente" : "Com vínculo";
              return `
            <tr>
              <td><strong>${escapeHtml(m.name)}</strong>
                <div style="color:${GRAY_500};font-size:10px">${escapeHtml(formatCgccpf(m.cgccpf))}</div>
              </td>
              <td>${m.role === "proponent" ? "Proponente" : "Observado"}</td>
              <td>${escapeHtml(rel)}</td>
              <td class="num">${formatCurrency(m.amount)}</td>
              <td class="num"><strong>${formatPercent(m.amount, params.projectTotal)}</strong></td>
              <td class="num">${formatPercent(m.amount, comprovado)}</td>
            </tr>`;
            })
            .join("")}
          <tr style="background:#fff;font-weight:700">
            <td colspan="3">Soma dos % que geram vínculo</td>
            <td class="num">${formatCurrency(group.amount)}</td>
            <td class="num" style="color:${group.percent > limitPct ? "#b42318" : NAVY}">
              ${formatPercent(group.amount, params.projectTotal)}
              <span style="font-weight:600;color:${GRAY_500}"> / ${limitPct}%</span>
            </td>
            <td class="num">${formatPercent(group.amount, comprovado)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `
    : `
    <h2>Vínculos art. 23</h2>
    <div class="alert info">
      <strong>Sem soma de vínculo neste PRONAC</strong>
      <p>Não há pagamentos a observados com vínculo ligado nesta IN (${escapeHtml(rules.sourceCode)}). Ative o vínculo no detalhe do PRONAC quando couber.</p>
    </div>
  `;

  const watched = (params.watchedSuppliers || []).filter((w) => {
    const dig = normalizeCgccpf(w.cgccpf || "");
    return dig.length >= 11 && paidByCgccpf.has(dig);
  });
  const watchedSection =
    watched.length === 0
      ? `
    <h2>Observados neste PRONAC</h2>
    <div class="alert attention">
      <strong>Nenhum observado com pagamento neste PRONAC</strong>
      <p>Só entram aqui observados que receberam neste projeto.</p>
    </div>
  `
      : `
    <h2>Observados neste PRONAC</h2>
    <div class="panel">
      <p style="margin:0 0 10px;font-size:11px;color:${GRAY_500}">
        Observados com pagamento neste projeto. Vínculo Sim/Não conforme a IN ${escapeHtml(rules.sourceCode)}.
      </p>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Observado</th>
            <th>CNPJ/CPF</th>
            <th>Vínculo art. 23</th>
            <th class="num">Pago neste PRONAC</th>
            <th class="num">% captado</th>
            <th class="num">% comprovado</th>
          </tr>
        </thead>
        <tbody>
          ${watched
            .map((w, i) => {
              const dig = normalizeCgccpf(w.cgccpf || "");
              const isBond = dig ? bondSet.has(dig) : false;
              const paid = dig ? paidByCgccpf.get(dig) : undefined;
              return `
            <tr>
              <td>${i + 1}</td>
              <td>
                <strong>${escapeHtml(w.name)}</strong>
                ${w.label && w.label !== w.name ? `<div style="color:${GRAY_500};font-size:10px">${escapeHtml(w.label)}</div>` : ""}
              </td>
              <td>${escapeHtml(formatCgccpf(w.cgccpf))}</td>
              <td>
                ${
                  isBond
                    ? `<span style="font-weight:600;color:${NAVY}">Sim</span>`
                    : `<span style="color:${GRAY_500}">Não</span>`
                }
              </td>
              <td class="num">${paid ? formatCurrency(paid.total) : "—"}</td>
              <td class="num">${
                paid
                  ? formatPercent(paid.total, params.projectTotal)
                  : "—"
              }</td>
              <td class="num">${
                paid ? formatPercent(paid.total, comprovado) : "—"
              }</td>
            </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  return `${bondSection}${watchedSection}`;
}

function shellHtml(params: {
  title: string;
  subtitle: string;
  logoDataUri: string;
  filters: ReportFiltersMeta;
  body: string;
  rules?: ActiveRules;
  /** Sobrescreve o chip de limite (ex.: panorama multi-IN). */
  rulesChipLabel?: string;
}) {
  const generatedAt = formatNow();
  const filterBits = [
    params.filters.accountName ? `Proponente: ${params.filters.accountName}` : "Proponente: todos",
    params.filters.pronac ? `PRONAC: ${params.filters.pronac}` : null,
    params.filters.from ? `De: ${params.filters.from}` : null,
    params.filters.to ? `Até: ${params.filters.to}` : null,
    params.filters.watchedOnly
      ? `Fornecedores: observados (${params.filters.watchedCount})`
      : "Fornecedores: todos",
  ]
    .filter(Boolean)
    .map((x) => escapeHtml(String(x)));

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="max-origem-generated-at" content="${escapeHtml(generatedAt)}" />
  <title>${escapeHtml(params.title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --navy: ${NAVY};
      --gold: ${GOLD};
      --gold-soft: ${GOLD_SOFT};
      --navy-soft: ${NAVY_SOFT};
      --gray-500: ${GRAY_500};
      --border: ${BORDER};
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--navy);
      font-family: "Montserrat", system-ui, sans-serif;
      background: #fff;
      font-size: 12px;
      line-height: 1.45;
    }
    .page { padding: 28px 32px 40px; }
    .header {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      align-items: flex-start;
      border-bottom: 2px solid var(--navy);
      padding-bottom: 18px;
      margin-bottom: 22px;
    }
    .logo { height: 42px; width: auto; }
    .eyebrow {
      margin: 0 0 4px;
      font-size: 10px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--gray-500);
      font-weight: 600;
    }
    h1 { margin: 0; font-size: 22px; font-weight: 700; }
    .subtitle { margin: 6px 0 0; color: var(--gray-500); font-size: 12px; }
    .meta {
      text-align: right;
      color: var(--gray-500);
      font-size: 11px;
    }
    .meta .timestamp {
      margin-top: 4px;
      font-size: 13px;
      font-weight: 700;
      color: var(--navy);
      font-variant-numeric: tabular-nums;
    }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 22px; }
    .chip {
      background: var(--navy-soft);
      color: var(--navy);
      border-radius: 999px;
      padding: 6px 12px;
      font-size: 11px;
      font-weight: 600;
    }
    .chip.gold { background: var(--gold-soft); }
    h2 {
      margin: 28px 0 12px;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.02em;
      break-after: avoid;
      page-break-after: avoid;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin: 12px 0 8px;
    }
    .card {
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 14px;
      background: #fff;
    }
    .card .label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--gray-500);
      font-weight: 600;
    }
    .card .value {
      margin-top: 8px;
      font-size: 18px;
      font-weight: 700;
      color: var(--navy);
    }
    .card .hint { margin-top: 6px; font-size: 11px; color: var(--gray-500); }
    .grid-2 {
      display: grid;
      grid-template-columns: 1.4fr 0.8fr;
      gap: 18px;
      align-items: center;
    }
    .panel {
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 16px;
      background: #fff;
    }
    table {
      width: 100%;
      /* separate + spacing 0: Chromium respeita break-inside em <tr> */
      border-collapse: separate;
      border-spacing: 0;
      font-size: 11px;
    }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    th, td {
      text-align: left;
      padding: 8px 6px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    th {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--gray-500);
      background: #fff;
    }
    td.num, th.num { text-align: right; white-space: nowrap; }
    tr, th, td {
      break-inside: avoid;
      page-break-inside: avoid;
      -webkit-column-break-inside: avoid;
    }
    tbody.pronac-group {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    /* Grupos grandes podem precisar quebrar; linhas individuais nunca cortam */
    tbody.pronac-group.allow-split {
      break-inside: auto;
      page-break-inside: auto;
    }
    tr.pronac-row {
      background: var(--navy-soft);
      break-after: avoid;
      page-break-after: avoid;
    }
    tr.pronac-row td {
      font-weight: 600;
      border-bottom-color: #d7dce8;
      background: var(--navy-soft);
    }
    tr.supplier-row td {
      background: #fff;
      color: var(--navy);
      font-weight: 400;
      font-size: 10.5px;
    }
    tr.supplier-header td {
      break-after: avoid;
      page-break-after: avoid;
    }
    tr.supplier-row td.indent {
      padding-left: 18px;
    }
    .supplier-mark {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 99px;
      background: var(--gold);
      margin-right: 8px;
      vertical-align: middle;
    }
    .mini-bar {
      height: 6px;
      border-radius: 99px;
      background: #eef0f4;
      overflow: hidden;
      min-width: 72px;
    }
    .mini-bar > span {
      display: block;
      height: 100%;
      background: var(--gold);
      border-radius: 99px;
    }
    .alert {
      border-radius: 12px;
      padding: 12px 14px;
      margin-bottom: 10px;
      border: 1px solid var(--border);
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .alert strong { display: block; margin-bottom: 4px; }
    .alert p { margin: 0; color: var(--gray-500); }
    .alert.info { background: var(--navy-soft); }
    .alert.attention { background: var(--gold-soft); border-color: #e5d3bb; }
    .alert.critical { background: #fdecec; border-color: #f2c7c7; }
    .card, .panel.keep {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .footer {
      margin-top: 28px;
      padding-top: 12px;
      border-top: 1px solid var(--border);
      color: var(--gray-500);
      font-size: 10px;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .header, .chips, .cards {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .grid-2 {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    @page {
      size: A4;
      margin: 14mm 12mm;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { padding: 0; }
      a { color: inherit; text-decoration: none; }
    }
  </style>
</head>
<body>
  <div class="page">
    <header class="header">
      <div>
        <img class="logo" src="${params.logoDataUri}" alt="MAX Origem" />
        <p class="eyebrow" style="margin-top:14px">Relatório de auditoria</p>
        <h1>${escapeHtml(params.title)}</h1>
        <p class="subtitle">${escapeHtml(params.subtitle)}</p>
      </div>
      <div class="meta">
        <div><strong>Gerado em</strong></div>
        <div class="timestamp">${escapeHtml(generatedAt)}</div>
        <div style="margin-top:10px">MAX Origem · Auditoria & Gestão</div>
      </div>
    </header>

    <div class="chips">
      ${filterBits.map((b) => `<span class="chip">${b}</span>`).join("")}
      ${params.filters.watchedOnly ? `<span class="chip gold">Modo observação</span>` : ""}
      <span class="chip">${
        params.rulesChipLabel ||
        `Limite legal ${(params.rules || DEFAULT_RULES).caps.supplierCapPct}% · ${(params.rules || DEFAULT_RULES).sourceCode}`
      }</span>
      <span class="chip">Gerado em ${escapeHtml(generatedAt)}</span>
    </div>

    ${params.body}

    <footer class="footer">
      <span>Documento gerado automaticamente pelo MAX Origem para apoio à auditoria de gastos SALIC.</span>
      <span>Gerado em ${escapeHtml(generatedAt)}</span>
    </footer>
  </div>
</body>
</html>`;
}

export function buildPronacListWarnings(
  rows: Array<{
    pronac: string;
    name: string | null;
    total: number;
    projectTotal: number;
    supplierCount: number;
    accountCgccpf?: string | null;
    accountId?: string;
    personType?: PersonTypeInput | null;
    relatedParties?: RelatedPartyInput[];
    rules?: ActiveRules;
    bySupplier?: Array<{
      name: string;
      cgccpf: string;
      total: number;
    }>;
    allBySupplier?: Array<{
      name: string;
      cgccpf: string;
      total: number;
    }>;
    bondBySupplier?: Array<{
      name: string;
      cgccpf: string;
      total: number;
    }>;
  }>,
  filters: ReportFiltersMeta,
  fallbackRules: ActiveRules = DEFAULT_RULES,
): ReportWarning[] {
  const warnings: ReportWarning[] = [];

  if (filters.watchedOnly && filters.watchedCount === 0) {
    warnings.push({
      level: "attention",
      title: "Lista de observados vazia",
      detail: "O filtro de observados está ativo, mas não há fornecedores cadastrados na observação.",
    });
  }

  if (filters.watchedOnly && rows.length === 0) {
    warnings.push({
      level: "attention",
      title: "Sem ocorrências dos observados",
      detail: "Nenhum PRONAC do filtro contém pagamentos aos fornecedores observados.",
    });
  }

  const legal: ComplianceAlert[] = [];
  for (const row of rows) {
    const suppliersForCap = row.allBySupplier?.length
      ? row.allBySupplier
      : row.bySupplier;
    if (!suppliersForCap?.length) continue;
    const rules = row.rules || fallbackRules;
    legal.push(
      ...evaluatePronacSupplierCompliance({
        pronac: row.pronac,
        projectName: row.name,
        projectTotal: row.projectTotal,
        accountCgccpf: row.accountCgccpf,
        personType: row.personType,
        relatedParties: row.relatedParties,
        rules,
        suppliers: suppliersForCap,
        bondSuppliers: row.bondBySupplier?.length
          ? row.bondBySupplier
          : suppliersForCap,
      }),
    );
  }

  for (const alert of legal.slice(0, 12)) {
    warnings.push({
      level: alert.level,
      title: alert.title,
      detail: alert.detail,
    });
  }

  if (legal.length === 0 && rows.length > 0) {
    warnings.push({
      level: "info",
      title: "Nenhum fornecedor acima do teto da IN do projeto (proxy)",
      detail:
        "Os limites aplicados são os da IN vinculada a cada PRONAC (cobertura + tetos). " +
        legalBasisNote(fallbackRules),
    });
  }

  return warnings.slice(0, 14);
}

export function buildPronacDetailWarnings(params: {
  pronac: string;
  projectTotal: number;
  watchedTotal: number;
  watchedOnly: boolean;
  accountCgccpf?: string | null;
  personType?: PersonTypeInput | null;
  relatedParties?: RelatedPartyInput[];
  rules?: ActiveRules;
  suppliers: Array<{ name: string; cgccpf: string; total: number; percent: number }>;
  /** Base completa do PRONAC para art. 23 §1º (quando filtro de observados). */
  allSuppliers?: Array<{ name: string; cgccpf: string; total: number; percent: number }>;
  /** Totais §1º sem alimentação/refeição. */
  bondSuppliers?: Array<{ name: string; cgccpf: string; total: number; percent: number }>;
}): ReportWarning[] {
  const rules = params.rules || DEFAULT_RULES;
  const warnings: ReportWarning[] = [];

  const legal = evaluatePronacSupplierCompliance({
    pronac: params.pronac,
    projectTotal: params.projectTotal,
    accountCgccpf: params.accountCgccpf,
    personType: params.personType,
    relatedParties: params.relatedParties,
    rules,
    suppliers: params.allSuppliers?.length ? params.allSuppliers : params.suppliers,
    bondSuppliers: params.bondSuppliers?.length
      ? params.bondSuppliers
      : params.allSuppliers?.length
        ? params.allSuppliers
        : params.suppliers,
  });

  for (const alert of legal) {
    warnings.push({
      level: alert.level,
      title: alert.title,
      detail: alert.detail,
    });
  }

  if (params.watchedOnly && params.projectTotal > 0) {
    const share = sharePercent(params.watchedTotal, params.projectTotal);
    warnings.push({
      level: "info",
      title: `Observados representam ${share.toFixed(4).replace(".", ",")}% do projeto`,
      detail: `${formatCurrency(params.watchedTotal)} de ${formatCurrency(params.projectTotal)} no PRONAC ${params.pronac}. Este percentual conjunto não é o teto do ${rules.caps.articles.supplier} (o teto é por fornecedor).`,
    });
  }

  if (params.watchedOnly && params.suppliers.length === 0) {
    warnings.push({
      level: "attention",
      title: "Nenhum observado neste PRONAC",
      detail: "Com o filtro atual, não há pagamentos aos fornecedores da lista de observação.",
    });
  }

  if (legal.length === 0 && params.suppliers.length > 0) {
    warnings.push({
      level: "info",
      title: `Conformidade proxy — teto ${rules.caps.supplierCapPct}%`,
      detail: legalBasisNote(rules),
    });
  }

  return warnings;
}

export async function renderPronacOverviewHtml(params: {
  filters: ReportFiltersMeta;
  rules?: ActiveRules;
  watchedSuppliers?: Array<{
    name: string;
    cgccpf: string | null;
    label: string | null;
  }>;
  rows: Array<{
    pronac: string;
    name: string | null;
    accountName: string;
    accountId?: string;
    accountCgccpf?: string | null;
    personType?: PersonTypeInput | null;
    relatedParties?: RelatedPartyInput[];
    rules?: ActiveRules;
    rulesetSourceCode?: string | null;
    total: number;
    projectTotal: number;
    paidTotal?: number;
    paymentCount: number;
    supplierCount: number;
    bySupplier?: Array<{
      name: string;
      cgccpf: string;
      total: number;
      count: number;
      percentOfProject: number;
    }>;
    allBySupplier?: Array<{
      name: string;
      cgccpf: string;
      total: number;
      count: number;
      percentOfProject: number;
    }>;
    bondBySupplier?: Array<{
      name: string;
      cgccpf: string;
      total: number;
      count: number;
      percentOfProject: number;
    }>;
  }>;
}) {
  const fallbackRules = params.rules || DEFAULT_RULES;
  const logoDataUri = await loadLogoDataUri();
  const grandTotal = params.rows.reduce((s, r) => s + r.total, 0);
  const projectGrand = params.rows.reduce((s, r) => s + r.projectTotal, 0);
  const warnings = buildPronacListWarnings(params.rows, params.filters, fallbackRules);
  const watchedList = params.watchedSuppliers || [];

  const codes = [
    ...new Set(
      params.rows.map((r) => r.rulesetSourceCode || r.rules?.sourceCode || fallbackRules.sourceCode),
    ),
  ];
  const rulesChipLabel =
    codes.length <= 1
      ? `Limite legal ${(params.rows[0]?.rules || fallbackRules).caps.supplierCapPct}% · ${codes[0] || fallbackRules.sourceCode}`
      : `Limites por IN do projeto (${codes.length} normas no filtro)`;

  const chartItems = [...params.rows]
    .map((r) => ({
      label: `PRONAC ${r.pronac}`,
      value: r.total,
      percent: params.filters.watchedOnly
        ? sharePercent(r.total, r.projectTotal || 1)
        : sharePercent(r.total, grandTotal || 1),
    }))
    .sort((a, b) =>
      params.filters.watchedOnly ? b.percent - a.percent : b.value - a.value,
    )
    .slice(0, 8);

  const colCount = params.filters.watchedOnly ? 10 : 8;

  const watchedSection =
    watchedList.length > 0
      ? `
    <h2>Todos os observados</h2>
    <div class="panel keep">
      <p style="margin:0 0 10px;font-size:11px;color:${GRAY_500}">
        Lista completa de observação. No detalhe por PRONAC, a soma prioritária é só de quem gera vínculo art. 23.
      </p>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Fornecedor</th>
            <th>CNPJ/CPF</th>
            <th>Rótulo</th>
          </tr>
        </thead>
        <tbody>
          ${watchedList
            .map(
              (w, i) => `
            <tr>
              <td>${i + 1}</td>
              <td><strong>${escapeHtml(w.name)}</strong></td>
              <td>${escapeHtml(formatCgccpf(w.cgccpf))}</td>
              <td>${escapeHtml(w.label || "—")}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `
      : `
    <h2>Fornecedores observados</h2>
    <div class="alert attention">
      <strong>Lista de observados vazia</strong>
      <p>Cadastre fornecedores em Fornecedores. Os vínculos art. 23 usam o cadastro de relacionamentos da conta.</p>
    </div>
  `;

  const detailBodies = params.rows
    .map((r) => {
      const rowRules = r.rules || fallbackRules;
      const suppliers = r.bySupplier || [];
      const suppliersForCap = r.bondBySupplier?.length
        ? r.bondBySupplier
        : r.allBySupplier?.length
          ? r.allBySupplier
          : suppliers;
      const group = computeProponentGroupShare({
        projectTotal: r.projectTotal,
        accountCgccpf: r.accountCgccpf,
        personType: r.personType,
        suppliers: suppliersForCap.map((s) => ({
          name: s.name,
          cgccpf: s.cgccpf,
          total: s.total,
        })),
        relatedParties: r.relatedParties,
        rules: rowRules,
      });
      const limitPct =
        r.personType === "PF" || r.personType === "MEI"
          ? rowRules.caps.proponentMeiCapPct
          : rowRules.caps.proponentCapPct;
      const comprovado = r.paidTotal && r.paidTotal > 0 ? r.paidTotal : r.projectTotal;
      const bondCell = group
        ? `<td class="num" style="color:${group.percent > limitPct ? "#b42318" : NAVY}">
            <strong>${formatPercent(group.amount, r.projectTotal)}</strong>
            <div style="font-size:9px;color:${GRAY_500};font-weight:600">${formatPercent(group.amount, comprovado)} comp. · lim. ${limitPct}%</div>
          </td>`
        : `<td class="num" style="color:${GRAY_500}">—</td>`;

      const aggregate = `
        <tr class="pronac-row">
          <td><strong>${escapeHtml(r.pronac)}</strong></td>
          <td>${escapeHtml(r.name || "—")}</td>
          <td>${escapeHtml(r.accountName)}</td>
          <td style="font-size:10px;color:${GRAY_500}">${escapeHtml(r.rulesetSourceCode || rowRules.sourceCode)}</td>
          <td class="num">${formatCurrency(r.total)}</td>
          ${
            params.filters.watchedOnly
              ? `<td class="num">${formatPercent(r.total, r.projectTotal)}</td>
                 <td class="num">${formatPercent(r.total, comprovado)}</td>`
              : ""
          }
          ${bondCell}
          <td class="num">${r.supplierCount}</td>
          <td class="num">${r.paymentCount}</td>
        </tr>
      `;

      if (!params.filters.watchedOnly || suppliers.length === 0) {
        return `<tbody class="pronac-group">${aggregate}</tbody>`;
      }

      const bondSet = new Set(
        (r.relatedParties || [])
          .filter((p) => relatedPartyCountsTowardCap(p, rowRules))
          .map((p) => normalizeCgccpf(p.cgccpf)),
      );
      if (r.accountCgccpf) bondSet.add(normalizeCgccpf(r.accountCgccpf));
      const relationByCgccpf = new Map(
        (r.relatedParties || []).map((p) => [
          normalizeCgccpf(p.cgccpf),
          p.relation || null,
        ]),
      );

      const sortedSuppliers = [...suppliers].sort((a, b) => {
        const aBond = bondSet.has(normalizeCgccpf(a.cgccpf)) ? 1 : 0;
        const bBond = bondSet.has(normalizeCgccpf(b.cgccpf)) ? 1 : 0;
        if (aBond !== bBond) return bBond - aBond;
        return b.total - a.total;
      });

      const header = `
        <tr class="supplier-row supplier-header">
          <td class="indent" colspan="3" style="color:${GRAY_500};font-size:10px;text-transform:uppercase;letter-spacing:0.06em">
            <span class="supplier-mark"></span>Fornecedor · CNPJ/CPF · vínculo art. 23 primeiro
          </td>
          <td style="color:${GRAY_500};font-size:10px;text-transform:uppercase;letter-spacing:0.06em">IN / detalhe</td>
          <td class="num" style="color:${GRAY_500};font-size:10px;text-transform:uppercase;letter-spacing:0.06em">Total</td>
          <td class="num" style="color:${GRAY_500};font-size:10px;text-transform:uppercase;letter-spacing:0.06em">% captado</td>
          <td class="num" style="color:${GRAY_500};font-size:10px;text-transform:uppercase;letter-spacing:0.06em">% comprovado</td>
          <td class="num" style="color:${GRAY_500};font-size:10px;text-transform:uppercase;letter-spacing:0.06em">Vínculo art. 23</td>
          <td class="num" style="color:${GRAY_500};font-size:10px;text-transform:uppercase;letter-spacing:0.06em">Participação</td>
          <td class="num" style="color:${GRAY_500};font-size:10px;text-transform:uppercase;letter-spacing:0.06em">Pag.</td>
        </tr>
      `;

      const children = sortedSuppliers
        .map((s) => {
          const pct = sharePercent(s.total, r.projectTotal);
          const isProp =
            Boolean(r.accountCgccpf) &&
            normalizeCgccpf(s.cgccpf) ===
              normalizeCgccpf(r.accountCgccpf || "");
          const limit = isProp
            ? proponentLimitPct(rowRules, r.personType)
            : rowRules.caps.supplierCapPct;
          const over = pct > limit;
          const near = isNearLimit(pct, limit, rowRules);
          const isBond = bondSet.has(normalizeCgccpf(s.cgccpf));
          const rel = relationByCgccpf.get(normalizeCgccpf(s.cgccpf));
          const flag = over
            ? `<span style="color:#b42318;font-weight:700"> ↑ limite ${limit}%</span>`
            : near
              ? `<span style="color:#c05621;font-weight:600"> ~ limite</span>`
              : "";
          const bullet = over ? "#d94c4c" : near ? "#e67e22" : "#16a34a";
          const rowBg = over ? "background:#fef2f2" : near ? "background:#fff7ed" : "";
          return `
          <tr class="supplier-row" style="${rowBg}">
            <td class="indent" colspan="3">
              <span class="supplier-mark" style="background:${bullet}"></span>
              <strong>${escapeHtml(s.name)}</strong>${flag}
              <div style="color:${GRAY_500};margin-top:2px">${escapeHtml(formatCgccpf(s.cgccpf))}</div>
            </td>
            <td style="color:${GRAY_500};font-size:10px">${escapeHtml(rowRules.sourceCode)}</td>
            <td class="num">${formatCurrency(s.total)}</td>
            <td class="num"><strong>${formatPercent(s.total, r.projectTotal)}</strong></td>
            <td class="num">${formatPercent(s.total, comprovado)}</td>
            <td class="num">${
              isBond
                ? `<span style="font-weight:600;color:${NAVY}">Sim</span>`
                : `<span style="color:${GRAY_500}">Não</span>`
            }</td>
            <td>
              <div class="mini-bar"><span style="width:${Math.min(100, pct)}%;background:${over ? "#d94c4c" : near ? "#e67e22" : GOLD}"></span></div>
            </td>
            <td class="num">${s.count}</td>
          </tr>
        `;
        })
        .join("");

      const bondFooter = group
        ? `
        <tr class="supplier-row" style="font-weight:700${group.percent > limitPct ? ";background:#fef2f2" : group.percent >= limitPct * 0.8 ? ";background:#fff7ed" : ""}">
          <td class="indent" colspan="3">Soma dos % com vínculo art. 23</td>
          <td style="font-size:10px;color:${GRAY_500}">${escapeHtml(rowRules.sourceCode)}</td>
          <td class="num">${formatCurrency(group.amount)}</td>
          <td class="num" style="color:${group.percent > limitPct ? "#b42318" : NAVY}">
            ${formatPercent(group.amount, r.projectTotal)}
            <span style="color:${GRAY_500};font-weight:600"> / ${limitPct}%</span>
          </td>
          <td class="num">${formatPercent(group.amount, comprovado)}</td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
      `
        : "";

      const splitClass = suppliers.length > 6 ? " allow-split" : "";
      return `<tbody class="pronac-group${splitClass}">${aggregate}${header}${children}${bondFooter}</tbody>`;
    })
    .join("");

  const body = `
    <section class="cards">
      <div class="card">
        <div class="label">PRONACs</div>
        <div class="value">${params.rows.length}</div>
      </div>
      <div class="card">
        <div class="label">${params.filters.watchedOnly ? "Total observados" : "Total filtrado"}</div>
        <div class="value">${formatCurrency(grandTotal)}</div>
      </div>
      <div class="card">
        <div class="label">Total captado (projetos)</div>
        <div class="value">${formatCurrency(projectGrand)}</div>
        ${
          params.filters.watchedOnly && projectGrand > 0
            ? `<div class="hint">${formatPercent(grandTotal, projectGrand)} observados no conjunto</div>`
            : ""
        }
      </div>
      <div class="card">
        <div class="label">Alertas</div>
        <div class="value">${warnings.length}</div>
      </div>
    </section>

    ${watchedSection}

    <h2>Sinais para auditoria</h2>
    ${warningsHtml(warnings)}

    <h2>Distribuição por PRONAC${params.filters.watchedOnly ? " (% do gasto do projeto com observados)" : ""}</h2>
    <div class="panel keep">
      ${barChartSvg(chartItems, { scale: "percent" })}
      ${
        params.filters.watchedOnly
          ? `<p style="margin:10px 0 0;color:${GRAY_500};font-size:11px">Cada barra mostra quanto os observados representam no total daquele PRONAC (escala de 0% a 100%).</p>`
          : `<p style="margin:10px 0 0;color:${GRAY_500};font-size:11px">Cada barra mostra a participação daquele PRONAC no total filtrado (escala de 0% a 100%).</p>`
      }
    </div>

    <h2>Detalhamento${params.filters.watchedOnly ? " (agregado + individual)" : ""}</h2>
    <div class="panel">
      <table>
        <thead>
          <tr>
            <th>PRONAC</th>
            <th>Projeto</th>
            <th>Proponente</th>
            <th>IN</th>
            <th class="num">${params.filters.watchedOnly ? "Total observados" : "Total"}</th>
            ${params.filters.watchedOnly ? `<th class="num">% captado</th><th class="num">% comprovado</th>` : ""}
            <th class="num">Soma % vínculo art. 23</th>
            <th class="num">Fornecedores</th>
            <th class="num">Pagamentos</th>
          </tr>
        </thead>
        ${
          detailBodies ||
          `<tbody class="pronac-group"><tr><td colspan="${colCount}" style="color:${GRAY_500}">Sem dados.</td></tr></tbody>`
        }
      </table>
    </div>
  `;

  return shellHtml({
    title: "Panorama por PRONAC",
    subtitle: params.filters.watchedOnly
      ? "Observados listados; soma prioritária = só quem gera vínculo art. 23"
      : "Visão consolidada — coluna de vínculo art. 23 destaca a soma prioritária",
    logoDataUri,
    filters: params.filters,
    body,
    rules: fallbackRules,
    rulesChipLabel,
  });
}

export async function renderPronacDetailHtml(params: {
  filters: ReportFiltersMeta;
  rules?: ActiveRules;
  personType?: PersonTypeInput | null;
  relatedParties?: RelatedPartyInput[];
  watchedSuppliers?: Array<{
    name: string;
    cgccpf: string | null;
    label: string | null;
  }>;
  pronac: string;
  name: string | null;
  accountName?: string | null;
  accountCgccpf?: string | null;
  projectTotal: number;
  paidTotal?: number;
  total: number;
  paymentCount: number;
  supplierCount: number;
  watchedOnly: boolean;
  suppliers: Array<{
    name: string;
    cgccpf: string;
    total: number;
    percent: number;
    count: number;
  }>;
  allSuppliers?: Array<{
    name: string;
    cgccpf: string;
    total: number;
    percent: number;
    count: number;
  }>;
  bondSuppliers?: Array<{
    name: string;
    cgccpf: string;
    total: number;
    percent: number;
    count: number;
  }>;
  payments: Array<{
    paymentDate: Date | null;
    supplierName: string;
    itemName: string | null;
    amount: number;
    documentType: string | null;
    documentNumber: string | null;
    source: string;
  }>;
}) {
  const rules = params.rules || DEFAULT_RULES;
  const logoDataUri = await loadLogoDataUri();
  const suppliersForCap = params.allSuppliers?.length
    ? params.allSuppliers
    : params.suppliers;
  const suppliersForBond = params.bondSuppliers?.length
    ? params.bondSuppliers
    : suppliersForCap;
  const warnings = buildPronacDetailWarnings({
    pronac: params.pronac,
    projectTotal: params.projectTotal,
    watchedTotal: params.total,
    watchedOnly: params.watchedOnly,
    accountCgccpf: params.accountCgccpf,
    personType: params.personType,
    relatedParties: params.relatedParties,
    rules,
    suppliers: params.suppliers,
    allSuppliers: params.allSuppliers,
    bondSuppliers: params.bondSuppliers,
  });

  const bondSet = new Set(
    (params.relatedParties || [])
      .filter((r) => relatedPartyCountsTowardCap(r, rules))
      .map((r) => normalizeCgccpf(r.cgccpf)),
  );
  if (params.accountCgccpf) {
    bondSet.add(normalizeCgccpf(params.accountCgccpf));
  }

  const suppliersSorted = [...params.suppliers].sort((a, b) => {
    const aBond = bondSet.has(normalizeCgccpf(a.cgccpf)) ? 1 : 0;
    const bBond = bondSet.has(normalizeCgccpf(b.cgccpf)) ? 1 : 0;
    if (aBond !== bBond) return bBond - aBond;
    return b.total - a.total;
  });

  const chartItems = suppliersSorted.slice(0, 10).map((s) => ({
    label: s.name,
    value: s.total,
    percent: s.percent,
  }));

  const rest = Math.max(0, params.projectTotal - params.total);
  const paymentsRows = params.payments.slice(0, 80);
  const comprovado =
    params.paidTotal && params.paidTotal > 0
      ? params.paidTotal
      : params.suppliers.reduce((s, x) => s + x.total, 0) || params.projectTotal;

  const bondBlock = bondAndWatchedHtml({
    projectTotal: params.projectTotal,
    paidTotal: comprovado,
    accountCgccpf: params.accountCgccpf,
    personType: params.personType,
    relatedParties: params.relatedParties,
    rules,
    suppliers: suppliersForCap,
    bondSuppliers: suppliersForBond,
    watchedSuppliers: params.watchedSuppliers,
  });

  const body = `
    <section class="cards">
      <div class="card">
        <div class="label">Valor captado</div>
        <div class="value">${formatCurrency(params.projectTotal)}</div>
      </div>
      <div class="card">
        <div class="label">Comprovado</div>
        <div class="value">${formatCurrency(comprovado)}</div>
        <div class="hint">${formatPercent(comprovado, params.projectTotal)} do captado</div>
      </div>
      <div class="card">
        <div class="label">${params.watchedOnly ? "Total observados" : "Total exibido"}</div>
        <div class="value">${formatCurrency(params.total)}</div>
        ${
          params.watchedOnly
            ? `<div class="hint">${formatPercent(params.total, params.projectTotal)} capt. · ${formatPercent(params.total, comprovado)} comp.</div>`
            : ""
        }
      </div>
      <div class="card">
        <div class="label">Pagamentos</div>
        <div class="value">${params.paymentCount}</div>
      </div>
    </section>

    <h2>Sinais para auditoria</h2>
    ${warningsHtml(warnings)}

    ${bondBlock}

    <h2>Participação dos fornecedores</h2>
    <div class="grid-2">
      <div class="panel keep">
        ${barChartSvg(chartItems, { maxBars: 10, scale: "percent" })}
      </div>
      <div class="panel keep" style="text-align:center">
        ${
          params.watchedOnly
            ? `${donutSvg(params.total, rest)}
               <p style="color:${GRAY_500};margin:8px 0 0">Observados vs demais no PRONAC</p>`
            : `<p style="color:${GRAY_500}">Barras com vínculos art. 23 primeiro.</p>
               <p style="color:${GRAY_500}">A soma prioritária está na seção de vínculos acima.</p>`
        }
      </div>
    </div>

    <h2>Fornecedores${params.watchedOnly ? " (exibidos)" : ""}</h2>
    <div class="panel">
      <table>
        <thead>
          <tr>
            <th>Fornecedor</th>
            <th>CNPJ/CPF</th>
            <th>Vínculo art. 23</th>
            <th class="num">Total</th>
            <th class="num">% captado</th>
            <th class="num">% comprovado</th>
            <th class="num">Pag.</th>
          </tr>
        </thead>
        <tbody>
          ${suppliersSorted
            .map((s) => {
              const isBond = bondSet.has(normalizeCgccpf(s.cgccpf));
              return `
            <tr style="${isBond ? `background:${GOLD_SOFT}` : ""}">
              <td><strong>${escapeHtml(s.name)}</strong></td>
              <td>${escapeHtml(formatCgccpf(s.cgccpf))}</td>
              <td>${
                isBond
                  ? `<span class="chip gold" style="padding:3px 8px">Sim</span>`
                  : `<span style="color:${GRAY_500}">Não</span>`
              }</td>
              <td class="num">${formatCurrency(s.total)}</td>
              <td class="num">${formatPercent(s.total, params.projectTotal)}</td>
              <td class="num">${formatPercent(s.total, comprovado)}</td>
              <td class="num">${s.count}</td>
            </tr>
          `;
            })
            .join("")}
        </tbody>
      </table>
    </div>

    <h2>Linhas de pagamento${params.payments.length > paymentsRows.length ? ` (primeiras ${paymentsRows.length})` : ""}</h2>
    <p style="font-size:11px;color:${GRAY_500};margin:0 0 8px">
      Itens de alimentação ou refeição são marcados e não entram no cálculo do vínculo art. 23.
    </p>
    <div class="panel">
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Fornecedor</th>
            <th>Item</th>
            <th>Comprovante</th>
            <th class="num">Valor</th>
            <th class="num">% captado</th>
            <th class="num">% comprovado</th>
            <th>Origem</th>
          </tr>
        </thead>
        <tbody>
          ${paymentsRows
            .map(
              (p) => `
            <tr>
              <td>${escapeHtml(formatDate(p.paymentDate))}</td>
              <td>${escapeHtml(p.supplierName)}</td>
              <td>${escapeHtml(p.itemName || "—")}${
                isExcludedFromBondItem(p.itemName)
                  ? ` <span class="chip" style="margin-left:6px;font-size:9px;background:${GRAY_100};color:${GRAY_500}">Não entrou no cálculo do vínculo art. 23</span>`
                  : ""
              }</td>
              <td>${escapeHtml(
                `${p.documentType || "—"}${p.documentNumber ? ` nº ${p.documentNumber}` : ""}`,
              )}</td>
              <td class="num">${formatCurrency(p.amount)}</td>
              <td class="num">${formatPercent(p.amount, params.projectTotal)}</td>
              <td class="num">${formatPercent(p.amount, comprovado)}</td>
              <td>${escapeHtml(p.source)}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  return shellHtml({
    title: `PRONAC ${params.pronac}`,
    subtitle: params.name || "Relação de pagamentos, vínculos art. 23 e observados",
    logoDataUri,
    filters: {
      ...params.filters,
      accountName: params.filters.accountName || params.accountName,
      pronac: params.pronac,
    },
    body,
    rules,
  });
}

export async function renderSupplierDetailHtml(params: {
  filters: {
    accountName?: string | null;
    pronac?: string | null;
  };
  supplierName: string;
  supplierCgccpf: string;
  total: number;
  paymentCount: number;
  byPronac: Array<{
    pronac: string;
    name: string | null;
    total: number;
    count: number;
    rulesetSourceCode?: string | null;
  }>;
  byAccount: Array<{ name: string; total: number; count: number }>;
  payments: Array<{
    paymentDate: Date | null;
    pronac: string;
    accountName: string;
    itemName: string | null;
    amount: number;
    documentType: string | null;
    documentNumber: string | null;
  }>;
}) {
  const logoDataUri = await loadLogoDataUri();
  const paymentsRows = params.payments.slice(0, 120);
  const chartItems = params.byPronac.slice(0, 10).map((p) => ({
    label: p.pronac,
    value: p.total,
    percent: params.total > 0 ? (p.total / params.total) * 100 : 0,
  }));
  const inCodes = [
    ...new Set(params.byPronac.map((p) => p.rulesetSourceCode).filter(Boolean)),
  ] as string[];
  const rulesChipLabel =
    inCodes.length === 1
      ? `IN dos projetos: ${inCodes[0]}`
      : inCodes.length > 1
        ? `IN por projeto (${inCodes.length} normas)`
        : "IN: conforme cada PRONAC";

  const body = `
    <section class="cards">
      <div class="card">
        <div class="label">Total recebido</div>
        <div class="value">${formatCurrency(params.total)}</div>
      </div>
      <div class="card">
        <div class="label">Pagamentos</div>
        <div class="value">${params.paymentCount}</div>
      </div>
      <div class="card">
        <div class="label">PRONACs</div>
        <div class="value">${params.byPronac.length}</div>
      </div>
      <div class="card">
        <div class="label">Proponentes</div>
        <div class="value">${params.byAccount.length}</div>
      </div>
    </section>

    <h2>Distribuição por PRONAC</h2>
    <div class="panel keep">
      ${barChartSvg(chartItems, { maxBars: 10, scale: "percent" })}
    </div>

    <h2>Por PRONAC</h2>
    <div class="panel">
      <table>
        <thead>
          <tr>
            <th>PRONAC</th>
            <th>Projeto</th>
            <th>IN</th>
            <th class="num">Total</th>
            <th class="num">Pag.</th>
          </tr>
        </thead>
        <tbody>
          ${params.byPronac
            .map(
              (p) => `
            <tr>
              <td><strong>${escapeHtml(p.pronac)}</strong></td>
              <td>${escapeHtml(p.name || "—")}</td>
              <td style="font-size:10px;color:${GRAY_500}">${escapeHtml(p.rulesetSourceCode || "—")}</td>
              <td class="num">${formatCurrency(p.total)}</td>
              <td class="num">${p.count}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>

    <h2>Por proponente</h2>
    <div class="panel">
      <table>
        <thead>
          <tr>
            <th>Proponente</th>
            <th class="num">Total</th>
            <th class="num">Pag.</th>
          </tr>
        </thead>
        <tbody>
          ${params.byAccount
            .map(
              (a) => `
            <tr>
              <td>${escapeHtml(a.name)}</td>
              <td class="num">${formatCurrency(a.total)}</td>
              <td class="num">${a.count}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>

    <h2>Linhas de pagamento${params.payments.length > paymentsRows.length ? ` (primeiras ${paymentsRows.length})` : ""}</h2>
    <p style="font-size:11px;color:${GRAY_500};margin:0 0 8px">
      Itens de alimentação ou refeição são marcados e não entram no cálculo do vínculo art. 23.
    </p>
    <div class="panel">
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>PRONAC</th>
            <th>Proponente</th>
            <th>Item</th>
            <th>Comprovante</th>
            <th class="num">Valor</th>
          </tr>
        </thead>
        <tbody>
          ${paymentsRows
            .map(
              (p) => `
            <tr>
              <td>${escapeHtml(formatDate(p.paymentDate))}</td>
              <td>${escapeHtml(p.pronac)}</td>
              <td>${escapeHtml(p.accountName)}</td>
              <td>${escapeHtml(p.itemName || "—")}${
                isExcludedFromBondItem(p.itemName)
                  ? ` <span class="chip" style="margin-left:6px;font-size:9px;background:${GRAY_100};color:${GRAY_500}">Não entrou no cálculo do vínculo art. 23</span>`
                  : ""
              }</td>
              <td>${escapeHtml(
                `${p.documentType || "—"}${p.documentNumber ? ` nº ${p.documentNumber}` : ""}`,
              )}</td>
              <td class="num">${formatCurrency(p.amount)}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  return shellHtml({
    title: params.supplierName,
    subtitle: `CNPJ/CPF ${formatCgccpf(params.supplierCgccpf)} · relatório do fornecedor`,
    logoDataUri,
    filters: {
      accountName: params.filters.accountName || null,
      pronac: params.filters.pronac || null,
      watchedOnly: false,
      watchedCount: 0,
    },
    body,
    rulesChipLabel,
  });
}

export async function renderProponentCorporateMapHtml(params: {
  proponentName: string;
  proponentCgccpf: string;
  foundedAt: Date | string | null;
  foundedAtPrecision: "DAY" | "MONTH" | "YEAR";
  foundedAtSource: string | null;
  institutionalMap?: boolean;
  periods: Array<{
    label: string | null;
    source: string | null;
    validFrom: Date | string;
    validFromPrecision: "DAY" | "MONTH" | "YEAR";
    validTo: Date | string | null;
    validToPrecision: "DAY" | "MONTH" | "YEAR";
    members: Array<{
      name: string;
      cgccpf: string;
      personType: string;
      role: string;
      source: string | null;
    }>;
  }>;
}) {
  const { formatPrecisionDate } = await import("@/lib/corporate/dates");
  const logoDataUri = await loadLogoDataUri();
  const copy = corporateMapCopy(Boolean(params.institutionalMap));
  const institutional = Boolean(params.institutionalMap);

  const allMembers = params.periods.flatMap((p) => p.members);
  const missingDoc = allMembers.filter((m) => !m.cgccpf.replace(/\D/g, ""));
  const sources = new Set(
    [
      ...params.periods.map((p) => p.source),
      ...allMembers.map((m) => m.source),
      params.foundedAtSource,
    ].filter(Boolean) as string[],
  );
  const originLabel =
    sources.size === 0
      ? "Declaração manual (nenhuma origem registrada)"
      : [...sources]
          .map((s) =>
            s === "brasilapi"
              ? "Consulta automática (Receita Federal)"
              : s === "manual"
                ? "Declaração manual"
                : s,
          )
          .join(" · ");

  const foundedLabel = formatPrecisionDate(
    params.foundedAt,
    params.foundedAtPrecision,
  );

  const periodsHtml =
    params.periods.length === 0
      ? `<div class="panel keep"><p style="color:${GRAY_500};margin:0">Nenhum intervalo de composição informado.</p></div>`
      : params.periods
          .map((p) => {
            const from = formatPrecisionDate(p.validFrom, p.validFromPrecision);
            const to = p.validTo
              ? formatPrecisionDate(p.validTo, p.validToPrecision)
              : "vigente";
            const rows =
              p.members.length === 0
                ? `<tr><td colspan="4" style="color:${GRAY_500}">${copy.emptyMembers}</td></tr>`
                : p.members
                    .map((m) => {
                      const doc = m.cgccpf.replace(/\D/g, "")
                        ? formatCgccpf(m.cgccpf)
                        : "Não informado";
                      const warn = !m.cgccpf.replace(/\D/g, "")
                        ? ` <span class="chip" style="background:${GOLD_SOFT};color:${NAVY}">doc. pendente</span>`
                        : "";
                      return `
                      <tr>
                        <td><strong>${escapeHtml(m.name)}</strong></td>
                        <td>${escapeHtml(m.personType)}</td>
                        <td>${escapeHtml(doc)}${warn}</td>
                        <td>${escapeHtml(corporateRoleLabel(m.role, institutional))}</td>
                      </tr>`;
                    })
                    .join("");
            return `
              <h2>${escapeHtml(from)} → ${escapeHtml(to)}</h2>
              ${
                p.label
                  ? `<p style="color:${GRAY_500};margin-top:-8px">${escapeHtml(p.label)}</p>`
                  : ""
              }
              <div class="panel">
                <table>
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Tipo</th>
                      <th>CPF/CNPJ</th>
                      <th>Papel</th>
                    </tr>
                  </thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>`;
          })
          .join("");

  const body = `
    <section class="cards">
      <div class="card">
        <div class="label">Data de abertura</div>
        <div class="value" style="font-size:18px">${escapeHtml(foundedLabel)}</div>
      </div>
      <div class="card">
        <div class="label">Intervalos</div>
        <div class="value">${params.periods.length}</div>
      </div>
      <div class="card">
        <div class="label">${copy.reportMembersTotal}</div>
        <div class="value">${allMembers.length}</div>
      </div>
      <div class="card">
        <div class="label">Doc. pendente</div>
        <div class="value">${missingDoc.length}</div>
      </div>
    </section>

    <p style="color:${GRAY_500};margin:0 0 16px">
      ${copy.reportIntro}
      Origem dos dados: ${escapeHtml(originLabel)}.
    </p>

    ${
      missingDoc.length
        ? `<div class="panel keep" style="border-color:${GOLD};background:${GOLD_SOFT};margin-bottom:16px">
            <strong>Atenção:</strong> ${escapeHtml(copy.reportMissingDoc(missingDoc.length))}
          </div>`
        : ""
    }

    ${periodsHtml}

    <p style="margin-top:20px;font-size:10px;color:${GRAY_500}">
      ${escapeHtml(copy.reportFooter)}
      O cruzamento A↔B com fornecedores continua nos relacionamentos tipificados.
    </p>
  `;

  return shellHtml({
    title: `${copy.mapName} · ${params.proponentName}`,
    subtitle: `CNPJ/CPF ${formatCgccpf(params.proponentCgccpf)} · ${copy.reportSubtitle}`,
    logoDataUri,
    filters: {
      accountName: params.proponentName,
      pronac: null,
      watchedOnly: false,
      watchedCount: 0,
    },
    body,
    rulesChipLabel: copy.reportChip,
  });
}

export type AuditoriaPronacBlock = {
  pronac: string;
  name: string;
  accountName: string;
  accountCgccpf: string;
  rules: ActiveRules;
  personType?: PersonTypeInput | null;
  relatedParties: RelatedPartyInput[];
  projectTotal: number;
  paidTotal: number;
  suppliers: ReportSupplier[];
  bondSuppliers: ReportSupplier[];
  watchedSuppliers: ReportWatched[];
  payments: Array<{
    paymentDate: string | null;
    supplierName: string;
    itemName: string | null;
    documentNumber: string | null;
    amount: number;
  }>;
  corporateMapHtml: string;
  alertsSummary: string;
  institutionalMap?: boolean;
};

/** Relatório multi-PRONAC de auditoria (PDF grande, seções por projeto). */
export async function renderAuditoriaReportHtml(params: {
  blocks: AuditoriaPronacBlock[];
}) {
  const logoDataUri = await loadLogoDataUri();
  const toc = params.blocks
    .map(
      (b, i) =>
        `<li><a href="#pronac-${i}">${escapeHtml(b.pronac)} — ${escapeHtml(b.name)}</a></li>`,
    )
    .join("");

  const sections = params.blocks
    .map((b, i) => {
      const bondBlock = bondAndWatchedHtml({
        projectTotal: b.projectTotal,
        paidTotal: b.paidTotal,
        accountCgccpf: b.accountCgccpf,
        personType: b.personType,
        relatedParties: b.relatedParties,
        rules: b.rules,
        suppliers: b.suppliers,
        bondSuppliers: b.bondSuppliers,
        watchedSuppliers: b.watchedSuppliers,
      });

      const supplierRows = b.suppliers
        .map((s) => {
          const dig = normalizeCgccpf(s.cgccpf);
          const bonded = (b.relatedParties || []).some(
            (r) => normalizeCgccpf(r.cgccpf) === dig,
          );
          return `
          <tr>
            <td><strong>${escapeHtml(s.name)}</strong>
              <div class="muted">${escapeHtml(formatCgccpf(s.cgccpf))}</div>
            </td>
            <td>${bonded ? '<span class="chip gold">Sim</span>' : "Não"}</td>
            <td class="num">${formatCurrency(s.total)}</td>
            <td class="num">${formatPercent(s.total, b.projectTotal)}</td>
            <td class="num">${formatPercent(s.total, b.paidTotal || b.projectTotal)}</td>
            <td class="num">${s.count}</td>
          </tr>`;
        })
        .join("");

      const paymentRows = b.payments
        .map(
          (p) => `
          <tr>
            <td>${p.paymentDate ? escapeHtml(p.paymentDate.slice(0, 10)) : "—"}</td>
            <td>${escapeHtml(p.supplierName)}</td>
            <td>${escapeHtml(p.itemName || "—")}${
              isExcludedFromBondItem(p.itemName)
                ? ` <span class="chip" style="margin-left:6px;font-size:9px;background:${GRAY_100};color:${GRAY_500}">Não entrou no cálculo do vínculo art. 23</span>`
                : ""
            }</td>
            <td>${escapeHtml(p.documentNumber || "—")}</td>
            <td class="num">${formatCurrency(p.amount)}</td>
          </tr>`,
        )
        .join("");

      return `
      <section id="pronac-${i}" class="keep" style="page-break-before: always; margin-top: 8px;">
        <div class="panel" style="border-color:${NAVY};background:${NAVY_SOFT};margin-bottom:16px">
          <h1 style="margin:0;font-size:18px;color:${NAVY}">PRONAC ${escapeHtml(b.pronac)}</h1>
          <p style="margin:6px 0 0;font-size:12px;color:${GRAY_500}">
            ${escapeHtml(b.name)} · ${escapeHtml(b.accountName)} ·
            ${escapeHtml(formatCgccpf(b.accountCgccpf))} · IN ${escapeHtml(b.rules.sourceCode)}
          </p>
        </div>

        <h2>1. Situação perante a auditoria</h2>
        <div class="kpis">
          <div class="kpi"><div class="label">Captado</div><div class="value">${formatCurrency(b.projectTotal)}</div></div>
          <div class="kpi"><div class="label">Comprovado</div><div class="value">${formatCurrency(b.paidTotal)}</div></div>
          <div class="kpi"><div class="label">Fornecedores</div><div class="value">${b.suppliers.length}</div></div>
          <div class="kpi"><div class="label">Pagamentos</div><div class="value">${b.payments.length}</div></div>
        </div>
        <p style="font-size:12px;color:${GRAY_500}">${escapeHtml(b.alertsSummary)}</p>

        <h2>${escapeHtml(corporateMapCopy(Boolean(b.institutionalMap)).reportSection)}</h2>
        ${b.corporateMapHtml}

        <h2>3. Observados e vínculo (IN)</h2>
        ${bondBlock}

        <h2>4. Agregados por fornecedor</h2>
        <table>
          <thead>
            <tr>
              <th>Fornecedor</th>
              <th>Vínculo</th>
              <th class="num">Total</th>
              <th class="num">% captado</th>
              <th class="num">% comprovado</th>
              <th class="num">Pag.</th>
            </tr>
          </thead>
          <tbody>${supplierRows || `<tr><td colspan="6">Sem fornecedores</td></tr>`}</tbody>
        </table>

        <h2>5. Linhas de pagamento</h2>
        <p style="font-size:11px;color:${GRAY_500};margin:0 0 8px">
          Itens de alimentação ou refeição são marcados e não entram no cálculo do vínculo art. 23.
        </p>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Fornecedor</th>
              <th>Item</th>
              <th>Documento</th>
              <th class="num">Valor</th>
            </tr>
          </thead>
          <tbody>${paymentRows || `<tr><td colspan="5">Sem pagamentos</td></tr>`}</tbody>
        </table>
      </section>`;
    })
    .join("\n");

  const body = `
    <h2>Sumário</h2>
    <ol>${toc}</ol>
    ${sections}
  `;

  return shellHtml({
    title: "Relatório de Auditoria",
    subtitle: `${params.blocks.length} PRONAC(s) · situação, mapa, observados, agregados e pagamentos`,
    logoDataUri,
    filters: {
      accountName: null,
      pronac: params.blocks.map((b) => b.pronac).join(", "),
      watchedOnly: false,
      watchedCount: 0,
    },
    body,
    rulesChipLabel: "Relatório de auditoria multi-PRONAC",
  });
}


