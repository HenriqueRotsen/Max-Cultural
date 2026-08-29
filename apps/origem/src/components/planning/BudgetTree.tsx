import { formatCurrency } from "@/lib/format";
import {
  isAdminProduct,
  type LineBalance,
} from "@/lib/planning/rubric-balance";
import { FieldHelp, ThHelp } from "@/components/FieldHelp";
import { HELP } from "@/lib/help";

type Line = {
  id: string;
  fonteRecurso: string;
  productName: string;
  stageName: string;
  state: string;
  city: string;
  itemName: string;
  approvedAmount: { toString(): string } | number;
};

function groupLines(lines: Line[]) {
  const tree = new Map<
    string,
    Map<string, Map<string, Map<string, Line[]>>>
  >();
  for (const line of lines) {
    const regiao = `${line.state} - ${line.city}`.trim();
    if (!tree.has(line.fonteRecurso)) tree.set(line.fonteRecurso, new Map());
    const f = tree.get(line.fonteRecurso)!;
    if (!f.has(line.productName)) f.set(line.productName, new Map());
    const p = f.get(line.productName)!;
    if (!p.has(line.stageName)) p.set(line.stageName, new Map());
    const e = p.get(line.stageName)!;
    if (!e.has(regiao)) e.set(regiao, []);
    e.get(regiao)!.push(line);
  }
  return tree;
}

function rowClass(b: LineBalance | undefined) {
  if (!b) return "border-t border-[var(--border)]";
  if (b.over) return "border-t border-red-200 bg-red-50 text-red-900";
  if (b.near) return "border-t border-amber-200 bg-amber-50 text-amber-950";
  return "border-t border-[var(--border)]";
}

export function BudgetTree({
  lines,
  balances,
  pctCaptadoTLabel,
}: {
  lines: Line[];
  balances: Map<string, LineBalance>;
  /** Ex.: "67,4%" para o thead */
  pctCaptadoTLabel?: string;
}) {
  const tree = groupLines(lines);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 text-xs text-[var(--gray-500)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-400" />
          Perto do disponível (≥80%)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500" />
          No limite do disponível
        </span>
      </div>

      {[...tree.entries()].map(([fonte, products]) => (
        <details key={fonte} open className="card overflow-hidden">
          <summary className="cursor-pointer bg-[var(--gray-50)] px-4 py-3 font-semibold text-[var(--navy)]">
            {fonte}
          </summary>
          <div className="space-y-2 p-3">
            {[...products.entries()].map(([produto, etapas]) => {
              const isAdminProduto = isAdminProduct(produto);
              const dispHeader = pctCaptadoTLabel
                ? `Teto operacional (${pctCaptadoTLabel})`
                : "Teto operacional";
              return (
              <details key={produto} open className="rounded-lg border border-[var(--border)]">
                <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
                  <span className="inline-flex items-center gap-1.5">
                    {produto}
                    {isAdminProduto ? (
                      <FieldHelp text={HELP.planningAdminProduto} />
                    ) : null}
                  </span>
                </summary>
                <div className="space-y-2 p-2">
                  {[...etapas.entries()].map(([etapa, regioes]) => (
                    <details key={etapa} open>
                      <summary className="cursor-pointer px-2 py-1 text-sm text-[var(--gray-600)]">
                        {etapa}
                      </summary>
                      {[...regioes.entries()].map(([regiao, items]) => (
                        <details key={regiao} open className="mb-2 ml-2">
                          <summary className="cursor-pointer py-1 text-xs font-medium text-[var(--gray-500)]">
                            {regiao || "—"}
                            <span className="ml-2 font-normal tabular-nums text-[var(--gray-400)]">
                              ({items.length} {items.length === 1 ? "item" : "itens"})
                            </span>
                          </summary>
                          <div className="overflow-x-auto pl-1">
                            <table className="w-full text-left text-sm">
                              <thead>
                                <tr className="text-xs text-[var(--gray-500)]">
                                  <th className="py-1 pr-2">Item</th>
                                  <ThHelp
                                    className="py-1 pr-2"
                                    help={HELP.planningAprovado}
                                  >
                                    Aprovado (MinC)
                                  </ThHelp>
                                  {!isAdminProduto ? (
                                    <ThHelp
                                      className="py-1 pr-2"
                                      help={HELP.planningDisponivel}
                                    >
                                      {dispHeader}
                                    </ThHelp>
                                  ) : null}
                                  <th className="py-1 pr-2">Reservado</th>
                                  <th className="py-1 pr-2">Pago</th>
                                  <ThHelp
                                    className="py-1"
                                    help={HELP.planningSaldo}
                                  >
                                    Saldo na rubrica
                                  </ThHelp>
                                </tr>
                              </thead>
                              <tbody>
                                {items.map((line) => {
                                  const b = balances.get(line.id);
                                  const approved =
                                    b?.approved ??
                                    (Number(line.approvedAmount) || 0);
                                  return (
                                    <tr key={line.id} className={rowClass(b)}>
                                      <td className="py-1.5 pr-2">
                                        {line.itemName}
                                        {b?.over ? (
                                          <span className="ml-2 text-xs font-semibold">
                                            no limite
                                          </span>
                                        ) : b?.near ? (
                                          <span className="ml-2 text-xs font-semibold">
                                            alerta 80%
                                          </span>
                                        ) : null}
                                      </td>
                                      <td className="py-1.5 pr-2 tabular-nums">
                                        {formatCurrency(approved)}
                                      </td>
                                      {!isAdminProduto ? (
                                        <td className="py-1.5 pr-2 tabular-nums">
                                          {formatCurrency(
                                            b?.availableCap ?? approved,
                                          )}
                                        </td>
                                      ) : null}
                                      <td className="py-1.5 pr-2 tabular-nums">
                                        {formatCurrency(b?.reserved ?? 0)}
                                      </td>
                                      <td className="py-1.5 pr-2 tabular-nums">
                                        {formatCurrency(b?.paid ?? 0)}
                                      </td>
                                      <td className="py-1.5 tabular-nums font-medium">
                                        {formatCurrency(
                                          b?.available ?? approved,
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      ))}
                    </details>
                  ))}
                </div>
              </details>
              );
            })}
          </div>
        </details>
      ))}
    </div>
  );
}
