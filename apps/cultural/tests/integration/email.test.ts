import { afterEach, describe, expect, it, vi } from "vitest";

describe("sendEmail (integração)", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("simula quando AUTH_EMAIL_SIMULATE=true", async () => {
    vi.stubEnv("AUTH_EMAIL_SIMULATE", "true");
    delete process.env.RESEND_API_KEY;
    const { sendEmail } = await import("@/lib/email");
    const result = await sendEmail({
      to: "a@b.com",
      subject: "Oi",
      html: "<p>x</p>",
    });
    expect(result).toEqual({ ok: true });
  });

  it("simula quando não há RESEND_API_KEY", async () => {
    vi.stubEnv("AUTH_EMAIL_SIMULATE", "false");
    delete process.env.RESEND_API_KEY;
    const { sendInviteEmail } = await import("@/lib/email");
    const result = await sendInviteEmail({
      to: "a@b.com",
      name: "Ana",
      link: "http://localhost:3000/login",
    });
    expect(result).toEqual({ ok: true });
  });
});
