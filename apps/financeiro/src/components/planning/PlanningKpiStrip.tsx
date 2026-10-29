import { FieldHelp } from "@/components/FieldHelp";

export function PlanningKpiStrip({
  items,
}: {
  items: Array<{
    label: string;
    value: string;
    help?: string;
    emphasize?: boolean;
  }>;
}) {
  return (
    <div className="card flex flex-wrap divide-y divide-[var(--border)] sm:divide-x sm:divide-y-0">
      {items.map((item) => (
        <div
          key={item.label}
          className={`min-w-[9rem] flex-1 px-4 py-3 ${
            item.emphasize ? "bg-[var(--navy-soft)]/40" : ""
          }`}
        >
          <p className="inline-flex items-center gap-1 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--gray-400)]">
            {item.label}
            {item.help ? <FieldHelp text={item.help} /> : null}
          </p>
          <p className="mt-0.5 text-base font-semibold tabular-nums text-[var(--navy)] sm:text-lg">
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}
