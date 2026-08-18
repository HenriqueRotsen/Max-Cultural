import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { cookies } from "next/headers";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth-token";
import { listAllRowsForExport } from "@/app/actions/inscricoes";
import { SIGACULTURAL_COLUMNS, rowToExportObject } from "@/lib/schema";

async function assertAuth() {
  const jar = await cookies();
  return verifySessionToken(jar.get(AUTH_COOKIE)?.value);
}

export async function GET(request: NextRequest) {
  if (!(await assertAuth())) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const format = request.nextUrl.searchParams.get("format") ?? "csv";
  const rows = await listAllRowsForExport();
  const exportRows = rows.map(rowToExportObject);

  if (format === "xlsx") {
    const worksheet = XLSX.utils.json_to_sheet(exportRows, {
      header: [...SIGACULTURAL_COLUMNS],
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "SigaCultural");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="sigacultural-base.xlsx"',
      },
    });
  }

  const header = SIGACULTURAL_COLUMNS.join(",");
  const lines = exportRows.map((row) =>
    SIGACULTURAL_COLUMNS.map((col) => {
      const value = row[col];
      const str = value === null || value === undefined ? "" : String(value);
      if (/[",\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(","),
  );
  const csv = [header, ...lines].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="sigacultural-base.csv"',
    },
  });
}
