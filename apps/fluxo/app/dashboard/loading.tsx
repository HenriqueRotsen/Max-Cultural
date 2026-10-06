export default function DashboardLoading() {
  return (
    <div
      className="mx-auto w-full max-w-7xl px-4 py-6"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="mb-4 h-7 w-48 animate-pulse rounded-md bg-muted" />
      <div className="mb-3 h-36 animate-pulse rounded-xl bg-muted/80" />
      <div className="h-36 animate-pulse rounded-xl bg-muted/60" />
    </div>
  );
}