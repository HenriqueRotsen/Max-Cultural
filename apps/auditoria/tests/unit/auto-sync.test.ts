import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  hasPermission: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { workspace: { update: mocks.update } } }));
vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(async () => ({ id: "u1" })),
  getWorkspaceContext: vi.fn(async () => ({ entitlements: { workspaceId: "ws1" } })),
}));
vi.mock("@/lib/auth/hub-permissions", () => ({ hasHubPermission: mocks.hasPermission }));
vi.mock("@/lib/hub-audit", () => ({ postHubAudit: mocks.audit }));

import { setSalicAutoSync } from "@/lib/sync/auto-sync";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("atualização automática com o SALIC", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
    mocks.hasPermission.mockResolvedValue(true);
    mocks.audit.mockResolvedValue(true);
  });

  it("sem a capacidade do hub não altera", async () => {
    mocks.hasPermission.mockResolvedValue(false);
    const r = await setSalicAutoSync({}, form({ enable: "0", confirm: "DESATIVAR", note: "x" }));
    expect(r.error).toMatch(/permissão/);
    expect(mocks.hasPermission).toHaveBeenCalledWith("auditoria.atualizacao.desativar");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("desligar exige a palavra e o motivo", async () => {
    expect((await setSalicAutoSync({}, form({ enable: "0", confirm: "sim", note: "x" }))).error).toMatch(
      /DESATIVAR/,
    );
    expect((await setSalicAutoSync({}, form({ enable: "0", confirm: "desativar" }))).error).toMatch(
      /motivo/,
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("desliga com confirmação e registra quem e por quê", async () => {
    const r = await setSalicAutoSync(
      {},
      form({ enable: "0", confirm: "desativar", note: "Manutenção no SALIC" }),
    );
    expect(r.ok).toBe(true);
    expect(mocks.update.mock.calls[0]?.[0]).toMatchObject({
      where: { id: "ws1" },
      data: { salicAutoSync: false, salicAutoSyncChangedById: "u1", salicAutoSyncNote: "Manutenção no SALIC" },
    });
    expect(mocks.audit.mock.calls[0]?.[0].action).toBe("auditoria.atualizacao.desativada");
  });

  it("religar não pede a palavra", async () => {
    const r = await setSalicAutoSync({}, form({ enable: "1" }));
    expect(r.ok).toBe(true);
    expect(mocks.update.mock.calls[0]?.[0].data.salicAutoSync).toBe(true);
  });
});
