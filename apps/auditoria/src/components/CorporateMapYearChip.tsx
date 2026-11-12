"use client";

import Link from "next/link";
import { useId } from "react";
import { createPortal } from "react-dom";
import { useAnchoredBubble } from "@/components/useAnchoredBubble";
import { corporateMapCopy, corporateRoleLabel } from "@/lib/corporate/copy";
import { formatPrecisionDate, type DatePrecisionValue } from "@/lib/corporate/dates";

export type YearChipPeriod = {
  validFrom: string;
  validFromPrecision: DatePrecisionValue;
  validTo: string | null;
  validToPrecision: DatePrecisionValue;
  members: Array<{
    name: string;
    role: string;
    sharePct: number | null;
    notes: string | null;
  }>;
};

const MAX_WIDTH = 360;

/**
 * Selo “Sócios em <anos>” — ao passar o mouse, quem era sócio (ou administrador)
 * da empresa nesses anos; clique abre o mapa. `label` é "2024" ou "2023–2024";
 * `basis` diz por que esses anos. As datas do balão são de entrada e saída na
 * sociedade, nunca de pagamento — o balão diz isso com todas as letras.
 */
export function CorporateMapYearChip({
  accountId,
  href,
  ownerName,
  label,
  basis,
  institutional,
  periods,
}: {
  /** Proponente (abre /contas/mapa/<id>). Use `href` para outro dono. */
  accountId?: string;
  href?: string;
  /** Nome da empresa, para o título do balão. */
  ownerName?: string;
  label: string;
  basis?: string;
  institutional: boolean;
  periods: YearChipPeriod[];
}) {
  const link = href ?? `/contas/mapa/${accountId}`;
  const tooltipId = useId();
  const copy = corporateMapCopy(institutional);
  const { triggerRef, bubbleRef, open, setOpen, mounted, pos } =
    useAnchoredBubble<HTMLAnchorElement>(MAX_WIDTH, periods);

  const bubble =
    mounted && open
      ? createPortal(
          <span
            ref={bubbleRef}
            id={tooltipId}
            className={`field-help-bubble field-help-bubble-portal map-year-bubble${pos ? " is-open" : ""}`}
            role="tooltip"
            style={pos ? { top: pos.top, left: pos.left } : undefined}
            data-placement={pos?.placement || "above"}
          >
            <span className="map-year-title">
              {copy.membersCap} {ownerName ? `de ${ownerName} ` : ""}em {label}
            </span>
            {basis ? <span className="block text-[var(--gray-500)]">{basis}</span> : null}
            <span className="map-year-note">
              As datas abaixo são de quando cada um entrou e saiu da {institutional ? "organização" : "sociedade"}{" "}
              — não são datas de pagamento.
            </span>
            {periods.length === 0 ? (
              <span className="block">
                Nenhum {copy.member} cadastrado para {label}. Clique para abrir o mapa.
              </span>
            ) : (
              periods.map((p) => (
                <span key={p.validFrom} className="map-year-period">
                  <span className="map-year-range">
                    {copy.membersCap} de {formatPrecisionDate(p.validFrom, p.validFromPrecision)} até{" "}
                    {p.validTo ? formatPrecisionDate(p.validTo, p.validToPrecision) : "hoje"}:
                  </span>
                  {p.members.length === 0 ? (
                    <span className="block">{copy.emptyMembers}</span>
                  ) : (
                    p.members.map((m) => (
                      <span key={m.name} className="block">
                        <strong>{m.name}</strong>
                        {" — "}
                        {institutional && m.notes ? m.notes : corporateRoleLabel(m.role, institutional)}
                        {m.sharePct != null ? ` · ${String(m.sharePct).replace(".", ",")}%` : ""}
                      </span>
                    ))
                  )}
                </span>
              ))
            )}
          </span>,
          document.body,
        )
      : null;

  return (
    <>
      <Link
        ref={triggerRef}
        href={link}
        className="badge badge-info map-year-chip"
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {copy.membersCap} em {label}
      </Link>
      {bubble}
    </>
  );
}
