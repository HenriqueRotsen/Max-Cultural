import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  alertFindFirst: vi.fn(),
  alertCreate: vi.fn(),
  alertUpdate: vi.fn(),
  userFindMany: vi.fn(),
  settingsFindMany: vi.fn(),
  notificationCreate: vi.fn(),
  sendAlertEmail: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    auditAlert: {
      findFirst: mocks.alertFindFirst,
      create: mocks.alertCreate,
      update: mocks.alertUpdate,
    },
    appUser: { findMany: mocks.userFindMany },
    notificationSettings: { findMany: mocks.settingsFindMany },
    appNotification: { create: mocks.notificationCreate },
  },
}));

vi.mock("@/lib/alerts/email", () => ({ sendAlertEmail: mocks.sendAlertEmail }));

import { recordSituacaoChange } from "@/lib/alerts/diligencia";

const base = {
  workspaceId: "ws1",
  salicAccountId: "acc1",
  projectId: "p1",
  pronac: "203090",
  projectName: "Festival",
};

describe("alerta de diligência da Auditoria (mock Prisma)", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
    mocks.alertFindFirst.mockResolvedValue(null);
    mocks.alertCreate.mockImplementation(async ({ data }) => ({ id: "al1", ...data }));
    mocks.userFindMany.mockResolvedValue([
      { id: "u1", email: "a@x.com", contactEmail: "" },
      { id: "u2", email: "b@x.com", contactEmail: "contato@x.com" },
      { id: "u3", email: "c@x.com", contactEmail: "" },
    ]);
    mocks.settingsFindMany.mockResolvedValue([
      { userId: "u2", salicDiligencia: true, emailEnabled: true },
      { userId: "u3", salicDiligencia: false, emailEnabled: true },
    ]);
  });

  it("entrou em diligência: abre alerta, avisa no sino e por e-mail conforme preferências", async () => {
    const id = await recordSituacaoChange({
      ...base,
      previousSituacao: "E10 - Em execução",
      nextSituacao: "E37 - Diligência",
    });

    expect(id).toBe("al1");
    expect(mocks.alertCreate.mock.calls[0]?.[0].data).toMatchObject({
      type: "DILIGENCIA",
      pronac: "203090",
      title: "Diligência — PRONAC 203090",
    });
    // u3 desligou diligência; u1 sem preferência = padrão ligado.
    const notified = mocks.notificationCreate.mock.calls.map(([a]) => a.data.userId);
    expect(notified).toEqual(["u1", "u2"]);
    expect(mocks.notificationCreate.mock.calls[0]?.[0].data).toMatchObject({
      type: "SALIC_DILIGENCIA",
      href: expect.stringMatching(/\/alertas\/al1$/),
      meta: { source: "auditoria", alertId: "al1", pronac: "203090" },
    });
    // e-mail só para quem ligou (u2, no e-mail de contato).
    expect(mocks.sendAlertEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendAlertEmail.mock.calls[0]?.[0].to).toBe("contato@x.com");
  });

  it("primeira leitura de projeto já em diligência, sem alerta anterior: abre alerta", async () => {
    const id = await recordSituacaoChange({
      ...base,
      previousSituacao: "E37 - Diligência",
      nextSituacao: "E37 - Diligência",
    });
    expect(id).toBe("al1");
  });

  it("continua em diligência e já houve alerta: não duplica", async () => {
    mocks.alertFindFirst.mockResolvedValue({ id: "old" });
    const id = await recordSituacaoChange({
      ...base,
      previousSituacao: "E37 - Diligência",
      nextSituacao: "E37 - Diligência",
    });
    expect(id).toBeNull();
    expect(mocks.alertCreate).not.toHaveBeenCalled();
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
  });

  it("entrou de novo com alerta ainda aberto: não duplica", async () => {
    mocks.alertFindFirst.mockResolvedValue({ id: "aberto" });
    const id = await recordSituacaoChange({
      ...base,
      previousSituacao: "E10 - Em execução",
      nextSituacao: "E37 - Diligência",
    });
    expect(id).toBeNull();
    expect(mocks.alertCreate).not.toHaveBeenCalled();
  });

  it("saiu de diligência: anota no alerta aberto sem resolver", async () => {
    mocks.alertFindFirst.mockResolvedValue({ id: "aberto", meta: { situacao: "E37" } });
    await recordSituacaoChange({
      ...base,
      previousSituacao: "E37 - Diligência",
      nextSituacao: "E12 - Em execução",
    });
    const update = mocks.alertUpdate.mock.calls[0]?.[0];
    expect(update.where).toEqual({ id: "aberto" });
    expect(update.data.meta).toMatchObject({ situacao: "E37", exitedTo: "E12 - Em execução" });
    expect(update.data.status).toBeUndefined();
  });

  it("projeto arquivado por não atender diligência não abre alerta", async () => {
    const id = await recordSituacaoChange({
      ...base,
      previousSituacao: "E30-Análise de resposta de diligência",
      nextSituacao: "A42-Arquivado - não atendimento à diligência técnica",
    });
    expect(id).toBeNull();
    expect(mocks.alertCreate).not.toHaveBeenCalled();
  });

  it("análise de resposta de diligência conta como diligência", async () => {
    const id = await recordSituacaoChange({
      ...base,
      previousSituacao: null,
      nextSituacao: "E30-Análise de resposta de diligência",
    });
    expect(id).toBe("al1");
  });

  it("sem diligência: nada acontece", async () => {
    await recordSituacaoChange({ ...base, previousSituacao: null, nextSituacao: "E10 - Em execução" });
    expect(mocks.alertFindFirst).not.toHaveBeenCalled();
    expect(mocks.alertCreate).not.toHaveBeenCalled();
  });
});
