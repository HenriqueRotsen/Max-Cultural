import Link from "next/link";
import { ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

/** Atalho para o acompanhamento de Comunicação e Produção do projeto. */
export function AcompanhamentoLink({
  projetoId,
  compact = false,
  className,
}: {
  projetoId: string;
  /** Versão pequena para listas. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={`/dashboard/acompanhamento/${encodeURIComponent(projetoId)}`}
      title="Acompanhamento de Comunicação e Produção"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-brand/20 bg-white font-medium text-brand-deep transition hover:border-brand/40 hover:bg-brand-mist/40",
        compact ? "h-8 px-2 text-xs" : "px-3 py-1.5 text-sm",
        className,
      )}
    >
      <ListChecks className={compact ? "size-3.5" : "size-4"} />
      {compact ? "Acompanhamento" : "Acompanhamento · Comunicação e Produção"}
    </Link>
  );
}
