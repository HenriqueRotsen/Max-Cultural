import { NextResponse } from "next/server";
import municipios from "@/data/municipios-ibge.json";

const POR_UF = municipios as Record<string, string[]>;

/** Municípios da UF (lista oficial do IBGE, dados públicos), para os campos de território. */
export async function GET(_req: Request, { params }: { params: Promise<{ uf: string }> }) {
  const uf = (await params).uf.toUpperCase();
  const lista = POR_UF[uf];
  if (!lista) return NextResponse.json({ error: "UF inválida" }, { status: 404 });
  return NextResponse.json(lista, {
    headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" },
  });
}
