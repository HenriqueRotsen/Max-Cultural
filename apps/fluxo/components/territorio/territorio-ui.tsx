import Link from "next/link";
import type { TerritorioKpis } from "@/app/actions/territorio";
import { StatusKindBadge } from "@/components/status-badges";
import { buildTerritorioPath } from "@/lib/territorio-slug";
import { cn } from "@/lib/utils";

export function TerritorioBreadcrumb({
  estado,
  cidade,
  territorio,
  online,
}: {
  estado?: string;
  cidade?: string;
  territorio?: string;
  online?: boolean;
}) {
  const parts: Array<{ label: string; href: string }> = [
    { label: "Territórios", href: "/territorio" },
  ];
  if (online) {
    parts.push({ label: "Online", href: "/territorio/online" });
    if (territorio) {
      parts.push({
        label: territorio,
        href: buildTerritorioPath({ online: true, territorio }),
      });
    }
  } else {
    if (estado) {
      parts.push({
        label: estado,
        href: buildTerritorioPath({ estado }),
      });
    }
    if (estado && cidade) {
      parts.push({
        label: cidade,
        href: buildTerritorioPath({ estado, cidade }),
      });
    }
    if (estado && cidade && territorio) {
      parts.push({
        label: territorio,
        href: buildTerritorioPath({ estado, cidade, territorio }),
      });
    }
  }

  return (
    <nav className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
      {parts.map((p, i) => (
        <span key={`${p.href}-${p.label}`} className="inline-flex items-center gap-1.5">
          {i > 0 ? <span aria-hidden>/</span> : null}
          {i === parts.length - 1 ? (
            <span className="font-medium text-brand-deep">{p.label}</span>
          ) : (
            <Link
              href={p.href}
              className="underline-offset-2 hover:text-brand-deep hover:underline"
            >
              {p.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}

export function TerritorioKpiGrid({
  kpis,
  className,
}: {
  kpis: TerritorioKpis;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6",
        className,
      )}
    >
      <div className="rounded-xl border border-brand/10 bg-white/80 px-4 py-3 shadow-sm">
        <div className="text-xs text-muted-foreground">Inscritos</div>
        <div className="font-heading text-2xl font-semibold tabular-nums text-brand-deep">
          {kpis.inscritos}
        </div>
      </div>
      <div className="rounded-xl border border-brand/10 bg-white/80 px-4 py-3 shadow-sm">
        <StatusKindBadge kind="selecionado" className="mb-1" />
        <div className="font-heading text-2xl font-semibold tabular-nums text-brand-deep">
          {kpis.selecionados}
        </div>
      </div>
      <div className="rounded-xl border border-brand/10 bg-white/80 px-4 py-3 shadow-sm">
        <StatusKindBadge kind="participante" className="mb-1" />
        <div className="font-heading text-2xl font-semibold tabular-nums text-brand-deep">
          {kpis.participantes}
        </div>
      </div>
      <div className="rounded-xl border border-brand/10 bg-white/80 px-4 py-3 shadow-sm">
        <StatusKindBadge kind="certificado" className="mb-1" />
        <div className="font-heading text-2xl font-semibold tabular-nums text-brand-deep">
          {kpis.certificados}
        </div>
      </div>
      <div className="rounded-xl border border-brand/10 bg-white/80 px-4 py-3 shadow-sm">
        <div className="text-xs text-muted-foreground">Oficinas</div>
        <div className="font-heading text-2xl font-semibold tabular-nums text-brand-deep">
          {kpis.oficinas}
        </div>
      </div>
      <div className="rounded-xl border border-brand/10 bg-white/80 px-4 py-3 shadow-sm">
        <div className="text-xs text-muted-foreground">Projetos</div>
        <div className="font-heading text-2xl font-semibold tabular-nums text-brand-deep">
          {kpis.projetos}
        </div>
      </div>
    </div>
  );
}
