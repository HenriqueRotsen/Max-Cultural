import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "@e965/xlsx";
import { cookies } from "next/headers";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth-token";
import {
  AUTH_COOKIE as HUB_COOKIE,
  parseSessionToken as parseHubSession,
} from "@max/auth";
import { getAnaliseAction } from "@/app/actions/inscricoes";

async function assertAuth() {
  const jar = await cookies();
  if (await verifySessionToken(jar.get(AUTH_COOKIE)?.value)) return true;
  try {
    return Boolean(await parseHubSession(jar.get(HUB_COOKIE)?.value));
  } catch {
    return false;
  }
}

const HEADERS = [
  "id_oficina",
  "id_projeto",
  "Nome_oficina",
  "Estado",
  "Cidade",
  "Territorio",
  "Soma de Inscritos",
  "Soma de Selecionados",
  "Soma de Participantes",
  "Soma de Certificado",
] as const;

export async function GET(request: NextRequest) {
  if (!(await assertAuth())) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const format = sp.get("format") ?? "csv";
  const data = await getAnaliseAction({
    idProjeto: sp.get("idProjeto") ?? undefined,
    idOficina: sp.get("idOficina") ?? undefined,
    estado: sp.get("estado") ?? undefined,
    cidade: sp.get("cidade") ?? undefined,
    territorio: sp.get("territorio") ?? undefined,
  });

  const exportRows = data.rows.map((r) => ({
    id_oficina: r.id_oficina,
    id_projeto: r.id_projeto,
    Nome_oficina: r.Nome_oficina,
    Estado: r.Estado,
    Cidade: r.Cidade,
    Territorio: r.Territorio,
    "Soma de Inscritos": r.Inscritos,
    "Soma de Selecionados": r.Selecionados,
    "Soma de Participantes": r.Participantes,
    "Soma de Certificado": r.Certificado,
  }));

  if (format === "xlsx") {
    const worksheet = XLSX.utils.json_to_sheet(exportRows, {
      header: [...HEADERS],
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Analise");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="max-fluxo-analise.xlsx"',
      },
    });
  }

  const header = HEADERS.join(",");
  const lines = exportRows.map((row) =>
    HEADERS.map((col) => {
      const value = row[col];
      const str = value === null || value === undefined ? "" : String(value);
      if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
      return str;
    }).join(","),
  );

  return new NextResponse([header, ...lines].join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="max-fluxo-analise.csv"',
    },
  });
}
