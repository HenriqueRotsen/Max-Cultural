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

/** Selo “Mapa societário <ano>” — composição daquele ano ao passar o mouse; clique abre o mapa. */
export function CorporateMapYearChip({
  accountId,
  year,
  institutional,
  periods,
}: {
  accountId: string;
  year: number;
  institutional: boolean;
  periods: YearChipPeriod[];
}) {
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
              {copy.mapName} em {year}
            </span>
            {periods.length === 0 ? (
              <span className="block">Nenhuma {copy.composition} cadastrada para {year}.</span>
            ) : (
              periods.map((p) => (
                <span key={p.validFrom} className="map-year-period">
                  <span className="map-year-range">
                    {formatPrecisionDate(p.validFrom, p.validFromPrecision)} →{" "}
                    {p.validTo ? formatPrecisionDate(p.validTo, p.validToPrecision) : "hoje"}
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
        href={`/contas/mapa/${accountId}`}
        className="badge badge-info map-year-chip"
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {copy.mapName} {year}
      </Link>
      {bubble}
    </>
  );
}
