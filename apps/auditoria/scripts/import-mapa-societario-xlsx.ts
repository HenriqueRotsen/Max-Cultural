/**
 * Importação única do mapa societário a partir da planilha de diligência
 * (abas "Dados Cadastrais", "Quadro Societário", "Linha do Tempo (Dados)" e
 * "Grupo Econômico"). Depois dela, os ajustes são feitos à mão no editor do mapa.
 *
 *   npx tsx scripts/import-mapa-societario-xlsx.ts <planilha.xlsx>            # simulação
 *   npx tsx scripts/import-mapa-societario-xlsx.ts <planilha.xlsx> --apply    # grava
 *
 * Opções: --workspace <id> (se o CNPJ existir em mais de um workspace),
 * --replace (apaga os intervalos que a conta já tiver antes de importar),
 * --skip-missing (importa as demais quando algum proponente não está cadastrado).
 * Sem DATABASE_URL a simulação só mostra os intervalos montados da planilha.
 */
import * as XLSX from "@e965/xlsx";
import { formatPrecisionDate } from "@/lib/corporate/dates";
import { formatCgccpf, isValidCgccpf, normalizeCgccpf } from "@/lib/format";

type Role = "PARTNER" | "ADMINISTRATOR" | "BOTH";

type Company = {
  key: string;
  name: string;
  cgccpf: string;
  foundedAt: Date;
  institutional: boolean;
};

type Stint = {
  name: string;
  role: Role;
  papel: string;
  from: Date;
  /** Primeiro dia fora; null = permanece */
  to: Date | null;
};

type PlannedMember = {
  name: string;
  cgccpf: string;
  role: Role;
  sharePct: number | null;
  notes: string | null;
};

type PlannedPeriod = {
  validFrom: Date;
  validTo: Date | null;
  members: PlannedMember[];
};

const SOURCE = "planilha";
const DAY_MS = 24 * 60 * 60 * 1000;

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--workspace");
const apply = args.includes("--apply");
const replace = args.includes("--replace");
const skipMissing = args.includes("--skip-missing");
const workspaceId = args.includes("--workspace") ? args[args.indexOf("--workspace") + 1] : null;
const warnings: string[] = [];

function keyOf(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\bltda\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Datas do Excel chegam como Date local à meia-noite; o mapa guarda 12:00 UTC. */
function utcNoon(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function cellDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return utcNoon(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  return null;
}

function textDate(text: string): Date | null {
  const m = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? utcNoon(Number(m[3]), Number(m[2]), Number(m[1])) : null;
}

function rows(wb: XLSX.WorkBook, sheet: string): unknown[][] {
  const ws = wb.Sheets[sheet];
  if (!ws) throw new Error(`Aba "${sheet}" não encontrada na planilha`);
  // Cabeçalho na linha 4; dados a partir da 5
  return XLSX.utils
    .sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null })
    .slice(4)
    .filter((r) => r.some((c) => c !== null && String(c).trim() !== ""));
}

const str = (v: unknown) => (v == null ? "" : String(v).trim());

function parseCompanies(wb: XLSX.WorkBook): Company[] {
  return rows(wb, "Dados Cadastrais").map((r) => {
    const name = str(r[0]);
    const cgccpf = normalizeCgccpf(str(r[1]));
    const foundedAt = cellDate(r[2]);
    if (!isValidCgccpf(cgccpf)) throw new Error(`CNPJ inválido para ${name}: ${str(r[1])}`);
    if (!foundedAt) throw new Error(`Data de abertura ausente para ${name}`);
    return {
      key: keyOf(name),
      name,
      cgccpf,
      foundedAt,
      // CNAE 94.xx = organização associativa (OSC) → mapa institucional
      institutional: str(r[5]).startsWith("94."),
    };
  });
}

function findCompany(companies: Company[], label: string): Company {
  const key = keyOf(label);
  const found = companies.find((c) => c.key === key || c.key.startsWith(key) || key.startsWith(c.key));
  if (!found) throw new Error(`Empresa "${label}" não está na aba Dados Cadastrais`);
  return found;
}

