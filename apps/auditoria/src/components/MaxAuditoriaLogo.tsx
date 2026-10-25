export function MaxAuditoriaLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex flex-col ${className}`}>
      <img
        src="/brand/max-auditoria.png"
        alt="MAX Auditoria"
        width={1200}
        height={454}
        className="h-12 w-auto max-w-[220px] bg-transparent object-contain object-left"
      />
      <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-400)]">
        antigo Salink
      </span>
    </span>
  );
}
