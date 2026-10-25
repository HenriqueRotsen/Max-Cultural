export function MaxAuditoriaLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex flex-col leading-tight ${className}`}>
      <span className="text-lg font-extrabold tracking-tight text-[var(--navy)]">
        MAX <span className="text-[#2563eb]">Auditoria</span>
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-400)]">
        antigo Salink
      </span>
    </span>
  );
}
