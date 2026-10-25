import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  fetchHomologada: vi.fn(),
  fetchReadequada: vi.fn(),
  persistSheet: vi.fn(),
  saveVersion: vi.fn(),
  applyCaptacao: vi.fn(),
  projectUpdate: vi.fn(),
  projectFindFirst: vi.fn(),
  canEditRubricas: vi.fn(),
  canCloseProject: vi.fn(),
  lineCreate: vi.fn(),
  lineUpdate: vi.fn(),
  lineDelete: vi.fn(),
  lineFindUnique: vi.fn(),
  lineAggregate: vi.fn(),
  sheetUpdate: vi.fn(),
  commitmentAggregate: vi.fn(),
  commitmentFindFirst: vi.fn(),
  allocFindMany: vi.fn(),
  engagementFindMany: vi.fn(),
  engagementUpdateMany: vi.fn(),
  notificationDeleteMany: vi.fn(),
  recomputeService: vi.fn(),
  recomputeSupplier: vi.fn(),
  log: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(async () => ({ id: "u1" })),
  getWorkspaceContext: vi.fn(async () => ({ session: { id: "u1" }, entitlements: { workspaceId: "ws1" } })),
}));
vi.mock("@/lib/planning/acl", () => ({
  canEditRubricas: m.canEditRubricas,
  canCloseProject: m.canCloseProject,
}));
vi.mock("@/lib/activity-audit", () => ({ logPlanningAction: m.log }));
vi.mock("@/lib/planning/server-utils", () => ({ revalidatePlanning: vi.fn() }));
vi.mock("@/lib/catalog/ratings", () => ({
  recomputeServiceStats: m.recomputeService,
  recomputeSupplierStats: m.recomputeSupplier,
}));
vi.mock("@/lib/planning/federal/import-homologada", () => ({
  fetchHomologatedLinesFromSalic: m.fetchHomologada,
  fetchReadequadaLinesFromSalic: m.fetchReadequada,
  HomologadaImportError: class extends Error {},
}));
vi.mock("@/lib/planning/persist-sheet", () => ({ persistHomologatedSheet: m.persistSheet }));
vi.mock("@/lib/planning/federal/sheet-versions", () => ({
  saveSheetVersion: m.saveVersion,
  hasSheetVersion: vi.fn(),
  notifyReadequadaApplied: vi.fn(),
}));
vi.mock("@/lib/planning/federal/captacao-salic", () => ({
  applyCaptacaoToPlanningProject: m.applyCaptacao,
  fetchCaptacaoOnPage: vi.fn(),
}));
vi.mock("@/lib/salic/session", () => ({
  fetchJsonAllowError: vi.fn(),
  listProjectsUi: vi.fn(),
  listProponentesUi: vi.fn(),
  withAccountBrowser: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    planningProject: { update: m.projectUpdate, findFirst: m.projectFindFirst },
    projectBudgetLine: {
      create: m.lineCreate,
      update: m.lineUpdate,
      delete: m.lineDelete,
      findUnique: m.lineFindUnique,
      aggregate: m.lineAggregate,
    },
    projectBudgetSheet: { update: m.sheetUpdate, create: vi.fn() },
    rubricCommitment: { aggregate: m.commitmentAggregate, findFirst: m.commitmentFindFirst },
    documentRubricAllocation: { findMany: m.allocFindMany },
    catalogEngagement: { findMany: m.engagementFindMany, updateMany: m.engagementUpdateMany },
    appNotification: { deleteMany: m.notificationDeleteMany },
  },
}));

import { importPreferredSheetForNewProject } from "@/lib/planning/federal/sync-sheet";
import {
  addStateBudgetLine,
  removeStateBudgetLine,
  updateStateBudgetLine,
} from "@/lib/planning/state-lines";
import { evaluateSupplier } from "@/lib/planning/evaluation";
import { closePlanningProject } from "@/lib/planning/project-actions";

