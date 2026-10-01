import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(async () => ({ id: "u1" })),
}));

vi.mock("@/lib/auth/config", () => ({
  needsLogin: vi.fn(() => true),
}));

vi.mock("@/lib/auth/hub-permissions", () => ({
  hasHubPermission: vi.fn(async (id: string) => id === "origem.planejamento.excluir_nf"),
}));

import { canDeleteNf, canExceedRubric } from "@/lib/planning/acl";
import { hasHubPermission } from "@/lib/auth/hub-permissions";
import { needsLogin } from "@/lib/auth/config";

describe("planning ACL deny-by-default", () => {
  beforeEach(() => {
    vi.mocked(needsLogin).mockReturnValue(true);
  });

  it("libera só a capability concedida", async () => {
    expect(await canDeleteNf()).toBe(true);
    expect(await canExceedRubric()).toBe(false);
    expect(hasHubPermission).toHaveBeenCalled();
  });

  it("em dev aberto libera tudo", async () => {
    vi.mocked(needsLogin).mockReturnValue(false);
    expect(await canExceedRubric()).toBe(true);
  });
});
