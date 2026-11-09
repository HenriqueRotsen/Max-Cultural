import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { chaveCpf, contarCpfsUnicos, cpfsPorGrupo } from "@/lib/cpfs-unicos";

describe("CPFs únicos", () => {
  it("normaliza pontuação e zeros cortados pela planilha", () => {
    expect(chaveCpf("012.345.678-90")).toBe("01234567890");
    expect(chaveCpf("1234567890")).toBe("01234567890");
    expect(chaveCpf("")).toBeNull();
    expect(chaveCpf("123")).toBeNull();
  });

  it("conta cada pessoa uma vez", () => {
    expect(contarCpfsUnicos(["012.345.678-90", "01234567890", "1234567890", "98765432100", "", null])).toBe(2);
  });

  it("conta por grupo sem misturar grupos", () => {
    const g = cpfsPorGrupo();
    g.add("a", "11111111111");
    g.add("a", "111.111.111-11");
    g.add("b", "11111111111");
    g.add("b", "22222222222");
    expect(g.total("a")).toBe(1);
    expect(g.total("b")).toBe(2);
    expect(g.total("c")).toBe(0);
  });
});