const line = (id: string, amount: number) => ({
  planilhaAprovacaoId: id,
  fonteRecurso: "Incentivo",
  productName: "Festival",
  stageName: "Produção",
  state: "MG",
  city: "BH",
  itemName: `Item ${id}`,
  categoryHint: null,
  unit: "Unidade",
  days: 1,
  quantity: 1,
  occurrences: 1,
  unitPrice: amount,
  approvedAmount: amount,
  salicComprovado: null,
  sortOrder: 1,
});

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

beforeEach(() => {
  for (const fn of Object.values(m)) if ("mockReset" in fn) fn.mockReset();
  m.redirect.mockImplementation((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  });
  m.canEditRubricas.mockResolvedValue(true);
  m.canCloseProject.mockResolvedValue(true);
  m.lineAggregate.mockResolvedValue({ _sum: { approvedAmount: 0 }, _max: { sortOrder: 2 } });
});

describe("novo projeto federal: homologada + readequada", () => {
  it("com readequada: guarda as duas, usa a readequada e para de buscar", async () => {
    m.fetchHomologada.mockResolvedValue({ lines: [line("1", 100)], totalApproved: 100, captacao: null });
    m.fetchReadequada.mockResolvedValue([line("1", 150)]);

    const r = await importPreferredSheetForNewProject({ accountId: "a", pronac: "1", planningProjectId: "pp" });

    expect(r.importSource).toBe("SALIC_READEQUADA");
    expect(m.saveVersion.mock.calls.map((c) => c[0].kind)).toEqual(["HOMOLOGADA", "READEQUADA"]);
    expect(m.persistSheet.mock.calls[0]?.[0]).toMatchObject({ importSource: "SALIC_READEQUADA", totalApproved: 150 });
    expect(m.projectUpdate.mock.calls[0]?.[0].data).toMatchObject({ sheetSearchActive: false });
  });

  it("sem readequada: usa a homologada e segue procurando", async () => {
    m.fetchHomologada.mockResolvedValue({ lines: [line("1", 100)], totalApproved: 100, captacao: null });
    m.fetchReadequada.mockResolvedValue([]);

    const r = await importPreferredSheetForNewProject({ accountId: "a", pronac: "1", planningProjectId: "pp" });

    expect(r.importSource).toBe("SALIC_HOMOLOGADA");
    expect(m.saveVersion.mock.calls.map((c) => c[0].kind)).toEqual(["HOMOLOGADA"]);
    expect(m.projectUpdate.mock.calls[0]?.[0].data).toEqual({ sheetSearchActive: true });
  });
});

describe("rubricas do projeto estadual", () => {
  const stateProject = { id: "pp", jurisdiction: "SP", sheet: { id: "sh" } };

  it("adiciona rubrica com valor = quantidade × ocorrência × unitário", async () => {
    m.projectFindFirst.mockResolvedValue(stateProject);
    m.lineCreate.mockResolvedValue({ id: "l1", itemName: "Cachê" });
    const r = await addStateBudgetLine(
      "pp",
      {},
      fd({ productName: "Show", itemName: "Cachê", quantity: "2", occurrences: "3", unitPrice: "1.500,00" }),
    );
    expect(r.ok).toBe(true);
    expect(m.lineCreate.mock.calls[0]?.[0].data).toMatchObject({
      sheetId: "sh",
      state: "SP",
      homologatedAmount: 9000,
      approvedAmount: 9000,
      sortOrder: 3,
    });
  });

  it("não aceita projeto federal nem usuário sem permissão", async () => {
    m.projectFindFirst.mockResolvedValue({ ...stateProject, jurisdiction: "FEDERAL" });
    expect((await addStateBudgetLine("pp", {}, fd({}))).error).toMatch(/federal/);
    m.canEditRubricas.mockResolvedValue(false);
    expect((await addStateBudgetLine("pp", {}, fd({}))).error).toMatch(/permissão/);
  });

  it("não reduz abaixo do reservado nem remove rubrica em uso", async () => {
    m.projectFindFirst.mockResolvedValue(stateProject);
    m.lineFindUnique.mockResolvedValue({
      id: "l1",
      sheetId: "sh",
      itemName: "Cachê",
      sheet: { planningProjectId: "pp" },
      _count: { commitments: 1, allocations: 0, engagements: 1 },
    });
    m.commitmentAggregate.mockResolvedValue({ _sum: { amount: 5000 } });
    const upd = await updateStateBudgetLine(
      "l1",
      {},
      fd({ productName: "Show", itemName: "Cachê", quantity: "1", occurrences: "1", unitPrice: "1000" }),
    );
    expect(upd.error).toMatch(/abaixo/);
    expect(m.lineUpdate).not.toHaveBeenCalled();
    const rem = await removeStateBudgetLine("l1");
    expect(rem.error).toMatch(/reserva/);
    expect(m.lineDelete).not.toHaveBeenCalled();
  });
});

