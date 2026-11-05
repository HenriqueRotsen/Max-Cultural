"use client";

import { useEffect, useState } from "react";

const cache = new Map<string, Promise<string[]>>();

function carregar(uf: string): Promise<string[]> {
  let p = cache.get(uf);
  if (!p) {
    p = fetch(`/api/municipios/${encodeURIComponent(uf)}`)
      .then((r) => (r.ok ? (r.json() as Promise<string[]>) : []))
      .catch(() => []);
    cache.set(uf, p);
  }
  return p;
}

/** Cidades da UF (IBGE); carrega uma vez por UF. */
export function useMunicipios(uf: string): { cidades: string[]; carregando: boolean } {
  const [estado, setEstado] = useState<{ uf: string; cidades: string[] }>({ uf: "", cidades: [] });
  useEffect(() => {
    if (!uf) return;
    let vivo = true;
    void carregar(uf).then((cidades) => vivo && setEstado({ uf, cidades }));
    return () => {
      vivo = false;
    };
  }, [uf]);
  const pronto = estado.uf === uf;
  return { cidades: pronto ? estado.cidades : [], carregando: Boolean(uf) && !pronto };
}