/** CPF e % atuais por pessoa (Quadro Societário + Mapa Cruzado). */
function parsePeople(wb: XLSX.WorkBook, companies: Company[]) {
  const cpfByName = new Map<string, string>();
  const shareByCompanyName = new Map<string, number>();
  const tipoByCompanyName = new Map<string, string>();
  for (const r of rows(wb, "Quadro Societário")) {
    const company = findCompany(companies, str(r[0]));
    const nameKey = keyOf(str(r[1]));
    const cpf = normalizeCgccpf(str(r[2]));
    if (cpf) cpfByName.set(nameKey, cpf);
    if (str(r[3])) tipoByCompanyName.set(`${company.key}|${nameKey}`, str(r[3]));
    if (typeof r[4] === "number") shareByCompanyName.set(`${company.key}|${nameKey}`, r[4] * 100);
  }
  for (const r of rows(wb, "Mapa Cruzado")) {
    const cpf = normalizeCgccpf(str(r[1]));
    if (cpf && !cpfByName.has(keyOf(str(r[0])))) cpfByName.set(keyOf(str(r[0])), cpf);
  }
  for (const [name, cpf] of cpfByName) {
    if (!isValidCgccpf(cpf)) throw new Error(`CPF inválido para ${name}: ${cpf}`);
  }
  return { cpfByName, shareByCompanyName, tipoByCompanyName };
}

function parseStints(wb: XLSX.WorkBook, companies: Company[], people: ReturnType<typeof parsePeople>) {
  const byCompany = new Map<string, Stint[]>();
  for (const r of rows(wb, "Linha do Tempo (Dados)")) {
    const company = findCompany(companies, str(r[0]));
    const name = str(r[2]);
    const papel = str(r[3]);
    const entrada = str(r[4]);
    const saida = str(r[5]);

    const from = textDate(entrada) ?? (/funda/i.test(entrada) ? company.foundedAt : null);
    if (!from) {
      warnings.push(
        `${company.name}: ${name} (${papel}) sem data de entrada (“${entrada}”) — não importado, ajuste no editor`,
      );
      continue;
    }
    const to = textDate(saida);
    if (!to && !/perman/i.test(saida)) {
      warnings.push(`${company.name}: ${name} com saída ilegível (“${saida}”) — tratado como vigente`);
    }
    if (from < company.foundedAt) {
      warnings.push(`${company.name}: entrada de ${name} antes da abertura — ajustada para a abertura`);
    }
    // Linha do tempo costuma dizer só “Sócio”; o Quadro Societário traz o tipo atual
    const tipo = people.tipoByCompanyName.get(`${company.key}|${keyOf(name)}`) ?? papel;
    const role: Role = company.institutional
      ? "ADMINISTRATOR"
      : /admin/i.test(tipo)
        ? "BOTH"
        : "PARTNER";
    const list = byCompany.get(company.key) ?? [];
    list.push({ name, role, papel, from: from < company.foundedAt ? company.foundedAt : from, to });
    byCompany.set(company.key, list);
  }
  return byCompany;
}

/**
 * Corta a linha do tempo em intervalos de composição constante: cada entrada
 * ou saída abre um intervalo novo, e o anterior termina na véspera.
 */
