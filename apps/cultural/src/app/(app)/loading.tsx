export default function AppLoading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      style={{ display: "grid", gap: 12, paddingTop: 4 }}
    >
      <div
        style={{
          height: 28,
          width: "40%",
          borderRadius: 8,
          background: "color-mix(in srgb, var(--border) 70%, transparent)",
        }}
      />
      <div
        style={{
          height: 140,
          borderRadius: 12,
          background: "color-mix(in srgb, var(--border) 55%, transparent)",
        }}
      />
      <div
        style={{
          height: 140,
          borderRadius: 12,
          background: "color-mix(in srgb, var(--border) 45%, transparent)",
        }}
      />
    </div>
  );
}