describe("avaliação do fornecedor após o pagamento", () => {
  it("grava nas contratações do mesmo pagamento e recalcula médias", async () => {
    m.commitmentFindFirst.mockResolvedValue({ id: "c1", status: "PAID", planningProjectId: "pp" });
    m.allocFindMany
      .mockResolvedValueOnce([{ documentId: "proof" }])
      .mockResolvedValueOnce([{ commitmentId: "c1" }, { commitmentId: "c2" }]);
    m.engagementFindMany.mockResolvedValue([
      { id: "e1", serviceId: "s1", service: { supplierId: "f1" } },
      { id: "e2", serviceId: "s2", service: { supplierId: "f1" } },
    ]);
    const r = await evaluateSupplier("c1", {}, fd({ rating: "4", onTime: "nao", delayDays: "3", comment: "ok" }));
    expect(r.ok).toBe(true);
    expect(m.engagementUpdateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { id: { in: ["e1", "e2"] } },
      data: { rating: 4, delayed: true, delayDays: 3, ratingComment: "ok", evaluatedById: "u1" },
    });
    expect(m.recomputeService).toHaveBeenCalledTimes(2);
    expect(m.recomputeSupplier).toHaveBeenCalledTimes(1);
  });

  it("só depois de pago e com nota válida", async () => {
    m.commitmentFindFirst.mockResolvedValue({ id: "c1", status: "RESERVED", planningProjectId: "pp" });
    expect((await evaluateSupplier("c1", {}, fd({ rating: "5", onTime: "sim" }))).error).toMatch(/pagamento/);
    m.commitmentFindFirst.mockResolvedValue({ id: "c1", status: "PAID", planningProjectId: "pp" });
    expect((await evaluateSupplier("c1", {}, fd({ rating: "9", onTime: "sim" }))).error).toMatch(/nota/);
  });
});

describe("encerrar projeto", () => {
  it("exige permissão e o código digitado", async () => {
    m.canCloseProject.mockResolvedValue(false);
    expect((await closePlanningProject("pp", {}, fd({ confirmCode: "123" }))).error).toMatch(/permissão/);
    m.canCloseProject.mockResolvedValue(true);
    m.projectFindFirst.mockResolvedValue({ id: "pp", externalCode: "123456", name: "X" });
    expect((await closePlanningProject("pp", {}, fd({ confirmCode: "12345" }))).error).toMatch(/123456/);
    expect(m.projectUpdate).not.toHaveBeenCalled();
  });

  it("encerra, para a busca no SALIC e registra no log", async () => {
    m.projectFindFirst.mockResolvedValue({ id: "pp", externalCode: "123456", name: "X" });
    await expect(
      closePlanningProject("pp", {}, fd({ confirmCode: "123456", reason: "Prestação aprovada" })),
    ).rejects.toThrow("REDIRECT:/planejamento?encerrado=1");
    expect(m.projectUpdate.mock.calls[0]?.[0].data).toMatchObject({
      lifecycleStatus: "ENCERRADO",
      closedById: "u1",
      closeReason: "Prestação aprovada",
      sheetSearchActive: false,
    });
    expect(m.log.mock.calls[0]?.[0].action).toBe("planning.project_closed");
  });
});