function buildPeriods(
  company: Company,
  stints: Stint[],
  people: ReturnType<typeof parsePeople>,
): PlannedPeriod[] {
  const points = [...new Set(stints.flatMap((s) => [s.from, s.to]).filter((d): d is Date => !!d).map((d) => d.getTime()))].sort(
    (a, b) => a - b,
  );
  const periods: PlannedPeriod[] = [];
  points.forEach((start, i) => {
    const next = points[i + 1] ?? null;
    const active = stints.filter((s) => s.from.getTime() <= start && (!s.to || s.to.getTime() > start));
    if (!active.length) return;
    const isOpen = next === null;
    const byPerson = new Map<string, PlannedMember>();
    for (const s of active) {
      const nameKey = keyOf(s.name);
      const prev = byPerson.get(nameKey);
      byPerson.set(nameKey, {
        name: s.name,
        cgccpf: people.cpfByName.get(nameKey) ?? "",
        role: prev && prev.role !== s.role ? "BOTH" : s.role,
        // % só é conhecido para a composição atual
        sharePct: isOpen ? (people.shareByCompanyName.get(`${company.key}|${nameKey}`) ?? null) : null,
        notes: company.institutional ? [prev?.notes, s.papel].filter(Boolean).join(" / ") : null,
      });
    }
    periods.push({
      validFrom: new Date(start),
      validTo: next === null ? null : new Date(next - DAY_MS),
      members: [...byPerson.values()],
    });
  });
  return periods;
}

/** Pares de empresas marcadas com o mesmo endereço na aba Grupo Econômico. */
function parseSameAddress(wb: XLSX.WorkBook, companies: Company[]) {
  const flagged = rows(wb, "Grupo Econômico")
    .filter((r) => /endere/i.test(str(r[3])))
    .map((r) => ({ company: findCompany(companies, str(r[0])), notes: str(r[3]) }));
  return flagged.flatMap((a) => flagged.filter((b) => b.company !== a.company).map((b) => ({ a: a.company, b: b.company, notes: a.notes })));
}

function printPlan(company: Company, periods: PlannedPeriod[]) {
  console.log(
    `\n■ ${company.name} — ${formatCgccpf(company.cgccpf)} — abertura ${formatPrecisionDate(company.foundedAt)}${company.institutional ? " — mapa institucional" : ""}`,
  );
  for (const p of periods) {
    console.log(`  ${formatPrecisionDate(p.validFrom)} → ${p.validTo ? formatPrecisionDate(p.validTo) : "vigente"}`);
    for (const m of p.members) {
      const extra = [m.cgccpf ? formatCgccpf(m.cgccpf) : "sem CPF", m.role, m.sharePct != null ? `${m.sharePct}%` : null, m.notes]
        .filter(Boolean)
        .join(" · ");
      console.log(`    - ${m.name} (${extra})`);
    }
  }
}

