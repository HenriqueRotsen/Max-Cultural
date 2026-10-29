import type { ExtractedTaxes } from "@/lib/nf/extract";
import { taxTotalOf } from "@/lib/nf/extract";

/**
 * Vencimentos típicos de retenções na NFS-e (competência = mês da emissão/contratação).
 *
 * - **ISS (dia 10):** tributo municipal; LC 116/2003 — o prazo exato varia por município,
 *   mas o dia 10 do mês seguinte é o mais adotado para ISS retido na fonte.
 * - **Federais (dia 20):** IRRF, PIS, COFINS, CSLL e INSS retidos — vencimento no
 *   20º dia do mês seguinte à competência (Lei 10.833/2003, IN RFB).
 */

export function calendarDayNextMonth(from: Date, dayOfMonth: number): Date {
  const parts = calendarYearMonth(from);
  let y = parts.year;
  let m = parts.monthIndex + 1;
  if (m > 11) {
    y += 1;
    m = 0;
  }
  const lastDay = new Date(Date.UTC(y, m + 1, 0, 12, 0, 0)).getUTCDate();
  const day = Math.min(dayOfMonth, lastDay);
  return new Date(Date.UTC(y, m, day, 12, 0, 0));
}

function calendarYearMonth(from: Date): { year: number; monthIndex: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  });
  const parts = fmt.formatToParts(from);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return { year, monthIndex: month - 1 };
}

export function issDueDateFromCompetence(competence: Date): Date {
  return calendarDayNextMonth(competence, 10);
}

export function federalTaxDueDateFromCompetence(competence: Date): Date {
  return calendarDayNextMonth(competence, 20);
}

export function federalTaxTotal(taxes: ExtractedTaxes | null | undefined): number {
  if (!taxes) return 0;
  return (
    (taxes.irrf || 0) +
    (taxes.inss || 0) +
    (taxes.csll || 0) +
    (taxes.pis || 0) +
    (taxes.cofins || 0) +
    (taxes.other || 0)
  );
}

export function hasIssRetention(taxes: ExtractedTaxes | null | undefined): boolean {
  return (taxes?.iss ?? 0) > 0;
}

export function hasFederalRetention(
  taxes: ExtractedTaxes | null | undefined,
): boolean {
  return federalTaxTotal(taxes) > 0;
}

export function taxDueSummary(taxes: ExtractedTaxes | null | undefined): {
  issDue: Date | null;
  federalDue: Date | null;
  issAmount: number;
  federalAmount: number;
} {
  const issAmount = taxes?.iss ?? 0;
  const federalAmount = federalTaxTotal(taxes);
  return {
    issDue: issAmount > 0 ? issDueDateFromCompetence(new Date()) : null,
    federalDue: federalAmount > 0 ? federalTaxDueDateFromCompetence(new Date()) : null,
    issAmount,
    federalAmount,
  };
}

export function taxDueSummaryFromCompetence(
  competence: Date,
  taxes: ExtractedTaxes | null | undefined,
): {
  issDue: Date | null;
  federalDue: Date | null;
  issAmount: number;
  federalAmount: number;
  totalRetained: number;
} {
  const issAmount = taxes?.iss ?? 0;
  const federalAmount = federalTaxTotal(taxes);
  return {
    issDue: issAmount > 0 ? issDueDateFromCompetence(competence) : null,
    federalDue: federalAmount > 0 ? federalTaxDueDateFromCompetence(competence) : null,
    issAmount,
    federalAmount,
    totalRetained: taxTotalOf(taxes),
  };
}

export const TAX_DUE_LEGEND = {
  iss: "ISS retido — vencimento típico no dia 10 do mês seguinte (LC 116/2003; confira o município).",
  federal:
    "IRRF, PIS, COFINS, CSLL e INSS retidos — vencimento típico no dia 20 do mês seguinte (Lei 10.833/2003).",
};
