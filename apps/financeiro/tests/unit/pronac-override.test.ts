import { beforeEach, describe, expect, it, vi } from "vitest";

const allowed = { value: false };
vi.mock("@/lib/planning/acl", () => ({
  canOverridePronac: vi.fn(async () => allowed.value),
}));

import { enforcePronacMatch, pronacMismatchOf } from "@/lib/planning/pronac-override";

const form = (reason?: string) => {
  const fd = new FormData();
  if (reason !== undefined) fd.set("pronacOverrideReason", reason);
  return fd;
};
const warning = "O documento menciona o projeto 240001, mas você está no projeto 250010.";

describe("enforcePronacMatch", () => {
  beforeEach(() => {
    allowed.value = false;
  });

  it("deixa passar quando o PRONAC bate", async () => {
    expect(await enforcePronacMatch({ mismatch: null, formData: form() })).toEqual({
      ok: true,
      overrideReason: null,
    });
  });

  it("bloqueia quem não tem a permissão, mesmo com motivo", async () => {
    const r = await enforcePronacMatch({ mismatch: warning, formData: form("motivo qualquer") });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.pronacOverride).toBe(false);
      expect(r.error).toContain("Liberar documento de outro PRONAC");
    }
  });

  it("pede o motivo a quem tem a permissão", async () => {
    allowed.value = true;
    const r = await enforcePronacMatch({ mismatch: warning, formData: form("") });
    expect(r).toMatchObject({ ok: false, pronacOverride: true });
  });

  it("libera com motivo e devolve o motivo para o log", async () => {
    allowed.value = true;
    const r = await enforcePronacMatch({
      mismatch: warning,
      formData: form("  nota cita o projeto anterior  "),
    });
    expect(r).toEqual({ ok: true, overrideReason: "nota cita o projeto anterior" });
  });
});

describe("pronacMismatchOf", () => {
  it("lê o campo novo", () => {
    expect(pronacMismatchOf({ pronacMismatch: warning })).toBe(warning);
  });
  it("reconhece NFs antigas pelo aviso", () => {
    expect(pronacMismatchOf({ warnings: ["outro", warning] })).toBe(warning);
  });
  it("sem aviso, sem trava", () => {
    expect(pronacMismatchOf({ warnings: ["Extração incompleta"] })).toBeNull();
    expect(pronacMismatchOf(null)).toBeNull();
  });
});
