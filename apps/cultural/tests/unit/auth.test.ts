import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined, set: () => {}, delete: () => {} })),
}));

vi.mock("@/lib/db", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T extends (...args: never[]) => unknown>(fn: T) => fn };
});

import {
  can,
  canViewProjetos,
  needs2faChallenge,
  needs2faSetup,
  needsPasswordChange,
  type SessionUser,
} from "@/lib/auth";

function user(partial: {
  isSuperAdmin?: boolean;
  mustChangePassword?: boolean;
  totpEnabled?: boolean;
  permissions?: SessionUser["role"]["permissions"];
}): SessionUser {
  return {
    id: "u1",
    email: "a@b.com",
    name: "A",
    passwordHash: "x",
    mustChangePassword: partial.mustChangePassword ?? false,
    totpEnabled: partial.totpEnabled ?? false,
    totpSecretEnc: null,
    sessionVersion: 1,
    isSuperAdmin: partial.isSuperAdmin ?? false,
    deactivatedAt: null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    roleId: "r1",
    role: {
      id: "r1",
      name: "ops",
      permissions: partial.permissions ?? [],
    },
  } as SessionUser;
}

describe("auth ACL helpers", () => {
  beforeEach(() => {
    delete process.env.AUTH_2FA_DISABLED;
  });

  it("superadmin pode tudo", () => {
    const u = user({ isSuperAdmin: true });
    expect(can(u, "cultural.usuarios", "edit")).toBe(true);
  });

  it("respeita permissões view/edit", () => {
    const u = user({
      permissions: [
        { screen: "cultural.projetos", canView: true, canEdit: false },
      ],
    });
    expect(can(u, "cultural.projetos", "view")).toBe(true);
    expect(can(u, "cultural.projetos", "edit")).toBe(false);
    expect(can(u, "cultural.usuarios", "view")).toBe(false);
  });

  it("canViewProjetos aceita telas relacionadas", () => {
    expect(
      canViewProjetos(
        user({
          permissions: [
            { screen: "origem.planejamento", canView: true, canEdit: false },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("flags de onboarding", () => {
    expect(needsPasswordChange({ mustChangePassword: true })).toBe(true);
    process.env.AUTH_2FA_DISABLED = "true";
    expect(needs2faSetup({ totpEnabled: false })).toBe(false);
    expect(needs2faChallenge({ totpEnabled: true })).toBe(false);
  });
});
