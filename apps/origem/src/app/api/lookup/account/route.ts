import { NextResponse } from "next/server";
import { isValidCnpj, isValidCpf, normalizeCgccpf } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Autocomplete de proponente por CNPJ/CPF.
 * Route Handler (JSON) — evita Server Action + RSC #441 em produção.
 */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("q") || "";
  const cgccpf = normalizeCgccpf(raw);

  if (cgccpf.length !== 11 && cgccpf.length !== 14) {
    return NextResponse.json(
      { found: false, error: "Informe um CNPJ (14) ou CPF (11) válido" },
      { status: 400 },
    );
  }
  if (cgccpf.length === 11 && !isValidCpf(cgccpf)) {
    return NextResponse.json({ found: false, error: "CPF inválido" }, { status: 400 });
  }
  if (cgccpf.length === 14 && !isValidCnpj(cgccpf)) {
    return NextResponse.json({ found: false, error: "CNPJ inválido" }, { status: 400 });
  }

  try {
    if (cgccpf.length === 14) {
      try {
        const { fetchCnpjCompany } = await import("@/lib/lookup/cnpj");
        const company = await fetchCnpjCompany(cgccpf);
        if (company) {
          return NextResponse.json({
            found: true,
            source: "brasilapi",
            cgccpf: company.cnpj,
            name: company.name,
            personType: company.personType,
          });
        }
      } catch (error) {
        console.error("[api/lookup/account] cnpj providers", error);
      }
    }

    const { searchProponentes, listProjetosByCgccpf } = await import("@/lib/salic/api");
    try {
      const items = await searchProponentes({ cgccpf });
      const exact =
        items.find((p) => normalizeCgccpf(p.cgccpf || "") === cgccpf) || items[0];
      if (exact?.nome?.trim()) {
        return NextResponse.json({
          found: true,
          source: "salic",
          cgccpf: normalizeCgccpf(exact.cgccpf || cgccpf),
          name: exact.nome.trim(),
          personType: cgccpf.length === 14 ? "PJ" : "PF",
        });
      }
      const projetos = await listProjetosByCgccpf(cgccpf);
      const fromProject = projetos[0]?.proponente?.trim();
      if (fromProject) {
        return NextResponse.json({
          found: true,
          source: "salic",
          cgccpf,
          name: fromProject,
          personType: cgccpf.length === 14 ? "PJ" : "PF",
        });
      }
    } catch (error) {
      console.error("[api/lookup/account] salic", error);
    }

    return NextResponse.json({
      found: false,
      error:
        cgccpf.length === 14
          ? "CNPJ não encontrado. Informe o nome manualmente."
          : "CPF não encontrado. Informe o nome manualmente.",
    });
  } catch (error) {
    console.error("[api/lookup/account]", error);
    return NextResponse.json({
      found: false,
      error: "Consulta automática indisponível. Informe o nome manualmente.",
    });
  }
}
