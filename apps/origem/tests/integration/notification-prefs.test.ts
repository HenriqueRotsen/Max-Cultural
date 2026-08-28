import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique } = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    notificationSettings: {
      findUnique,
    },
  },
}));

import { getNotificationPrefs } from "@/lib/planning/notification-prefs";
import { DEFAULT_NOTIFICATION_PREFS } from "@/lib/planning/notification-settings";

describe("getNotificationPrefs (integração mock Prisma)", () => {
  beforeEach(() => {
    findUnique.mockReset();
  });

  it("retorna defaults sem userId", async () => {
    const prefs = await getNotificationPrefs("ws1", null);
    expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("busca por workspaceId+userId", async () => {
    findUnique.mockResolvedValue(null);
    await getNotificationPrefs("ws1", "user1");
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        workspaceId_userId: { workspaceId: "ws1", userId: "user1" },
      },
    });
  });

  it("retorna defaults se não houver registro", async () => {
    findUnique.mockResolvedValue(null);
    const prefs = await getNotificationPrefs("ws1", "user1");
    expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });

  it("mapeia preferências persistidas", async () => {
    findUnique.mockResolvedValue({
      workspaceId: "ws1",
      paymentDueSoon: false,
      paymentOverdue: true,
      rubricNear: false,
      emailEnabled: true,
      dueSoonDaysAhead: 10,
    });
    const prefs = await getNotificationPrefs("ws1", "user1");
    expect(prefs).toEqual({
      paymentDueSoon: false,
      paymentOverdue: true,
      rubricNear: false,
      nfPending: true,
      taxDueIss: true,
      taxDueFederal: true,
      emailEnabled: true,
      dueSoonDaysAhead: 10,
      nfPendingDaysAfterPaid: 7,
    });
  });

  it("limita dueSoonDaysAhead entre 1 e 30", async () => {
    findUnique.mockResolvedValue({
      workspaceId: "ws1",
      paymentDueSoon: true,
      paymentOverdue: true,
      rubricNear: true,
      emailEnabled: false,
      dueSoonDaysAhead: 99,
    });
    const prefs = await getNotificationPrefs("ws1", "user1");
    expect(prefs.dueSoonDaysAhead).toBe(30);
  });
});
