"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchSelect } from "@/components/ui/search-select";
import { SimpleSelect } from "@/components/ui/simple-select";
import { LEIS } from "@/lib/prestacao/types";
import { cn } from "@/lib/utils";

/** Busca e filtros da lista da prestação de contas (ficam no endereço da página). */
export function PrestacaoFiltros({ contextos }: { contextos: Array<{ id: string; nome: string }> }) {
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
    next.delete("page");
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  const temFiltro = ["q", "contexto", "lei", "entregue"].some((k) => sp.get(k));

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
            placeholder="Buscar por projeto, PRONAC, proponente, patrocinador ou contexto…"
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
          aria-label="Lei"
          className="h-9"
          value={sp.get("lei") ?? ""}
          onChange={(v) => aplicar({ lei: v || null })}
          options={[{ value: "", label: "Lei: todas" }, ...LEIS.map((l) => ({ value: l.value, label: l.label }))]}
        />
        <SimpleSelect
          aria-label="Entrega"
          className="h-9"
          value={sp.get("entregue") ?? ""}
          onChange={(v) => aplicar({ entregue: v || null })}
          options={[
            { value: "", label: "Entrega: todas" },
            { value: "nao", label: "Ainda não entregue", dot: "bg-amber-500" },
            { value: "sim", label: "Entregue", dot: "bg-emerald-600" },
          ]}
        />
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
