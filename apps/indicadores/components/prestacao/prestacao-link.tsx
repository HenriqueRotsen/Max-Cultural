import Link from "next/link";
import { FileCheck2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Atalho para a prestação de contas do projeto. */
export function PrestacaoLink({
  projetoId,
  compact = false,
  className,
}: {
  projetoId: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={`/dashboard/prestacao/${encodeURIComponent(projetoId)}`}
      title="Prestação de contas"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-brand/20 bg-white font-medium text-brand-deep transition hover:border-brand/40 hover:bg-brand-mist/40",
        compact ? "h-8 px-2 text-xs" : "px-3 py-1.5 text-sm",
        className,
      )}
    >
      <FileCheck2 className={compact ? "size-3.5" : "size-4"} />
      Prestação de contas
    </Link>
  );
}
