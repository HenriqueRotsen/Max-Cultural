import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  notifyDiligenciaIfEntered: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    planningProject: { findUnique: mocks.findUnique, update: mocks.update },
  },
}));

vi.mock("@/lib/planning/diligencia-notify", () => ({
  notifyDiligenciaIfEntered: mocks.notifyDiligenciaIfEntered,
}));

import { applySalicSituacaoToPlanningProject } from "@/lib/planning/federal/situacao-salic";

const project = {
  id: "pp1",
  workspaceId: "ws1",
  externalCode: "203090",
  name: "Festival",
  situacao: "E10 - Em execução",
};

describe("situação do SALIC no Planejamento (mock Prisma)", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
    mocks.findUnique.mockResolvedValue(project);
  });

  it("grava situação, data e ciclo de vida no próprio PlanningProject", async () => {
    await applySalicSituacaoToPlanningProject({
      planningProjectId: "pp1",
      situacao: " E37 - Diligência ",
    });

    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "pp1" },
      data: expect.objectContaining({
        situacao: "E37 - Diligência",
        lifecycleStatus: "EM_ANDAMENTO",
        situacaoAt: expect.any(Date),
      }),
    });
    expect(mocks.notifyDiligenciaIfEntered).toHaveBeenCalledWith(
      expect.objectContaining({
        planningProjectId: "pp1",
        pronac: "203090",
        previousSituacao: "E10 - Em execução",
        nextSituacao: "E37 - Diligência",
      }),
    );
  });

  it("encerra o projeto quando a situação é de arquivamento", async () => {
    await applySalicSituacaoToPlanningProject({
      planningProjectId: "pp1",
      situacao: "K00 - Projeto arquivado",
    });
    expect(mocks.update.mock.calls[0]?.[0].data.lifecycleStatus).toBe("ENCERRADO");
  });

  it("situação igual não dispara aviso; vazia não grava nada", async () => {
    await applySalicSituacaoToPlanningProject({
      planningProjectId: "pp1",
      situacao: "E10 - Em execução",
    });
    expect(mocks.notifyDiligenciaIfEntered).not.toHaveBeenCalled();

    mocks.update.mockReset();
    await applySalicSituacaoToPlanningProject({ planningProjectId: "pp1", situacao: "  " });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
