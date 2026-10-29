import { DEFAULT_PROJECT_CAPS, type ProjectCaps } from "@/lib/planning/project-caps";

/** Os três limites do projeto (em % do valor captado / da rubrica). */
export function ProjectCapsFields({ initial = DEFAULT_PROJECT_CAPS }: { initial?: ProjectCaps }) {
  return (
    <fieldset className="space-y-3 rounded-xl border border-[var(--border)] p-4">
      <legend className="px-1 text-sm font-semibold text-[var(--navy)]">Limites do projeto</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="field">
          <span>Mesmo fornecedor (% do captado)</span>
          <input
            name="supplierCapPct"
            inputMode="decimal"
            className="w-full"
            defaultValue={initial.supplierCapPct}
            required
          />
          <span className="text-xs text-[var(--gray-500)]">
            Quanto um mesmo fornecedor pode receber, no total, neste projeto.
          </span>
        </label>
        <label className="field">
          <span>Vínculo (% do captado)</span>
          <input
            name="bondCapPct"
            inputMode="decimal"
            className="w-full"
            defaultValue={initial.bondCapPct}
            required
          />
          <span className="text-xs text-[var(--gray-500)]">
            Total para o proponente e quem tem vínculo com ele (sócio, cônjuge, empresa ligada).
          </span>
        </label>
        <label className="field">
          <span>Exceder a rubrica (% acima)</span>
          <input
            name="rubricOverrunPct"
            inputMode="decimal"
            className="w-full"
            defaultValue={initial.rubricOverrunPct}
            required
          />
          <span className="text-xs text-[var(--gray-500)]">
            Quanto uma rubrica pode passar do aprovado (reserva e remanejamento), para quem tem
            permissão. Ex.: 50 = até 1,5×.
          </span>
        </label>
      </div>
    </fieldset>
  );
}