async function main() {
  if (!file) {
    console.error("Uso: npx tsx scripts/import-mapa-societario-xlsx.ts <planilha.xlsx> [--apply] [--replace] [--workspace <id>]");
    process.exit(1);
  }
  const wb = XLSX.readFile(file, { cellDates: true });
  const companies = parseCompanies(wb);
  const people = parsePeople(wb, companies);
  const stints = parseStints(wb, companies, people);
  const plans = companies.map((c) => ({ company: c, periods: buildPeriods(c, stints.get(c.key) ?? [], people) }));
  const sameAddress = parseSameAddress(wb, companies);

  for (const { company, periods } of plans) printPlan(company, periods);
  if (sameAddress.length) {
    console.log("\n■ Vínculos “mesmo endereço”");
    for (const p of sameAddress) console.log(`  ${p.a.name} → ${p.b.name}`);
  }
  if (warnings.length) {
    console.log("\n⚠ Avisos");
    for (const w of warnings) console.log(`  - ${w}`);
  }

  if (!process.env.DATABASE_URL && !apply) {
    console.log("\n(sem DATABASE_URL: simulação só da planilha, contas não conferidas)");
    return;
  }

  const { prisma } = await import("@/lib/db");
  const { relationGeneratesBond } = await import("@/lib/compliance/defaults");

  const accounts = new Map<string, { id: string; name: string; periods: number; projects: string[] }>();
  let missing = 0;
  for (const { company } of plans) {
    const found = await prisma.salicAccount.findMany({
      where: { cgccpf: { in: [company.cgccpf, formatCgccpf(company.cgccpf)] }, ...(workspaceId ? { workspaceId } : {}) },
      select: {
        id: true,
        name: true,
        workspaceId: true,
        _count: { select: { corporatePeriods: true } },
        projects: { select: { id: true } },
      },
    });
    if (found.length !== 1) {
      if (!found.length && skipMissing) {
        console.log(`– ${company.name}: proponente não cadastrado — pulado`);
        continue;
      }
      missing += 1;
      console.log(
        `✗ ${company.name}: ${found.length ? `${found.length} contas (workspaces ${found.map((f) => f.workspaceId).join(", ")}) — use --workspace` : "proponente não cadastrado"}`,
      );
      continue;
    }
    const acc = found[0];
    if (acc._count.corporatePeriods > 0 && !replace) {
      missing += 1;
      console.log(`✗ ${company.name}: já tem ${acc._count.corporatePeriods} intervalo(s) — use --replace para substituir`);
      continue;
    }
    accounts.set(company.key, { id: acc.id, name: acc.name, periods: acc._count.corporatePeriods, projects: acc.projects.map((p) => p.id) });
    console.log(`✓ ${company.name} → conta ${acc.id}${acc._count.corporatePeriods ? ` (substitui ${acc._count.corporatePeriods} intervalo(s))` : ""}`);
  }

  if (!apply) {
    console.log("\nSimulação concluída. Rode de novo com --apply para gravar.");
    return;
  }
  if (missing) {
    console.error("\nNada gravado: resolva as contas marcadas com ✗ antes.");
    process.exit(1);
  }

  for (const { company, periods } of plans) {
    const acc = accounts.get(company.key);
    if (!acc) continue;
    await prisma.$transaction(async (tx) => {
      await tx.salicAccount.update({
        where: { id: acc.id },
        data: {
          foundedAt: company.foundedAt,
          foundedAtPrecision: "DAY",
          foundedAtSource: SOURCE,
          institutionalMap: company.institutional,
        },
      });
      if (replace) await tx.corporatePeriod.deleteMany({ where: { salicAccountId: acc.id } });
      for (const p of periods) {
        await tx.corporatePeriod.create({
          data: {
            salicAccountId: acc.id,
            validFrom: p.validFrom,
            validFromPrecision: "DAY",
            validTo: p.validTo,
            validToPrecision: "DAY",
            source: SOURCE,
            members: {
              create: p.members.map((m) => ({
                name: m.name,
                cgccpf: m.cgccpf,
                personType: m.cgccpf.length === 14 ? "PJ" : "PF",
                role: m.role,
                sharePct: m.sharePct,
                notes: m.notes,
                source: SOURCE,
              })),
            },
          },
        });
      }
    });
    console.log(`Gravado: ${company.name} — ${periods.length} intervalo(s)`);
  }

  for (const { a, b, notes } of sameAddress) {
    const accountId = accounts.get(a.key)?.id;
    if (!accountId) continue;
    const existing = await prisma.relatedParty.findUnique({
      where: { salicAccountId_cgccpf: { salicAccountId: accountId, cgccpf: b.cgccpf } },
    });
    if (existing) {
      console.log(`Vínculo ${a.name} → ${b.name} já existe (${existing.relation}) — mantido`);
      continue;
    }
    await prisma.relatedParty.create({
      data: {
        salicAccountId: accountId,
        cgccpf: b.cgccpf,
        name: b.name,
        relation: "SAME_ADDRESS",
        notes,
        countsTowardProponentCap: relationGeneratesBond("SAME_ADDRESS"),
      },
    });
    console.log(`Vínculo criado: ${a.name} → ${b.name} (mesmo endereço)`);
  }

  // Briefings dos PRONACs dependem do mapa
  const { ensureProjectRuleset } = await import("@/lib/compliance/choose-ruleset");
  for (const acc of accounts.values()) {
    for (const projectId of acc.projects) {
      await ensureProjectRuleset(projectId, { forceBriefRefresh: true }).catch((err) =>
        console.warn("[map] falha ao atualizar briefing", projectId, err instanceof Error ? err.message : err),
      );
    }
  }
  console.log("\nImportação concluída.");
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
