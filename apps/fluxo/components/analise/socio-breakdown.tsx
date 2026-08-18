import type { SocioBreakdown, SocioBucket } from "@/lib/socio";
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
                <span className="min-w-0 truncate text-brand-deep">
                  {item.label}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {item.count} · {item.pct}%
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-brand-mist">
                <div
                  className="h-full rounded-full bg-emerald-700/80"
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

export function SocioBreakdownPanel({
  socio,
  className,
  title = "Perfil sociodemográfico",
}: {
  socio: SocioBreakdown;
  className?: string;
  title?: string;
}) {
  if (socio.total === 0) return null;

  return (
    <section className={cn("space-y-4", className)}>
      <div>
        <h2 className="font-heading text-2xl font-semibold text-brand-deep">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Distribuição entre {socio.total} inscrição(ões).
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <BarList title="Gênero" items={socio.genero} />
        <BarList title="Etnia / raça" items={socio.etnia} />
        <BarList title="Escolaridade" items={socio.escolaridade} />
        <BarList title="Faixa etária" items={socio.idade} />
        <BarList title="Deficiência" items={socio.deficienca} />
      </div>
    </section>
  );
}
