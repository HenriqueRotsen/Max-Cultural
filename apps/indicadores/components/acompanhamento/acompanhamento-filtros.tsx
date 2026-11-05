"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchSelect } from "@/components/ui/search-select";
import { SimpleSelect } from "@/components/ui/simple-select";
import { cn } from "@/lib/utils";

/** Busca e filtros da lista do acompanhamento (ficam no endereço da página). */
export function AcompanhamentoFiltros({ contextos }: { contextos: Array<{ id: string; nome: string }> }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [pending, startTransition] = useTransition();

  function aplicar(mudancas: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(mudancas)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page"); // filtro novo volta para a primeira página
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  const temFiltro = ["q", "contexto", "recurso", "atencao", "ordem"].some((k) => sp.get(k));

  return (
    <div className={cn("space-y-3 rounded-2xl border border-brand/10 bg-white/90 p-4 shadow-sm", pending && "opacity-70")}>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          aplicar({ q: q.trim() || null });
        }}
      >
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por projeto, PRONAC, proponente ou contexto…"
            aria-label="Buscar projetos"
            className="h-9 pl-9"
          />
        </div>
        <Button type="submit" variant="outline" size="sm" className="h-9">
          Buscar
        </Button>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        <SearchSelect
          aria-label="Contexto"
          className="h-9 w-auto min-w-[14rem] max-w-xs bg-white"
          value={sp.get("contexto") ?? ""}
          onValueChange={(v) => aplicar({ contexto: v || null })}
          placeholder="Todos os contextos"
          searchPlaceholder="Buscar contexto…"
          emptyText="Nenhum contexto encontrado."
          options={[{ value: "", label: "Todos os contextos" }, ...contextos.map((c) => ({ value: c.id, label: c.nome }))]}
        />
        <SimpleSelect
          aria-label="Recurso"
          className="h-9"
          value={sp.get("recurso") ?? ""}
          onChange={(v) => aplicar({ recurso: v || null })}
          options={[
            { value: "", label: "Recurso: todos" },
            { value: "liberado", label: "Recurso liberado", dot: "bg-emerald-600" },
            { value: "aguardando", label: "Aguardando liberação", dot: "bg-slate-400" },
          ]}
        />
        <SimpleSelect
          aria-label="Ordenar"
          className="h-9"
          value={sp.get("ordem") ?? ""}
          onChange={(v) => aplicar({ ordem: v || null })}
          options={[
            { value: "", label: "Ordem: nome" },
            { value: "atencao", label: "Mais atrasados primeiro" },
          ]}
        />
        <button
          type="button"
          aria-pressed={sp.get("atencao") === "1"}
          onClick={() => aplicar({ atencao: sp.get("atencao") === "1" ? null : "1" })}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition",
            sp.get("atencao") === "1"
              ? "border-red-200 bg-red-50 font-medium text-red-800"
              : "border-input bg-white text-muted-foreground hover:bg-muted/40",
          )}
        >
          <span className="size-2 rounded-full bg-red-600" /> Só com tarefas atrasadas ou vencendo
        </button>
        {temFiltro ? (
          <button
            type="button"
            onClick={() => {
              setQ("");
              startTransition(() => router.replace(pathname, { scroll: false }));
            }}
            className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" /> Limpar
          </button>
        ) : null}
      </div>
    </div>
  );
}
