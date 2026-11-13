import { describe, expect, it } from "vitest";
import { reportFileStamp } from "@/lib/reports/pdf";

describe("horário dos relatórios", () => {
  it("usa o horário de Brasília (UTC−3), mesmo com o servidor em UTC", () => {
    // 02:30 UTC de 13/11 = 23:30 de 12/11 em Brasília.
    expect(reportFileStamp(new Date("2026-11-13T02:30:00Z"))).toBe("12112026-233000");
  });
});
