import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();

vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

describe("sendNotificationEmail (integração mock Resend)", () => {
  beforeEach(() => {
    send.mockReset();
    vi.resetModules();
    process.env.RESEND_API_KEY = "test-key";
    process.env.NOTIFY_FROM_EMAIL = "MAX Origem <avisos@example.com>";
    process.env.NEXT_PUBLIC_ORIGEM_URL = "http://localhost:3001";
  });

  it("não envia sem destinatário válido", async () => {
    const { sendNotificationEmail } = await import("@/lib/planning/notify-email");
    const ok = await sendNotificationEmail({
      to: "invalido",
      title: "t",
      body: "b",
    });
    expect(ok).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("não envia sem API key", async () => {
    delete process.env.RESEND_API_KEY;
    const { sendNotificationEmail } = await import("@/lib/planning/notify-email");
    const ok = await sendNotificationEmail({
      to: "user@example.com",
      title: "Aviso",
      body: "Corpo",
      href: "/notificacoes",
    });
    expect(ok).toBe(false);
  });

  it("envia e-mail com link absoluto", async () => {
    send.mockResolvedValue({ error: null });
    const { sendNotificationEmail } = await import("@/lib/planning/notify-email");
    const ok = await sendNotificationEmail({
      to: "user@example.com",
      title: "Pagamento em atraso",
      body: "Venceu em 07/08/2026",
      href: "/planejamento/compromissos/abc",
    });
    expect(ok).toBe(true);
    expect(send).toHaveBeenCalledOnce();
    const arg = send.mock.calls[0]![0] as {
      to: string[];
      subject: string;
      text: string;
    };
    expect(arg.to).toEqual(["user@example.com"]);
    expect(arg.subject).toBe("Pagamento em atraso");
    expect(arg.text).toContain(
      "http://localhost:3001/planejamento/compromissos/abc",
    );
  });
});
