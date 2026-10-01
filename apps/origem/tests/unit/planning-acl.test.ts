import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(async () => ({ id: "u1" })),
}));

vi.mock("@/lib/auth/hub-permissions", () => ({
  hasHubPermission: vi.fn(async (id: string) => id === "origem.planejamento.excluir_nf"),
}));

import { canDeleteNf, canExceedRubric } from "@/lib/planning/acl";
import { hasHubPermission } from "@/lib/auth/hub-permissions";

describe("planning ACL deny-by-default", () => {
  it("libera só a capability concedida", async () => {
    expect(await canDeleteNf()).toBe(true);
    expect(await canExceedRubric()).toBe(false);
    expect(hasHubPermission).toHaveBeenCalled();
  });
});
