import { cn } from "@/lib/utils";
import { EQUIPE_LABEL, type EquipePrestacao } from "@/lib/prestacao/types";

const CURTO: Record<EquipePrestacao, string> = { PRODUCAO: "Prod.", COMUNICACAO: "Com.", GESTAO: "Gest." };

export const COR_EQUIPE: Record<EquipePrestacao, string> = {
  PRODUCAO: "bg-orange-500",
  COMUNICACAO: "bg-teal-700",
  GESTAO: "bg-brand-deep",
};

/** Barra de preenchimento de uma equipe. */
export function BarraEquipe({ equipe, pct, compacta = false }: { equipe: EquipePrestacao; pct: number; compacta?: boolean }) {
  return (
    <div className="min-w-0" title={`${EQUIPE_LABEL[equipe]}: ${pct}% preenchido`}>
      {!compacta ? <div className="mb-1 text-[11px] font-medium text-muted-foreground">{EQUIPE_LABEL[equipe]}</div> : null}
      <div className="flex items-center gap-2">
        {compacta ? <span className="w-9 shrink-0 text-[11px] text-muted-foreground">{CURTO[equipe]}</span> : null}
        <div className="h-1.5 w-full min-w-12 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full", COR_EQUIPE[equipe])} style={{ width: `${pct}%` }} />
        </div>
        <span className={cn("w-9 text-xs tabular-nums", pct === 100 ? "font-medium text-emerald-700" : "text-muted-foreground")}>
          {pct}%
        </span>
      </div>
    </div>
  );
}
