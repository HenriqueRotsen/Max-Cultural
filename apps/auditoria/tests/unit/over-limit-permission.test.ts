import { describe, expect, it, vi } from "vitest";
import { DEFAULT_RULES } from "@/lib/compliance/defaults";
import { ACCESS_BY_ID, ACCESS_RESTRICTION_IDS } from "@max/auth";
import {
  HIDE_OVER_LIMIT_PERMISSION,
  isHidingOverLimit,
} from "@/lib/compliance/over-limit-permission";
import { worstComplianceTone } from "@/lib/compliance/rouanet";

describe("restrição “não ver PRONACs acima do limite”", () => {
  it("existe no catálogo do hub como restrição", () => {
    expect(ACCESS_BY_ID[HIDE_OVER_LIMIT_PERMISSION]?.kind).toBe("capability");
    expect(ACCESS_RESTRICTION_IDS).toContain(HIDE_OVER_LIMIT_PERMISSION);
  });

  it("só esconde para quem tem a restrição", () => {
    expect(isHidingOverLimit({ ids: new Set(["auditoria.app"]) })).toBe(false);
    expect(
      isHidingOverLimit({ ids: new Set(["auditoria.app", HIDE_OVER_LIMIT_PERMISSION]) }),
    ).toBe(true);
  });

  it("superadmin nunca é afetado, mesmo com a restrição na lista", () => {
    expect(isHidingOverLimit({ ids: new Set(["*", HIDE_OVER_LIMIT_PERMISSION]) })).toBe(false);
  });

  it("se as permissões não carregaram, esconde (falha fechada)", () => {
    expect(isHidingOverLimit({ ids: new Set(), fetchFailed: true })).toBe(true);
  });

  it("a linha vermelha é o tom critical (fornecedor acima do teto)", () => {
    expect(worstComplianceTone([{ total: 90, cgccpf: "1" }], 100)).toBe("critical");
    expect(worstComplianceTone([{ total: 1, cgccpf: "1" }], 100)).toBe("ok");
  });
});

const mocks = vi.hoisted(() => ({
  panorama: vi.fn(),
  bundle: vi.fn(),
  perms: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ getPronacPanorama: mocks.panorama }));
vi.mock("@/lib/compliance/context", () => ({
  loadComplianceBundle: mocks.bundle,
  metaForProject: () => ({ relatedParties: [] }),
}));
vi.mock("@/lib/auth/hub-permissions", () => ({ getHubPermissions: mocks.perms }));
vi.mock("@/lib/auth/session", () => ({
  getWorkspaceContext: async () => ({ entitlements: { workspaceId: "ws1" } }),
}));

function row(projectId: string, pronac: string, supplierTotal: number) {
  const s = [{ total: supplierTotal, cgccpf: "11111111000111" }];
  return {
    projectId,
    pronac,
    accountId: "acc",
    accountCgccpf: "99999999000199",
    personType: "PJ",
    projectTotal: 100,
    rules: DEFAULT_RULES,
    allBySupplier: s,
    bondBySupplier: s,
  };
}

describe("computeOverLimitProjects", () => {
  it("devolve só os projetos com linha vermelha", async () => {
    mocks.panorama.mockResolvedValue([row("p1", "111", 90), row("p2", "222", 1)]);
    mocks.bundle.mockResolvedValue({ rules: DEFAULT_RULES, byAccountId: new Map() });
    const { computeOverLimitProjects } = await import("@/lib/compliance/over-limit-visibility");
    const r = await computeOverLimitProjects("ws-test-1");
    expect(r).toEqual({ projectIds: ["p1"], pronacs: ["111"] });
    expect(mocks.panorama).toHaveBeenCalledWith({ workspaceId: "ws-test-1" });
  });

  it("quem não tem a restrição não dispara a consulta", async () => {
    mocks.panorama.mockClear();
    mocks.perms.mockResolvedValue({ ids: new Set(["auditoria.app"]), fetchFailed: false });
    const { getOverLimitScope } = await import("@/lib/compliance/over-limit-visibility");
    expect(await getOverLimitScope()).toEqual({ projectIds: [], pronacs: [] });
    expect(mocks.panorama).not.toHaveBeenCalled();
  });
});
