import { describe, expect, it } from "vitest";
import {
  classifyLifecycleFromSituacao,
  isPrestacaoContasSituacao,
  projectListBucket,
} from "@/lib/planning/lifecycle";

describe("project list buckets", () => {
  it("keeps execução for typical open statuses", () => {
    expect(classifyLifecycleFromSituacao("Em execução")).toBe("EM_ANDAMENTO");
    expect(
      projectListBucket({
        lifecycleStatus: "EM_ANDAMENTO",
        situacao: "Em execução",
      }),
    ).toBe("execucao");
    expect(
      projectListBucket({
        lifecycleStatus: "EM_ANDAMENTO",
        situacao: "Diligenciado",
      }),
    ).toBe("execucao");
  });

  it("puts prestação apresentada in secondary bucket", () => {
    expect(
      isPrestacaoContasSituacao("Prestação de Contas apresentada"),
    ).toBe(true);
    expect(
      projectListBucket({
        lifecycleStatus: "EM_ANDAMENTO",
        situacao: "Prestação de Contas apresentada",
      }),
    ).toBe("prestacao");
  });

  it("treats prestação aprovada as encerrado", () => {
    expect(
      classifyLifecycleFromSituacao(
        "Prestação de Contas aprovada",
      ),
    ).toBe("ENCERRADO");
    expect(
      isPrestacaoContasSituacao("Prestação de Contas aprovada"),
    ).toBe(false);
    expect(
      projectListBucket({
        lifecycleStatus: "ENCERRADO",
        situacao: "Prestação de Contas aprovada",
      }),
    ).toBe("encerrado");
  });
});
