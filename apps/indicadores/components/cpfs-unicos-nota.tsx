import { cn } from "@/lib/utils";

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

/** Linha pequena embaixo de um número: quantas pessoas diferentes (CPFs únicos) há nele. */
export function CpfsUnicosNota({ n, className }: { n: number; className?: string }) {
  return (
    <div className={cn("text-[11px] leading-tight text-muted-foreground tabular-nums", className)}>
      {fmt(n)} {n === 1 ? "CPF único" : "CPFs únicos"}
    </div>
  );
}

/** Versão em linha, para listas compactas: “(12 únicos)”. */
export function CpfsUnicosInline({ n, className }: { n: number; className?: string }) {
  return (
    <span
      className={cn("text-[10px] font-normal text-muted-foreground tabular-nums", className)}
      title="CPFs únicos (pessoas diferentes)"
    >
      ({fmt(n)} {n === 1 ? "único" : "únicos"})
    </span>
  );
}
