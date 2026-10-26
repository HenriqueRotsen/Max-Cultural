"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { SocioBreakdown, SocioBucket } from "@/lib/socio-cohort";
import {
  parseSocioCohort,
  SOCIO_COHORT_PARAM,
  SOCIO_COHORTS,
  type SocioCohort,
} from "@/lib/socio-cohort";
import { cn } from "@/lib/utils";

function BarList({
  title,
  items,
}: {
  title: string;
  items: SocioBucket[];
}) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="rounded-2xl border border-brand/10 bg-white/90 px-4 py-4 shadow-sm">
      <h3 className="font-heading text-base font-semibold text-brand-deep">
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Sem dados.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.slice(0, 8).map((item) => (
            <li key={item.label}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 break-words text-brand-deep">
                  {item.label}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {item.count} · {item.pct}%
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-brand-mist">
                <div
                  className="h-full rounded-full bg-brand/80"
                  style={{ width: `${(item.count / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SocioCohortFilter() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const cohort = parseSocioCohort(searchParams.get(SOCIO_COHORT_PARAM));

  function setCohort(id: SocioCohort) {
    const params = new URLSearchParams(searchParams.toString());
    if (id === "inscritos") params.delete(SOCIO_COHORT_PARAM);
    else params.set(SOCIO_COHORT_PARAM, id);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {SOCIO_COHORTS.map((opt) => {
        const on = opt.id === cohort;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => setCohort(opt.id)}
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-semibold transition",
              on
                ? "bg-brand text-white"
                : "bg-brand-mist text-brand-deep hover:bg-brand/15",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function SocioBreakdownPanel({
  socio,
  className,
  title = "Perfil sociodemográfico",
  cohort = "inscritos",
}: {
  socio: SocioBreakdown;
  className?: string;
  title?: string;
  cohort?: SocioCohort;
}) {
  const meta =
    SOCIO_COHORTS.find((c) => c.id === cohort) ?? SOCIO_COHORTS[0]!;

  return (
    <section className={cn("space-y-4", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-heading text-2xl font-semibold text-brand-deep">
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {socio.total === 0
              ? `Nenhum ${meta.noun.replace(/\(.*\)/, "").trim()} neste recorte.`
              : `Distribuição entre ${socio.total} ${meta.noun}.`}
          </p>
        </div>
        <Suspense fallback={null}>
          <SocioCohortFilter />
        </Suspense>
      </div>
      {socio.total === 0 ? null : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <BarList title="Gênero" items={socio.genero} />
          <BarList title="Etnia / raça" items={socio.etnia} />
          <BarList title="Escolaridade" items={socio.escolaridade} />
          <BarList title="Faixa etária" items={socio.idade} />
          <BarList title="Deficiência" items={socio.deficienca} />
        </div>
      )}
    </section>
  );
}
