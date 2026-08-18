import {
  RELATION_LABELS,
  type RelationKind,
} from "@/lib/compliance/defaults";

export type RulesetBondRow = {
  version: string;
  sourceCode: string;
  sourceUrl: string;
  catalogRelations: RelationKind[];
  notes?: string | null;
};

/** Catálogo read-only: o que cada IN prevê como vínculo art. 23. */
export function RelationBondByRulesetPanel({
  rows,
}: {
  rows: RulesetBondRow[];
}) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--gray-600)]">
        Abaixo, os tipos de relacionamento que cada norma menciona para a soma do
        art. 23. Para ligar ou desligar o vínculo de um observado, use o detalhe
        do PRONAC.
      </p>
      {rows.map((row) => (
        <article
          key={row.version}
          className="rounded-xl border border-[var(--border)] bg-white p-4"
        >
          <h3 className="text-sm font-semibold text-[var(--navy)]">
            {row.sourceUrl ? (
              <a
                href={row.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-2 hover:text-[var(--gold)] hover:underline"
              >
                {row.sourceCode}
              </a>
            ) : (
              row.sourceCode
            )}
          </h3>
          {row.notes ? (
            <p className="mt-1 text-xs text-[var(--gray-500)]">{row.notes}</p>
          ) : null}
          <ul className="mt-3 flex flex-wrap gap-2">
            {row.catalogRelations.map((rel) => (
              <li
                key={rel}
                className="rounded-full border border-[var(--border)] bg-[var(--gray-50)] px-3 py-1 text-xs text-[var(--gray-700)]"
              >
                {RELATION_LABELS[rel]}
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}
