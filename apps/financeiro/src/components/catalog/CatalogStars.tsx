export function CatalogStars({
  value,
  count,
}: {
  value: number | null | undefined;
  count?: number;
}) {
  if (value == null || value <= 0) {
    return <span className="text-xs text-[var(--gray-400)]">—</span>;
  }
  const n = Math.max(1, Math.min(5, Math.round(value)));
  return (
    <span className="whitespace-nowrap text-sm text-[var(--gold)]" title={value.toFixed(1)}>
      {"★".repeat(n)}
      <span className="text-[var(--gray-300)]">{"★".repeat(5 - n)}</span>
      {count != null ? (
        <span className="ml-1 text-xs text-[var(--gray-400)]">({count})</span>
      ) : null}
    </span>
  );
}
